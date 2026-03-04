/**
 * Send Slack Notification Edge Function
 * Two modes:
 * 1. Internal: { userId, type, data } — sends notification to user's Slack channel
 * 2. User-facing: { action: 'list_channels' } — lists user's Slack channels (auth via resolveUser)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SLACK_PROVIDER_ID = 'fc067ae0-0682-4a60-83c0-19600369656f'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const body = await req.json()

    // User-facing actions (authenticated via resolveUser)
    if (body.action === 'list_channels') {
      return await handleListChannels(req, body)
    }

    // Internal notification mode
    return await handleSendNotification(body)

  } catch (error: any) {
    console.error('Error in send-notification-slack:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


async function handleListChannels(req: Request, _body: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const user = await resolveUser(req, supabase)
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Get user's Slack access token
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('provider_id', SLACK_PROVIDER_ID)
    .eq('status', 'connected')
    .single()

  if (!integration?.access_token) {
    return jsonResponse({ error: 'No Slack integration connected' }, 400)
  }

  const resp = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true', {
    headers: { 'Authorization': `Bearer ${integration.access_token}` },
  })
  const result = await resp.json()

  if (!result.ok) {
    return jsonResponse({ error: `Slack API error: ${result.error}` }, 500)
  }

  const channels = (result.channels || [])
    .map((c: any) => ({ id: c.id, name: c.name }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  return jsonResponse({ channels })
}


async function handleSendNotification(body: any) {
  const { userId, agentId, type, data } = body

  if (!userId || !type) {
    return jsonResponse({ error: 'Missing required fields' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Extracted data uses per-variable channel routing — bypasses notification prefs
  if (type === 'extracted_data') {
    return await handleExtractedDataNotification(userId, data, supabase)
  }

  // Get user's notification preferences (per-agent first, fallback to user-level)
  let prefs = null
  if (agentId) {
    const { data: agentPrefs } = await supabase
      .from('notification_preferences')
      .select('slack_enabled, slack_channel, slack_inbound_calls, slack_all_calls, slack_inbound_messages, slack_all_messages')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .maybeSingle()
    prefs = agentPrefs
  }
  if (!prefs) {
    const { data: userPrefs } = await supabase
      .from('notification_preferences')
      .select('slack_enabled, slack_channel, slack_inbound_calls, slack_all_calls, slack_inbound_messages, slack_all_messages')
      .eq('user_id', userId)
      .is('agent_id', null)
      .maybeSingle()
    prefs = userPrefs
  }

  if (!prefs || !prefs.slack_enabled) {
    console.log('Slack notifications not enabled for user:', userId)
    return jsonResponse({ message: 'Notifications not enabled' })
  }

  if (!prefs.slack_channel) {
    console.log('No Slack channel configured for user:', userId)
    return jsonResponse({ message: 'No Slack channel configured' })
  }

  // Check if this notification type is enabled
  let typeEnabled = false

  if (type === 'completed_call') {
    typeEnabled = prefs.slack_inbound_calls || prefs.slack_all_calls
  } else if (type === 'missed_call') {
    typeEnabled = prefs.slack_all_calls
  } else if (type === 'new_message' || type === 'new_chat') {
    typeEnabled = prefs.slack_inbound_messages || prefs.slack_all_messages
  } else if (type === 'outbound_message') {
    typeEnabled = prefs.slack_all_messages
  }

  if (!typeEnabled) {
    console.log(`Slack notifications for ${type} not enabled for user:`, userId)
    return jsonResponse({ message: 'Notification type not enabled' })
  }

  // Get user's Slack access token
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider_id', SLACK_PROVIDER_ID)
    .eq('status', 'connected')
    .single()

  if (integrationError || !integration?.access_token) {
    console.log('No Slack integration connected for user:', userId)
    return jsonResponse({ message: 'Slack not connected' })
  }

  // Resolve channel name to ID
  const channelId = await resolveChannelId(integration.access_token, prefs.slack_channel)
  if (!channelId) {
    console.error('Could not resolve Slack channel:', prefs.slack_channel)
    return jsonResponse({ error: 'Slack channel not found' }, 400)
  }

  // Build Slack message
  const message = buildSlackMessage(type, data)

  const result = await postToSlackChannel(integration.access_token, channelId, message)
  if (!result.ok) {
    console.error('Slack API error:', result.error)
    return jsonResponse({ error: `Slack error: ${result.error}` }, 500)
  }

  console.log('Slack notification sent for user:', userId, 'type:', type)
  return jsonResponse({ success: true })
}


function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}


async function handleExtractedDataNotification(userId: string, data: any, supabase: any) {
  if (!data?.variables || !Array.isArray(data.variables) || data.variables.length === 0) {
    return jsonResponse({ message: 'No variables to notify' })
  }

  // Get user's Slack access token
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider_id', SLACK_PROVIDER_ID)
    .eq('status', 'connected')
    .single()

  if (!integration?.access_token) {
    console.log('No Slack integration connected for user:', userId)
    return jsonResponse({ message: 'Slack not connected' })
  }

  // Group variables by target channel
  const channelGroups: Record<string, { name: string; value: any }[]> = {}
  for (const v of data.variables) {
    const channel = v.slack_channel
    if (!channel) continue
    if (!channelGroups[channel]) channelGroups[channel] = []
    channelGroups[channel].push({ name: v.name, value: v.value })
  }

  if (Object.keys(channelGroups).length === 0) {
    return jsonResponse({ message: 'No channels configured for variables' })
  }

  // Fetch channel list once and build name→id map for all resolutions
  const channelMap = await fetchChannelMap(integration.access_token)

  const callerNumber = data.callerNumber || 'Unknown'
  const results: string[] = []

  for (const [channelName, vars] of Object.entries(channelGroups)) {
    const channelId = resolveChannelFromMap(channelMap, channelName)
    if (!channelId) {
      console.error('Could not resolve Slack channel:', channelName)
      results.push(`${channelName}: channel not found`)
      continue
    }

    // Build message for this channel's variables
    const varLines = vars.map(v => `• *${v.name}:* ${v.value ?? '_not found_'}`).join('\n')
    const message = {
      text: `Extracted data from ${callerNumber}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:bar_chart: *Extracted Data*\n*From:* ${callerNumber}\n${varLines}`,
          },
        },
      ],
    }

    const result = await postToSlackChannel(integration.access_token, channelId, message)
    if (result.ok) {
      results.push(`${channelName}: sent`)
    } else {
      console.error(`Slack API error for ${channelName}:`, result.error)
      results.push(`${channelName}: ${result.error}`)
    }
  }

  console.log('Extracted data Slack notifications sent for user:', userId, results)
  return jsonResponse({ success: true, channels: results })
}


/** Join a channel and post a message. Shared by both standard and extracted-data paths. */
async function postToSlackChannel(accessToken: string, channelId: string, message: { text: string; blocks?: any[] }): Promise<{ ok: boolean; error?: string }> {
  // Join channel (no-op if already joined)
  await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `channel=${encodeURIComponent(channelId)}`,
  })

  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      text: message.text,
      blocks: message.blocks,
    }),
  })
  return resp.json()
}


