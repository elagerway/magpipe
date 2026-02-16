import { createClient } from 'npm:@supabase/supabase-js@2'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Get all active agent email configs
    const { data: emailConfigs, error: configError } = await supabase
      .from('agent_email_configs')
      .select('*')
      .eq('is_active', true)
      .neq('agent_mode', 'off')

    if (configError || !emailConfigs?.length) {
      console.log('No active email configs:', configError?.message || 'none found')
      return jsonResponse({ skipped: true, reason: 'no_active_configs' })
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

    // Process each email config (could be multiple agents with different emails)
    let totalNewInbound = 0

    for (const config of emailConfigs) {
      if (!config.gmail_address) continue

      // Get the integration for this user
      let integration: any = null
      if (config.integration_id) {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('id', config.integration_id)
          .eq('status', 'connected')
          .single()
        integration = data
      } else {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', config.user_id)
          .eq('provider_id', provider.id)
          .eq('status', 'connected')
          .limit(1)
          .single()
        integration = data
      }

      if (!integration) {
        console.log(`No integration found for agent email config ${config.id}`)
        continue
      }

      // Refresh token if expired
      let accessToken = integration.access_token
      if (new Date(integration.token_expires_at) < new Date()) {
        accessToken = await refreshGoogleToken(supabase, integration)
        if (!accessToken) {
          console.error(`Failed to refresh token for config ${config.id}`)
          continue
        }
      }

      // 3. Fetch new messages from Gmail
      let messages: any[] = []
      if (config.last_history_id) {
        messages = await fetchViaHistory(accessToken, config.last_history_id)
      } else {
        // First run: just set the history_id baseline, don't import old emails
        const historyId = await getLatestHistoryId(accessToken)
        await supabase
          .from('agent_email_configs')
          .update({
            last_history_id: historyId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
        console.log(`Config ${config.id}: initial sync, set history_id to ${historyId}`)
        continue
      }

      console.log(`Config ${config.id}: fetched ${messages.length} messages`)

      // 4. Process messages
      const newInboundMessages: any[] = []

      // Build list of our addresses for direction detection and filtering
      const ourAddresses = new Set<string>()
      if (config.gmail_address) ourAddresses.add(config.gmail_address.toLowerCase())
      if (config.send_as_email) ourAddresses.add(config.send_as_email.toLowerCase())

      for (const msg of messages) {
        const parsed = parseGmailMessage(msg, config.gmail_address, config.send_as_email)
        if (!parsed) continue

        // Only process emails sent TO our configured address(es)
        // Skip emails that don't involve our addresses as recipients (for inbound) or sender (for outbound)
        if (parsed.direction === 'inbound') {
          const toAddresses = (parsed.to_email || '').toLowerCase()
          const isToUs = [...ourAddresses].some(addr => toAddresses.includes(addr))
          if (!isToUs) continue
        }

        // Skip system/automated emails
        const fromLower = (parsed.from_email || '').toLowerCase()
        if (fromLower.includes('mailer-daemon') ||
            fromLower.includes('noreply') ||
            fromLower.includes('no-reply') ||
            fromLower.includes('postmaster') ||
            fromLower.includes('notifications@') ||
            fromLower.includes('notification@') ||
            fromLower.includes('systemgenerated')) {
          console.log(`Skipping system email from: ${parsed.from_email}`)
          continue
        }

        // Dedup
        const { data: existing } = await supabase
          .from('email_messages')
          .select('id')
          .eq('gmail_message_id', parsed.gmail_message_id)
          .single()

        if (existing) continue

        // Run sentiment analysis on inbound messages
        let sentiment: string | null = null
        if (parsed.direction === 'inbound') {
          try {
            sentiment = await analyzeSentiment(parsed.body_text || parsed.subject || '')
          } catch (e) {
            console.error('Sentiment analysis failed:', e)
          }
        }

        // Extract image attachments
        let attachments: any[] = []
        const attachmentMetas = extractImageAttachments(msg.payload)
        if (attachmentMetas.length > 0) {
          attachments = await downloadAndUploadAttachments(
            accessToken, parsed.gmail_message_id, parsed.thread_id, attachmentMetas, supabase, supabaseUrl
          )
          console.log(`email_messages: uploaded ${attachments.length} attachment(s) for msg ${parsed.gmail_message_id}`)
        }

        // Insert into email_messages
        const insertData: Record<string, any> = {
            user_id: config.user_id,
            agent_id: config.agent_id,
            gmail_message_id: parsed.gmail_message_id,
            thread_id: parsed.thread_id,
            from_email: parsed.from_email,
            from_name: parsed.from_name,
            to_email: parsed.to_email,
            subject: parsed.subject,
            body_text: parsed.body_text,
            body_html: parsed.body_html,
            direction: parsed.direction,
            status: parsed.direction === 'inbound' ? 'delivered' : 'sent',
            is_read: parsed.direction === 'outbound',
            sentiment,
            sent_at: parsed.received_at,
        }
        if (attachments.length > 0) {
          insertData.attachments = attachments
        }
        const { error: insertError } = await supabase
          .from('email_messages')
          .insert(insertData)

        if (insertError) {
          console.error('Failed to insert email:', insertError)
          continue
        }

        if (parsed.direction === 'inbound') {
          newInboundMessages.push({ ...parsed, sentiment })

          // Auto-enrich contact if not exists (fire and forget)
          autoEnrichEmailContact(config.user_id, parsed.from_email, parsed.from_name, supabase)
            .catch(err => console.error('Email contact enrichment error:', err))
          deductEmailCredits(supabaseUrl, supabaseKey, config.user_id, 1)
            .catch(err => console.error('Email credit deduction error:', err))
        }
      }

      // 5. Update last_history_id
      const latestHistoryId = await getLatestHistoryId(accessToken)
      await supabase
        .from('agent_email_configs')
        .update({
          last_history_id: latestHistoryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id)

      // 6. Generate AI replies for new inbound messages
      // Fetch agent details separately
      let agent: any = null
      if (config.agent_id) {
        const { data: agentData } = await supabase
          .from('agent_configs')
          .select('id, system_prompt, llm_model, temperature, knowledge_source_ids, agent_name')
          .eq('id', config.agent_id)
          .single()
        agent = agentData
      }
      const sendFrom = config.send_as_email || config.gmail_address

      for (const msg of newInboundMessages) {
        totalNewInbound++

        if (config.agent_mode === 'draft' || config.agent_mode === 'auto') {
          // Check if there's already an AI reply AFTER this inbound message (prevent double-reply to same message)
          const msgTime = msg.received_at || new Date().toISOString()

          const { count: emailReplies } = await supabase
            .from('email_messages')
            .select('id', { count: 'exact', head: true })
            .eq('thread_id', msg.thread_id)
            .eq('direction', 'outbound')
            .eq('is_ai_generated', true)
            .gte('sent_at', msgTime)

          const { count: ticketReplies } = await supabase
            .from('support_tickets')
            .select('id', { count: 'exact', head: true })
            .eq('thread_id', msg.thread_id)
            .eq('direction', 'outbound')
            .not('ai_draft', 'is', null)
            .gte('received_at', msgTime)

          const totalReplies = (emailReplies || 0) + (ticketReplies || 0)
          if (totalReplies > 0) {
            console.log(`Skipping AI reply for thread ${msg.thread_id} — already replied after ${msgTime}`)
            continue
          }

          await generateAiReply(supabase, accessToken, config, agent, sendFrom, msg)
        }
      }
    }

    return jsonResponse({
      success: true,
      configs_processed: emailConfigs.length,
      new_inbound: totalNewInbound,
    })

  } catch (error: any) {
    console.error('Error in poll-gmail-inbox:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


async function deductEmailCredits(supabaseUrl: string, supabaseKey: string, userId: string, messageCount: number) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ userId, type: 'email', messageCount, referenceType: 'email' })
    })
    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} email(s), balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct email credits:', result.error)
    }
  } catch (err) {
    console.error('Error deducting email credits:', err)
  }
}

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
    if (response.status === 404) {
      console.log('History ID expired, falling back to recent messages')
      return await fetchRecentMessages(accessToken, 10)
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


function parseGmailMessage(msg: any, gmailAddress: string, sendAsEmail?: string) {
  try {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const from = getHeader('From')
    const to = getHeader('To')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageIdHeader = getHeader('Message-ID') || getHeader('Message-Id')

    // Parse "Name <email>" or just "email" — handle various formats
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

    // Check if from our gmail address or send-as alias
    const fromLower = fromEmail.toLowerCase()
    const isOutbound = fromLower === gmailAddress.toLowerCase() ||
      (sendAsEmail && fromLower === sendAsEmail.toLowerCase())
    const direction = isOutbound ? 'outbound' : 'inbound'

    const { text, html } = extractBody(msg.payload)

    return {
      gmail_message_id: msg.id,
      thread_id: msg.threadId,
      message_id_header: messageIdHeader,
      from_email: fromEmail,
      from_name: fromName,
      to_email: to,
      subject,
      body_text: text,
      body_html: html,
      direction,
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

  if (payload.body?.data) {
    const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    if (payload.mimeType === 'text/plain') text = decoded
    if (payload.mimeType === 'text/html') html = decoded
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      if (part.parts) {
        const nested = extractBody(part)
        if (nested.text) text = nested.text
        if (nested.html) html = nested.html
      }
    }
  }

  return { text, html }
}


async function generateAiReply(
  supabase: any,
  accessToken: string,
  config: any,
  agent: any,
  sendFrom: string,
  msg: any
) {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not set, skipping AI reply')
    return
  }

  try {
    // Get thread context
    const { data: threadMessages } = await supabase
      .from('email_messages')
      .select('from_email, from_name, direction, body_text, sent_at')
      .eq('thread_id', msg.thread_id)
      .order('sent_at', { ascending: true })
      .limit(10)

    const threadContext = (threadMessages || [])
      .map((m: any) => `[${m.direction}] ${m.from_name || m.from_email}: ${(m.body_text || '').substring(0, 500)}`)
      .join('\n\n')

    const hasReply = (threadMessages || []).some((m: any) => m.direction === 'outbound')

    // Build system prompt from agent config
    let systemPrompt = agent?.system_prompt || ''
    let agentModel = agent?.llm_model || 'gpt-4o-mini'
    const agentName = agent?.agent_name || 'Magpipe Team'

    systemPrompt += `\n\nYou are now responding to an email (not a phone call). Write a professional email reply.
- Be warm but concise
- Address the sender's question directly
- If you don't know the answer, say the team will follow up
- Never say the issue has "already been addressed" unless there is a clear prior reply
- Sign off as "${agentName}"`

    // Search knowledge base if available
    if (agent?.knowledge_source_ids?.length > 0) {
      try {
        const queryText = `${msg.subject || ''} ${(msg.body_text || '').substring(0, 500)}`

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
              console.log(`Injected ${chunks.length} KB chunks into email reply`)
            }
          }
        }
      } catch (kbError) {
        console.error('KB search failed (non-fatal):', kbError)
      }
    }

    if (!systemPrompt.trim()) {
      systemPrompt = `You are a helpful email assistant. Draft a professional reply to the sender's email.
- Be warm but concise
- Address their question directly
- If unsure, say the team will follow up
- Sign off as "Magpipe Team"`
    }

    // Generate AI reply
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
            content: `Draft a reply to this email:\n\nFrom: ${msg.from_name || msg.from_email}\nSubject: ${msg.subject}\n\n${msg.body_text || ''}${threadContext ? `\n\nPrevious messages in thread:\n${threadContext}` : ''}${!hasReply ? '\n\nNote: No one has replied yet. This is the first response.' : ''}`,
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

    // Analyze sentiment of the AI reply
    let replySentiment: string | null = null
    try {
      replySentiment = await analyzeSentiment(draftText)
    } catch (e) { /* non-fatal */ }

    const replySubject = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`

    if (config.agent_mode === 'auto') {
      // Auto-send: send via Gmail and record
      const gmailResult = await sendGmailReply(accessToken, sendFrom, msg, draftText, replySubject)

      if (gmailResult) {
        await supabase.from('email_messages').insert({
          user_id: config.user_id,
          agent_id: config.agent_id,
          gmail_message_id: gmailResult.id,
          thread_id: gmailResult.threadId || msg.thread_id,
          from_email: sendFrom,
          to_email: msg.from_email,
          subject: replySubject,
          body_text: draftText,
          direction: 'outbound',
          status: 'sent',
          is_ai_generated: true,
          is_read: true,
          sentiment: replySentiment,
          sent_at: new Date().toISOString(),
        })
        console.log(`Auto-sent AI reply for thread ${msg.thread_id}`)
      }
    } else {
      // Draft mode: store draft on the inbound message for human approval
      // Update the inbound message with the AI draft
      await supabase
        .from('email_messages')
        .update({
          ai_draft: draftText,
          ai_draft_status: 'pending',
        })
        .eq('gmail_message_id', msg.gmail_message_id)

      console.log(`Stored AI draft for thread ${msg.thread_id}`)
    }

  } catch (e) {
    console.error('Error generating AI reply:', e)
  }
}


async function sendGmailReply(
  accessToken: string,
  fromAddress: string,
  originalMsg: any,
  body: string,
  subject: string
): Promise<any | null> {
  // Use RFC 2822 Message-ID header for proper threading
  const replyToId = originalMsg.message_id_header || `<${originalMsg.gmail_message_id}@mail.gmail.com>`
  const rawMessage = [
    `From: ${fromAddress}`,
    `To: ${originalMsg.from_email}`,
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
    body: JSON.stringify({ raw: encoded, threadId: originalMsg.thread_id }),
  })

  if (!response.ok) {
    console.error('Failed to send Gmail reply:', await response.text())
    return null
  }

  return await response.json()
}

async function autoEnrichEmailContact(
  userId: string,
  email: string,
  fromName: string | null,
  supabase: any
) {
  const normalizedEmail = email.toLowerCase().trim()

  // 1. Check if contact already exists by email
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

  // 2. Call contact-lookup for enrichment data
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
    // No enrichment data — try name match before creating basic contact
    console.log('No enrichment data for', normalizedEmail, '- checking for existing contact by name')
    const nameParts = fromName ? fromName.trim().split(/\s+/) : []
    const firstName = nameParts[0] || normalizedEmail.split('@')[0]
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

    if (firstName && lastName) {
      const { data: nameMatches } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .is('email', null)
        .limit(1)

      if (nameMatches?.[0]) {
        await supabase.from('contacts').update({
          email: normalizedEmail,
        }).eq('id', nameMatches[0].id)
        console.log('Merged email into existing name-matched contact:', nameMatches[0].id)
        return
      }
    }

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

  // Enrichment succeeded
  const contact = data.contact
  const firstName = contact.first_name || (fromName ? fromName.split(' ')[0] : normalizedEmail.split('@')[0])
  const lastName = contact.last_name || (fromName ? fromName.split(' ').slice(1).join(' ') : null)
  const fullName = contact.name || [firstName, lastName].filter(Boolean).join(' ')

  // 3. If enrichment returns phone, try to find existing contact by phone
  if (contact.phone) {
    const phoneDigits = contact.phone.replace(/\D/g, '')
    const phoneForms = [contact.phone]
    if (phoneDigits.length === 10) {
      phoneForms.push(`+1${phoneDigits}`, phoneDigits)
    } else if (phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
      phoneForms.push(`+${phoneDigits}`, phoneDigits, phoneDigits.substring(1))
    }

    const orConditions = phoneForms.map(p => `phone_number.eq.${p}`).join(',')
    const { data: phoneMatches } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .or(orConditions)
      .limit(1)

    if (phoneMatches?.[0]) {
      const existing = phoneMatches[0]
      const updates: Record<string, any> = { email: normalizedEmail, enriched_at: new Date().toISOString() }
      if (!existing.name && fullName) updates.name = fullName
      if (!existing.first_name && firstName) updates.first_name = firstName
      if (!existing.last_name && lastName) updates.last_name = lastName
      if (!existing.company && contact.company) updates.company = contact.company
      if (!existing.job_title && contact.job_title) updates.job_title = contact.job_title
      if (!existing.address && contact.address) updates.address = contact.address
      if (!existing.avatar_url && contact.avatar_url) updates.avatar_url = contact.avatar_url
      if (!existing.linkedin_url && contact.linkedin_url) updates.linkedin_url = contact.linkedin_url
      if (!existing.twitter_url && contact.twitter_url) updates.twitter_url = contact.twitter_url
      if (!existing.facebook_url && contact.facebook_url) updates.facebook_url = contact.facebook_url

      await supabase.from('contacts').update(updates).eq('id', existing.id)
      console.log('Merged email+enrichment into phone-matched contact:', existing.id, existing.phone_number)
      return
    }
  }

  // 4. Try name match (first_name + last_name, case-insensitive, no email set)
  if (firstName && lastName) {
    const { data: nameMatches } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .is('email', null)
      .limit(1)

    if (nameMatches?.[0]) {
      const existing = nameMatches[0]
      const updates: Record<string, any> = { email: normalizedEmail, enriched_at: new Date().toISOString() }
      if (!existing.phone_number && contact.phone) updates.phone_number = contact.phone
      if (!existing.name && fullName) updates.name = fullName
      if (!existing.company && contact.company) updates.company = contact.company
      if (!existing.job_title && contact.job_title) updates.job_title = contact.job_title
      if (!existing.address && contact.address) updates.address = contact.address
      if (!existing.avatar_url && contact.avatar_url) updates.avatar_url = contact.avatar_url
      if (!existing.linkedin_url && contact.linkedin_url) updates.linkedin_url = contact.linkedin_url
      if (!existing.twitter_url && contact.twitter_url) updates.twitter_url = contact.twitter_url
      if (!existing.facebook_url && contact.facebook_url) updates.facebook_url = contact.facebook_url

      await supabase.from('contacts').update(updates).eq('id', existing.id)
      console.log('Merged email+enrichment into name-matched contact:', existing.id)
      return
    }
  }

  // 5. No match — create new enriched contact
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


/**
 * Walk the MIME tree and collect image attachment metadata (max 10, max 5MB each).
 */
function extractImageAttachments(payload: any): { attachmentId: string; filename: string; mimeType: string; size: number }[] {
  const results: { attachmentId: string; filename: string; mimeType: string; size: number }[] = []
  const MAX_ATTACHMENTS = 10
  const MAX_SIZE = 5 * 1024 * 1024

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
      for (const child of part.parts) walk(child)
    }
  }

  if (payload) walk(payload)
  return results
}


/**
 * Download attachments from Gmail API, upload to Supabase Storage.
 */
async function downloadAndUploadAttachments(
  accessToken: string,
  messageId: string,
  threadId: string,
  metas: { attachmentId: string; filename: string; mimeType: string; size: number }[],
  supabase: any,
  supabaseUrl: string
): Promise<{ filename: string; url: string; mime_type: string; size_bytes: number }[]> {
  const results: { filename: string; url: string; mime_type: string; size_bytes: number }[] = []

  for (const meta of metas) {
    try {
      const resp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${meta.attachmentId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      if (!resp.ok) continue

      const attachData = await resp.json()
      if (!attachData.data) continue

      const base64 = attachData.data.replace(/-/g, '+').replace(/_/g, '/')
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const timestamp = Date.now()
      const safeName = meta.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${threadId}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(storagePath, bytes, { contentType: meta.mimeType, upsert: false })

      if (uploadError) {
        console.error(`Failed to upload ${meta.filename}:`, uploadError.message)
        continue
      }

      results.push({
        filename: meta.filename,
        url: `https://api.magpipe.ai/storage/v1/object/public/support-attachments/${storagePath}`,
        mime_type: meta.mimeType,
        size_bytes: meta.size,
      })
    } catch (e) {
      console.error(`Error processing attachment ${meta.filename}:`, e)
    }
  }

  return results
}
