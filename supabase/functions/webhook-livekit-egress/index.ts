import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { analyzeSentiment, extractCallerMessages } from '../_shared/sentiment-analysis.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== LIVEKIT EGRESS WEBHOOK START ===')
    console.log('Request method:', req.method)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))

    let payload
    try {
      payload = await req.json()
      console.log('✅ Parsed JSON payload successfully')
      console.log('Webhook payload:', JSON.stringify(payload, null, 2))
    } catch (jsonError) {
      console.error('❌ Failed to parse JSON:', jsonError)
      throw jsonError
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Log to database for debugging (temporary)
    try {
      await supabase.from('webhook_logs').insert({
        webhook_type: 'livekit_egress',
        payload: payload,
        received_at: new Date().toISOString()
      })
      console.log('✅ Logged webhook payload to database')
    } catch (logError) {
      console.warn('Could not log to database (table may not exist):', logError)
    }

    // Support both camelCase and snake_case field names
    const event = payload.event
    const egressInfo = payload.egressInfo || payload.egress_info

    console.log(`Event type: ${event}, has egressInfo: ${!!egressInfo}`)

    // Only process when egress completes successfully
    if (event !== 'egress_ended') {
      console.log(`Ignoring event: ${event}`)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!egressInfo) {
      console.error('❌ No egressInfo in payload!')
      return new Response(JSON.stringify({ error: 'No egressInfo in payload' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const egressId = egressInfo.egressId || egressInfo.egress_id
    const status = egressInfo.status

    console.log(`Egress ended: ${egressId}, status: ${status}, statusType: ${typeof status}`)
    console.log('Full egressInfo:', JSON.stringify(egressInfo, null, 2))

    // Only process successful egresses (status can be number 3 or string "EGRESS_COMPLETE")
    const isComplete = status === 3 || status === 'EGRESS_COMPLETE'
    if (!isComplete) {
      console.log(`Egress ${egressId} did not complete successfully (status: ${status})`)
      return new Response(JSON.stringify({ ok: true, message: `Ignoring status ${status}` }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Extract recording URL (support both camelCase and snake_case)
    const fileResults = egressInfo.fileResults || egressInfo.file_results || []
    console.log(`Found ${fileResults.length} file results`)

    let recordingUrl = null

    if (fileResults.length > 0) {
      const firstFile = fileResults[0]
      // Try all possible field names: location (LiveKit actual), downloadUrl, download_url
      recordingUrl = firstFile.location || firstFile.downloadUrl || firstFile.download_url
      console.log('First file result keys:', Object.keys(firstFile))
      console.log('First file location:', firstFile.location)
    } else if (egressInfo.file) {
      recordingUrl = egressInfo.file.location || egressInfo.file.downloadUrl || egressInfo.file.download_url
      console.log('Using egressInfo.file, keys:', Object.keys(egressInfo.file))
      console.log('File location:', egressInfo.file.location)
    }

    if (!recordingUrl) {
      console.warn(`❌ No recording URL found for egress ${egressId}`)
      console.warn('fileResults:', JSON.stringify(fileResults, null, 2))
      console.warn('egressInfo.file:', JSON.stringify(egressInfo.file, null, 2))
      return new Response(JSON.stringify({ ok: true, message: 'No recording URL found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`✅ Recording URL: ${recordingUrl}`)

    // First, get the call record to access the transcript for sentiment analysis
    const { data: existingRecord } = await supabase
      .from('call_records')
      .select('transcript')
      .eq('egress_id', egressId)
      .single()

    // Analyze sentiment from caller's messages in the transcript
    let sentiment = null
    if (existingRecord?.transcript) {
      console.log('Analyzing sentiment from transcript...')
      const callerMessages = extractCallerMessages(existingRecord.transcript)
      if (callerMessages) {
        sentiment = await analyzeSentiment(callerMessages)
        console.log(`✅ Sentiment analysis result: ${sentiment}`)
      }
    }

    // Update call_record with recording URL, sentiment, and get Slack info
    const updateData: Record<string, any> = { recording_url: recordingUrl }
    if (sentiment) {
      updateData.user_sentiment = sentiment
    }

    const { data: updateResult, error: updateError } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('egress_id', egressId)
      .select('id, user_id, slack_message_ts, slack_channel_id, contact_phone, caller_number, direction, duration_seconds, transcript')

    if (updateError) {
      console.error('Error updating call_record:', updateError)
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!updateResult || updateResult.length === 0) {
      console.warn(`No call_record found with egress_id: ${egressId}`)
      return new Response(JSON.stringify({ ok: true, message: 'No matching call record' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`✅ Updated call_record ${updateResult[0].id} with recording URL`)

    // Update Slack message with recording URL if we have a Slack message
    const callRecord = updateResult[0]
    if (callRecord.slack_message_ts && callRecord.slack_channel_id) {
      updateSlackMessageWithRecording(
        supabase,
        callRecord.user_id,
        callRecord.slack_channel_id,
        callRecord.slack_message_ts,
        callRecord.contact_phone || callRecord.caller_number,
        callRecord.direction,
        callRecord.duration_seconds,
        recordingUrl,
        callRecord.transcript
      ).catch(err => console.error('Failed to update Slack message:', err))
    }

    return new Response(JSON.stringify({ ok: true, updated: updateResult.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-livekit-egress:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/**
 * Update Slack message with recording and transcript
 * Downloads the recording and uploads it to Slack for inline playback
 */
async function updateSlackMessageWithRecording(
  supabase: any,
  userId: string,
  channelId: string,
  messageTs: string,
  phoneNumber: string,
  direction: string,
  durationSeconds: number,
  recordingUrl: string,
  transcript: string | null
) {
  try {
    // Get Slack provider ID
    const { data: slackProvider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'slack')
      .single()

    if (!slackProvider) return

    // Get user's Slack token
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .eq('provider_id', slackProvider.id)
      .single()

    if (!integration?.access_token) return

    // Get contact name
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .single()

    const contactName = contact?.name || phoneNumber

    // Format duration
    const minutes = Math.floor((durationSeconds || 0) / 60)
    const seconds = (durationSeconds || 0) % 60
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    const isInbound = direction === 'inbound'
    const emoji = isInbound ? '📞' : '📱'
    const directionText = isInbound ? 'Inbound call from' : 'Outbound call to'

    // Build updated message blocks
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${directionText} ${contactName}*\nDuration: ${durationStr}`
        }
      }
    ]

    // Add recording link
    if (recordingUrl) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🎙️ <${recordingUrl}|Play Recording>`
        }
      })
    }

    // Add transcript if available
    if (transcript) {
      const truncatedTranscript = transcript.length > 500
        ? transcript.substring(0, 500) + '...'
        : transcript
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📝 *Transcript:*\n>${truncatedTranscript.replace(/\n/g, '\n>')}`
        }
      })
    }

    // Add context
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${phoneNumber} • ${new Date().toLocaleString()}`
        }
      ]
    })

    // Update the message first
    await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        text: `${emoji} ${directionText} ${contactName}`,
        blocks,
      }),
    })

    console.log('✅ Updated Slack message with recording and transcript')
  } catch (error) {
    console.error('Error updating Slack message:', error)
  }
}
