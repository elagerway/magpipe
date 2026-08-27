import { createClient } from 'npm:@supabase/supabase-js@2'
import { reportError } from '../_shared/error-reporter.ts'
import {
  extractBody,
  isComposioManaged,
  fetchRecentMessagesComposio,
  sendGmailReplyComposio,
  isBulkOrAutomated,
  quarantineEmail,
  hasRecentAiReplyToSender,
  extractImagePartsWithCid,
  downloadAndUploadAttachmentsComposio,
  rewriteCidReferences,
  fetchMessageByIdComposio
} from '../_shared/gmail-helpers.ts'

const CONFIG_ID = '00000000-0000-0000-0000-000000000001'

function buildReplySubject(subject: string | null, ticketRef: string | null): string {
  let clean = (subject || '').replace(/\s*\[TKT-\d+\]\s*/g, '').trim()
  if (!clean.startsWith('Re:')) clean = `Re: ${clean}`
  if (ticketRef) clean = `${clean} [${ticketRef}]`
  return clean
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Backfill mode: ingest a wider window of past mail as tickets but suppress
    // ALL outbound side effects (admin notifications, AI drafts/replies). Used
    // to recover a gap (e.g. the Apr 27→Jun outage) without firing replies or a
    // notification storm at weeks-old email. Tickets are deduped by
    // gmail_message_id, so re-running is safe. POST {"backfill":true,"window":"newer_than:60d","limit":200}
    const reqBody = await req.json().catch(() => ({} as Record<string, unknown>))
    const backfill = reqBody?.backfill === true
    const fetchQuery = backfill ? (String(reqBody.window || 'newer_than:60d')) : 'newer_than:1d'
    const fetchLimit = backfill ? (Number(reqBody.limit) || 200) : 50
    if (backfill) console.log(`[poll] BACKFILL mode — window=${fetchQuery} limit=${fetchLimit}; replies/drafts/notifications suppressed`)
    // Repair mode: re-host inline images for already-ingested tickets that have
    // cid: refs but no attachments (gap-era tickets ingested before Composio
    // attachment support). POST {"repair":true,"repairLimit":100}
    const repair = reqBody?.repair === true
    const repairLimit = Number(reqBody.repairLimit) || 100

    // 1. Get support email config
    const { data: config, error: configError } = await supabase
      .from('support_email_config')
      .select('*')
      .eq('id', CONFIG_ID)
      .single()

    if (configError || !config || !config.gmail_address) {
      console.log('Gmail not configured, skipping poll')
      return new Response(JSON.stringify({ skipped: true, reason: 'not_configured' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 2. Get OAuth token for google_email
    const { data: provider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single()

    if (!provider) {
      return jsonResponse({ skipped: true, reason: 'provider_not_found' })
    }

    // Get the google_email integration matching the configured Gmail address
    const { data: integration, error: intError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('provider_id', provider.id)
      .eq('status', 'connected')
      .eq('external_user_id', config.gmail_address)
      .limit(1)
      .single()

    if (intError || !integration) {
      console.log('No connected Google Email integration found')
      return jsonResponse({ skipped: true, reason: 'not_connected' })
    }

    const composioRoute = isComposioManaged(integration)
    let accessToken: string | null = null
    if (!composioRoute) {
      accessToken = integration.access_token
      if (new Date(integration.token_expires_at) < new Date()) {
        accessToken = await refreshGoogleToken(supabase, integration)
        if (!accessToken) {
          await reportError(supabase, {
            error_type: 'gmail_token_expired',
            error_message: 'Failed to refresh Google OAuth token — Gmail polling is stopped until reconnected',
            source: 'supabase',
            severity: 'error',
            metadata: { function_name: 'poll-gmail-tickets', integration_id: integration.id },
          })
          return jsonResponse({ error: 'Failed to refresh Google token' }, 500)
        }
      }
    }

    // REPAIR mode: re-fetch + re-host inline images for already-ingested tickets
    // whose body_html references cid: images but have no attachments. Runs before
    // the normal poll and returns early. Idempotent (skips tickets that already
    // have attachments).
    if (repair) {
      if (!composioRoute) return jsonResponse({ repaired: 0, reason: 'repair only supported on composio route' })
      const { data: candidates } = await supabase
        .from('support_tickets')
        .select('id, gmail_message_id, thread_id, body_html, attachments')
        .eq('direction', 'inbound')
        .ilike('body_html', '%cid:%')
        .order('received_at', { ascending: false })
        .limit(repairLimit)

      let scanned = 0, repaired = 0
      for (const t of (candidates || [])) {
        if (Array.isArray(t.attachments) && t.attachments.length > 0) continue
        scanned++
        try {
          const full = await fetchMessageByIdComposio(integration.user_id, t.gmail_message_id)
          const imgParts = extractImagePartsWithCid(full?.payload)
          if (imgParts.length === 0) continue
          const uploaded = await downloadAndUploadAttachmentsComposio(
            integration.user_id, t.gmail_message_id, t.thread_id || t.gmail_message_id, imgParts, supabase
          )
          if (uploaded.length === 0) continue
          const newHtml = rewriteCidReferences(t.body_html, uploaded)
          await supabase.from('support_tickets').update({ attachments: uploaded, body_html: newHtml }).eq('id', t.id)
          await supabase.from('email_messages').update({ attachments: uploaded, body_html: newHtml }).eq('gmail_message_id', t.gmail_message_id)
          repaired++
          console.log(`[repair] ${t.gmail_message_id}: re-hosted ${uploaded.length} image(s)`)
        } catch (e) {
          console.error(`[repair] failed for ${t.gmail_message_id}:`, e)
        }
      }
      return jsonResponse({ repair: true, scanned, repaired })
    }

    // 3. Fetch messages from Gmail
    let messages: any[] = []

    console.log(`[poll] Starting fetch — last_history_id: ${config.last_history_id || 'null'}`)

    if (composioRoute) {
      // Composio doesn't expose Gmail's history-ID watermark; we fetch a
      // recent window and rely on per-message dedup via gmail_message_id.
      // Keep the window tight (24h) since polls run on cron — older mail
      // backfills via support_tickets dedup don't help.
      messages = await fetchRecentMessagesComposio(integration.user_id, fetchQuery, fetchLimit)
    } else if (config.last_history_id) {
      // Incremental sync via history API
      messages = await fetchViaHistory(accessToken!, config.last_history_id)
    } else {
      // Initial sync: get last 50 messages
      messages = await fetchRecentMessages(accessToken, 50)
    }

    console.log(`[poll] Fetched ${messages.length} messages from Gmail`)

    // 4. Process and upsert messages
    let newInboundCount = 0
    const newInboundMessages: any[] = []

    // Build set of our addresses for filtering
    const ourAddresses = new Set<string>()
    if (config.gmail_address) ourAddresses.add(config.gmail_address.toLowerCase())
    if (config.send_as_email) ourAddresses.add(config.send_as_email.toLowerCase())

    for (const msg of messages) {
      const parsed = parseGmailMessage(msg, config.gmail_address, config.send_as_email)
      if (!parsed) {
        console.log(`[poll] Skipped unparseable message id=${msg.id}`)
        continue
      }

      console.log(`[poll] Processing: id=${parsed.gmail_message_id} from=${parsed.from_email} subject="${(parsed.subject || '').substring(0, 60)}" dir=${parsed.direction}`)

      // Skip system/automated emails
      const fromLower = (parsed.from_email || '').toLowerCase()
      if (fromLower.includes('mailer-daemon') ||
          fromLower.includes('noreply') ||
          fromLower.includes('no-reply') ||
          fromLower.includes('postmaster') ||
          fromLower.includes('notifications@') ||
          fromLower.includes('notification@') ||
          fromLower.includes('systemgenerated') ||
          fromLower.includes('@magpipe.ai')) {
        console.log(`[poll] Skipping system email from: ${parsed.from_email}`)
        continue
      }

      // Bulk/automated header check — drops newsletters, "verify your
      // subscription", marketing, etc. Audit row in quarantined_emails.
      const bulkCheck = isBulkOrAutomated(msg.payload)
      if (bulkCheck.isBulk) {
        console.log(`[poll] Quarantining ${parsed.gmail_message_id} (${bulkCheck.reason})`)
        await quarantineEmail(supabase, {
          userId: integration.user_id,
          parsedMsg: parsed,
          reason: bulkCheck.reason!,
          reasonDetail: { matchedHeader: bulkCheck.matchedHeader, matchedValue: bulkCheck.matchedValue }
        })
        continue
      }

      // Upsert (dedup by gmail_message_id)
      const { data: existing } = await supabase
        .from('support_tickets')
        .select('id')
        .eq('gmail_message_id', parsed.gmail_message_id)
        .single()

      if (existing) {
        console.log(`[poll] Skipping dedup — already in support_tickets: ${parsed.gmail_message_id}`)
        continue
      }

      // Extract and upload image attachments. Composio-managed mailboxes have no
      // raw Gmail token, so route attachment fetches through Composio and rewrite
      // inline cid: refs so screenshots render in admin.
      if (composioRoute) {
        const imgParts = extractImagePartsWithCid(msg.payload)
        if (imgParts.length > 0) {
          const uploaded = await downloadAndUploadAttachmentsComposio(
            integration.user_id, parsed.gmail_message_id, parsed.thread_id || msg.threadId, imgParts, supabase
          )
          if (uploaded.length > 0) {
            parsed.attachments = uploaded
            parsed.body_html = rewriteCidReferences(parsed.body_html, uploaded)
          }
        }
      } else {
        const attachmentMetas = extractImageAttachments(msg.payload)
        if (attachmentMetas.length > 0) {
          const uploaded = await downloadAndUploadAttachments(
            accessToken!, parsed.gmail_message_id, parsed.thread_id || msg.threadId, attachmentMetas, supabase
          )
          if (uploaded.length > 0) {
            parsed.attachments = uploaded
          }
        }
      }

      // Check subject for ticket ref tag to match existing threads (e.g. Postmark replies)
      const refMatch = parsed.subject?.match(/\[TKT-(\d+)\]/)
      if (refMatch) {
        const refTag = `TKT-${refMatch[1]}`
        const { data: existingThread } = await supabase
          .from('support_tickets')
          .select('thread_id')
          .eq('ticket_ref', refTag)
          .limit(1)
          .single()

        if (existingThread) {
          parsed.thread_id = existingThread.thread_id
        }
      }

      // For new inbound messages, check if this is the first in a thread and assign ticket_ref
      if (parsed.direction === 'inbound') {
        const { count: threadCount } = await supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', parsed.thread_id)

        if ((threadCount || 0) === 0) {
          // First message in thread — generate ticket ref
          const { data: seqResult } = await supabase.rpc('nextval_ticket_ref')
          if (seqResult) {
            parsed.ticket_ref = `TKT-${String(seqResult).padStart(6, '0')}`
          }
        }
      }

      // Strip fields that aren't columns in support_tickets before insert
      const { message_id_header: _mid, ...insertData } = parsed
      const { error: insertError } = await supabase
        .from('support_tickets')
        .insert(insertData)

      if (insertError) {
        console.error('[poll] Failed to insert ticket:', insertError)
        continue
      }

      console.log(`[poll] INSERTED ticket: gmail_id=${parsed.gmail_message_id} thread=${parsed.thread_id} dir=${parsed.direction} ref=${parsed.ticket_ref || 'none'}`)

      // Cross-write to email_messages so Inbox view stays in sync
      const { data: existingEmail } = await supabase
        .from('email_messages')
        .select('id')
        .eq('gmail_message_id', parsed.gmail_message_id)
        .maybeSingle()

      if (!existingEmail) {
        const emailInsert: Record<string, any> = {
          user_id: integration.user_id,
          agent_id: config.support_agent_id || null,
          gmail_message_id: parsed.gmail_message_id,
          thread_id: parsed.thread_id,
          from_email: parsed.from_email,
          from_name: parsed.from_name,
          to_email: parsed.to_email,
          cc: parsed.cc_email || null,
          subject: parsed.subject,
          body_text: parsed.body_text,
          body_html: parsed.body_html,
          direction: parsed.direction,
          status: parsed.direction === 'inbound' ? 'delivered' : 'sent',
          is_read: parsed.direction === 'outbound',
          sent_at: parsed.received_at,
        }
        if (parsed.attachments?.length > 0) {
          emailInsert.attachments = parsed.attachments
        }
        const { error: emailError } = await supabase
          .from('email_messages')
          .insert(emailInsert)

        if (emailError) {
          console.error('[poll] Failed to cross-write to email_messages:', emailError.message)
        } else {
          console.log(`[poll] Cross-wrote to email_messages: ${parsed.gmail_message_id}`)
        }
      }

      if (parsed.direction === 'inbound') {
        newInboundCount++
        newInboundMessages.push(parsed)

        // Auto-enrich contact if not exists (fire and forget)
        autoEnrichEmailContact(integration.user_id, parsed.from_email, parsed.from_name, supabase)
          .catch(err => console.error('Email contact enrichment error:', err))
      }
    }

    // 5. Update history_id and last_polled_at — direct path only.
    // Composio doesn't surface a Gmail history-ID watermark; we still bump
    // last_polled_at so operators can see polling is alive.
    if (composioRoute) {
      await supabase
        .from('support_email_config')
        .update({
          last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', CONFIG_ID)
    } else {
      const latestHistoryId = await getLatestHistoryId(accessToken!)
      await supabase
        .from('support_email_config')
        .update({
          last_history_id: latestHistoryId,
          last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', CONFIG_ID)
      await supabase
        .from('agent_email_configs')
        .update({ last_history_id: latestHistoryId, updated_at: new Date().toISOString() })
        .eq('gmail_address', config.gmail_address)
    }

    // 6. Process new inbound messages — notifications + AI drafts/replies.
    // Skipped entirely in backfill mode: the tickets are already inserted above;
    // we don't want to notify or draft/reply against a recovered backlog.
    const sendFrom = config.send_as_email || config.gmail_address
    for (const msg of (backfill ? [] : newInboundMessages)) {
      // Send ticket acknowledgment — only when AI auto-reply is NOT enabled
      // (in auto mode, the AI reply is the first response the customer sees).
      // Composio path: deferred — ack via Composio reply action will land in
      // a follow-up. Skipping the ack for now is correct behavior (the AI
      // reply lands instead in auto mode; in draft mode the human handles it).
      if (config.agent_mode !== 'auto' && !composioRoute) {
        await sendTicketAcknowledgment(accessToken!, sendFrom, msg)
      }

      // Multi-channel admin notification (replaces old SMS-only alert)
      await sendAdminNotification(supabaseUrl, msg)

      // AI draft generation — only if we haven't already replied AFTER this inbound message
      if (config.agent_mode === 'draft' || config.agent_mode === 'auto') {
        const msgTime = msg.received_at || new Date().toISOString()

        const { count: ticketReplies } = await supabase
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', msg.thread_id)
          .eq('direction', 'outbound')
          .not('ai_draft', 'is', null)
          .gte('received_at', msgTime)

        const { count: emailReplies } = await supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', msg.thread_id)
          .eq('direction', 'outbound')
          .eq('is_ai_generated', true)
          .gte('sent_at', msgTime)

        const totalReplies = (ticketReplies || 0) + (emailReplies || 0)
        if (totalReplies > 0) {
          console.log(`Skipping AI draft for thread ${msg.thread_id} — already replied after ${msgTime}`)
          continue
        }

        // Rate-limit AI replies per sender (24h window) — backstop against
        // reply storms when spam slips past the bulk-header filter.
        if (await hasRecentAiReplyToSender(supabase, msg.from_email, 24)) {
          console.log(`[poll] rate-limited AI draft for ${msg.from_email} (replied within 24h)`)
          continue
        }

        await generateAiDraft(supabase, accessToken, config, msg, integration.user_id, integration)
      }
    }

    return jsonResponse({
      success: true,
      fetched: messages.length,
      newInbound: newInboundCount,
    })

  } catch (error: any) {
    console.error('Error in poll-gmail-tickets:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}


async function refreshGoogleToken(supabase: any, integration: any): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text())
      return null
    }

    const tokens = await response.json()
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)

    await supabase
      .from('user_integrations')
      .update({
        access_token: tokens.access_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    return tokens.access_token
  } catch (e) {
    console.error('Error refreshing Google token:', e)
    return null
  }
}


async function fetchRecentMessages(accessToken: string, maxResults: number): Promise<any[]> {
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!listResponse.ok) {
    console.error('Gmail list failed:', await listResponse.text())
    return []
  }

  const listData = await listResponse.json()
  if (!listData.messages) return []

  // Fetch full message details
  const messages: any[] = []
  for (const msg of listData.messages) {
    const detail = await fetchMessageDetail(accessToken, msg.id)
    if (detail) messages.push(detail)
  }

  return messages
}


async function fetchViaHistory(accessToken: string, historyId: string): Promise<any[]> {
  console.log(`[poll] fetchViaHistory: startHistoryId=${historyId}`)
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const text = await response.text()
    // 404 means historyId is too old, need full sync
    if (response.status === 404) {
      console.log('[poll] History ID expired (404), falling back to recent messages')
      return await fetchRecentMessages(accessToken, 50)
    }
    console.error('[poll] Gmail history failed:', response.status, text)
    return []
  }

  const data = await response.json()
  console.log(`[poll] History API response: ${data.history?.length || 0} history entries, historyId=${data.historyId}`)
  if (!data.history) return []

  const messageIds = new Set<string>()
  for (const h of data.history) {
    if (h.messagesAdded) {
      for (const m of h.messagesAdded) {
        messageIds.add(m.message.id)
      }
    }
  }

  console.log(`[poll] Found ${messageIds.size} unique new message IDs`)

  const messages: any[] = []
  for (const id of messageIds) {
    const detail = await fetchMessageDetail(accessToken, id)
    if (detail) messages.push(detail)
  }

  return messages
}


async function fetchMessageDetail(accessToken: string, messageId: string): Promise<any | null> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) return null
  return await response.json()
}


async function getLatestHistoryId(accessToken: string): Promise<string | null> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) return null
  const profile = await response.json()
  return profile.historyId || null
}


function parseGmailMessage(msg: any, gmailAddress: string, sendAsEmail?: string) {
  try {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const from = getHeader('From')
    const to = getHeader('To')
    const cc = getHeader('Cc')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageId = msg.id
    const messageIdHeader = getHeader('Message-ID') || getHeader('Message-Id')

    // Parse "Name <email>" or bare "email" formats
    let fromName = ''
    let fromEmail = from
    const angleMatch = from.match(/<([^>]+@[^>]+)>/)
    if (angleMatch) {
      fromEmail = angleMatch[1].trim()
      fromName = from.substring(0, from.indexOf('<')).replace(/"/g, '').trim()
    } else {
      const simpleMatch = from.match(/([^\s]+@[^\s]+)/)
      if (simpleMatch) fromEmail = simpleMatch[1].trim()
    }

    // Determine direction - check both gmail_address and send_as_email
    const fromLower = fromEmail.toLowerCase()
    const isOutbound = fromLower === gmailAddress.toLowerCase() ||
      (sendAsEmail ? fromLower === sendAsEmail.toLowerCase() : false)
    const direction = isOutbound ? 'outbound' : 'inbound'

    // Extract body
    const { text, html } = extractBody(msg.payload)

    // Labels
    const labels = msg.labelIds || []

    // For outbound messages, normalize from_email to send_as_email so the UI
    // shows the branded address (e.g. help@magpipe.ai) instead of the raw Gmail address
    const normalizedFrom = isOutbound && sendAsEmail ? sendAsEmail : fromEmail

    return {
      gmail_message_id: messageId,
      thread_id: msg.threadId,
      message_id_header: messageIdHeader,
      from_email: normalizedFrom,
      from_name: fromName,
      to_email: to,
      cc_email: cc || '',
      subject,
      body_text: text,
      body_html: html,
      direction,
      status: 'open',
      labels,
      received_at: date ? new Date(date).toISOString() : new Date(parseInt(msg.internalDate)).toISOString(),
    }
  } catch (e) {
    console.error('Error parsing Gmail message:', e)
    return null
  }
}




async function sendTicketAcknowledgment(accessToken: string, fromAddress: string, msg: any) {
  try {
    // Only send for messages that have a ticket_ref (new threads only)
    if (!msg.ticket_ref) {
      console.log('Skipping acknowledgment for follow-up message:', msg.thread_id)
      return
    }

    const subject = `Re: ${msg.subject} [${msg.ticket_ref}]`
    const senderName = msg.from_name || 'there'

    const body = `Hi ${senderName},

Thank you for reaching out! We've received your message and created a support ticket for you.

Ticket Reference: ${msg.ticket_ref}
Subject: ${msg.subject}

Our team typically responds within a few hours during business hours (Mon\u2013Fri, 9 AM \u2013 5 PM PST). We'll follow up with you directly in this email thread.

If you have any additional details to share, simply reply to this email.

Best regards,
The Support Team`

    const replyToId = msg.message_id_header || `<${msg.gmail_message_id}@mail.gmail.com>`
    const rawMessage = [
      `From: ${fromAddress}`,
      `To: ${msg.from_email}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${replyToId}`,
      `References: ${replyToId}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n')

    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded, threadId: msg.thread_id }),
    })

    if (!response.ok) {
      console.error('Failed to send ticket acknowledgment:', await response.text())
    } else {
      console.log('Ticket acknowledgment sent for:', msg.ticket_ref)
    }
  } catch (e) {
    console.error('Error sending ticket acknowledgment:', e)
  }
}


async function sendAdminNotification(supabaseUrl: string, msg: any) {
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const title = 'New Support Email'
    const body = `From ${msg.from_name || msg.from_email}: ${msg.subject || '(no subject)'}`

    await fetch(`${supabaseUrl}/functions/v1/admin-send-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ category: 'tickets', title, body }),
    })
  } catch (e) {
    console.error('Failed to send admin notification:', e)
  }
}


async function generateAiDraft(supabase: any, accessToken: string | null, config: any, msg: any, userId?: string, integration?: any) {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not set, skipping AI draft')
    return
  }

  try {
    // Get thread context
    const { data: threadMessages } = await supabase
      .from('support_tickets')
      .select('from_email, from_name, direction, body_text, received_at')
      .eq('thread_id', msg.thread_id)
      .order('received_at', { ascending: true })
      .limit(10)

    // Filter out auto-acknowledgment messages from thread context
    const humanMessages = (threadMessages || []).filter((m: any) => {
      if (m.direction !== 'outbound') return true
      if (m.body_text?.includes('created a support ticket')) return false
      return true
    })

    const threadContext = humanMessages
      .map((m: any) => `[${m.direction}] ${m.from_name || m.from_email}: ${(m.body_text || '').substring(0, 500)}`)
      .join('\n\n')

    const hasHumanReply = humanMessages.some((m: any) => m.direction === 'outbound')

    // Build system prompt from selected agent or default
    let systemPrompt = ''
    let agentModel = 'gpt-4o-mini'

    if (config.support_agent_id) {
      const { data: agent } = await supabase
        .from('agent_configs')
        .select('system_prompt, llm_model, temperature, knowledge_source_ids, agent_name')
        .eq('id', config.support_agent_id)
        .single()

      if (agent) {
        systemPrompt = agent.system_prompt || ''
        if (agent.llm_model) agentModel = agent.llm_model

        // Add support-specific instructions
        systemPrompt += `\n\nYou are now responding to a support email (not a phone call). Write a professional email reply.
- Be warm but concise
- Address the customer's question directly
- If you don't know the answer, say the team will follow up
- Never say the issue has "already been addressed" unless there is a substantive prior reply
- Sign off as "${agent.agent_name || 'The Support Team'}"`

        // Search knowledge base for relevant context
        if (agent.knowledge_source_ids?.length > 0) {
          try {
            const queryText = `${msg.subject || ''} ${(msg.body_text || '').substring(0, 500)}`

            // Generate embedding for the email content
            const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
              },
              body: JSON.stringify({
                model: 'text-embedding-ada-002',
                input: queryText,
              }),
            })

            if (embResponse.ok) {
              const embData = await embResponse.json()
              const embedding = embData.data?.[0]?.embedding

              if (embedding) {
                const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
                  query_embedding: embedding,
                  source_ids: agent.knowledge_source_ids,
                  match_count: 5,
                  similarity_threshold: 0.5,
                })

                if (chunks?.length > 0) {
                  const kbContext = chunks.map((c: any) => c.content).join('\n\n---\n\n')
                  systemPrompt += `\n\nRelevant knowledge base information:\n${kbContext}`
                  console.log(`Injected ${chunks.length} KB chunks into support draft`)
                }
              }
            }
          } catch (kbError) {
            console.error('KB search failed (non-fatal):', kbError)
          }
        }
      }
    }

    if (!systemPrompt) {
      systemPrompt = config.agent_system_prompt || `You are a support agent for Magpipe, an AI-powered phone and communications platform. Draft a helpful, professional reply to the customer's email.

Guidelines:
- Address the customer's specific question or issue directly
- Be warm but concise — aim for 2-4 sentences unless the topic needs more detail
- If you don't have enough context to fully answer, acknowledge their question and let them know the team will look into it
- Never say the issue has "already been addressed" unless there is a clear prior reply that resolved it
- Never make up features or pricing — if unsure, say the team will follow up with details
- Sign off as "The Magpipe Team"`
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: agentModel,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Draft a reply to this support email:\n\nFrom: ${msg.from_name || msg.from_email}\nSubject: ${msg.subject}\n\n${msg.body_text || ''}${threadContext ? `\n\nPrevious messages in thread:\n${threadContext}` : ''}${!hasHumanReply ? '\n\nNote: No one from the team has replied yet. This is the first response the customer will receive.' : ''}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return
    }

    const result = await response.json()
    const draftText = result.choices?.[0]?.message?.content

    if (!draftText) return

    // Look up ticket_ref for subject threading
    const { data: draftRefRow } = await supabase
      .from('support_tickets')
      .select('ticket_ref')
      .eq('thread_id', msg.thread_id)
      .not('ticket_ref', 'is', null)
      .limit(1)
      .single()
    const draftTicketRef = draftRefRow?.ticket_ref

    const sendFrom = config.send_as_email || config.gmail_address
    if (config.agent_mode === 'auto') {
      // Auto-send: send via Gmail and record
      // Composio-managed: route through GMAIL_REPLY_TO_THREAD; otherwise direct.
      if (isComposioManaged(integration)) {
        const replySubject = buildReplySubject(msg.subject, draftTicketRef)
        await sendGmailReplyComposio(integration.user_id, msg, draftText, replySubject)
      } else {
        await sendGmailReply(accessToken!, sendFrom, msg, draftText, draftTicketRef)
      }

      const autoGmailId = `auto-${Date.now()}-${msg.gmail_message_id}`
      const replySubject = buildReplySubject(msg.subject, draftTicketRef)
      const now = new Date().toISOString()

      // Insert outbound record into support_tickets
      await supabase.from('support_tickets').insert({
        gmail_message_id: autoGmailId,
        thread_id: msg.thread_id,
        from_email: sendFrom,
        from_name: '',
        to_email: msg.from_email,
        subject: replySubject,
        body_text: draftText,
        direction: 'outbound',
        status: 'open',
        ai_draft: draftText,
        ai_draft_status: 'sent',
        received_at: now,
      })

      // Cross-write to email_messages for Inbox sync
      if (userId) {
        await supabase.from('email_messages').insert({
          user_id: userId,
          agent_id: config.support_agent_id || null,
          gmail_message_id: autoGmailId,
          thread_id: msg.thread_id,
          from_email: sendFrom,
          to_email: msg.from_email,
          subject: replySubject,
          body_text: draftText,
          direction: 'outbound',
          status: 'sent',
          is_read: true,
          is_ai_generated: true,
          sent_at: now,
        })
      }

      // Update original message's draft status
      await supabase
        .from('support_tickets')
        .update({ ai_draft: draftText, ai_draft_status: 'sent' })
        .eq('gmail_message_id', msg.gmail_message_id)
    } else {
      // Draft mode: store for human approval
      await supabase
        .from('support_tickets')
        .update({ ai_draft: draftText, ai_draft_status: 'pending' })
        .eq('gmail_message_id', msg.gmail_message_id)
    }
  } catch (e) {
    console.error('Error generating AI draft:', e)
  }
}


