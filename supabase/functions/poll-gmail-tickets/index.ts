import { createClient } from 'npm:@supabase/supabase-js@2'

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

    // Get any user's google_email integration (admin-level, single Gmail account)
    const { data: integration, error: intError } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('provider_id', provider.id)
      .eq('status', 'connected')
      .limit(1)
      .single()

    if (intError || !integration) {
      console.log('No connected Google Email integration found')
      return jsonResponse({ skipped: true, reason: 'not_connected' })
    }

    // Refresh token if expired
    let accessToken = integration.access_token
    if (new Date(integration.token_expires_at) < new Date()) {
      accessToken = await refreshGoogleToken(supabase, integration)
      if (!accessToken) {
        return jsonResponse({ error: 'Failed to refresh Google token' }, 500)
      }
    }

    // 3. Fetch messages from Gmail
    let messages: any[] = []

    if (config.last_history_id) {
      // Incremental sync via history API
      messages = await fetchViaHistory(accessToken, config.last_history_id)
    } else {
      // Initial sync: get last 50 messages
      messages = await fetchRecentMessages(accessToken, 50)
    }

    console.log(`Fetched ${messages.length} messages from Gmail`)

    // 4. Process and upsert messages
    let newInboundCount = 0
    const newInboundMessages: any[] = []

    for (const msg of messages) {
      const parsed = parseGmailMessage(msg, config.gmail_address)
      if (!parsed) continue

      // Upsert (dedup by gmail_message_id)
      const { data: existing } = await supabase
        .from('support_tickets')
        .select('id')
        .eq('gmail_message_id', parsed.gmail_message_id)
        .single()

      if (existing) continue // Already have this message

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

      const { error: insertError } = await supabase
        .from('support_tickets')
        .insert(parsed)

      if (insertError) {
        console.error('Failed to insert ticket:', insertError)
        continue
      }

      if (parsed.direction === 'inbound') {
        newInboundCount++
        newInboundMessages.push(parsed)
      }
    }

    // 5. Update history_id and last_polled_at
    const latestHistoryId = await getLatestHistoryId(accessToken)
    await supabase
      .from('support_email_config')
      .update({
        last_history_id: latestHistoryId,
        last_polled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', CONFIG_ID)

    // 6. Process new inbound messages
    for (const msg of newInboundMessages) {
      // Send ticket acknowledgment auto-reply (only for new threads with ticket_ref)
      await sendTicketAcknowledgment(accessToken, config.gmail_address, msg)

      // Multi-channel admin notification (replaces old SMS-only alert)
      await sendAdminNotification(supabaseUrl, msg)

      // AI draft generation
      if (config.agent_mode === 'draft' || config.agent_mode === 'auto') {
        await generateAiDraft(supabase, accessToken, config, msg)
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
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    const text = await response.text()
    // 404 means historyId is too old, need full sync
    if (response.status === 404) {
      console.log('History ID expired, falling back to recent messages')
      return await fetchRecentMessages(accessToken, 50)
    }
    console.error('Gmail history failed:', text)
    return []
  }

  const data = await response.json()
  if (!data.history) return []

  const messageIds = new Set<string>()
  for (const h of data.history) {
    if (h.messagesAdded) {
      for (const m of h.messagesAdded) {
        messageIds.add(m.message.id)
      }
    }
  }

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


function parseGmailMessage(msg: any, gmailAddress: string) {
  try {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const from = getHeader('From')
    const to = getHeader('To')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageId = msg.id

    // Parse from name and email
    const fromMatch = from.match(/^(?:"?(.+?)"?\s*)?<?([^>]+@[^>]+)>?$/)
    const fromName = fromMatch?.[1]?.trim() || ''
    const fromEmail = fromMatch?.[2]?.trim() || from

    // Determine direction
    const isOutbound = fromEmail.toLowerCase() === gmailAddress.toLowerCase()
    const direction = isOutbound ? 'outbound' : 'inbound'

    // Extract body
    const { text, html } = extractBody(msg.payload)

    // Labels
    const labels = msg.labelIds || []

    return {
      gmail_message_id: messageId,
      thread_id: msg.threadId,
      from_email: fromEmail,
      from_name: fromName,
      to_email: to,
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


function extractBody(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''

  if (!payload) return { text, html }

  // Single-part message
  if (payload.body?.data) {
    const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    if (payload.mimeType === 'text/plain') text = decoded
    if (payload.mimeType === 'text/html') html = decoded
  }

  // Multipart message
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      // Nested multipart
      if (part.parts) {
        const nested = extractBody(part)
        if (nested.text) text = nested.text
        if (nested.html) html = nested.html
      }
    }
  }

  return { text, html }
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

    const rawMessage = [
      `From: ${fromAddress}`,
      `To: ${msg.from_email}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${msg.gmail_message_id}`,
      `References: ${msg.gmail_message_id}`,
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


async function generateAiDraft(supabase: any, accessToken: string, config: any, msg: any) {
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

    const threadContext = (threadMessages || [])
      .map((m: any) => `[${m.direction}] ${m.from_name || m.from_email}: ${(m.body_text || '').substring(0, 500)}`)
      .join('\n\n')

    const systemPrompt = config.agent_system_prompt || 'You are a helpful support agent. Be concise and professional.'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Reply to this support email thread:\n\nFrom: ${msg.from_name || msg.from_email}\nSubject: ${msg.subject}\n\n${msg.body_text || ''}\n\n${threadContext ? `Previous messages in thread:\n${threadContext}` : ''}`,
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

    if (config.agent_mode === 'auto') {
      // Auto-send: send via Gmail and record
      await sendGmailReply(accessToken, config.gmail_address, msg, draftText, draftTicketRef)

      // Insert outbound record
      await supabase.from('support_tickets').insert({
        gmail_message_id: `auto-${Date.now()}-${msg.gmail_message_id}`,
        thread_id: msg.thread_id,
        from_email: config.gmail_address,
        from_name: '',
        to_email: msg.from_email,
        subject: buildReplySubject(msg.subject, draftTicketRef),
        body_text: draftText,
        direction: 'outbound',
        status: 'open',
        ai_draft: draftText,
        ai_draft_status: 'sent',
        received_at: new Date().toISOString(),
      })

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
    `In-Reply-To: ${originalMsg.gmail_message_id}`,
    `References: ${originalMsg.gmail_message_id}`,
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
