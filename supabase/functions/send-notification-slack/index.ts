/**
 * Send Slack Notification Edge Function
 * Two modes:
 * 1. Internal: { userId, type, data } — sends notification to user's Slack channel
 * 2. User-facing: { action: 'list_channels' } — lists user's Slack channels (auth via resolveUser)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { fetchAllSlackChannels, resolveSlackChannelId } from '../_shared/slack-channels.ts'
import { buildSlackBody } from '../_shared/build-notification-body.ts'

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

  try {
    const channels = await fetchAllSlackChannels(integration.access_token)
    channels.sort((a, b) => a.name.localeCompare(b.name))
    return jsonResponse({ channels })
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500)
  }
}


async function handleSendNotification(body: any) {
  const { userId, agentId, type, data, content_config: reqContentConfig } = body

  if (!userId || !type) {
    return jsonResponse({ error: 'Missing required fields' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get user's notification preferences (per-agent first, fallback to user-level)
  let prefs = null
  if (agentId) {
    const { data: agentPrefs } = await supabase
      .from('notification_preferences')
      .select('slack_enabled, slack_channel, slack_inbound_calls, slack_all_calls, slack_inbound_messages, slack_all_messages, content_config')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .maybeSingle()
    prefs = agentPrefs
  }
  if (!prefs) {
    const { data: userPrefs } = await supabase
      .from('notification_preferences')
      .select('slack_enabled, slack_channel, slack_inbound_calls, slack_all_calls, slack_inbound_messages, slack_all_messages, content_config')
      .eq('user_id', userId)
      .is('agent_id', null)
      .maybeSingle()
    prefs = userPrefs
  }

  // Skill executions bypass notification prefs — they have their own delivery config
  const isSkillExecution = type === 'skill_execution'

  if (!isSkillExecution) {
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

  // Resolve channel name to ID — skill executions use data.channel, otherwise prefs
  const targetChannel = isSkillExecution ? (data?.channel || prefs?.slack_channel) : prefs.slack_channel
  if (!targetChannel) {
    console.log('No Slack channel specified')
    return jsonResponse({ message: 'No Slack channel configured' })
  }
  const channelId = await resolveChannelId(integration.access_token, targetChannel)
  if (!channelId) {
    console.error('Could not resolve Slack channel:', targetChannel)
    return jsonResponse({ error: 'Slack channel not found' }, 400)
  }

  // Resolve content_config: per-request override → prefs.content_config.slack
  const contentConfig = reqContentConfig || prefs?.content_config?.slack || null

  // Build Slack message — use content_config if set (non-skill types)
  const customSlack = (contentConfig && type !== 'skill_execution') ? buildSlackBody(data, contentConfig) : null
  const message = customSlack || buildSlackMessage(type, data)

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
      text: message.text,
      blocks: message.blocks,
    }),
  })

  const result = await resp.json()
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


async function resolveChannelId(accessToken: string, channelName: string): Promise<string | null> {
  if (channelName.startsWith('C') && !channelName.startsWith('#')) {
    return channelName
  }
  return resolveSlackChannelId(accessToken, channelName)
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

    case 'skill_execution': {
      emoji = ':zap:'
      text = data?.message?.substring(0, 200) || 'Skill execution completed'
      const fullMessage = data?.message || ''
      // Split on --- dividers for natural section breaks
      const sections = fullMessage.split(/\n---\n/).filter(Boolean)
      const messageBlocks: any[] = []
      for (const section of sections) {
        if (section.length <= 2900) {
          messageBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: section.trim() } })
        } else {
          // Chunk by lines if too long
          let current = ''
          for (const line of section.split('\n')) {
            if (current.length + line.length > 2900 && current.length > 0) {
              messageBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: current.trim() } })
              current = line
            } else {
              current += (current ? '\n' : '') + line
            }
          }
          if (current.trim()) messageBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: current.trim() } })
        }
        if (sections.indexOf(section) < sections.length - 1) {
          messageBlocks.push({ type: 'divider' })
        }
      }
      return {
        text,
        blocks: messageBlocks.length > 0
          ? messageBlocks
          : [{ type: 'section', text: { type: 'mrkdwn', text: fullMessage.substring(0, 2900) } }],
      }
    }

    default:
      return { text: 'New notification', blocks: [] }
  }
}
