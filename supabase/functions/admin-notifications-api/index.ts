/**
 * Admin Notifications API
 * CRUD for admin notification config + test channel functionality
 *
 * Actions:
 * - get_config: returns the singleton row + Slack connection status
 * - update_config: updates any subset of fields
 * - test_channel: sends a test message to a specific channel (sms / email / slack)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

const CONFIG_ID = '00000000-0000-0000-0000-000000000100'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Require admin auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    const token = authHeader.replace('Bearer ', '')
    await requireAdmin(supabase, token)

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'get_config':
        return await handleGetConfig(supabase)
      case 'update_config':
        return await handleUpdateConfig(supabase, body)
      case 'test_channel':
        return await handleTestChannel(supabase, body)
      case 'list_slack_channels':
        return await handleListSlackChannels(supabase)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error('Error in admin-notifications-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})


async function handleGetConfig(supabase: any) {
  const { data: config, error } = await supabase
    .from('admin_notification_config')
    .select('*')
    .eq('id', CONFIG_ID)
    .single()

  if (error) {
    return errorResponse('Failed to load notification config: ' + error.message, 500)
  }

  // Check Slack connection status
  let slackConnected = false
  let slackWorkspace = ''
  try {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token, integration_providers!inner(slug)')
      .eq('integration_providers.slug', 'slack')
      .eq('status', 'connected')
      .not('access_token', 'is', null)
      .limit(1)
      .single()

    if (integration?.access_token) {
      slackConnected = true
      // Get workspace name
      const resp = await fetch('https://slack.com/api/auth.test', {
        headers: { 'Authorization': `Bearer ${integration.access_token}` },
      })
      const result = await resp.json()
      if (result.ok) {
        slackWorkspace = result.team || ''
      }
    }
  } catch {
    // No Slack connected
  }

  return successResponse({
    config,
    slackConnected,
    slackWorkspace,
  })
}


async function handleUpdateConfig(supabase: any, body: any) {
  // Extract only valid fields
  const allowedFields = [
    'sms_phone', 'email_address', 'slack_channel',
    'tickets_sms', 'tickets_email', 'tickets_slack',
    'signups_sms', 'signups_email', 'signups_slack',
    'vendor_status_sms', 'vendor_status_email', 'vendor_status_slack',
  ]

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  const { error } = await supabase
    .from('admin_notification_config')
    .update(updates)
    .eq('id', CONFIG_ID)

  if (error) {
    return errorResponse('Failed to update config: ' + error.message, 500)
  }

  return successResponse({ success: true })
}


async function handleTestChannel(supabase: any, body: any) {
  const { channel } = body // 'sms', 'email', or 'slack'

  // Get current config to read channel addresses
  const { data: config, error } = await supabase
    .from('admin_notification_config')
    .select('*')
    .eq('id', CONFIG_ID)
    .single()

  if (error || !config) {
    return errorResponse('Failed to load config', 500)
  }

  const testTitle = 'Test Notification'
  const testBody = 'This is a test notification from Magpipe Admin.'

  try {
    if (channel === 'sms') {
      if (!config.sms_phone) return errorResponse('No SMS phone configured')
      await sendTestSms(supabase, config.sms_phone, `${testTitle}: ${testBody}`)
    } else if (channel === 'email') {
      if (!config.email_address) return errorResponse('No email address configured')
      await sendTestEmail(config.email_address, testTitle, testBody)
    } else if (channel === 'slack') {
      if (!config.slack_channel) return errorResponse('No Slack channel configured')
      await sendTestSlack(supabase, config.slack_channel, testTitle, testBody)
    } else {
      return errorResponse('Invalid channel. Use: sms, email, or slack')
    }

    return successResponse({ success: true, channel })
  } catch (e: any) {
    return errorResponse(`Test failed: ${e.message}`, 500)
  }
}


// --- Channel senders (same as admin-send-notification) ---

async function sendTestSms(_supabase: any, phone: string, message: string) {
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


async function sendTestEmail(to: string, subject: string, body: string) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkApiKey) throw new Error('POSTMARK_API_KEY not configured')

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
        <p style="color: #555; line-height: 1.6;">${escapeHtml(body)}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Magpipe Admin Notification</p>
      </div>`,
      MessageStream: 'outbound',
    }),
  })

  if (!resp.ok) throw new Error(`Postmark failed: HTTP ${resp.status}`)
}


async function sendTestSlack(supabase: any, channelName: string, title: string, body: string) {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('integration_providers.slug', 'slack')
    .eq('status', 'connected')
    .not('access_token', 'is', null)
    .limit(1)
    .single()

  if (!integration?.access_token) throw new Error('No Slack integration connected')

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

  // Join channel
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
  if (!result.ok) throw new Error(`Slack error: ${result.error}`)
}


async function handleListSlackChannels(supabase: any) {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token, integration_providers!inner(slug)')
    .eq('integration_providers.slug', 'slack')
    .eq('status', 'connected')
    .not('access_token', 'is', null)
    .limit(1)
    .single()

  if (!integration?.access_token) {
    return errorResponse('No Slack integration connected', 400)
  }

  const resp = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true', {
    headers: { 'Authorization': `Bearer ${integration.access_token}` },
  })
  const result = await resp.json()

  if (!result.ok) {
    return errorResponse(`Slack API error: ${result.error}`, 500)
  }

  const channels = (result.channels || [])
    .map((c: any) => ({ id: c.id, name: c.name, is_private: c.is_private }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  return successResponse({ channels })
}


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
