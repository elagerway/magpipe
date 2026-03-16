import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldNotify } from '../_shared/app-function-prefs.ts'
import { resolveSlackChannelId, fetchAllSlackChannels } from '../_shared/slack-channels.ts'

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const callDuration = formData.get('CallDuration') as string

    console.log('Call status update:', { callSid, callStatus, callDuration })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // First, get the call record to know user_id and phone info
    const { data: callRecord } = await supabase
      .from('call_records')
      .select('id, user_id, caller_number, contact_phone, direction, agent_id, call_summary, user_sentiment, recording_url')
      .or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)
      .single()

    // Update call record in database
    const updateData: any = {
      status: callStatus.toLowerCase(),
    }

    const durationSeconds = callDuration ? parseInt(callDuration) : 0

    if (callStatus === 'completed' && callDuration) {
      updateData.duration_seconds = durationSeconds
      updateData.ended_at = new Date().toISOString()
    } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      updateData.ended_at = new Date().toISOString()
    }

    // Update by vendor_call_id (new multi-vendor architecture)
    // Also update call_sid for backward compatibility
    const { error } = await supabase
      .from('call_records')
      .update(updateData)
      .or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)

    if (error) {
      console.error('Error updating call status:', error)
    } else if (callRecord && (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer')) {
      const phoneNumber = callRecord.contact_phone || callRecord.caller_number
      const isMissed = callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer'

      // Run all notification logic in the background so we can return 200 to SignalWire
      // immediately. Without this, SignalWire retries the webhook (15s timeout) and the
      // user receives duplicate notifications.
      const backgroundWork = async () => {
        // Look up agent config to check notification prefs
        let agentFunctions = null;
        {
          const svcPhone = callRecord.direction === 'inbound'
            ? (callRecord.contact_phone ? callRecord.caller_number : null)
            : callRecord.caller_number;
          if (svcPhone) {
            const { data: svcNum } = await supabase
              .from('service_numbers')
              .select('agent_id')
              .eq('phone_number', svcPhone)
              .maybeSingle();
            if (svcNum?.agent_id) {
              const { data: ac } = await supabase
                .from('agent_configs')
                .select('functions')
                .eq('id', svcNum.agent_id)
                .single();
              agentFunctions = ac?.functions;
            }
          }
        }

        if (shouldNotify(agentFunctions, 'slack', 'calls')) {
          sendSlackCallNotification(
            supabase,
            callRecord.id,
            callRecord.user_id,
            phoneNumber,
            callRecord.direction || 'inbound',
            callStatus.toLowerCase(),
            durationSeconds,
            callRecord.agent_id || null
          ).catch(err => console.error('Failed to send Slack call notification:', err))
        }

        // For completed calls, wait for the voice agent to finish writing summary/sentiment
        // (agent.py needs an OpenAI round-trip after hang-up; this webhook fires immediately)
        let enrichedSummary: string | null = callRecord.call_summary || null
        let enrichedSentiment: string | null = callRecord.user_sentiment || null
        let enrichedRecordingUrl: string | null = callRecord.recording_url || null

        // Look up agent name and recording config upfront (needed for poll condition below)
        let agentName: string | null = null
        let agentRecordingEnabled = true
        if (callRecord.agent_id) {
          const { data: agentCfg } = await supabase
            .from('agent_configs')
            .select('name, recording_enabled')
            .eq('id', callRecord.agent_id)
            .maybeSingle()
          agentName = agentCfg?.name || null
          agentRecordingEnabled = agentCfg?.recording_enabled !== false
        }

        // Poll until we have summary, sentiment, AND recording URL (if recording is enabled).
        // The recording callback fires a few seconds after call end — if summary/sentiment
        // are already written, the old condition skipped this loop and recording_url was missed.
        const shouldWaitForRecording = !isMissed && agentRecordingEnabled && !enrichedRecordingUrl
        if (!isMissed && (!enrichedSummary || shouldWaitForRecording)) {
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5000))
            const { data: freshRecord } = await supabase
              .from('call_records')
              .select('call_summary, user_sentiment, recording_url, recordings')
              .eq('id', callRecord.id)
              .single()
            enrichedSummary = freshRecord?.call_summary || null
            enrichedSentiment = freshRecord?.user_sentiment || null
            // Derive recording URL from recording_url column OR first non-null URL in recordings JSONB
            // (sip-recording-callback writes to recordings[] while sync-recording uploads; livekit-egress sets both)
            const recordingsArr: any[] = freshRecord?.recordings || []
            const firstRecordingUrl = recordingsArr.find((r: any) => r.url)?.url || null
            enrichedRecordingUrl = freshRecord?.recording_url || firstRecordingUrl || enrichedRecordingUrl
            const hasSummary = !!enrichedSummary
            const hasRecording = !agentRecordingEnabled || !!enrichedRecordingUrl
            if (hasSummary && hasRecording) {
              console.log(`✅ Got summary${agentRecordingEnabled ? '+recording' : ''} after ${(attempt + 1) * 5}s`)
              break
            }
            console.log(`⏳ Waiting for summary/recording... attempt ${attempt + 1}/12`)
          }
        }

        // Send email/SMS/push notifications for terminal call states
        const notificationType = isMissed ? 'missed_call' : 'completed_call'
        const notificationData = {
          userId: callRecord.user_id,
          agentId: callRecord.agent_id,
          type: notificationType,
          data: {
            callerNumber: phoneNumber,
            timestamp: new Date().toISOString(),
            duration: durationSeconds,
            successful: callStatus === 'completed',
            agentName,
            sessionId: callRecord.id,
            summary: enrichedSummary,
            sentiment: enrichedSentiment,
            recordingUrl: enrichedRecordingUrl,
          }
        }

        await Promise.allSettled([
          fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          fetch(`${supabaseUrl}/functions/v1/send-notification-slack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
        ])
      }

      // Run background work (polls for summary/sentiment, sends notifications)
      // Use EdgeRuntime.waitUntil so the function stays alive after returning 200
      // This prevents SignalWire from retrying the webhook due to timeout
      // @ts-ignore — EdgeRuntime is available in Supabase edge function environment
      if (typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(backgroundWork())
      } else {
        backgroundWork().catch(err => console.error('Background notification error:', err))
      }
    }

    // Deduct credits for completed calls with duration
    if (callRecord && callStatus === 'completed' && durationSeconds > 0) {
      deductCallCredits(
        supabaseUrl,
        supabaseKey,
        callRecord.user_id,
        durationSeconds,
        callRecord.id
      ).catch(err => console.error('Failed to deduct credits:', err))
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in webhook-call-status:', error)
    return new Response('OK', { status: 200 })
  }
})

/**
 * Deduct credits for a completed call
 */
async function deductCallCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  durationSeconds: number,
  callRecordId: string
) {
  try {
    // Get user's agent config to determine voice, LLM, and add-on rates
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('voice_id, ai_model, memory_enabled, semantic_memory_enabled, knowledge_source_ids, pii_storage')
      .eq('user_id', userId)
      .single()

    // Determine active add-ons
    const addons: string[] = []
    const kbIds = agentConfig?.knowledge_source_ids || []
    if (kbIds.length > 0) addons.push('knowledge_base')
    if (agentConfig?.memory_enabled) addons.push('memory')
    if (agentConfig?.semantic_memory_enabled) addons.push('semantic_memory')
    if (agentConfig?.pii_storage === 'redacted') addons.push('pii_removal')

    // Call deduct-credits function
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'voice',
        durationSeconds,
        voiceId: agentConfig?.voice_id,
        aiModel: agentConfig?.ai_model,
        addons: addons.length > 0 ? addons : undefined,
        referenceType: 'call',
        referenceId: callRecordId
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${durationSeconds}s call (addons: ${addons.join(',') || 'none'}), balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting call credits:', error)
  }
}

/**
 * Send Slack notification for completed calls
 * Saves the message ID so it can be updated with transcript/recording later
 */
async function sendSlackCallNotification(
  supabase: any,
  callRecordId: string,
  userId: string,
  phoneNumber: string,
  direction: string,
  status: string,
  durationSeconds: number,
  agentId: string | null = null
) {
  try {
    // Get Slack provider ID
    const { data: slackProvider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'slack')
      .single()

    if (!slackProvider) return

    // Check if user has Slack connected
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token, config')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .eq('provider_id', slackProvider.id)
      .single()

    if (!integration?.access_token) return

    // Get contact name if available
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .single()

    const contactName = contact?.name || phoneNumber

    // Format duration
    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    // Determine emoji and status text
    const isInbound = direction === 'inbound'
    const emoji = status === 'completed' ? (isInbound ? '📞' : '📱') : '❌'
    const directionText = isInbound ? 'Inbound call from' : 'Outbound call to'
    const statusText = status === 'completed' ? `Duration: ${durationStr}` : `Status: ${status}`

    // Resolve channel: per-agent notification_preferences.slack_channel → user-level → config.notification_channel → fallback
    let channelId: string | null = null

    // Check notification preferences (per-agent first, then user-level fallback)
    let notifPrefs = null
    if (agentId) {
      const { data: agentPrefs } = await supabase
        .from('notification_preferences')
        .select('slack_channel')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .maybeSingle()
      notifPrefs = agentPrefs
    }
    if (!notifPrefs) {
      const { data: userPrefs } = await supabase
        .from('notification_preferences')
        .select('slack_channel')
        .eq('user_id', userId)
        .is('agent_id', null)
        .maybeSingle()
      notifPrefs = userPrefs
    }

    if (notifPrefs?.slack_channel) {
      channelId = await resolveSlackChannelId(integration.access_token, notifPrefs.slack_channel)
    }

    // Fallback to integration config or first available channel
    if (!channelId) {
      channelId = integration.config?.notification_channel
    }
    if (!channelId) {
      try {
        const channels = await fetchAllSlackChannels(integration.access_token)
        const magpipeChannel = channels.find(c => c.name === 'magpipe-notifications')
        const generalChannel = channels.find(c => c.name === 'general')
        channelId = magpipeChannel?.id || generalChannel?.id || channels[0]?.id || null
      } catch { /* ignore */ }
    }

    if (!channelId) return

    // Auto-join channel
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    })

    // Send the notification
    const slackMessage = {
      channel: channelId,
      text: `${emoji} ${directionText} ${contactName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${directionText} ${contactName}*\n${statusText}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${phoneNumber} • ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('Slack call notification failed:', result.error)
    } else {
      console.log('Slack call notification sent for', phoneNumber, 'ts:', result.ts)

      // Save the Slack message ID so we can update it with transcript/recording later
      await supabase
        .from('call_records')
        .update({
          slack_message_ts: result.ts,
          slack_channel_id: channelId,
        })
        .eq('id', callRecordId)
    }
  } catch (error) {
    console.error('Error sending Slack call notification:', error)
  }
}