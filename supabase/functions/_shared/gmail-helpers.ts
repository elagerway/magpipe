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
    const cc = getHeader('Cc')
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

    // Normalize: replace raw Gmail address with send-as alias in from/to
    // so the underlying help@webrtc.is never leaks into stored records
    const normalizeEmail = (email: string) => {
      if (!sendAsEmail || !gmailAddress) return email
      return email.replace(new RegExp(gmailAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), sendAsEmail)
    }

    return {
      gmail_message_id: msg.id,
      thread_id: msg.threadId,
      message_id_header: messageIdHeader,
      from_email: isOutbound && sendAsEmail ? sendAsEmail : fromEmail,
      from_name: fromName,
      to_email: normalizeEmail(to),
      cc_email: cc ? normalizeEmail(cc) : '',
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

/**
 * Decode a base64url-encoded string to UTF-8 text.
 * Gmail API returns base64url; plain atob() mangles multi-byte UTF-8
 * characters (e.g. curly quotes → â, non-breaking space → Â).
 */
export function decodeBase64Url(data: string): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

export function extractBody(payload: any): { text: string; html: string } {
  let text = ''
  let html = ''

  if (!payload) return { text, html }

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType === 'text/plain') text = decoded
    if (payload.mimeType === 'text/html') html = decoded
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = decodeBase64Url(part.body.data)
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        html = decodeBase64Url(part.body.data)
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
    lower.includes('systemgenerated') ||
    lower.includes('@magpipe.ai')
}

// ─── Contact Enrichment ─────────────────────────────────────────────

