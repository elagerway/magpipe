import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Password reset request received')
    const { email } = await req.json()
    console.log('Email:', email)

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://mtxbiyilvgwhbdptysex.supabase.co'
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Just try to generate the reset link - Supabase will handle user lookup
    // This is more efficient and secure
    console.log('Attempting to generate reset link for:', email)

    // Try to get user profile for name
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('email', email)
      .limit(1)
      .single()

    const userName = profile?.name || null

    // Generate password reset token using Supabase Auth
    const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    })

    if (resetError || !resetData) {
      console.error('Error generating reset link:', resetError)
      // For security, don't reveal if user exists or not
      // Return success anyway (user might not exist)
      return new Response(
        JSON.stringify({ success: true, message: 'If an account exists, a reset link has been sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Reset link generated successfully')
    // Extract the reset token from the link
    const resetLink = resetData.properties.action_link
    console.log('Reset link:', resetLink)

    // Send email via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!

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
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1f2937;">Reset Your Password</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #6b7280;">
                Hi${userName ? ' ' + userName : ''},
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #6b7280;">
                We received a request to reset your Pat password. Click the button below to create a new password:
              </p>

              <!-- Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.
              </p>

              <!-- Alternative Link -->
              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color: #6366f1; word-break: break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                © 2025 Magpipe Assistant. All rights reserved.
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
Reset Your Password

Hi${userName ? ' ' + userName : ''},

We received a request to reset your Pat password.

Click the link below to create a new password:
${resetLink}

If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.

---
© 2025 Magpipe Assistant. All rights reserved.
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
        Subject: 'Reset Your Pat Password',
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
    console.log('Password reset email sent successfully:', postmarkResult)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset link sent! Check your email.',
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
