import { createClient } from 'npm:@supabase/supabase-js@2'

// No CORS needed — this is a Postmark inbound webhook (server-to-server)
// Deploy with: npx supabase functions deploy webhook-inbound-email --no-verify-jwt

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = await req.json()

    // Postmark inbound webhook payload fields:
    // From, FromName, To, Subject, TextBody, HtmlBody, MessageID, Headers, etc.
    const { From, FromName, To, Subject, TextBody, HtmlBody, MessageID, Headers } = payload

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
      // Not a CNAM reply — forward to Erik for review
      await forwardToAdmin(supabase, {
        from: From,
        fromName: FromName,
        subject: Subject,
        textBody: TextBody,
        htmlBody: HtmlBody,
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
      From: 'support@snapsonic.com',
      To: 'Support@signalwire.com',
      ReplyTo: 'support@snapsonic.com',
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
    from: 'support@snapsonic.com',
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
      From: 'support@snapsonic.com',
      To: 'erik@snapsonic.com',
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
