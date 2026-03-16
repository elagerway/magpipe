/**
 * Status Notify Edge Function
 * Called every 5 min by cron. Detects status transitions and notifies subscribers.
 * Deploy with --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { APP_NAME } from '../_shared/config.ts'
import { USA_SENDER_NUMBER, CANADA_SENDER_NUMBER, isUSNumber } from '../_shared/sms-compliance.ts'

const STATUS_PAGE_URL = 'https://status.magpipe.ai'
const SUBSCRIBE_URL = 'https://api.magpipe.ai/functions/v1/status-subscribe'

const STATUS_DISPLAY: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Partial Outage',
  down: 'Outage',
}

interface CategoryStatus {
  name: string
  status: string
  detail?: string
}

interface Transition {
  category: string
  oldStatus: string
  newStatus: string
  detail?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // 1. Fetch current status from public-status
    const statusRes = await fetch(`${supabaseUrl}/functions/v1/public-status`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!statusRes.ok) {
      console.error('Failed to fetch public-status:', statusRes.status)
      return jsonResponse({ error: 'Failed to fetch status' }, 502)
    }
    const statusData = await statusRes.json()
    const categories: CategoryStatus[] = statusData.categories || []

    // 2. Load cached state
    const { data: cachedRows } = await supabase
      .from('status_state_cache')
      .select('category, status, detail, confirmed')

    const cache: Record<string, { status: string; detail?: string; confirmed: boolean }> = {}
    for (const row of cachedRows || []) {
      cache[row.category] = { status: row.status, detail: row.detail, confirmed: row.confirmed ?? true }
    }

    // 3. Detect transitions
    // Flap dampening: degraded/down transitions require 2 consecutive bad checks before notifying.
    // First bad check: update cache, set confirmed=false (no notification yet).
    // Second bad check (still bad, confirmed=false): set confirmed=true and notify.
    // Recovery to operational: notify immediately only if we previously confirmed+notified degraded.
    const transitions: Transition[] = []
    for (const cat of categories) {
      const prev = cache[cat.name]
      if (!prev) {
        // First time seeing this category — seed the cache, no notification
        await supabase.from('status_state_cache').upsert({
          category: cat.name,
          status: cat.status,
          detail: cat.detail || null,
          confirmed: true,
          updated_at: new Date().toISOString(),
        })
        continue
      }

      if (prev.status !== cat.status) {
        if (cat.status === 'operational') {
          // Recovery: only notify if we previously confirmed a degraded/down alert
          if (prev.confirmed) {
            transitions.push({
              category: cat.name,
              oldStatus: prev.status,
              newStatus: cat.status,
              detail: cat.detail,
            })
          }
          await supabase.from('status_state_cache').upsert({
            category: cat.name,
            status: cat.status,
            detail: cat.detail || null,
            confirmed: true,
            updated_at: new Date().toISOString(),
          })
        } else {
          // Going degraded/down: first occurrence — update cache but don't notify yet
          await supabase.from('status_state_cache').upsert({
            category: cat.name,
            status: cat.status,
            detail: cat.detail || null,
            confirmed: false,
            updated_at: new Date().toISOString(),
          })
        }
      } else if (prev.status === cat.status && !prev.confirmed && cat.status !== 'operational') {
        // Still degraded/down after first unconfirmed check — now confirm and notify
        transitions.push({
          category: cat.name,
          oldStatus: 'operational', // effectively: was OK before the flap started
          newStatus: cat.status,
          detail: cat.detail,
        })
        await supabase.from('status_state_cache').upsert({
          category: cat.name,
          status: cat.status,
          detail: cat.detail || null,
          confirmed: true,
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (transitions.length === 0) {
      return jsonResponse({ message: 'No transitions detected', categories: categories.length })
    }

    console.log(`Detected ${transitions.length} transition(s):`, transitions.map(t => `${t.category}: ${t.oldStatus} → ${t.newStatus}`))

    // 4. Fetch confirmed subscribers
    const { data: subscribers, error: subError } = await supabase
      .from('status_subscribers')
      .select('id, email, phone, webhook_url, channels, unsubscribe_token')
      .eq('confirmed', true)

    if (subError || !subscribers?.length) {
      console.log('No confirmed subscribers to notify')
      return jsonResponse({ message: 'Transitions detected but no subscribers', transitions: transitions.length })
    }

    console.log(`Notifying ${subscribers.length} subscriber(s)`)

    // 5. Send notifications
    const results = { email: 0, sms: 0, webhook: 0, errors: 0 }

    for (const sub of subscribers) {
      const channels: string[] = sub.channels || []

      if (channels.includes('email') && sub.email) {
        try {
          await sendEmailNotification(sub.email, sub.unsubscribe_token, transitions)
          results.email++
        } catch (e) {
          console.error(`Email failed for ${sub.email}:`, e)
          results.errors++
        }
      }

      if (channels.includes('sms') && sub.phone) {
        try {
          await sendSMSNotification(sub.phone, transitions, supabase)
          results.sms++
        } catch (e) {
          console.error(`SMS failed for ${sub.phone}:`, e)
          results.errors++
        }
      }

      if (channels.includes('webhook') && sub.webhook_url) {
        try {
          await sendWebhookNotification(sub.webhook_url, transitions)
          results.webhook++
        } catch (e) {
          console.error(`Webhook failed for ${sub.webhook_url}:`, e)
          results.errors++
        }
      }
    }

    return jsonResponse({
      message: `Notified subscribers of ${transitions.length} transition(s)`,
      transitions: transitions.length,
      results,
    })
  } catch (e) {
    console.error('status-notify error:', e)
    return jsonResponse({ error: 'Internal error' }, 500)
  }
})

// --- Notification senders ---

async function sendEmailNotification(email: string, unsubscribeToken: string, transitions: Transition[]) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY') || Deno.env.get('POSTMARK_SERVER_TOKEN')
  if (!postmarkApiKey) throw new Error('Postmark not configured')

  const unsubUrl = `${SUBSCRIBE_URL}?unsubscribe=${unsubscribeToken}`

  // Subject line
  const primary = transitions[0]
  const subject = transitions.length === 1
    ? `${APP_NAME} Status: ${primary.category} is now ${STATUS_DISPLAY[primary.newStatus] || primary.newStatus}`
    : `${APP_NAME} Status: ${transitions.length} service changes detected`

  // Build HTML rows
  const rows = transitions.map(t => {
    const oldLabel = STATUS_DISPLAY[t.oldStatus] || t.oldStatus
    const newLabel = STATUS_DISPLAY[t.newStatus] || t.newStatus
    const color = t.newStatus === 'operational' ? '#10b981' : t.newStatus === 'down' ? '#ef4444' : '#f59e0b'
    const detail = t.detail ? `<br><span style="color:#94a3b8;font-size:13px;">${escHtml(t.detail)}</span>` : ''
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${escHtml(t.category)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#94a3b8;">${oldLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:${color};">${newLabel}${detail}</td>
    </tr>`
  }).join('')

  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin-bottom:8px;">${APP_NAME} Status Update</h2>
      <p style="color:#64748b;margin-bottom:20px;">The following service(s) changed status:</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Service</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Was</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#64748b;">Now</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:20px;"><a href="${STATUS_PAGE_URL}" style="color:#6366f1;font-weight:600;">View status page &rarr;</a></p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;">
        You're receiving this because you subscribed to ${APP_NAME} status updates.
        <a href="${unsubUrl}" style="color:#6366f1;">Unsubscribe</a>
      </p>
    </div>
  `

  // Plain text fallback
  const textLines = transitions.map(t =>
    `${t.category}: ${STATUS_DISPLAY[t.oldStatus] || t.oldStatus} → ${STATUS_DISPLAY[t.newStatus] || t.newStatus}${t.detail ? ' — ' + t.detail : ''}`
  )
  const textBody = `${APP_NAME} Status Update\n\n${textLines.join('\n')}\n\nView: ${STATUS_PAGE_URL}\n\nUnsubscribe: ${unsubUrl}`

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey,
    },
    body: JSON.stringify({
      From: `${APP_NAME} Status <info@magpipe.ai>`,
      To: email,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: 'outbound',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Postmark ${res.status}: ${errText}`)
  }
}

async function sendSMSNotification(phone: string, transitions: Transition[], supabase: ReturnType<typeof createClient>) {
  const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
  const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
  const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
  if (!signalwireProjectId || !signalwireApiToken) throw new Error('SignalWire not configured')

  // Status alerts use dedicated numbers (not the notification numbers which get spam-flagged)
  const STATUS_SMS_CA = '+16042566768'
  const isUS = await isUSNumber(phone, supabase)
  const fromNumber = isUS ? USA_SENDER_NUMBER : STATUS_SMS_CA

  // Short SMS body — no URLs (carriers flag them as spam)
  const lines = transitions.map(t => {
    const status = STATUS_DISPLAY[t.newStatus] || t.newStatus
    return t.detail ? `${t.category}: ${status} — ${t.detail}` : `${t.category}: ${status}`
  })
  let body = `${APP_NAME} Status Update\n${lines.join('\n')}`

  // Add opt-out text for US recipients
  if (isUS) {
    body += '\n\nReply STOP to unsubscribe'
  }

  const smsData = new URLSearchParams({
    From: fromNumber,
    To: phone,
    Body: body,
  })

  const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
  const res = await fetch(
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

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`SignalWire ${res.status}: ${errText}`)
  }
}

async function sendWebhookNotification(webhookUrl: string, transitions: Transition[]) {
  const payload = {
    event: 'status_change',
    timestamp: new Date().toISOString(),
    transitions: transitions.map(t => ({
      category: t.category,
      previous_status: t.oldStatus,
      current_status: t.newStatus,
      detail: t.detail || null,
    })),
    status_page: STATUS_PAGE_URL,
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    throw new Error(`Webhook ${res.status}`)
  }
}

// --- Helpers ---

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
