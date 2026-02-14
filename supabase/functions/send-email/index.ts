import { createClient } from 'npm:@supabase/supabase-js@2'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the user's token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { to_email, cc, bcc, subject, body_html, body_text, agent_id, thread_id, in_reply_to } = body

    if (!to_email || !subject) {
      return new Response(JSON.stringify({ error: 'to_email and subject are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Determine send-as email: check agent_email_configs first, then fall back to user's Gmail
    let sendAsEmail: string | null = null
    let integrationId: string | null = null

    if (agent_id) {
      const { data: emailConfig } = await supabase
        .from('agent_email_configs')
        .select('send_as_email, gmail_address, integration_id')
        .eq('agent_id', agent_id)
        .eq('user_id', user.id)
        .single()

      if (emailConfig) {
        sendAsEmail = emailConfig.send_as_email || emailConfig.gmail_address
        integrationId = emailConfig.integration_id
      }
    }

    // Get Gmail access token
    const accessToken = await getGmailAccessToken(supabase, user.id, integrationId)
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Gmail not connected. Please connect Gmail in Integrations.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If no send-as found via agent config, try any active email config for this user
    if (!sendAsEmail) {
      const { data: anyConfig } = await supabase
        .from('agent_email_configs')
        .select('send_as_email, gmail_address, integration_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (anyConfig) {
        sendAsEmail = anyConfig.send_as_email || anyConfig.gmail_address
        if (!integrationId) integrationId = anyConfig.integration_id
      }
    }

    // Final fallback: use primary Gmail address from integration
    if (!sendAsEmail) {
      const gmailAddress = await getGmailAddress(supabase, user.id)
      sendAsEmail = gmailAddress
    }

    if (!sendAsEmail) {
      return new Response(JSON.stringify({ error: 'Could not determine sender email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build MIME message
    const mimeLines = [
      `From: ${sendAsEmail}`,
      `To: ${to_email}`,
    ]
    if (cc) mimeLines.push(`Cc: ${cc}`)
    if (bcc) mimeLines.push(`Bcc: ${bcc}`)
    mimeLines.push(`Subject: ${subject}`)
    if (in_reply_to) {
      mimeLines.push(`In-Reply-To: ${in_reply_to}`)
      mimeLines.push(`References: ${in_reply_to}`)
    }
    mimeLines.push('Content-Type: text/html; charset=UTF-8')
    mimeLines.push('')
    mimeLines.push(body_html || body_text || '')

    const rawMessage = mimeLines.join('\r\n')
    const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send via Gmail API
    const sendPayload: Record<string, string> = { raw: encoded }
    if (thread_id) sendPayload.threadId = thread_id

    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendPayload),
    })

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text()
      console.error('Failed to send Gmail message:', errorText)
      return new Response(JSON.stringify({ error: 'Failed to send email: ' + errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const gmailResult = await gmailResponse.json()

    // Analyze sentiment of email content
    let emailSentiment: string | null = null
    try {
      emailSentiment = await analyzeSentiment(body_text || subject || '')
      console.log(`Email sentiment: ${emailSentiment}`)
    } catch (err) {
      console.error('Sentiment analysis failed:', err)
    }

    // Insert outbound record into email_messages
    const { data: emailRecord, error: insertError } = await supabase
      .from('email_messages')
      .insert({
        user_id: user.id,
        agent_id: agent_id || null,
        thread_id: gmailResult.threadId || thread_id || gmailResult.id,
        gmail_message_id: gmailResult.id,
        from_email: sendAsEmail,
        to_email,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        body_text: body_text || null,
        body_html: body_html || null,
        direction: 'outbound',
        status: 'sent',
        is_ai_generated: !!agent_id,
        is_read: true,
        sentiment: emailSentiment,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to save email record:', insertError)
      // Still return success since the email was sent
    }

    // Deduct email credits (fire and forget)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    deductEmailCredits(supabaseUrl, supabaseKey, user.id, 1)
      .catch(err => console.error('Email credit deduction error:', err))

    return new Response(JSON.stringify({
      success: true,
      message_id: gmailResult.id,
      thread_id: gmailResult.threadId,
      email_record: emailRecord,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function deductEmailCredits(supabaseUrl: string, supabaseKey: string, userId: string, messageCount: number) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ userId, type: 'email', messageCount, referenceType: 'email' })
    })
    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} email(s), balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct email credits:', result.error)
    }
  } catch (err) {
    console.error('Error deducting email credits:', err)
  }
}

async function getGmailAccessToken(supabase: any, userId: string, integrationId?: string | null): Promise<string | null> {
  let integration: any = null

  if (integrationId) {
    // Use specific integration
    const { data } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('status', 'connected')
      .single()
    integration = data
  } else {
    // Find any connected google_email integration for this user
    const { data: provider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single()

    if (!provider) return null

    const { data } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider_id', provider.id)
      .eq('status', 'connected')
      .limit(1)
      .single()
    integration = data
  }

  if (!integration) return null

  // Refresh if expired
  if (new Date(integration.token_expires_at) < new Date()) {
    return await refreshGoogleToken(supabase, integration)
  }

  return integration.access_token
}

async function refreshGoogleToken(supabase: any, integration: any): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    console.error('Token refresh failed:', await response.text())
    return null
  }

  const tokens = await response.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)

  await supabase
    .from('user_integrations')
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  return tokens.access_token
}

async function getGmailAddress(supabase: any, userId: string): Promise<string | null> {
  const { data: provider } = await supabase
    .from('integration_providers')
    .select('id')
    .eq('slug', 'google_email')
    .single()

  if (!provider) return null

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('external_user_id, config')
    .eq('user_id', userId)
    .eq('provider_id', provider.id)
    .eq('status', 'connected')
    .limit(1)
    .single()

  // Gmail address is stored in external_user_id (or config.email as fallback)
  return integration?.external_user_id || integration?.config?.email || null
}
