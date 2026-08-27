import { createClient } from 'npm:@supabase/supabase-js@2'
import { isBulkOrAutomated, quarantineEmail } from '../_shared/gmail-helpers.ts'

// No CORS needed — this is a Postmark inbound webhook (server-to-server)
// Deploy with: ./scripts/deploy-functions.sh webhook-inbound-email
//   (already in the --no-verify-jwt list — external callers send no JWT)
//
// AUTH: Postmark does not HMAC-sign inbound webhooks, so we use a shared secret.
// Set POSTMARK_INBOUND_SECRET and append ?token=<secret> to the webhook URL
// configured in Postmark (Servers → <server> → Inbound). While the env var is
// unset the endpoint stays open and logs a warning, so configuring the secret
// and the URL can happen in either order without dropping mail.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Accepts the secret via ?token= or HTTP Basic auth (Postmark supports both).
function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get('POSTMARK_INBOUND_SECRET')
  if (!secret) {
    console.warn('[inbound-email] POSTMARK_INBOUND_SECRET unset — endpoint is UNAUTHENTICATED')
    return true
  }

  const token = new URL(req.url).searchParams.get('token')
  if (token && timingSafeEqual(token, secret)) return true

  const auth = req.headers.get('authorization') || ''
  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6))
      const pass = decoded.slice(decoded.indexOf(':') + 1)
      if (timingSafeEqual(pass, secret)) return true
    } catch { /* malformed header — fall through to reject */ }
  }

  return false
}

// Postmark sends Headers as [{Name, Value}]; gmail-helpers' filters expect
// Gmail's [{name, value}] shape. Normalise once and reuse both.
function toGmailHeaderShape(headers: any[]): { headers: Array<{ name: string; value: string }> } {
  const list = Array.isArray(headers) ? headers : []
  return { headers: list.map((h: any) => ({ name: h?.Name ?? '', value: h?.Value ?? '' })) }
}

function getHeader(headers: any[], name: string): string | null {
  const list = Array.isArray(headers) ? headers : []
  const hit = list.find((h: any) => (h?.Name || '').toLowerCase() === name.toLowerCase())
  return hit?.Value ?? null
}

