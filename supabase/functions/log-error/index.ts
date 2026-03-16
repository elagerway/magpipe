/**
 * log-error
 * Public endpoint for logging errors from frontend, edge functions, and external services.
 * Inserts to system_error_logs and sends alert notifications if configured.
 * No JWT required — callable from browser with anon key or from edge functions with service role key.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { resolveSlackChannelId } from '../_shared/slack-channels.ts'

const CONFIG_ID = '00000000-0000-0000-0000-000000000100'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const {
      error_type,
      error_message,
      error_code,
      source = 'supabase',
      severity = 'error',
      metadata = {},
      user_id = null,
    } = body

    if (!error_type || !error_message) {
      return new Response(
        JSON.stringify({ error: 'error_type and error_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Optionally resolve user from JWT (frontend calls send their session token)
    let resolvedUserId = user_id
    if (!resolvedUserId) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        // Only try to resolve if it looks like a JWT (3 dot-separated segments), not a service role key
        if (token.split('.').length === 3) {
          try {
            const anonClient = createClient(
              supabaseUrl,
              Deno.env.get('SUPABASE_ANON_KEY')!,
              { global: { headers: { Authorization: authHeader } } }
            )
            const { data: { user } } = await anonClient.auth.getUser()
            if (user) resolvedUserId = user.id
          } catch { /* ignore — user_id stays null */ }
        }
      }
    }

    const { error: insertError } = await supabase
      .from('system_error_logs')
      .insert({
        error_type,
        error_message: String(error_message).substring(0, 2000),
        error_code: error_code ? String(error_code).substring(0, 100) : null,
        source,
        severity,
        metadata,
        user_id: resolvedUserId,
      })

    if (insertError) {
      console.error('[log-error] DB insert failed:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to log error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only alert for severity=error, fire-and-forget
    if (severity === 'error') {
      sendAlerts(supabase, error_type, error_message, error_code).catch(e =>
        console.error('[log-error] Alert failed:', e)
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[log-error] Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function sendAlerts(supabase: any, errorType: string, errorMessage: string, errorCode?: string) {
  const { data: config } = await supabase
    .from('admin_notification_config')
    .select('errors_sms, errors_email, errors_slack, sms_phone, email_address, slack_channel')
    .eq('id', CONFIG_ID)
    .single()

  if (!config) return

  const sends: Promise<void>[] = []

  if (config.errors_sms && config.sms_phone) {
    sends.push(sendSmsAlert(config.sms_phone, errorType, errorMessage, errorCode))
  }
  if (config.errors_email && config.email_address) {
    sends.push(sendEmailAlert(config.email_address, errorType, errorMessage, errorCode))
  }
  if (config.errors_slack && config.slack_channel) {
    sends.push(sendSlackAlert(supabase, config.slack_channel, errorType, errorMessage, errorCode))
  }

  if (sends.length > 0) await Promise.allSettled(sends)
}

async function sendSmsAlert(phone: string, errorType: string, errorMessage: string, errorCode?: string) {
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

  const msg = `Magpipe Error: [${errorType}] ${errorMessage}${errorCode ? ` (${errorCode})` : ''}`.substring(0, 160)

  const resp = await fetch(
    `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${projectId}:${apiToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: '+14152518686', To: phone, Body: msg }).toString(),
    }
  )
  if (!resp.ok) console.error('[log-error] SMS failed:', resp.status)
}

async function sendEmailAlert(to: string, errorType: string, errorMessage: string, errorCode?: string) {
  const postmarkKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkKey) return

  const html = `
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#dc2626;margin-bottom:16px;">⚠️ System Error Alert</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:100px;">Type</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${esc(errorType)}</code></td></tr>
        ${errorCode ? `<tr><td style="padding:6px 0;color:#666;">Code</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${esc(errorCode)}</code></td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#666;">Message</td><td style="padding:6px 0;">${esc(errorMessage)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Time</td><td style="padding:6px 0;">${new Date().toUTCString()}</td></tr>
      </table>
      <p style="margin-top:20px;">
        <a href="https://magpipe.ai/admin?tab=support&subtab=errors" style="background:#4f46e5;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;">View in Admin</a>
      </p>
    </div>`

  await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkKey,
    },
    body: JSON.stringify({
      From: Deno.env.get('NOTIFICATION_EMAIL') || 'notifications@snapsonic.com',
      To: to,
      Subject: `[Admin Alert] ${errorType}`,
      HtmlBody: html,
      TextBody: `Error: ${errorType}\n${errorCode ? `Code: ${errorCode}\n` : ''}${errorMessage}\n\nhttps://magpipe.ai/admin?tab=support&subtab=errors`,
      MessageStream: 'outbound',
    }),
  })
}

async function sendSlackAlert(supabase: any, channelName: string, errorType: string, errorMessage: string, errorCode?: string) {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('integration_providers.slug', 'slack')
    .eq('status', 'connected')
    .not('access_token', 'is', null)
    .limit(1)
    .single()

  if (!integration?.access_token) return

  let channelId = channelName
  if (channelName.startsWith('#') || !channelName.startsWith('C')) {
    const resolved = await resolveSlackChannelId(integration.access_token, channelName)
    if (resolved) channelId = resolved
  }

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:red_circle: *System Error Alert*\n*Type:* \`${errorType}\`${errorCode ? `\n*Code:* \`${errorCode}\`` : ''}\n*Message:* ${errorMessage}`,
          },
        },
        {
          type: 'actions',
          elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Admin' }, url: 'https://magpipe.ai/admin?tab=support&subtab=errors' }],
        },
      ],
    }),
  })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
