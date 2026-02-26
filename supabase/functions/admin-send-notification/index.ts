/**
 * Admin Send Notification
 * Multi-channel notification sender (SMS, Email, Slack)
 * Called internally by other edge functions when events occur.
 *
 * Input: { category: 'tickets'|'signups'|'vendor_status', title: string, body: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const CONFIG_ID = '00000000-0000-0000-0000-000000000100'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { category, title, body: messageBody } = await req.json()

    if (!category || !title || !messageBody) {
      return jsonResponse({ error: 'Missing category, title, or body' }, 400)
    }

    // Read admin_notification_config
    const { data: config, error: configError } = await supabase
      .from('admin_notification_config')
      .select('*')
      .eq('id', CONFIG_ID)
      .single()

    if (configError || !config) {
      console.error('Failed to load notification config:', configError)
      return jsonResponse({ error: 'Config not found' }, 500)
    }

    // Determine which channels are enabled for this category
    const smsEnabled = config[`${category}_sms`] === true
    const emailEnabled = config[`${category}_email`] === true
    const slackEnabled = config[`${category}_slack`] === true

    const results: Record<string, string> = {}

    // Send SMS
    if (smsEnabled && config.sms_phone) {
      try {
        await sendSms(supabase, config.sms_phone, `${title}: ${messageBody}`)
        results.sms = 'sent'
      } catch (e: any) {
        console.error('SMS notification failed:', e)
        results.sms = `error: ${e.message}`
      }
    }

    // Send Email
    if (emailEnabled && config.email_address) {
      try {
        await sendEmail(config.email_address, title, messageBody)
        results.email = 'sent'
      } catch (e: any) {
        console.error('Email notification failed:', e)
        results.email = `error: ${e.message}`
      }
    }

    // Send Slack
    if (slackEnabled && config.slack_channel) {
      try {
        await sendSlack(supabase, config.slack_channel, title, messageBody)
        results.slack = 'sent'
      } catch (e: any) {
        console.error('Slack notification failed:', e)
        results.slack = `error: ${e.message}`
      }
    }

    return jsonResponse({ success: true, results })
  } catch (error: any) {
    console.error('Error in admin-send-notification:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}


async function sendSms(_supabase: any, phone: string, message: string) {
  const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
  const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
  const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

  const smsData = new URLSearchParams({
    From: '+16042431596',
    To: phone,
    Body: message.substring(0, 160),
  })

  const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
  const resp = await fetch(
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

  const respBody = await resp.json()
  if (!resp.ok || respBody.error_code) {
    throw new Error(`SMS failed: ${respBody.error_message || `HTTP ${resp.status}`}`)
  }
}


async function sendEmail(to: string, subject: string, body: string) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkApiKey) {
    throw new Error('POSTMARK_API_KEY not configured')
  }

  const resp = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey,
    },
    body: JSON.stringify({
      From: Deno.env.get('NOTIFICATION_EMAIL') || 'notifications@snapsonic.com',
      To: to,
      Subject: `[Admin Alert] ${subject}`,
      TextBody: body,
      HtmlBody: `<div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #333;">${escapeHtml(subject)}</h2>
        <p style="color: #555; line-height: 1.6;">${escapeHtml(body).replace(/\n/g, '<br>')}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Magpipe Admin Notification</p>
      </div>`,
      MessageStream: 'outbound',
    }),
  })

  if (!resp.ok) {
    throw new Error(`Postmark failed: HTTP ${resp.status}`)
  }
}


async function sendSlack(supabase: any, channelName: string, title: string, body: string) {
  // Find a connected Slack integration (any user with Slack connected)
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('integration_providers.slug', 'slack')
    .eq('status', 'connected')
    .not('access_token', 'is', null)
    .limit(1)
    .single()

  if (!integration?.access_token) {
    throw new Error('No Slack integration connected')
  }

  // Resolve channel name to ID
  let channelId = channelName
  if (channelName.startsWith('#') || !channelName.startsWith('C')) {
    const name = channelName.replace(/^#/, '').toLowerCase()
    const listResp = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true', {
      headers: { 'Authorization': `Bearer ${integration.access_token}` },
    })
    const listResult = await listResp.json()
    if (listResult.ok && listResult.channels) {
      const found = listResult.channels.find((c: any) => c.name.toLowerCase() === name)
      if (found) channelId = found.id
      else throw new Error(`Slack channel "${channelName}" not found`)
    } else {
      throw new Error('Failed to list Slack channels')
    }
  }

  // Join channel (no-op if already joined)
  await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `channel=${encodeURIComponent(channelId)}`,
  })

  // Send message
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      text: `*${title}*\n${body}`,
    }),
  })

  const result = await resp.json()
  if (!result.ok) {
    throw new Error(`Slack error: ${result.error}`)
  }
}


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
