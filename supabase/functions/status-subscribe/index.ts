/**
 * Status Subscribe Edge Function
 * Handles subscribe, confirm, and unsubscribe for status page notifications.
 * Deploy with --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { APP_NAME } from '../_shared/config.ts'
import { isUSNumber, USA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'

const SUBSCRIBE_URL = 'https://api.magpipe.ai/functions/v1/status-subscribe'
const STATUS_PAGE_URL = 'https://status.magpipe.ai'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const url = new URL(req.url)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // GET: confirm or unsubscribe
  if (req.method === 'GET') {
    const confirmToken = url.searchParams.get('confirm')
    const unsubToken = url.searchParams.get('unsubscribe')

    if (confirmToken) {
      const { data, error } = await supabase
        .from('status_subscribers')
        .update({ confirmed: true, confirmed_at: new Date().toISOString() })
        .eq('confirm_token', confirmToken)
        .eq('confirmed', false)
        .select('email')
        .single()

      if (error || !data) {
        return htmlResponse('Already Confirmed', 'This subscription was already confirmed or the link is invalid.')
      }
      return htmlResponse('Subscription Confirmed', `You'll receive ${APP_NAME} status updates. <a href="${STATUS_PAGE_URL}">View status page</a>`)
    }

    if (unsubToken) {
      const { data, error } = await supabase
        .from('status_subscribers')
        .delete()
        .eq('unsubscribe_token', unsubToken)
        .select('email')
        .single()

      if (error || !data) {
        return htmlResponse('Not Found', 'This subscription was not found or already removed.')
      }
      return htmlResponse('Unsubscribed', `You've been removed from ${APP_NAME} status updates.`)
    }

    return new Response('Missing parameter', { status: 400, headers: corsHeaders })
  }

  // POST: subscribe or manage
  if (req.method === 'POST') {
    try {
      const body = await req.json()

      // Resend unsubscribe link to email
      if (body.action === 'resend_unsubscribe') {
        const email = (body.email || '').trim().toLowerCase()
        if (!email) return jsonResponse({ error: 'Email required' }, 400)

        const { data: sub } = await supabase
          .from('status_subscribers')
          .select('unsubscribe_token')
          .eq('email', email)
          .single()

        // Always return success to avoid email enumeration
        if (sub?.unsubscribe_token) {
          await sendUnsubscribeEmail(email, sub.unsubscribe_token)
        }
        return jsonResponse({ message: 'If that email is subscribed, you\'ll receive an unsubscribe link shortly.' })
      }

      // Unsubscribe by phone number directly
      if (body.action === 'unsubscribe_by_phone') {
        const phone = (body.phone || '').trim()
        if (!phone) return jsonResponse({ error: 'Phone required' }, 400)

        const { data, error } = await supabase
          .from('status_subscribers')
          .delete()
          .eq('phone', phone)
          .select('id')
          .single()

        if (error || !data) {
          // Return success to avoid enumeration
          return jsonResponse({ message: 'If that number is subscribed, it has been removed.' })
        }
        return jsonResponse({ message: 'You\'ve been unsubscribed from SMS status alerts.' })
      }

      const { email, phone, webhook_url, channels } = body

      // Validate channels
      const validChannels = ['email', 'sms', 'webhook']
      const requestedChannels: string[] = Array.isArray(channels) ? channels.filter((c: string) => validChannels.includes(c)) : ['email']
      if (requestedChannels.length === 0) {
        return jsonResponse({ error: 'At least one valid channel required (email, sms, webhook)' }, 400)
      }

      // Validate required fields per channel
      if (requestedChannels.includes('email') && !email) {
        return jsonResponse({ error: 'Email required for email notifications' }, 400)
      }
      if (requestedChannels.includes('sms') && !phone) {
        return jsonResponse({ error: 'Phone number required for SMS notifications' }, 400)
      }
      if (requestedChannels.includes('webhook') && !webhook_url) {
        return jsonResponse({ error: 'Webhook URL required for webhook notifications' }, 400)
      }

      // Basic email validation
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: 'Invalid email address' }, 400)
      }

      // Basic phone validation (E.164)
      if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
        return jsonResponse({ error: 'Phone must be in E.164 format (e.g. +14155551234)' }, 400)
      }

      // Basic webhook URL validation
      if (webhook_url && !/^https?:\/\/.+/.test(webhook_url)) {
        return jsonResponse({ error: 'Webhook URL must start with http:// or https://' }, 400)
      }

      // Check for existing subscriber by email or phone
      if (email) {
        const { data: existing } = await supabase
          .from('status_subscribers')
          .select('id, confirmed')
          .eq('email', email)
          .single()
        if (existing) {
          if (existing.confirmed) {
            return jsonResponse({ message: 'This email is already subscribed.' })
          }
          return jsonResponse({ message: 'A confirmation email was already sent. Please check your inbox.' })
        }
      }
      if (phone) {
        const { data: existing } = await supabase
          .from('status_subscribers')
          .select('id, confirmed')
          .eq('phone', phone)
          .single()
        if (existing) {
          return jsonResponse({ message: 'This phone number is already subscribed.' })
        }
      }

      // Auto-confirm: webhook-only or SMS subs (SMS confirmation links get spam-filtered)
      // Email-only subs still require email confirmation
      const emailOnly = requestedChannels.length === 1 && requestedChannels[0] === 'email'
      const isWebhookOnly = requestedChannels.length === 1 && requestedChannels[0] === 'webhook'
      const autoConfirm = !emailOnly

      // Insert subscriber
      const { data: subscriber, error: insertError } = await supabase
        .from('status_subscribers')
        .insert({
          email: email || null,
          phone: phone || null,
          webhook_url: webhook_url || null,
          channels: requestedChannels,
          confirmed: autoConfirm,
          confirmed_at: autoConfirm ? new Date().toISOString() : null,
        })
        .select('confirm_token, unsubscribe_token')
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        return jsonResponse({ error: 'Failed to create subscription' }, 500)
      }

      // Send confirmation email
      if (requestedChannels.includes('email') && email) {
        await sendConfirmationEmail(email, subscriber.confirm_token, subscriber.unsubscribe_token)
      }

      // Send confirmation SMS
      if (requestedChannels.includes('sms') && phone) {
        await sendConfirmationSMS(phone, subscriber.confirm_token, supabase)
      }

      const message = autoConfirm
        ? 'Subscription confirmed! You\'ll receive status alerts.'
        : 'Please check your email to confirm your subscription.'

      return jsonResponse({ message })
    } catch (e) {
      console.error('Subscribe error:', e)
      return jsonResponse({ error: 'Invalid request body' }, 400)
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})

// --- Helpers ---

async function sendConfirmationEmail(email: string, confirmToken: string, unsubscribeToken: string) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY') || Deno.env.get('POSTMARK_SERVER_TOKEN')
  if (!postmarkApiKey) {
    console.error('Postmark API key not configured')
    return
  }

  const confirmUrl = `${SUBSCRIBE_URL}?confirm=${confirmToken}`
  const unsubUrl = `${SUBSCRIBE_URL}?unsubscribe=${unsubscribeToken}`

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">Confirm your status subscription</h2>
      <p style="color: #475569; line-height: 1.6;">
        You requested to receive ${APP_NAME} status updates at this email address.
        Click the button below to confirm:
      </p>
      <div style="margin: 24px 0;">
        <a href="${confirmUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Confirm Subscription
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you didn't request this, you can ignore this email or
        <a href="${unsubUrl}" style="color: #6366f1;">unsubscribe</a>.
      </p>
    </div>
  `

  try {
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
        Subject: `Confirm your ${APP_NAME} status subscription`,
        HtmlBody: htmlBody,
        TextBody: `Confirm your ${APP_NAME} status subscription:\n\n${confirmUrl}\n\nUnsubscribe: ${unsubUrl}`,
        MessageStream: 'outbound',
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Postmark error:', errText)
    }
  } catch (e) {
    console.error('Failed to send confirmation email:', e)
  }
}

async function sendConfirmationSMS(phone: string, confirmToken: string, supabase: ReturnType<typeof createClient>) {
  const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
  const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
  const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
  if (!signalwireProjectId || !signalwireApiToken) {
    console.error('SignalWire credentials not configured')
    return
  }

  const confirmUrl = `${SUBSCRIBE_URL}?confirm=${confirmToken}`
  const STATUS_SMS_CA = '+16042566768'
  const isUS = await isUSNumber(phone, supabase)
  const fromNumber = isUS ? USA_SENDER_NUMBER : STATUS_SMS_CA

  const smsBody = `${APP_NAME} Status: You're now subscribed to status alerts. Reply STOP to unsubscribe.`

  const smsData = new URLSearchParams({
    From: fromNumber,
    To: phone,
    Body: smsBody,
  })

  try {
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
      console.error('SignalWire SMS error:', errText)
    }
  } catch (e) {
    console.error('Failed to send confirmation SMS:', e)
  }
}

async function sendUnsubscribeEmail(email: string, unsubscribeToken: string) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY') || Deno.env.get('POSTMARK_SERVER_TOKEN')
  if (!postmarkApiKey) return

  const unsubUrl = `${SUBSCRIBE_URL}?unsubscribe=${unsubscribeToken}`
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">Unsubscribe from status updates</h2>
      <p style="color: #475569; line-height: 1.6;">
        Click the button below to remove your email from ${APP_NAME} status notifications.
      </p>
      <div style="margin: 24px 0;">
        <a href="${unsubUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Unsubscribe
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  `

  try {
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
        Subject: `Unsubscribe from ${APP_NAME} status updates`,
        HtmlBody: htmlBody,
        TextBody: `Unsubscribe from ${APP_NAME} status updates:\n\n${unsubUrl}`,
        MessageStream: 'outbound',
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Postmark unsubscribe email error:', res.status, errText)
    }
  } catch (e) {
    console.error('Failed to send unsubscribe email:', e)
  }
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function htmlResponse(title: string, message: string) {
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${APP_NAME} Status</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 2.5rem; max-width: 420px; text-align: center; }
  h1 { font-size: 1.4rem; margin-bottom: 0.75rem; }
  p { color: rgba(255,255,255,0.7); line-height: 1.6; }
  a { color: #818cf8; }
</style>
</head><body>
<div class="card"><h1>${title}</h1><p>${message}</p></div>
</body></html>`
  return new Response(html, {
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
