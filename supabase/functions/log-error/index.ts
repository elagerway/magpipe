/**
 * log-error
 * Public endpoint for logging errors from frontend, edge functions, and external services.
 * Inserts to system_error_logs and sends alert notifications if configured.
 * No JWT required — callable from browser with anon key or from edge functions with service role key.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { resolveSlackChannelId } from '../_shared/slack-channels.ts'
import { getSenderNumber } from '../_shared/sms-compliance.ts'

const CONFIG_ID = '00000000-0000-0000-0000-000000000100'

// Customer-facing critical surfaces. Only these error_types trigger admin
// SMS/email/Slack alerts — frontend logs and non-critical backend errors still
// land in system_error_logs but don't page anyone. Add a row here when wiring
// a new realtime provider so the alert path picks it up automatically.
const CRITICAL_ERROR_TYPES = new Set([
  // OpenAI
  'openai_chat_failure',
  'openai_whisper_failure',
  'openai_embedding_failure',
  // Voice (LiveKit / OpenAI / Anthropic / Deepgram / ElevenLabs in-call)
  'voice_llm_failure',
  'voice_stt_failure',
  'voice_tts_failure',
  'voice_realtime_failure',
  'voice_session_error',
  // Outbound carriers
  'signalwire_sms_send_failure',
  'twilio_sms_send_failure',
  'meta_whatsapp_send_failure',
  // WhatsApp onboarding / registration lifecycle
  'whatsapp_account_deregistered',  // number lost Cloud API registration (133010) — outage
  'whatsapp_connect_failure',       // a customer couldn't connect/register a number
  'whatsapp_token_invalid',         // health-check found a dead/revoked access token
  'whatsapp_account_reregistered',  // health-check auto-healed a dropped registration (page so we root-cause)
  // Platform infra
  'jwt_policy_drift_autohealed', // enforce-jwt-policy detected + fixed drift; alert oncall so we know who/how to root-cause
])

// Throttle window: one SMS per error_type per 15 min, regardless of volume.
const ALERT_DEDUP_WINDOW_MIN = 15

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

    // Only alert for severity=error AND only for critical customer-facing
    // surfaces — frontend / cron / non-critical errors still land in
    // system_error_logs but don't page anyone. Throttled per error_type to
    // one alert per 15 min so an outage = 1 SMS, not 47.
    if (severity === 'error' && CRITICAL_ERROR_TYPES.has(error_type)) {
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
  // Dedup: skip the whole fan-out if we've already alerted on this error_type
  // in the last ALERT_DEDUP_WINDOW_MIN minutes. Saves us from 50 SMS during a
  // provider outage.
  const dedupSince = new Date(Date.now() - ALERT_DEDUP_WINDOW_MIN * 60_000).toISOString()
  const { data: recentAlert } = await supabase
    .from('error_alerts')
    .select('id')
    .eq('error_type', errorType)
    .gte('sent_at', dedupSince)
    .limit(1)
    .maybeSingle()
  if (recentAlert) {
    console.log(`[log-error] Suppressing alert for ${errorType} — already sent within ${ALERT_DEDUP_WINDOW_MIN}-min window`)
    return
  }

  const { data: config } = await supabase
    .from('admin_notification_config')
    .select('errors_sms, errors_email, errors_slack, sms_phone, email_address, slack_channel')
    .eq('id', CONFIG_ID)
    .single()

  if (!config) return

  // Pull aggregate context: how many errors of this type in the window, and
  // which sources (channels / functions) are impacted. Lets the SMS body say
  // "OpenAI down: 12 failures across SMS, voice, WhatsApp" instead of just
  // "openai_chat_failure".
  const { data: recentErrors } = await supabase
    .from('system_error_logs')
    .select('source, metadata')
    .eq('error_type', errorType)
    .gte('created_at', dedupSince)
    .order('created_at', { ascending: false })
    .limit(200)

  const count = recentErrors?.length ?? 1
  const sourcesImpacted = summarizeSources(recentErrors || [])
  const summary = composeAlertSummary(errorType, count, sourcesImpacted)

  const sends: Promise<void>[] = []
  let smsRecipient: string | null = null

  if (config.errors_sms && config.sms_phone) {
    smsRecipient = config.sms_phone
    sends.push(sendSmsAlert(supabase, config.sms_phone, errorType, summary, errorMessage, errorCode))
  }
  if (config.errors_email && config.email_address) {
    sends.push(sendEmailAlert(config.email_address, errorType, errorMessage, errorCode, count, sourcesImpacted))
  }
  if (config.errors_slack && config.slack_channel) {
    sends.push(sendSlackAlert(supabase, config.slack_channel, errorType, errorMessage, errorCode, count, sourcesImpacted))
  }

  if (sends.length === 0) return
  await Promise.allSettled(sends)

  // Log the alert so the next call within the dedup window short-circuits.
  await supabase.from('error_alerts').insert({
    error_type: errorType,
    count_in_window: count,
    services_impacted: sourcesImpacted,
    sample_message: String(errorMessage).substring(0, 500),
    sample_error_code: errorCode ? String(errorCode).substring(0, 100) : null,
    recipient_phone: smsRecipient,
    channel: 'sms',
  }).then(({ error }: any) => {
    if (error) console.error('[log-error] error_alerts insert failed:', error)
  })
}

/**
 * Roll the per-row sources up into a small set of channel labels. Sources
 * look like `webhook-inbound-sms/ai-reply` or `agent.py:generate_call_summary`
 * — first try the metadata.channel hint (sms / whatsapp / voice), fall back
 * to deriving from the source string. Returns ['sms', 'voice'] etc., capped.
 */
