/**
 * Send Team Invitation Email
 * Sends an email invitation to join an organization
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { memberId, email, name, organizationName, inviterName } = await req.json()

    if (!memberId || !email || !organizationName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Generate invitation link
    const baseUrl = Deno.env.get('APP_URL') || 'https://magpipe.ai'
    const inviteLink = `${baseUrl}/signup?invite=${memberId}`

    // Send email via Postmark
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')

    if (postmarkApiKey) {
      const firstName = (name || 'there').split(' ')[0]
      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f1ee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f1ee; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 32px 32px 0 32px;">
              <img src="https://magpipe.ai/magpipe-logo.png" alt="MAGPIPE" width="48" height="48" style="width: 48px; height: 48px; border-radius: 12px;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px 32px 0 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #1a1a1a; text-align: center;">
                You've been invited!
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 15px; color: #6b7280; text-align: center; line-height: 1.5;">
                ${firstName}, <strong style="color: #374151;">${inviterName}</strong> wants you on the team.
              </p>
            </td>
          </tr>
          <!-- Invite card -->
          <tr>
            <td style="padding: 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
                      Team
                    </p>
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">
                      ${organizationName}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 28px 32px 12px 32px;">
              <a href="${inviteLink}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 14px 40px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: 0.01em;">
                Join the team
              </a>
            </td>
          </tr>
          <!-- Subtext -->
          <tr>
            <td align="center" style="padding: 8px 32px 32px 32px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                MAGPIPE helps your team manage calls and messages with AI — you'll be set up in minutes.
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background: #e5e7eb;"></div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 20px 32px 24px 32px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                Didn't expect this? You can safely ignore this email.<br>
                <a href="https://magpipe.ai" style="color: #6366f1; text-decoration: none;">magpipe.ai</a>
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

      const emailResponse = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkApiKey,
        },
        body: JSON.stringify({
          From: `MAGPIPE <${Deno.env.get('NOTIFICATION_EMAIL') || 'notifications@snapsonic.com'}>`,
          To: email,
          Subject: `You've been invited to join ${organizationName}`,
          HtmlBody: htmlBody,
          MessageStream: 'outbound',
        }),
      })

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text()
        console.error('Failed to send email via Postmark:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to send invitation email', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const emailResult = await emailResponse.json()
      console.log('Postmark email sent:', emailResult.MessageID)
    } else {
      console.log('POSTMARK_API_KEY not configured, skipping email')
      console.log('Invitation link:', inviteLink)
    }

    // Update invitation record with sent timestamp
    await supabase
      .from('organization_members')
      .update({ invited_at: new Date().toISOString() })
      .eq('id', memberId)

    return new Response(
      JSON.stringify({ success: true, inviteLink }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-team-invitation:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