async function sendGmailReply(accessToken: string, fromAddress: string, originalMsg: any, body: string, ticketRef?: string | null) {
  const subject = buildReplySubject(originalMsg.subject, ticketRef || null)

  // Build RFC 2822 message
  const rawMessage = [
    `From: ${fromAddress}`,
    `To: ${originalMsg.from_email}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${originalMsg.message_id_header || '<' + originalMsg.gmail_message_id + '@mail.gmail.com>'}`,
    `References: ${originalMsg.message_id_header || '<' + originalMsg.gmail_message_id + '@mail.gmail.com>'}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n')

  // Base64url encode
  const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded, threadId: originalMsg.thread_id }),
  })

  if (!response.ok) {
    console.error('Failed to send Gmail reply:', await response.text())
    throw new Error('Failed to send Gmail reply')
  }

  return await response.json()
}

/**
 * Walk the MIME tree and collect image attachment metadata.
 * Returns up to 10 image parts that are <= 5MB.
 */
function extractImageAttachments(payload: any): { attachmentId: string; filename: string; mimeType: string; size: number }[] {
  const results: { attachmentId: string; filename: string; mimeType: string; size: number }[] = []
  const MAX_ATTACHMENTS = 10
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB

  function walk(part: any) {
    if (results.length >= MAX_ATTACHMENTS) return

    if (part.body?.attachmentId && part.mimeType?.startsWith('image/')) {
      const size = part.body.size || 0
      if (size <= MAX_SIZE) {
        results.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename || `image-${results.length + 1}.${part.mimeType.split('/')[1] || 'png'}`,
          mimeType: part.mimeType,
          size,
        })
      }
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child)
      }
    }
  }

  if (payload) walk(payload)
  return results
}


/**
 * Download attachments from Gmail API, upload to Supabase Storage,
 * return array of {filename, url, mime_type, size_bytes}.
 */
async function downloadAndUploadAttachments(
  accessToken: string,
  messageId: string,
  threadId: string,
  metas: { attachmentId: string; filename: string; mimeType: string; size: number }[],
  supabase: any
): Promise<{ filename: string; url: string; mime_type: string; size_bytes: number }[]> {
  const results: { filename: string; url: string; mime_type: string; size_bytes: number }[] = []
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  for (const meta of metas) {
    try {
      // Fetch attachment data from Gmail
      const resp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${meta.attachmentId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )

      if (!resp.ok) {
        console.error(`Failed to download attachment ${meta.filename}:`, resp.status)
        continue
      }

      const attachData = await resp.json()
      if (!attachData.data) continue

      // Decode base64url to binary
      const base64 = attachData.data.replace(/-/g, '+').replace(/_/g, '/')
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Upload to storage
      const timestamp = Date.now()
      const safeName = meta.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${threadId}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(storagePath, bytes, {
          contentType: meta.mimeType,
          upsert: false,
        })

      if (uploadError) {
        console.error(`Failed to upload ${meta.filename}:`, uploadError.message)
        continue
      }

      const publicUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/support-attachments/${storagePath}`

      results.push({
        filename: meta.filename,
        url: publicUrl,
        mime_type: meta.mimeType,
        size_bytes: meta.size,
      })

      console.log(`Uploaded attachment: ${meta.filename} (${meta.size} bytes)`)
    } catch (e) {
      console.error(`Error processing attachment ${meta.filename}:`, e)
    }
  }

  return results
}