/** Fetch all channels once and return a name→id map. */
async function fetchChannelMap(accessToken: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const resp = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const result = await resp.json()
  if (result.ok && result.channels) {
    for (const c of result.channels) {
      map.set(c.name.toLowerCase(), c.id)
    }
  }
  return map
}


/** Resolve a channel name (or raw ID) using a pre-fetched map. */
function resolveChannelFromMap(channelMap: Map<string, string>, channelName: string): string | null {
  if (channelName.startsWith('C') && !channelName.startsWith('#')) {
    return channelName
  }
  const name = channelName.replace(/^#/, '').toLowerCase()
  return channelMap.get(name) || null
}


/** Resolve a single channel name to an ID (fetches channel list each call — use fetchChannelMap for batch). */
async function resolveChannelId(accessToken: string, channelName: string): Promise<string | null> {
  if (channelName.startsWith('C') && !channelName.startsWith('#')) {
    return channelName
  }
  const map = await fetchChannelMap(accessToken)
  return resolveChannelFromMap(map, channelName)
}


function buildSlackMessage(type: string, data: any): { text: string; blocks: any[] } {
  let text = ''
  let emoji = ''
  const timestamp = data?.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString()

  switch (type) {
    case 'missed_call':
      emoji = ':phone:'
      text = `Missed call from ${data?.callerNumber || 'Unknown'}`
      return {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Missed Call*\n*From:* ${data?.callerNumber || 'Unknown'}\n*Time:* ${timestamp}`,
            },
          },
        ],
      }

    case 'completed_call':
      emoji = ':white_check_mark:'
      text = `Call ${data?.successful ? 'completed' : 'ended'} with ${data?.callerNumber || 'Unknown'}`
      return {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Call ${data?.successful ? 'Completed' : 'Ended'}*\n*From:* ${data?.callerNumber || 'Unknown'}\n*Time:* ${timestamp}${data?.duration ? `\n*Duration:* ${data.duration}s` : ''}`,
            },
          },
        ],
      }

    case 'new_message':
      emoji = ':envelope:'
      text = `New message from ${data?.senderNumber || 'Unknown'}`
      return {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *New Message*\n*From:* ${data?.senderNumber || 'Unknown'}\n*Time:* ${timestamp}`,
            },
          },
          ...(data?.content ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `> ${data.content.substring(0, 500)}`,
            },
          }] : []),
        ],
      }

    case 'new_chat':
      emoji = ':speech_balloon:'
      text = 'New website chat message'
      return {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Website Chat*\n*Time:* ${timestamp}${data?.content ? `\n> ${data.content.substring(0, 500)}` : ''}`,
            },
          },
        ],
      }

    case 'outbound_message':
      emoji = ':outbox_tray:'
      text = `Message sent to ${data?.recipientNumber || 'Unknown'}`
      return {
        text,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *Message Sent*\n*To:* ${data?.recipientNumber || 'Unknown'}\n*Time:* ${timestamp}`,
            },
          },
          ...(data?.content ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `> ${data.content.substring(0, 500)}`,
            },
          }] : []),
        ],
      }

    default:
      return { text: 'New notification', blocks: [] }
  }
}
