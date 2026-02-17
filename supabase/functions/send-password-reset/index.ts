import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    console.log('Password reset / magic link request received')
    const { email, type = 'recovery' } = await req.json()
    console.log('Email:', email, 'Type:', type)

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['recovery', 'magiclink'].includes(type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid type. Must be "recovery" or "magiclink"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://api.magpipe.ai'
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Attempting to generate link for:', email, 'type:', type)

    // Try to get user profile for name
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('email', email)
      .limit(1)
      .single()

    const userName = profile?.name || null

    // Generate link using Supabase Auth
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: type,
      email: email,
    })

    if (linkError || !linkData) {
      console.error('Error generating link:', linkError)
      // For security, don't reveal if user exists or not
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists, a link has been sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Link generated successfully')
    const actionLink = linkData.properties.action_link
    console.log('Action link:', actionLink)

    // Send email via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

    const isMagicLink = type === 'magiclink'

    const emailTitle = isMagicLink ? 'Sign In to Magpipe' : 'Reset Your Password'
    const emailSubject = isMagicLink ? 'Your Magpipe Magic Link' : 'Reset Your Magpipe Password'
    const emailBody = isMagicLink
      ? 'You requested a magic link to sign in to your Magpipe account. Click the button below to sign in instantly:'
      : 'We received a request to reset your Magpipe password. Click the button below to create a new password:'
    const buttonText = isMagicLink ? 'Sign In Now' : 'Reset Password'
    const expiryNote = isMagicLink
      ? 'If you didn\'t request this, you can safely ignore this email. This link will expire in 1 hour.'
      : 'If you didn\'t request this, you can safely ignore this email. This link will expire in 1 hour.'

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1f2937;">${emailTitle}</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #6b7280;">
                Hi${userName ? ' ' + userName : ''},
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #6b7280;">
                ${emailBody}
              </p>

              <!-- Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${actionLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                ${expiryNote}
              </p>

              <!-- Alternative Link -->
              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${actionLink}" style="color: #6366f1; word-break: break-all;">${actionLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                &copy; ${new Date().getFullYear()} Magpipe. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `

    const emailText = `
${emailTitle}

Hi${userName ? ' ' + userName : ''},

${emailBody}

Click the link below:
${actionLink}

${expiryNote}

---
© ${new Date().getFullYear()} Magpipe. All rights reserved.
    `

    console.log('Sending email via Postmark to:', email)
    const postmarkResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey,
      },
      body: JSON.stringify({
        From: 'notifications@snapsonic.com',
        To: email,
        Subject: emailSubject,
        HtmlBody: emailHtml,
        TextBody: emailText,
        MessageStream: 'outbound',
      }),
    })

    console.log('Postmark response status:', postmarkResponse.status)
    if (!postmarkResponse.ok) {
      const errorText = await postmarkResponse.text()
      console.error('Postmark error:', errorText)
      throw new Error('Failed to send email via Postmark')
    }

    const postmarkResult = await postmarkResponse.json()
    console.log('Email sent successfully:', postmarkResult)

    const successMessage = isMagicLink
      ? 'Magic link sent! Check your email to sign in.'
      : 'Password reset link sent! Check your email.'

    return new Response(
      JSON.stringify({
        success: true,
        message: successMessage,
        messageId: postmarkResult.MessageID
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