// Pull every <...> message-id out of a References/In-Reply-To header value.
function parseMessageIds(value: string | null): string[] {
  if (!value) return []
  return (value.match(/<[^>]+>/g) || []).map(s => s.trim())
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!isAuthorized(req)) {
    console.error('[inbound-email] rejected: bad or missing token')
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json()

    // Postmark inbound webhook payload fields:
    // From, FromName, To, Subject, TextBody, HtmlBody, MessageID, Headers, etc.
    const { From, FromName, To, Cc, Subject, TextBody, HtmlBody, MessageID, Headers, OriginalRecipient } = payload

    console.log(`Inbound email from: ${From}, subject: ${Subject}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if this is a CNAM reply by looking for [CNAM-xxxxxxxx] in subject
    const cnamMatch = Subject?.match(/\[CNAM-([a-f0-9]{8})\]/i)

    if (cnamMatch) {
      const requestIdPrefix = cnamMatch[1]
      await handleCnamReply(supabase, requestIdPrefix, {
        from: From,
        fromName: FromName,
        subject: Subject,
        textBody: TextBody,
        htmlBody: HtmlBody,
        messageId: MessageID,
        headers: Headers,
      })
    } else {
      // Not a CNAM reply — create a support ticket
      await createSupportTicket(supabase, {
        from: From,
        fromName: FromName,
        to: OriginalRecipient || To,
        cc: Cc,
        subject: Subject,
        textBody: TextBody,
        htmlBody: HtmlBody,
        headers: Headers,
        messageId: MessageID,
      })
    }

    // Always return 200 to Postmark so it doesn't retry
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Error in webhook-inbound-email:', error)
    // Still return 200 to prevent Postmark retries on processing errors
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})


interface EmailData {
  from: string
  fromName?: string
  subject: string
  textBody: string
  htmlBody?: string
  messageId?: string
  headers?: any[]
}


async function handleCnamReply(
  supabase: any,
  requestIdPrefix: string,
  email: EmailData
) {
  console.log(`Processing CNAM reply for request prefix: ${requestIdPrefix}`)

  // Find the CNAM request by ID prefix
  const { data: requests, error } = await supabase
    .from('cnam_requests')
    .select('*')
    .like('id', `${requestIdPrefix}%`)
    .limit(1)

  if (error || !requests || requests.length === 0) {
    console.error(`CNAM request not found for prefix: ${requestIdPrefix}`)
    await forwardToAdmin(supabase, {
      from: email.from,
      subject: `[UNMATCHED] ${email.subject}`,
      textBody: email.textBody,
      htmlBody: email.htmlBody,
    })
    return
  }

  const cnamRequest = requests[0]

  // Append this reply to the email thread
  const emailThread = cnamRequest.email_thread || []
  emailThread.push({
    direction: 'inbound',
    from: email.from,
    subject: email.subject,
    body: email.textBody || '',
    timestamp: new Date().toISOString()
  })

  await supabase
    .from('cnam_requests')
    .update({
      email_thread: emailThread,
      updated_at: new Date().toISOString()
    })
    .eq('id', cnamRequest.id)

  // Use AI to classify the reply
  const classification = await classifyReply(email.textBody || '', cnamRequest)

  console.log(`CNAM reply classified as: ${classification.type} for request ${cnamRequest.id}`)

  switch (classification.type) {
    case 'confirmed': {
      // CNAM is confirmed — update status and set cnam_name on service number
      await supabase
        .from('cnam_requests')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', cnamRequest.id)

      await supabase
        .from('service_numbers')
        .update({ cnam_name: cnamRequest.requested_name })
        .eq('id', cnamRequest.service_number_id)

      console.log(`CNAM confirmed for ${cnamRequest.phone_number}: "${cnamRequest.requested_name}"`)
      break
    }

    case 'needs_info': {
      // SignalWire needs more info — AI drafts a response
      await supabase
        .from('cnam_requests')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', cnamRequest.id)

      // Send AI-drafted reply
      const replyBody = classification.draftReply
      if (replyBody) {
        await sendReply(supabase, cnamRequest, email, replyBody)
      }
      break
    }

    case 'rejected': {
      await supabase
        .from('cnam_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', cnamRequest.id)

      console.log(`CNAM rejected for ${cnamRequest.phone_number}`)
      break
    }

    case 'unclear':
    default: {
      // Can't determine — forward to Erik for manual review
      await supabase
        .from('cnam_requests')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', cnamRequest.id)

      await forwardToAdmin(supabase, {
        from: email.from,
        subject: `[CNAM Review Needed] ${email.subject}`,
        textBody: `AI could not determine SignalWire's response. Please review.\n\nRequest: ${cnamRequest.requested_name} for ${cnamRequest.phone_number}\nStatus: ${cnamRequest.status}\n\n--- Original Reply ---\n${email.textBody}`,
        htmlBody: email.htmlBody,
      })
      break
    }
  }
}


interface Classification {
  type: 'confirmed' | 'needs_info' | 'rejected' | 'unclear'
  draftReply?: string
}


async function classifyReply(replyText: string, cnamRequest: any): Promise<Classification> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not set, defaulting to unclear')
    return { type: 'unclear' }
  }

  try {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID') || ''

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are analyzing email replies from SignalWire support regarding a CNAM (Caller ID Name) registration request.

The request was:
- Phone number: ${cnamRequest.phone_number}
- Requested CNAM name: "${cnamRequest.requested_name}"
- SignalWire Project ID: ${signalwireProjectId}

Classify the reply into one of these categories:
- "confirmed": SignalWire has confirmed the CNAM registration is complete or has been submitted/processed successfully
- "needs_info": SignalWire is asking for additional information (e.g., LOA, business verification, address)
- "rejected": SignalWire has denied the request (e.g., name doesn't match business, policy violation)
- "unclear": Cannot determine the intent of the reply

If "needs_info", also draft a professional reply providing what was asked. Our business name is "Snapsonic". Use the project ID and phone number from above.

Respond as JSON: { "type": "confirmed"|"needs_info"|"rejected"|"unclear", "draftReply": "..." (only if needs_info), "reasoning": "brief explanation" }`
          },
          {
            role: 'user',
            content: `SignalWire's reply:\n\n${replyText.substring(0, 3000)}`
          }
        ]
      })
    })

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text())
      return { type: 'unclear' }
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) {
      return { type: 'unclear' }
    }

    const parsed = JSON.parse(content)
    console.log(`AI classification: ${parsed.type} — ${parsed.reasoning}`)

    return {
      type: parsed.type || 'unclear',
      draftReply: parsed.draftReply
    }

  } catch (error) {
    console.error('Error classifying CNAM reply:', error)
    return { type: 'unclear' }
  }
}