async function autoEnrichEmailContact(
  userId: string,
  email: string,
  fromName: string | null,
  supabase: any
) {
  const normalizedEmail = email.toLowerCase().trim()

  // Check if contact already exists by email
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('user_id', userId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingContact) {
    console.log('Contact already exists for', normalizedEmail)
    return
  }

  console.log('No contact found for', normalizedEmail, '- attempting enrichment')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Call contact-lookup with email (Apollo supports email lookups)
  const response = await fetch(
    `${supabaseUrl}/functions/v1/contact-lookup`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail }),
    }
  )

  const data = await response.json()

  if (!response.ok || data.notFound || !data.success) {
    // No enrichment data — create basic contact from email header name
    console.log('No enrichment data for', normalizedEmail, '- creating basic contact')
    const nameParts = fromName ? fromName.trim().split(/\s+/) : []
    const firstName = nameParts[0] || normalizedEmail.split('@')[0]
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

    await supabase.from('contacts').insert({
      user_id: userId,
      email: normalizedEmail,
      name: fromName || firstName,
      first_name: firstName,
      last_name: lastName,
      is_whitelisted: false,
    })
    console.log('Created basic email contact for', normalizedEmail)
    return
  }

  // Create enriched contact
  const contact = data.contact
  const firstName = contact.first_name || (fromName ? fromName.split(' ')[0] : normalizedEmail.split('@')[0])
  const lastName = contact.last_name || (fromName ? fromName.split(' ').slice(1).join(' ') : null)
  const fullName = contact.name || [firstName, lastName].filter(Boolean).join(' ')

  await supabase.from('contacts').insert({
    user_id: userId,
    email: normalizedEmail,
    phone_number: contact.phone || null,
    name: fullName,
    first_name: firstName,
    last_name: lastName,
    address: contact.address || null,
    company: contact.company || null,
    job_title: contact.job_title || null,
    avatar_url: contact.avatar_url || null,
    linkedin_url: contact.linkedin_url || null,
    twitter_url: contact.twitter_url || null,
    facebook_url: contact.facebook_url || null,
    enriched_at: new Date().toISOString(),
    is_whitelisted: false,
  })
  console.log('Created enriched email contact for', normalizedEmail, '- company:', contact.company)
}
