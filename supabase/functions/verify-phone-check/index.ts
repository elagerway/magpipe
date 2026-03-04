import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { APP_NAME, APP_URL, NOTIFICATION_EMAIL } from '../_shared/config.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { phoneNumber, code } = await req.json()

    if (!phoneNumber || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone number and code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the code
    const { data: verification, error: verificationError } = await supabase
      .from('phone_verifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('phone_number', phoneNumber)
      .eq('code', code)
      .eq('verified', false)
      .single()

    if (verificationError || !verification) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if code is expired
    const expiresAt = new Date(verification.expires_at)
    if (expiresAt < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Verification code has expired' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Mark as verified
    const { error: updateVerificationError } = await supabase
      .from('phone_verifications')
      .update({ verified: true })
      .eq('user_id', user.id)
      .eq('phone_number', phoneNumber)

    if (updateVerificationError) {
      console.error('Error updating verification:', updateVerificationError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify phone number' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update user's phone_verified and phone_number in users table
    const { error: updateUserError } = await supabase
      .from('users')
      .update({
        phone_number: phoneNumber,
        phone_verified: true,
      })
      .eq('id', user.id)

    if (updateUserError) {
      console.error('Error updating user:', updateUserError)
      return new Response(
        JSON.stringify({ error: 'Failed to update user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send welcome email now that phone is verified
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
    if (postmarkApiKey) {
      const { data: userData } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', user.id)
        .single()

      if (userData?.email) {
        const userName = userData.name || userData.email.split('@')[0]
        const appUrl = APP_URL || 'https://app.magpipe.ai'
        const welcomeHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
            <h1 style="font-size: 1.5rem; color: #111827; margin-bottom: 0.5rem;">Welcome to ${APP_NAME}, ${userName}!</h1>
            <p style="color: #374151; line-height: 1.6;">Your account is verified and ready to go. Here's what you can do:</p>
            <ul style="color: #374151; line-height: 1.8; padding-left: 1.25rem;">
              <li><strong>AI Voice Agent</strong> — Answer calls automatically, 24/7</li>
              <li><strong>SMS Inbox</strong> — Send and receive text messages with customers</li>
              <li><strong>Contacts</strong> — Keep your customer list organized</li>
              <li><strong>Analytics</strong> — Track call and message activity</li>
            </ul>
            <p style="margin-top: 1.5rem;">
              <a href="${appUrl}/agents" style="display: inline-block; background: #6366f1; color: white; padding: 0.65rem 1.25rem; border-radius: 6px; text-decoration: none; font-weight: 500;">Get Started →</a>
            </p>
            <p style="color: #6b7280; font-size: 0.875rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
              Questions? Reply to this email or contact us at <a href="mailto:${NOTIFICATION_EMAIL}" style="color: #6366f1;">${NOTIFICATION_EMAIL}</a>
            </p>
          </div>
        `
        fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': postmarkApiKey,
          },
          body: JSON.stringify({
            From: `${APP_NAME} Onboarding <${NOTIFICATION_EMAIL}>`,
            To: userData.email,
            Subject: `Welcome to ${APP_NAME} — you're all set!`,
            HtmlBody: welcomeHtml,
            TextBody: `Welcome to ${APP_NAME}, ${userName}!\n\nYour account is verified and ready to go. Get started: ${appUrl}/agents\n\nQuestions? Email us at ${NOTIFICATION_EMAIL}`,
            MessageStream: 'outbound',
          }),
        }).catch(err => console.error('Welcome email failed:', err))
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Phone number verified successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in verify-phone-check:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})