async function sendReply(
  supabase: any,
  cnamRequest: any,
  originalEmail: EmailData,
  replyBody: string
) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
  const requestIdShort = cnamRequest.id.substring(0, 8)
  const subject = `Re: CNAM Registration Request [CNAM-${requestIdShort}]`

  const headers: any[] = []

  // Thread the reply using In-Reply-To if we have the original message ID
  if (cnamRequest.postmark_message_id) {
    headers.push({ Name: 'In-Reply-To', Value: `<${cnamRequest.postmark_message_id}.postmarkapp.com>` })
  }
  if (originalEmail.messageId) {
    headers.push({ Name: 'References', Value: originalEmail.messageId })
  }

  const emailResponse = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey
    },
    body: JSON.stringify({
      From: 'help@magpipe.ai',
      To: 'Support@signalwire.com',
      ReplyTo: 'help@magpipe.ai',
      Subject: subject,
      TextBody: replyBody,
      HtmlBody: `<div style="font-family: sans-serif; white-space: pre-wrap;">${replyBody}</div>`,
      MessageStream: 'outbound',
      Headers: headers.length > 0 ? headers : undefined
    })
  })

  const emailResult = await emailResponse.json()

  if (!emailResponse.ok) {
    console.error('Failed to send CNAM reply:', emailResult)
    return
  }

  // Append outbound reply to email thread
  const emailThread = cnamRequest.email_thread || []
  emailThread.push({
    direction: 'outbound',
    from: 'help@magpipe.ai',
    to: 'Support@signalwire.com',
    subject: subject,
    body: replyBody,
    timestamp: new Date().toISOString()
  })

  await supabase
    .from('cnam_requests')
    .update({
      email_thread: emailThread,
      updated_at: new Date().toISOString()
    })
    .eq('id', cnamRequest.id)

  console.log(`CNAM reply sent for request ${cnamRequest.id}`)
}


// Resolve which conversation this message belongs to.
//
// Mail clients thread on RFC5322 In-Reply-To / References, which carry the
// Message-IDs of earlier messages in the chain. We store the RFC Message-ID in
// support_tickets.gmail_message_id (legacy column name), so any referenced id
// that we've already seen tells us the thread. Falls back to a new thread only
// when nothing in the chain matches — otherwise every reply would open its own
// orphan ticket.
async function resolveThreadId(
  supabase: any,
  headers: any[],
  ownMessageId: string | null
): Promise<{ threadId: string; isNewThread: boolean }> {
  const inReplyTo = parseMessageIds(getHeader(headers, 'In-Reply-To'))
  const references = parseMessageIds(getHeader(headers, 'References'))
  const referenced = [...new Set([...inReplyTo, ...references])]

  if (referenced.length > 0) {
    const { data: priors } = await supabase
      .from('support_tickets')
      .select('thread_id, gmail_message_id, received_at')
      .in('gmail_message_id', referenced)
      .order('received_at', { ascending: false })
      .limit(1)

    if (priors?.length && priors[0].thread_id) {
      console.log(`[inbound-email] threading onto ${priors[0].thread_id} via ${priors[0].gmail_message_id}`)
      return { threadId: priors[0].thread_id, isNewThread: false }
    }

    // Referenced ids we've never stored (e.g. the chain started before this
    // webhook existed). Key on the ROOT of the chain so every later reply in
    // the same conversation derives the same id instead of fanning out.
    // RFC5322 orders References oldest-first, so the root is References[0];
    // In-Reply-To (the immediate parent) is only a fallback.
    const root = references[0] || inReplyTo[0]
    console.log(`[inbound-email] no stored prior; keying thread on root ${root}`)
    return { threadId: `email-${root}`, isNewThread: true }
  }

  // Genuinely new conversation — key on its own Message-ID when present so a
  // reply to our reply can find it.
  return {
    threadId: ownMessageId ? `email-${ownMessageId}` : `email-${crypto.randomUUID()}`,
    isNewThread: true,
  }
}

