/**
 * Send Team Invitation Email
 * Sends an email invitation to join an organization
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px;">You're invited!</h1>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Hi ${name || 'there'},
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            ${inviterName} has invited you to join <strong>${organizationName}</strong> on MAGPIPE.
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            MAGPIPE is an AI-powered communication assistant that helps manage calls and messages for your business.
          </p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `

      const emailResponse = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': postmarkApiKey,
        },
        body: JSON.stringify({
          From: 'MAGPIPE <notifications@snapsonic.com>',
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
