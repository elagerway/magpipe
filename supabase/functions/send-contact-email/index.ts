import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { CANADA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'

// This endpoint is public (--no-verify-jwt): every request-supplied string
// interpolated into the Postmark HTML email must be escaped, or an attacker
// can inject markup that forges the email's trusted header section.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // caller_name / caller_email / callback_number / session_id are sent by
    // the voice-agent create_support_ticket custom function (agent.py also
    // auto-injects channel + session_id = call_record_id on every call).
    const { subject, message, category, attachments, caller_name, caller_email, callback_number, session_id } = await req.json()

    if (!subject || !message) {
      return new Response(JSON.stringify({ error: 'Subject and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

    // Get the user from the auth header
    const authHeader = req.headers.get('Authorization')
    let userEmail = 'Unknown User'
    let userName = ''
    let userId = ''

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)

      if (user) {
        userId = user.id
        userEmail = user.email || 'Unknown'

        // Get user's name from profile
        const { data: profile } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single()

        userName = profile?.name || ''
      }
    }

    // Voice-agent path: no user JWT, but session_id (call_record_id, an
    // unguessable UUID) attributes the ticket to the call. Resolve the call
    // for the caller's number and the owning agent so the ticket carries
    // real context instead of "Unknown User". The voice path only activates
    // when the call record actually resolves — a fabricated session_id must
    // not buy "verified call" framing (or ReplyTo control) in the email.
    let voiceCall: { caller_number: string | null; agent_name: string | null } | null = null
    if (!userId && session_id) {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data: call } = await supabase
        .from('call_records')
        .select('caller_number, agent_id')
        .eq('id', session_id)
        .single()
      if (call) {
        let agentName: string | null = null
        if (call.agent_id) {
          const { data: agent } = await supabase
            .from('agent_configs')
            .select('name')
            .eq('id', call.agent_id)
            .single()
          agentName = agent?.name || null
        }
        voiceCall = { caller_number: call.caller_number || null, agent_name: agentName }
      }
    }
    const isVoiceTicket = !userId && !!voiceCall
    // Voice agents transcribe emails badly ("john at gmail dot com") and
    // Postmark hard-rejects malformed addresses (which would 500 AFTER the
    // ticket row exists → duplicate tickets on agent retry). Only use a
    // caller_email that actually parses; the raw value still lands in the body.
    const validCallerEmail = typeof caller_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(caller_email.trim())
      ? caller_email.trim()
      : null
    const callbackNumber = callback_number || voiceCall?.caller_number || null
    if (isVoiceTicket) {
      userName = caller_name || ''
      userEmail = validCallerEmail || (callbackNumber ? `phone: ${callbackNumber}` : 'Voice caller')
    }

    // Parse attachments array from request
    const attachmentList: { url: string; name: string; type: string; size: number }[] = Array.isArray(attachments) ? attachments : []

    // Voice tickets: carry the caller/callback context in the ticket body so
    // the admin Support tab shows how to reach the caller.
    const voiceContext = isVoiceTicket
      ? `\n\n—\nSubmitted by voice agent${voiceCall?.agent_name ? ` "${voiceCall.agent_name}"` : ''} during a call.` +
        `${caller_name ? `\nCaller: ${caller_name}` : ''}` +
        `${callbackNumber ? `\nCallback number: ${callbackNumber}` : ''}` +
        `${caller_email ? `\nEmail: ${caller_email}` : ''}` +
        `\nCall record: ${session_id}`
      : ''

    // Create support ticket first so we can include the ref in the email
    const ticketSupabase = createClient(supabaseUrl, supabaseKey)
    const ticketSubject = category ? `[${category}] ${subject}` : subject
    const threadId = `contact-${crypto.randomUUID()}`
    let ticketRef: string | null = null
    try {
      const { data: seqVal } = await ticketSupabase.rpc('nextval_ticket_ref')
      ticketRef = seqVal ? `TKT-${String(seqVal).padStart(6, '0')}` : null
      const { data: ticket, error: ticketError } = await ticketSupabase
        .from('support_tickets')
        .insert({
          thread_id: threadId,
          ticket_ref: ticketRef,
          // Voice tickets: only a real email (or null) — the admin reply flow
          // sends to from_email verbatim and 500s on "phone: +1604..." values.
          from_email: isVoiceTicket ? validCallerEmail : userEmail,
          from_name: userName || null,
          subject: ticketSubject,
          body_text: `${message}${voiceContext}`,
          direction: 'inbound',
          status: 'open',
          priority: 'medium',
          tags: [...(category ? [category] : []), ...(isVoiceTicket ? ['voice-agent'] : [])],
          attachments: attachmentList.length > 0 ? attachmentList : null,
        })
        .select('id, ticket_ref')
        .single()

      if (ticketError) {
        console.error('Failed to create support ticket:', ticketError)
      } else {
        console.log('Support ticket created:', ticket.id, ticket.ticket_ref)
      }
    } catch (ticketErr) {
      console.error('Error creating support ticket:', ticketErr)
    }

    // Build attachments HTML
    let attachmentsHtml = ''
    let attachmentsText = ''
    if (attachmentList.length > 0) {
      const items = attachmentList.map(a => {
        const isVideo = a.type?.startsWith('video/')
        if (isVideo) {
          return `<div style="margin:0.5rem 0;"><a href="${esc(a.url)}" style="color:#6366f1;text-decoration:none;">&#9658; ${esc(a.name || 'Video')}</a> <span style="color:#999;font-size:0.8rem;">(${(a.size / 1024 / 1024).toFixed(1)}MB)</span></div>`
        }
        return `<div style="margin:0.5rem 0;"><a href="${esc(a.url)}" target="_blank"><img src="${esc(a.url)}" alt="${esc(a.name || 'Image')}" style="max-width:300px;max-height:200px;border-radius:6px;border:1px solid #ddd;"></a></div>`
      }).join('')
      attachmentsHtml = `<hr style="margin:1.5rem 0;border:none;border-top:1px solid #ccc;"><p><strong>Attachments (${attachmentList.length}):</strong></p>${items}`
      attachmentsText = `\n\nAttachments:\n${attachmentList.map(a => `- ${a.name}: ${a.url}`).join('\n')}`
    }

    // Build email content
    const sourceLabel = isVoiceTicket ? 'Voice Agent Support Ticket' : 'Contact Form Submission'
    const voiceHtml = isVoiceTicket
      ? `${callbackNumber ? `<p><strong>Callback number:</strong> ${esc(callbackNumber)}</p>` : ''}` +
        `${voiceCall?.agent_name ? `<p><strong>Agent:</strong> ${esc(voiceCall.agent_name)}</p>` : ''}` +
        `<p><strong>Call record:</strong> ${esc(session_id)}</p>`
      : ''
    const htmlBody = `
      <h2>${sourceLabel}</h2>
      ${ticketRef ? `<p><strong>Ticket:</strong> ${ticketRef}</p>` : ''}
      <p><strong>From:</strong> ${esc(userName ? `${userName} (${userEmail})` : userEmail)}</p>
      ${userId ? `<p><strong>User ID:</strong> ${esc(userId)}</p>` : ''}
      ${voiceHtml}
      ${category ? `<p><strong>Category:</strong> ${esc(category)}</p>` : ''}
      <p><strong>Subject:</strong> ${esc(subject)}</p>
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p><strong>Message:</strong></p>
      <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; white-space: pre-wrap;">${esc(message)}</div>
      ${attachmentsHtml}
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p style="color: #666; font-size: 0.875rem;">Sent from MAGPIPE ${isVoiceTicket ? 'voice agent' : 'contact form'}</p>
    `

    const voiceText = isVoiceTicket
      ? `${callbackNumber ? `Callback number: ${callbackNumber}\n` : ''}${voiceCall?.agent_name ? `Agent: ${voiceCall.agent_name}\n` : ''}Call record: ${session_id}\n`
      : ''
    const textBody = `${sourceLabel}\n\n${ticketRef ? `Ticket: ${ticketRef}\n` : ''}From: ${userName ? `${userName} (${userEmail})` : userEmail}\n${userId ? `User ID: ${userId}\n` : ''}${voiceText}${category ? `Category: ${category}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}${attachmentsText}\n\n---\nSent from MAGPIPE ${isVoiceTicket ? 'voice agent' : 'contact form'}`

    const emailSubject = ticketRef
      ? `[${ticketRef}]${category ? ` [${category}]` : ''} ${subject}`
      : (category ? `[${category}] ${subject}` : `[Contact] ${subject}`)

    // Send email via Postmark
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
        ReplyTo: (isVoiceTicket ? validCallerEmail : userEmail !== 'Unknown' && userEmail !== 'Unknown User' ? userEmail : null) || 'help@magpipe.ai',
        Subject: emailSubject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Postmark error:', emailResult)
      throw new Error(`Postmark API error: ${emailResult.Message || 'Unknown error'}`)
    }

    console.log('Contact email sent successfully:', emailResult)

    // Send SMS notification for upgrade requests
    if (subject.includes('Custom Plan Request')) {
      try {
        const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
        const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
        const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

        const smsBody = `New Custom Plan Request\n${userName ? `From: ${userName}` : `Email: ${userEmail}`}\n${subject.replace('Custom Plan Request', '').replace(' - ', '').trim() || ''}\n\nCheck email for details.`

        const smsData = new URLSearchParams({
          From: CANADA_SENDER_NUMBER,
          To: '+16045628647',
          Body: smsBody.substring(0, 160),
        })

        const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
        const smsResponse = await fetch(
          `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: smsData.toString(),
          }
        )

        if (smsResponse.ok) {
          console.log('SMS notification sent for upgrade request')
        } else {
          console.error('SMS send failed:', await smsResponse.text())
        }
      } catch (smsError) {
        // Don't fail the whole request if SMS fails
        console.error('Error sending SMS notification:', smsError)
      }
    }

    return new Response(JSON.stringify({ success: true, ticket_ref: ticketRef, thread_id: threadId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-contact-email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