async function createSupportTicket(
  supabase: any,
  email: {
    from: string; fromName?: string; to?: string; cc?: string
    subject: string; textBody: string; htmlBody?: string
    messageId?: string; headers?: any[]
  }
) {
  // Skip system/automated emails — don't create tickets for these
  const fromLower = (email.from || '').toLowerCase()
  if (fromLower.includes('mailer-daemon') ||
      fromLower.includes('noreply') ||
      fromLower.includes('no-reply') ||
      fromLower.includes('postmaster') ||
      fromLower.includes('notifications@') ||
      fromLower.includes('notification@') ||
      fromLower.includes('systemgenerated') ||
      fromLower.includes('@magpipe.ai')) {
    console.log(`Skipping system email from ${email.from}, not creating ticket`)
    return
  }

  const headers = email.headers || []

  // Prefer the RFC Message-ID over Postmark's GUID — it's what the sender's
  // In-Reply-To will reference, so threading depends on storing this one.
  const rfcMessageId = parseMessageIds(getHeader(headers, 'Message-ID'))[0] || null
  const storedMessageId = rfcMessageId || email.messageId || null

  // Dedup on whichever id we store
  if (storedMessageId) {
    const { data: existing } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('gmail_message_id', storedMessageId)
      .maybeSingle()

    if (existing) {
      console.log(`Duplicate email ${storedMessageId}, ticket ${existing.id} already exists`)
      return
    }
  }

  const { threadId, isNewThread } = await resolveThreadId(supabase, headers, rfcMessageId)

  // Bulk/automated filter — drop newsletters, marketing, list mail. Mirrors the
  // Gmail path so behaviour is consistent across ingestion routes. Only applied
  // to new threads: once a human conversation exists, keep appending to it even
  // if a later message carries list headers.
  if (isNewThread) {
    const bulkCheck = isBulkOrAutomated(toGmailHeaderShape(headers))
    if (bulkCheck.isBulk) {
      console.log(`[inbound-email] quarantining ${storedMessageId} (${bulkCheck.reason})`)
      await quarantineEmail(supabase, {
        userId: null,
        parsedMsg: {
          gmail_message_id: storedMessageId,
          thread_id: threadId,
          from_email: email.from,
          from_name: email.fromName || null,
          to_email: email.to || null,
          subject: email.subject,
          body_text: email.textBody,
          received_at: new Date().toISOString(),
        },
        reason: bulkCheck.reason!,
        reasonDetail: { matchedHeader: bulkCheck.matchedHeader, matchedValue: bulkCheck.matchedValue },
      })
      return
    }
  }

  // Ticket ref only for new threads — replies inherit the original's ref
  let ticketRef: string | null = null
  if (isNewThread) {
    const { data: seqVal } = await supabase.rpc('nextval_ticket_ref')
    ticketRef = seqVal ? `TKT-${String(seqVal).padStart(6, '0')}` : null
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      thread_id: threadId,
      ticket_ref: ticketRef,
      gmail_message_id: storedMessageId,
      from_email: email.from,
      from_name: email.fromName || null,
      to_email: email.to || 'help@magpipe.ai',
      cc_email: email.cc || null,
      subject: email.subject,
      body_text: email.textBody,
      body_html: email.htmlBody || null,
      direction: 'inbound',
      status: 'open',
      priority: 'medium',
      tags: ['Email'],
      received_at: new Date().toISOString(),
    })
    .select('id, ticket_ref')
    .single()

  if (ticketError) {
    console.error('Failed to create support ticket:', ticketError)
    // Fall back to forwarding so the email isn't lost
    await forwardToAdmin(supabase, email)
    return
  }

  console.log(
    `Support ticket ${isNewThread ? 'created' : 'appended'} from inbound email: ` +
    `${ticket.ticket_ref || threadId} from ${email.from}`
  )
}


async function forwardToAdmin(supabase: any, email: { from: string, fromName?: string, subject: string, textBody: string, htmlBody?: string }) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

  const htmlBody = `
    <h3>Forwarded Inbound Email</h3>
    <p><strong>From:</strong> ${email.fromName ? `${email.fromName} &lt;${email.from}&gt;` : email.from}</p>
    <p><strong>Subject:</strong> ${email.subject}</p>
    <hr style="margin: 1rem 0; border: none; border-top: 1px solid #ccc;">
    ${email.htmlBody || `<pre style="white-space: pre-wrap;">${email.textBody}</pre>`}
  `

  const emailResponse = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey
    },
    body: JSON.stringify({
      From: 'help@magpipe.ai',
      To: 'help@magpipe.ai',
      ReplyTo: email.from,
      Subject: `[Fwd] ${email.subject}`,
      HtmlBody: htmlBody,
      TextBody: `Forwarded inbound email\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.textBody}`,
      MessageStream: 'outbound'
    })
  })

  if (!emailResponse.ok) {
    const result = await emailResponse.json()
    console.error('Failed to forward email to admin:', result)
  } else {
    console.log('Forwarded inbound email to admin')
  }
}
