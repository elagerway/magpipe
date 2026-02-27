import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'
import { APP_NAME, APP_URL, NOTIFICATION_EMAIL } from '../_shared/config.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Unauthorized', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    let adminUser
    try {
      adminUser = await requireAdmin(supabase, token)
    } catch (error) {
      return errorResponse(error.message, 403)
    }

    const { userId } = await req.json()
    if (!userId) {
      return errorResponse('userId is required', 400)
    }

    // Fetch user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, phone_number, phone_verified')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return errorResponse('User not found', 404)
    }

    if (!user.phone_verified) {
      return errorResponse('Phone number must be verified before sending welcome email', 400)
    }

    const userName = user.name || user.email.split('@')[0]
    const appUrl = APP_URL || 'https://app.snapsonic.com'
    const appName = APP_NAME

    const subject = `Welcome to ${appName} — you're all set!`

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem;">
        <h1 style="font-size: 1.5rem; color: #111827; margin-bottom: 0.5rem;">Welcome to ${appName}, ${userName}!</h1>
        <p style="color: #374151; line-height: 1.6;">Your account is verified and ready to go. Here's a quick overview of what you can do:</p>
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

    const textBody = `Welcome to ${appName}, ${userName}!\n\nYour account is verified and ready to go.\n\nGet started: ${appUrl}/agents\n\nQuestions? Email us at ${NOTIFICATION_EMAIL}`

    const emailResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: `Magpipe Onboarding <${NOTIFICATION_EMAIL}>`,
        To: user.email,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Postmark error:', emailResult)
      return errorResponse(`Failed to send email: ${emailResult.Message || 'Unknown error'}`, 500)
    }

    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'send_welcome_email',
      details: { email: user.email, postmarkMessageId: emailResult.MessageID }
    })

    return successResponse({
      success: true,
      message: `Welcome email sent to ${user.email}`
    })
  } catch (error) {
    console.error('Error in admin-send-welcome-email:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