function summarizeSources(rows: Array<{ source?: string | null; metadata?: any }>): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const channel = row?.metadata?.channel
    if (channel && typeof channel === 'string') {
      seen.add(channel)
      continue
    }
    const src = (row.source || '').toLowerCase()
    if (src.includes('whatsapp')) seen.add('whatsapp')
    else if (src.includes('inbound-sms') || src.includes('sms-delivery') || src.includes('send-user-sms') || src.includes('send-notification-sms')) seen.add('sms')
    else if (src.includes('voice') || src.includes('agent.py') || src.includes('inbound-call')) seen.add('voice')
    else if (src.includes('email') || src.includes('gmail')) seen.add('email')
    else if (src.includes('chat')) seen.add('chat')
    else if (src) seen.add(src.split('/')[0])
  }
  return Array.from(seen).slice(0, 6)
}

/**
 * SMS body composer. Default format = `<summary>\n<first line of error>` —
 * concise, fits 1–2 SMS segments, gives the recipient enough to act without
 * opening the dashboard. Some error types deserve a custom format because the
 * generic "X alert: N failures" framing would either misrepresent the event
 * (jwt_policy_drift_autohealed isn't a *failure* — it self-healed) or
 * duplicate the error_message text.
 */
function composeSmsBody(errorType: string, summary: string, errorMessage: string, errorCode?: string): string {
  // Self-healed JWT drift: error_message is already a clean one-liner like
  // "JWT policy drift auto-healed on 1 function(s): notify-signup". Don't
  // wrap it with "alert: 1 failure" framing — it implies an outage that
  // didn't happen.
  if (errorType === 'jwt_policy_drift_autohealed') {
    return `✓ ${String(errorMessage).split('\n')[0]} (no outage; check who deployed bare).`.substring(0, 320)
  }

  const detail = String(errorMessage).split('\n')[0]
  const codeStr = errorCode ? ` [${errorCode}]` : ''
  return `${summary}${codeStr}\n${detail}`.substring(0, 320)
}

