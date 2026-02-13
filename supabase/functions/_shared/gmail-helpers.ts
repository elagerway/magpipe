/**
 * Shared Gmail helper functions
 * Used by: poll-gmail-inbox, gmail-push-webhook, gmail-watch-renew, integration-oauth-callback
 */

import { analyzeSentiment } from './sentiment-analysis.ts'

// ─── Token Management ───────────────────────────────────────────────

export async function refreshGoogleToken(supabase: any, integration: any): Promise<string | null> {
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

export async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date()) {
    return integration.access_token
  }
  return await refreshGoogleToken(supabase, integration)
}

// ─── Gmail API Calls ────────────────────────────────────────────────

export async function fetchViaHistory(accessToken: string, historyId: string): Promise<any[]> {
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

export async function fetchRecentMessages(accessToken: string, maxResults: number): Promise<any[]> {
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

export async function fetchMessageDetail(accessToken: string, messageId: string): Promise<any | null> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) return null
  return await response.json()
}

export async function getLatestHistoryId(accessToken: string): Promise<string | null> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  if (!response.ok) return null
  const profile = await response.json()
  return profile.historyId || null
}

// ─── Message Parsing ────────────────────────────────────────────────

export function parseGmailMessage(msg: any, gmailAddress: string, sendAsEmail?: string) {
  try {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const from = getHeader('From')
    const to = getHeader('To')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageIdHeader = getHeader('Message-ID') || getHeader('Message-Id')

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

    const fromLower = fromEmail.toLowerCase()
    const isOutbound = fromLower === gmailAddress.toLowerCase() ||
      (sendAsEmail ? fromLower === sendAsEmail.toLowerCase() : false)
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

export function extractBody(payload: any): { text: string; html: string } {
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

export function isSystemEmail(fromEmail: string): boolean {
  const lower = (fromEmail || '').toLowerCase()
  return lower.includes('mailer-daemon') ||
    lower.includes('noreply') ||
    lower.includes('no-reply') ||
    lower.includes('postmaster') ||
    lower.includes('notifications@') ||
    lower.includes('notification@') ||
    lower.includes('systemgenerated')
}

// ─── Contact Enrichment ─────────────────────────────────────────────

export async function autoEnrichEmailContact(
  userId: string,
  email: string,
  fromName: string | null,
  supabase: any
) {
  const normalizedEmail = email.toLowerCase().trim()

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

// ─── AI Reply Generation ────────────────────────────────────────────

export async function generateAiReply(
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

    let systemPrompt = agent?.system_prompt || ''
    let agentModel = agent?.llm_model || 'gpt-4o-mini'
    const agentName = agent?.agent_name || 'Magpipe Team'

    systemPrompt += `\n\nYou are now responding to an email (not a phone call). Write a professional email reply.
- Be warm but concise
- Address the sender's question directly
- If you don't know the answer, say the team will follow up
- Never say the issue has "already been addressed" unless there is a clear prior reply
- Sign off as "${agentName}"`

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

    let replySentiment: string | null = null
    try {
      replySentiment = await analyzeSentiment(draftText)
    } catch (e) { /* non-fatal */ }

    const replySubject = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`

    if (config.agent_mode === 'auto') {
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

// ─── Gmail Send ─────────────────────────────────────────────────────

export async function sendGmailReply(
  accessToken: string,
  fromAddress: string,
  originalMsg: any,
  body: string,
  subject: string
): Promise<any | null> {
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

// ─── Gmail Watch (Pub/Sub) ──────────────────────────────────────────

export async function setupGmailWatch(
  accessToken: string,
  topicName: string
): Promise<{ historyId: string; expiration: string; resourceId?: string } | null> {
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Gmail watch setup failed:', text)
      return null
    }

    const result = await response.json()
    console.log('Gmail watch set up:', { historyId: result.historyId, expiration: result.expiration })
    return {
      historyId: result.historyId,
      expiration: result.expiration,
      resourceId: result.resourceId,
    }
  } catch (e) {
    console.error('Error setting up Gmail watch:', e)
    return null
  }
}
