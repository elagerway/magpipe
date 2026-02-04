import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { subject, message } = await req.json()

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

    // Build email content
    const htmlBody = `
      <h2>Contact Form Submission</h2>
      <p><strong>From:</strong> ${userName ? `${userName} (${userEmail})` : userEmail}</p>
      ${userId ? `<p><strong>User ID:</strong> ${userId}</p>` : ''}
      <p><strong>Subject:</strong> ${subject}</p>
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p><strong>Message:</strong></p>
      <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; white-space: pre-wrap;">${message}</div>
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid #ccc;">
      <p style="color: #666; font-size: 0.875rem;">Sent from MAGPIPE contact form</p>
    `

    const textBody = `Contact Form Submission\n\nFrom: ${userName ? `${userName} (${userEmail})` : userEmail}\n${userId ? `User ID: ${userId}\n` : ''}Subject: ${subject}\n\nMessage:\n${message}\n\n---\nSent from MAGPIPE contact form`

    // Send email via Postmark
    const emailResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: 'info@snapsonic.com',
        To: 'erik@snapsonic.com',
        ReplyTo: 'info@snapsonic.com',
        Subject: `[Contact] ${subject}`,
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

        // Get the first service number to use as sender
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: serviceNumber } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('is_active', true)
          .limit(1)
          .single()

        if (serviceNumber) {
          // Build concise SMS summary
          const smsBody = `New Custom Plan Request\n${userName ? `From: ${userName}` : `Email: ${userEmail}`}\n${subject.replace('Custom Plan Request', '').replace(' - ', '').trim() || ''}\n\nCheck email for details.`

          const smsData = new URLSearchParams({
            From: serviceNumber.phone_number,
            To: '+16045628647',
            Body: smsBody.substring(0, 160), // Keep SMS short
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
        }
      } catch (smsError) {
        // Don't fail the whole request if SMS fails
        console.error('Error sending SMS notification:', smsError)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
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