function composeAlertSummary(errorType: string, count: number, services: string[]): string {
  const provider = errorType.startsWith('openai_') ? 'OpenAI'
    : errorType.startsWith('voice_') ? 'Voice provider'
    : errorType.startsWith('signalwire_') ? 'SignalWire'
    : errorType.startsWith('twilio_') ? 'Twilio'
    : errorType.startsWith('meta_whatsapp_') ? 'Meta WhatsApp'
    : errorType === 'whatsapp_account_deregistered' ? 'WhatsApp number DEREGISTERED'
    : errorType === 'whatsapp_connect_failure' ? 'WhatsApp connect'
    : errorType === 'whatsapp_token_invalid' ? 'WhatsApp token INVALID'
    : errorType === 'whatsapp_account_reregistered' ? 'WhatsApp auto-healed'
    : errorType
  const svcStr = services.length > 0 ? ` across ${services.join(', ')}` : ''
  const failureWord = count === 1 ? 'failure' : 'failures'
  return `${provider} alert: ${count} ${failureWord}${svcStr} in last ${ALERT_DEDUP_WINDOW_MIN}m. Type: ${errorType}`
}

async function sendSmsAlert(supabase: any, phone: string, errorType: string, summary: string, errorMessage: string, errorCode?: string) {
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

  // Pick the sender by recipient country: getSenderNumber → US sender for US
  // recipients (10DLC compliance), Canadian sender otherwise. Sending US-origin
  // SMS to a Canadian number gets filtered/blocked by Canadian carriers, so we
  // can't hardcode the From here.
  const fromNumber = await getSenderNumber(phone, '', supabase)

  const msg = composeSmsBody(errorType, summary, errorMessage, errorCode)

  const resp = await fetch(
    `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${projectId}:${apiToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromNumber, To: phone, Body: msg }).toString(),
    }
  )
  if (!resp.ok) console.error('[log-error] SMS failed:', resp.status, await resp.text())
}

async function sendEmailAlert(to: string, errorType: string, errorMessage: string, errorCode: string | undefined, count: number, services: string[]) {
  const postmarkKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkKey) return

  const svcRow = services.length > 0
    ? `<tr><td style="padding:6px 0;color:#666;">Services</td><td style="padding:6px 0;">${esc(services.join(', '))}</td></tr>`
    : ''
  const countRow = `<tr><td style="padding:6px 0;color:#666;">Window</td><td style="padding:6px 0;">${count} failure${count === 1 ? '' : 's'} in last ${ALERT_DEDUP_WINDOW_MIN} min</td></tr>`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#dc2626;margin-bottom:16px;">⚠️ System Error Alert</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:100px;">Type</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${esc(errorType)}</code></td></tr>
        ${errorCode ? `<tr><td style="padding:6px 0;color:#666;">Code</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;">${esc(errorCode)}</code></td></tr>` : ''}
        ${countRow}
        ${svcRow}
        <tr><td style="padding:6px 0;color:#666;">Message</td><td style="padding:6px 0;">${esc(errorMessage)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Time</td><td style="padding:6px 0;">${new Date().toUTCString()}</td></tr>
      </table>
      <p style="margin-top:20px;">
        <a href="https://magpipe.ai/admin?tab=support&subtab=errors" style="background:#4f46e5;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:14px;">View in Admin</a>
      </p>
    </div>`

  const svcLine = services.length > 0 ? `\nServices: ${services.join(', ')}` : ''
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
      Subject: `[Admin Alert] ${errorType} (${count}x in ${ALERT_DEDUP_WINDOW_MIN}m)`,
      HtmlBody: html,
      TextBody: `Error: ${errorType}\n${errorCode ? `Code: ${errorCode}\n` : ''}${count} failures in last ${ALERT_DEDUP_WINDOW_MIN} min${svcLine}\n${errorMessage}\n\nhttps://magpipe.ai/admin?tab=support&subtab=errors`,
      MessageStream: 'outbound',
    }),
  })
}

async function sendSlackAlert(supabase: any, channelName: string, errorType: string, errorMessage: string, errorCode: string | undefined, count: number, services: string[]) {
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
            text: `:red_circle: *System Error Alert*\n*Type:* \`${errorType}\`${errorCode ? `\n*Code:* \`${errorCode}\`` : ''}\n*Window:* ${count} failure${count === 1 ? '' : 's'} in last ${ALERT_DEDUP_WINDOW_MIN}m${services.length > 0 ? `\n*Services:* ${services.join(', ')}` : ''}\n*Message:* ${errorMessage}`,
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