export async function autoEnrichEmailContact(
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

// ─── AI Reply Generation ────────────────────────────────────────────

export async function generateAiReply(
  supabase: any,
  accessToken: string,
  config: any,
  agent: any,
  sendFrom: string,
  msg: any,
  integration?: any  // optional; when present and composio_managed, send via Composio
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
      const gmailResult = isComposioManaged(integration)
        ? await sendGmailReplyComposio(integration.user_id, msg, draftText, replySubject)
        : await sendGmailReply(accessToken, sendFrom, msg, draftText, replySubject)

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

        // Deduct email credits for AI auto-reply (fire and forget)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        deductEmailCredits(supabaseUrl, supabaseKey, config.user_id, 1)
          .catch(err => console.error('Email credit deduction error:', err))
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

// ─── Email Billing ──────────────────────────────────────────────────

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

// ─── Bulk / Spam filtering ─────────────────────────────────────────
// Bad actors subscribe help@magpipe.ai to free services; the welcome/verify
// emails would otherwise become support tickets and trigger AI replies.
// Headers from automated/transactional mail are reliable enough to drop on
// (humans don't send via these channels). Apply BEFORE creating any rows.

const KNOWN_ESP_X_MAILER_PATTERNS: RegExp[] = [
  /mailchimp/i,
  /sendgrid/i,
  /mailgun/i,
  /hubspot/i,
  /klaviyo/i,
  /brevo|sendinblue/i,
  /constantcontact|constant contact/i,
  /campaignmonitor|campaign monitor/i,
  /amazonses|amazon ses/i,
  /postmark/i,
  /mandrill/i,
  /salesforce.*marketing/i,
  /iterable/i,
  /customer\.io/i,
]

export interface BulkCheckResult {
  isBulk: boolean
  reason: string | null
  matchedHeader: string | null
  matchedValue: string | null
}

// Returns {isBulk:false} for normal 1:1 mail; isBulk:true when the message
// carries a header that's only set by automated/list/transactional senders.
export function isBulkOrAutomated(payload: any): BulkCheckResult {
  if (!payload?.headers) return { isBulk: false, reason: null, matchedHeader: null, matchedValue: null }
  const headers: Array<{ name: string; value: string }> = payload.headers
  const get = (n: string): string | null => {
    const h = headers.find(x => x.name.toLowerCase() === n.toLowerCase())
    return h?.value ?? null
  }

  const listUnsub = get('List-Unsubscribe')
  if (listUnsub) {
    return { isBulk: true, reason: 'list_unsubscribe', matchedHeader: 'List-Unsubscribe', matchedValue: listUnsub.substring(0, 200) }
  }

  const listId = get('List-ID') || get('List-Id')
  if (listId) {
    return { isBulk: true, reason: 'list_id', matchedHeader: 'List-ID', matchedValue: listId.substring(0, 200) }
  }

  const precedence = (get('Precedence') || '').toLowerCase().trim()
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') {
    return { isBulk: true, reason: `precedence_${precedence}`, matchedHeader: 'Precedence', matchedValue: precedence }
  }

  const autoSub = (get('Auto-Submitted') || '').toLowerCase().trim()
  if (autoSub && autoSub !== 'no') {
    return { isBulk: true, reason: `auto_submitted_${autoSub.replace(/[^a-z0-9_-]/g, '_')}`, matchedHeader: 'Auto-Submitted', matchedValue: autoSub }
  }

  if (get('Feedback-ID')) {
    return { isBulk: true, reason: 'feedback_id', matchedHeader: 'Feedback-ID', matchedValue: get('Feedback-ID')!.substring(0, 200) }
  }

  if (get('X-Campaign-Id') || get('X-Campaign-ID')) {
    return { isBulk: true, reason: 'x_campaign_id', matchedHeader: 'X-Campaign-Id', matchedValue: (get('X-Campaign-Id') || get('X-Campaign-ID') || '').substring(0, 200) }
  }

  const xMailer = get('X-Mailer') || ''
  for (const re of KNOWN_ESP_X_MAILER_PATTERNS) {
    if (re.test(xMailer)) {
      return { isBulk: true, reason: 'x_mailer_esp', matchedHeader: 'X-Mailer', matchedValue: xMailer.substring(0, 200) }
    }
  }

  return { isBulk: false, reason: null, matchedHeader: null, matchedValue: null }
}

// Persists a one-row audit record for a dropped email. Failure is non-fatal —
// never let logging block the pipeline.
export async function quarantineEmail(
  supabase: any,
  args: {
    userId: string | null
    parsedMsg: any  // output of parseGmailMessage
    reason: string
    reasonDetail?: Record<string, unknown> | null
  }
): Promise<void> {
  try {
    await supabase.from('quarantined_emails').insert({
      user_id: args.userId,
      gmail_message_id: args.parsedMsg.gmail_message_id,
      thread_id: args.parsedMsg.thread_id,
      from_email: args.parsedMsg.from_email,
      from_name: args.parsedMsg.from_name,
      to_email: args.parsedMsg.to_email,
      subject: args.parsedMsg.subject,
      reason: args.reason,
      reason_detail: args.reasonDetail ?? null,
      body_text_preview: (args.parsedMsg.body_text || '').substring(0, 500),
      received_at: args.parsedMsg.received_at
    })
    console.log(`Quarantined ${args.parsedMsg.gmail_message_id} reason=${args.reason}`)
  } catch (err) {
    console.error('quarantineEmail insert failed (non-fatal):', err)
  }
}

// Backstop against reply storms — at most one AI reply per sender per window.
// Returns true if we've already AI-replied to this address recently.
export async function hasRecentAiReplyToSender(
  supabase: any,
  fromEmail: string,
  withinHours = 24
): Promise<boolean> {
  if (!fromEmail) return false
  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString()
  const { count } = await supabase
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .ilike('to_email', fromEmail)
    .eq('direction', 'outbound')
    .eq('is_ai_generated', true)
    .gte('sent_at', since)
  return (count || 0) > 0
}

// ─── Composio-routed Gmail (CASA off-load) ─────────────────────────
// When user_integrations.config.composio_managed === true, we don't have a
// raw OAuth token. Composio holds it; we call their tools/execute proxy
// keyed on the Magpipe user_id (which equals the Composio user_id).

const COMPOSIO_API_BASE = 'https://backend.composio.dev'

export function isComposioManaged(integration: any): boolean {
  return integration?.config?.composio_managed === true
}

async function composioExecute(
  userId: string,
  slug: string,
  args: Record<string, unknown>
): Promise<any> {
  const apiKey = Deno.env.get('COMPOSIO_API_KEY')
  if (!apiKey) {
    console.error('COMPOSIO_API_KEY not set — cannot route Gmail through Composio')
    return null
  }
  try {
    const res = await fetch(`${COMPOSIO_API_BASE}/api/v3/tools/execute/${slug}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, arguments: args })
    })
    const json = await res.json()
    if (!res.ok || !json.successful) {
      console.error(`Composio ${slug} failed:`, res.status, json?.error || json)
      return null
    }
    return json.data
  } catch (err) {
    console.error(`Composio ${slug} threw:`, err)
    return null
  }
}

// Send a threaded reply via Composio. Returns { id, threadId } on success
// (matching the shape sendGmailReply returns) or null on failure.
export async function sendGmailReplyComposio(
  userId: string,
  originalMsg: any,
  body: string,
  _subject: string,  // Composio's GMAIL_REPLY_TO_THREAD reuses the thread's subject
  cc?: string[]      // additional CC recipients (reply-all)
): Promise<{ id: string; threadId: string } | null> {
  const data = await composioExecute(userId, 'GMAIL_REPLY_TO_THREAD', {
    thread_id: originalMsg.thread_id,
    recipient_email: originalMsg.from_email,
    message_body: body,
    ...(cc && cc.length ? { cc } : {})
  })
  if (!data) return null
  const r = data.response_data || data
  return {
    id: r.id || r.message_id || originalMsg.gmail_message_id,
    threadId: r.threadId || r.thread_id || originalMsg.thread_id
  }
}

// Poll inbox via Composio. Returns Gmail-API-shaped message objects (same
// structure as fetchRecentMessages so parseGmailMessage reuses as-is).
export async function fetchRecentMessagesComposio(
  userId: string,
  query: string | null,
  maxResults: number
): Promise<any[]> {
  const data = await composioExecute(userId, 'GMAIL_FETCH_EMAILS', {
    max_results: maxResults,
    include_payload: true,
    ...(query ? { query } : {})
  })
  if (!data) return []
  const msgs = data.messages || data.response_data?.messages || []
  // Composio's response uses `messageId` as the top-level id; copy to `id` so
  // existing parsers (which read msg.id) work without modification.
  return msgs.map((m: any) => ({
    ...m,
    id: m.id || m.messageId,
    threadId: m.threadId || m.thread_id,
    internalDate: m.internalDate || (m.messageTimestamp ? String(new Date(m.messageTimestamp).getTime()) : '0')
  }))
}

// Fetch a single message (full payload, incl. attachment ids + Content-IDs)
// via Composio. Returns the Composio `data` object (has `.payload`).
export async function fetchMessageByIdComposio(userId: string, messageId: string): Promise<any | null> {
  const data = await composioExecute(userId, 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', {
    message_id: messageId,
    user_id: 'me',
    format: 'full',
  })
  return data || null
}

// ─── Inline image / attachment handling ─────────────────────────────
// Composio-managed mailboxes have no raw Gmail token, so attachment bytes can't
// be pulled from gmail.googleapis.com directly. We go through Composio's
// GMAIL_GET_ATTACHMENT (which stages the bytes to a temp s3url), re-host in the
// support-attachments bucket, and rewrite inline `cid:` refs to the public URL.

export interface ImagePart {
  attachmentId: string
  filename: string
  mimeType: string
  contentId: string | null  // Content-ID with <> stripped; null for non-inline
}

export interface UploadedAttachment {
  filename: string
  url: string
  mime_type: string
  size_bytes: number
  content_id: string | null
}

// Walk the MIME tree and collect image parts together with their Content-ID,
// which is what inline `cid:` references in the HTML body point at.
export function extractImagePartsWithCid(payload: any): ImagePart[] {
  const out: ImagePart[] = []
  const walk = (p: any) => {
    if (!p) return
    const body = p.body || {}
    const mime: string = p.mimeType || ''
    if (mime.startsWith('image/') && body.attachmentId) {
      const cidHeader = (p.headers || []).find((h: any) => h.name?.toLowerCase() === 'content-id')?.value || null
      out.push({
        attachmentId: body.attachmentId,
        filename: p.filename || 'image',
        mimeType: mime,
        contentId: cidHeader ? cidHeader.replace(/^<|>$/g, '') : null,
      })
    }
    for (const c of (p.parts || [])) walk(c)
  }
  walk(payload)
  return out
}

// Composio route: fetch each image via GMAIL_GET_ATTACHMENT → download the
// returned s3url → upload to support-attachments. Returns uploaded metadata
// (incl. content_id) so callers can rewrite inline cid refs.
export async function downloadAndUploadAttachmentsComposio(
  userId: string,
  messageId: string,
  threadId: string,
  parts: ImagePart[],
  supabase: any
): Promise<UploadedAttachment[]> {
  const results: UploadedAttachment[] = []
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  for (const part of parts) {
    try {
      const data = await composioExecute(userId, 'GMAIL_GET_ATTACHMENT', {
        message_id: messageId,
        attachment_id: part.attachmentId,
        file_name: part.filename,
        user_id: 'me',
      })
      const s3url: string | undefined = data?.file?.s3url
      if (!s3url) {
        console.error(`GMAIL_GET_ATTACHMENT returned no s3url for ${part.filename}`)
        continue
      }

      const fileResp = await fetch(s3url)
      if (!fileResp.ok) {
        console.error(`Failed to download attachment s3url (${fileResp.status}) for ${part.filename}`)
        continue
      }
      const bytes = new Uint8Array(await fileResp.arrayBuffer())

      const timestamp = Date.now()
      const safeName = (part.filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${threadId}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(storagePath, bytes, { contentType: part.mimeType, upsert: false })
      if (uploadError) {
        console.error(`Failed to upload ${part.filename}:`, uploadError.message)
        continue
      }

      results.push({
        filename: part.filename,
        url: `${supabaseUrl}/storage/v1/object/public/support-attachments/${storagePath}`,
        mime_type: part.mimeType,
        size_bytes: bytes.length,
        content_id: part.contentId,
      })
    } catch (e) {
      console.error(`Error fetching/uploading attachment ${part.filename}:`, e)
    }
  }
  return results
}

// Rewrite inline `cid:<content-id>` references in HTML to the re-hosted URLs so
// they render in the admin UI (browsers can't resolve cid: refs).
export function rewriteCidReferences(html: string | null, uploaded: UploadedAttachment[]): string {
  if (!html) return html || ''
  let out = html
  for (const u of uploaded) {
    if (!u.content_id) continue
    const esc = u.content_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`cid:${esc}`, 'gi'), u.url)
  }
  return out
}

// Send a top-level email (not a reply) via Composio.
export async function sendGmailEmailComposio(
  userId: string,
  args: {
    recipient_email: string
    subject?: string
    body?: string
    is_html?: boolean
    cc?: string[]
    bcc?: string[]
  }
): Promise<{ id: string; threadId?: string } | null> {
  const data = await composioExecute(userId, 'GMAIL_SEND_EMAIL', args)
  if (!data) return null
  const r = data.response_data || data
  return { id: r.id || r.message_id || '', threadId: r.threadId || r.thread_id }
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
