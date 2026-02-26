import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { CANADA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { subject, message, category } = await req.json()

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
          from_email: userEmail,
          from_name: userName || null,
          subject: ticketSubject,
          body_text: message,
          direction: 'inbound',
          status: 'open',
          priority: 'medium',
          tags: category ? [category] : [],
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

    // Build email content
    const htmlBody = `
      <h2>Contact Form Submission</h2>
      ${ticketRef ? `<p><strong>Ticket:</strong> ${ticketRef}</p>` : ''}
      <p><strong>From:</strong> ${userName ? `${userName} (${userEmail})` : userEmail}</p>
      ${userId ? `<p><strong>User ID:</strong> ${userId}</p>` : ''}
      ${category ? `<p><strong>Category:</strong> ${category}</p>` : ''}
      <p><strong>Subject:</strong> ${subject}</p>
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p><strong>Message:</strong></p>
      <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; white-space: pre-wrap;">${message}</div>
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p style="color: #666; font-size: 0.875rem;">Sent from MAGPIPE contact form</p>
    `

    const textBody = `Contact Form Submission\n\n${ticketRef ? `Ticket: ${ticketRef}\n` : ''}From: ${userName ? `${userName} (${userEmail})` : userEmail}\n${userId ? `User ID: ${userId}\n` : ''}${category ? `Category: ${category}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}\n\n---\nSent from MAGPIPE contact form`

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
        ReplyTo: userEmail !== 'Unknown' ? userEmail : 'help@magpipe.ai',
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
