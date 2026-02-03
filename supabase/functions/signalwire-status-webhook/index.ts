import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()

    console.log('📞 SignalWire Status Webhook Received:')
    console.log(JSON.stringify(payload, null, 2))

    // Extract call information from payload
    const {
      call_id,
      call_state,
      direction,
      from,
      to,
      answered_by,
      start_time,
      end_time,
      duration,
      recording_url,
      // SignalWire sends various other fields
      ...otherFields
    } = payload

    console.log(`📊 Call State: ${call_state}`)
    console.log(`📱 From: ${from} → To: ${to}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Try to find the call record by phone numbers
    let callRecord = null

    // For outbound calls, "to" is the destination phone
    // For inbound calls, "from" is the caller phone
    if (to) {
      // Try outbound first
      const { data: outboundData, error: outboundError } = await supabase
        .from('call_records')
        .select('*')
        .eq('contact_phone', to)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!outboundError && outboundData) {
        callRecord = outboundData
        console.log(`✅ Found outbound call record: ${callRecord.id}`)
      }
    }

    // If no outbound match, try inbound (caller is "from")
    if (!callRecord && from) {
      const { data: inboundData, error: inboundError } = await supabase
        .from('call_records')
        .select('*')
        .eq('caller_number', from)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!inboundError && inboundData) {
        callRecord = inboundData
        console.log(`✅ Found inbound call record: ${callRecord.id}`)
      }
    }

    // Update call record status based on SignalWire state
    if (callRecord) {
      let newStatus = callRecord.status

      switch (call_state) {
        case 'initiated':
        case 'ringing':
          newStatus = 'ringing'
          break
        case 'answered':
        case 'in-progress':
          newStatus = 'established'
          break
        case 'completed':
        case 'ended':
          newStatus = 'completed'
          break
        case 'failed':
        case 'busy':
        case 'no-answer':
          newStatus = 'failed'
          break
      }

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (start_time) {
        updateData.started_at = start_time
      }

      if (end_time) {
        updateData.ended_at = end_time
      }

      if (duration) {
        updateData.duration = parseInt(duration)
      }

      if (recording_url) {
        updateData.recording_url = recording_url
      }

      const { error: updateError } = await supabase
        .from('call_records')
        .update(updateData)
        .eq('id', callRecord.id)

      if (updateError) {
        console.error('❌ Error updating call record:', updateError)
      } else {
        console.log(`✅ Updated call record ${callRecord.id} to status: ${newStatus}`)

        // Send Slack notification for completed/ended calls
        if (call_state === 'completed' || call_state === 'ended') {
          sendSlackCallNotification(
            supabase,
            callRecord.user_id,
            callRecord.id,
            callRecord.contact_phone || callRecord.caller_number,
            callRecord.direction,
            newStatus,
            duration ? parseInt(duration) : 0
          ).catch(err => console.error('Failed to send Slack call notification:', err))
        }
      }
    } else {
      console.log('⚠️  No matching call record found')
    }

    // Store raw webhook payload for debugging
    await supabase
      .from('webhook_logs')
      .insert({
        source: 'signalwire',
        event_type: call_state || 'unknown',
        payload: payload,
        created_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error('Error logging webhook:', error)
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook received',
        call_state,
        call_record_updated: !!callRecord
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Error processing webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

/**
 * Send Slack notification for completed calls
 */
async function sendSlackCallNotification(
  supabase: any,
  userId: string,
  callRecordId: string,
  phoneNumber: string,
  direction: string,
  status: string,
  durationSeconds: number
) {
  try {
    // Wait a few seconds to allow LiveKit agent to save extracted data
    await new Promise(resolve => setTimeout(resolve, 5000))

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

    // Get call record with extracted data and sentiment
    const { data: callRecord } = await supabase
      .from('call_records')
      .select('extracted_data, call_summary, user_sentiment')
      .eq('id', callRecordId)
      .single()

    const extractedData = callRecord?.extracted_data || {}
    const callSummary = callRecord?.call_summary
    const sentiment = callRecord?.user_sentiment

    // Check if contact exists
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .single()

    // If no contact exists and we have caller_name in extracted data, create one
    const callerName = extractedData?.caller_name
    if (!contact && callerName && typeof callerName === 'string') {
      console.log(`Creating new contact: ${callerName} (${phoneNumber})`)
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: callerName,
          phone_number: phoneNumber,
        })
        .select('id, name')
        .single()

      if (!contactError && newContact) {
        contact = newContact
        console.log(`✅ Created contact: ${newContact.name}`)
      }
    }

    // Display name: contact name + phone, or just phone if no name
    const displayName = contact?.name
      ? `${contact.name} (${phoneNumber})`
      : phoneNumber

    // Format duration
    const minutes = Math.floor(durationSeconds / 60)
    const seconds = durationSeconds % 60
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    // Determine emoji and status text
    const isInbound = direction === 'inbound'

    // Check for urgent flag in extracted data
    const hasUrgent = Object.entries(extractedData).some(([key, value]) =>
      (key.toLowerCase().includes('urgent') && value === true)
    )
    const emoji = status === 'completed' ? (isInbound ? '📞' : '📱') : '❌'

    const directionText = isInbound ? 'Inbound call from' : 'Outbound call to'

    // Sentiment emoji
    const sentimentEmoji = sentiment === 'positive' ? '😊'
      : sentiment === 'negative' ? '😠'
      : sentiment === 'neutral' ? '😐'
      : ''

    // Build header text
    let headerText = `${emoji} *${directionText} ${displayName}*`
    if (hasUrgent) {
      headerText += `\n🚨 *URGENT*`
    }
    headerText += `\nDuration: ${durationStr}`
    if (sentimentEmoji) {
      headerText += ` • Sentiment: ${sentimentEmoji} ${sentiment}`
    }

    // Find a channel
    const channelsResponse = await fetch(
      'https://slack.com/api/conversations.list?types=public_channel&limit=10',
      { headers: { 'Authorization': `Bearer ${integration.access_token}` } }
    )
    const channelsResult = await channelsResponse.json()

    let channelId = integration.config?.notification_channel
    if (!channelId && channelsResult.ok && channelsResult.channels?.length > 0) {
      const patChannel = channelsResult.channels.find((c: any) => c.name === 'pat-notifications')
      const generalChannel = channelsResult.channels.find((c: any) => c.name === 'general')
      channelId = patChannel?.id || generalChannel?.id || channelsResult.channels[0].id
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

    // Build message blocks
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: headerText
        }
      }
    ]

    // Add call summary if present
    if (callSummary) {
      const truncatedSummary = callSummary.length > 500
        ? callSummary.substring(0, 500) + '...'
        : callSummary
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📝 *Summary:* ${truncatedSummary}`
        }
      })
    }

    // Add extracted data if present (excluding caller_name since it's in header)
    const filteredExtractedData = Object.entries(extractedData)
      .filter(([key]) => key !== 'caller_name')

    if (filteredExtractedData.length > 0) {
      const extractedFields = filteredExtractedData
        .map(([key, value]) => {
          const displayKey = key.replace(/_/g, ' ')
          let displayValue: string
          if (value === true) {
            displayValue = '✅ Yes'
          } else if (value === false) {
            displayValue = '❌ No'
          } else if (typeof value === 'string' && value.length > 100) {
            displayValue = value.substring(0, 100) + '...'
          } else {
            displayValue = String(value)
          }
          return `• *${displayKey}:* ${displayValue}`
        })
        .join('\n')

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *Extracted Data*\n${extractedFields}`
        }
      })
    }

    // Add context footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${phoneNumber} • ${new Date().toLocaleString()}`
        }
      ]
    })

    // Send the notification and save message ts for later update
    const slackMessage = {
      channel: channelId,
      text: `${emoji} ${directionText} ${displayName}`,
      blocks
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
      console.log('Slack call notification sent for', phoneNumber)

      // Save Slack message ts and channel for later update by egress webhook
      if (result.ts && channelId) {
        await supabase
          .from('call_records')
          .update({
            slack_message_ts: result.ts,
            slack_channel_id: channelId
          })
          .eq('id', callRecordId)
      }
    }
  } catch (error) {
    console.error('Error sending Slack call notification:', error)
  }
}
