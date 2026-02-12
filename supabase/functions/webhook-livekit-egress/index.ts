import { createClient } from 'npm:@supabase/supabase-js@2'
import { analyzeSentiment, extractCallerMessages } from '../_shared/sentiment-analysis.ts'
import { filterExtractedDataForApp } from '../_shared/app-function-prefs.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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

    // Extract duration from egress info if available
    const durationMs = egressInfo.endedAt && egressInfo.startedAt
      ? (egressInfo.endedAt - egressInfo.startedAt)
      : (egressInfo.ended_at && egressInfo.started_at
        ? (egressInfo.ended_at - egressInfo.started_at)
        : 0)
    const durationSeconds = Math.round(durationMs / 1000)

    // Get the call record to access transcript and existing recordings
    const { data: existingRecord } = await supabase
      .from('call_records')
      .select('id, transcript, recordings, user_id, slack_message_ts, slack_channel_id, contact_phone, caller_number, phone_number, direction, duration_seconds, extracted_data, call_summary, user_sentiment')
      .eq('egress_id', egressId)
      .single()

    if (!existingRecord) {
      console.warn(`No call_record found with egress_id: ${egressId}`)
      return new Response(JSON.stringify({ ok: true, message: 'No matching call record' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    console.log(`Found call_record: ${existingRecord.id}`)

    // Analyze sentiment from caller's messages in the transcript
    let sentiment = existingRecord.user_sentiment
    if (!sentiment && existingRecord.transcript) {
      console.log('Analyzing sentiment from transcript...')
      const callerMessages = extractCallerMessages(existingRecord.transcript)
      if (callerMessages) {
        sentiment = await analyzeSentiment(callerMessages)
        console.log(`✅ Sentiment analysis result: ${sentiment}`)
      }
    }

    // Check PII storage mode from agent config
    let piiStorage = 'enabled';
    const svcPhone = existingRecord.phone_number || existingRecord.caller_number
    if (svcPhone) {
      const { data: svcNum } = await supabase
        .from('service_numbers')
        .select('agent_id')
        .eq('phone_number', svcPhone)
        .maybeSingle()
      if (svcNum?.agent_id) {
        const { data: piiConfig } = await supabase
          .from('agent_configs')
          .select('pii_storage')
          .eq('id', svcNum.agent_id)
          .single()
        if (piiConfig?.pii_storage) {
          piiStorage = piiConfig.pii_storage
        }
      }
    }

    // Add LiveKit recording to the recordings array
    // Label it "conversation" since it's the initial agent conversation
    const existingRecordings = existingRecord.recordings || []

    // In disabled/redacted mode, don't store the recording URL (audio contains PII)
    const storeRecordingUrl = piiStorage === 'enabled' ? recordingUrl : null

    const livekitRecording = {
      recording_sid: egressId,
      label: 'conversation',
      url: storeRecordingUrl,
      duration_seconds: durationSeconds,
      source: 'livekit',
      created_at: new Date().toISOString(),
      ...(piiStorage !== 'enabled' ? { status: piiStorage === 'disabled' ? 'pii_disabled' : 'pii_redacted' } : {}),
    }

    // Check if this egress is already in recordings (avoid duplicates)
    const alreadyExists = existingRecordings.some((r: any) => r.recording_sid === egressId)
    const updatedRecordings = alreadyExists
      ? existingRecordings.map((r: any) => r.recording_sid === egressId ? { ...r, url: storeRecordingUrl } : r)
      : [livekitRecording, ...existingRecordings]  // LiveKit recording first (earliest)

    // Update call_record with recording in recordings array
    const updateData: Record<string, any> = {
      recording_url: storeRecordingUrl,  // Keep for backwards compatibility
      recordings: updatedRecordings,
    }
    if (sentiment) {
      updateData.user_sentiment = sentiment
    }

    const { error: updateError } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('id', existingRecord.id)

    if (updateError) {
      console.error('Error updating call_record:', updateError)
      return new Response(JSON.stringify({ error: updateError.message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    console.log(`✅ Updated call_record ${existingRecord.id} with LiveKit recording in recordings array`)

    // Update Slack message with recording URL if we have a Slack message
    if (existingRecord.slack_message_ts && existingRecord.slack_channel_id) {
      // Look up agent config and dynamic variables for per-variable send_to filtering
      let agentFunctions: Record<string, any> | null = null
      let dynamicVars: Array<{ name: string; send_to?: Record<string, boolean> | null }> = []
      const svcPhone = existingRecord.phone_number || existingRecord.caller_number
      if (svcPhone) {
        const { data: svcNum } = await supabase
          .from('service_numbers')
          .select('agent_id')
          .eq('phone_number', svcPhone)
          .maybeSingle()
        if (svcNum?.agent_id) {
          const { data: ac } = await supabase
            .from('agent_configs')
            .select('functions')
            .eq('id', svcNum.agent_id)
            .single()
          agentFunctions = ac?.functions || null

          const { data: vars } = await supabase
            .from('dynamic_variables')
            .select('name, send_to')
            .eq('agent_id', svcNum.agent_id)
          dynamicVars = vars || []
        }
      }

      // In disabled mode: minimal Slack notification (no transcript, extracted data, or recording)
      // In redacted mode: data already redacted by agent, pass through (no recording URL though)
      updateSlackMessageWithRecording(
        supabase,
        existingRecord.user_id,
        existingRecord.slack_channel_id,
        existingRecord.slack_message_ts,
        existingRecord.contact_phone || existingRecord.caller_number,
        existingRecord.direction,
        existingRecord.duration_seconds,
        piiStorage === 'enabled' ? recordingUrl : null,
        piiStorage === 'disabled' ? null : existingRecord.transcript,
        piiStorage === 'disabled' ? null : existingRecord.extracted_data,
        piiStorage === 'disabled' ? null : existingRecord.call_summary,
        existingRecord.user_sentiment || sentiment,
        agentFunctions,
        dynamicVars
      ).catch(err => console.error('Failed to update Slack message:', err))
    }

    return new Response(JSON.stringify({ ok: true, updated: 1 }), {
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
 * Update Slack message with recording, extracted data, and post transcript as thread reply
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
  transcript: string | null,
  extractedData: Record<string, any> | null,
  callSummary: string | null,
  sentiment: string | null,
  agentFunctions: Record<string, any> | null = null,
  dynamicVars: Array<{ name: string; send_to?: Record<string, boolean> | null }> = []
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

    // Check if contact exists
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .single()

    // Get caller_name from extracted data
    const callerName = extractedData?.caller_name

    if (callerName && typeof callerName === 'string') {
      if (!contact) {
        // No contact exists - create one
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
        } else {
          console.error('Failed to create contact:', contactError)
        }
      } else if (contact.name === 'Unknown' || contact.name === 'unknown' || !contact.name) {
        // Contact exists but has no real name - update it
        console.log(`Updating contact name from "${contact.name}" to "${callerName}"`)
        const { data: updatedContact, error: updateError } = await supabase
          .from('contacts')
          .update({ name: callerName, updated_at: new Date().toISOString() })
          .eq('id', contact.id)
          .select('id, name')
          .single()

        if (!updateError && updatedContact) {
          contact = updatedContact
          console.log(`✅ Updated contact: ${updatedContact.name}`)
        }
      }
    }

    // Display name: contact name + phone, or just phone if no name
    const displayName = contact?.name
      ? `${contact.name} (${phoneNumber})`
      : phoneNumber

    // Format duration
    const minutes = Math.floor((durationSeconds || 0) / 60)
    const seconds = (durationSeconds || 0) % 60
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

    const isInbound = direction === 'inbound'

    // Check for urgent flag in extracted data
    const hasUrgent = extractedData && Object.entries(extractedData).some(([key, value]) =>
      (key.toLowerCase().includes('urgent') && value === true)
    )
    const emoji = isInbound ? '📞' : '📱'
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

    // Build updated message blocks
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

    // Filter extracted data per-variable send_to prefs, excluding caller_name
    if (extractedData && Object.keys(extractedData).length > 0) {
      const dataWithoutCallerName = { ...extractedData }
      delete dataWithoutCallerName.caller_name

      const filteredForSlack = filterExtractedDataForApp(
        dataWithoutCallerName,
        dynamicVars,
        agentFunctions,
        'slack'
      )

      if (filteredForSlack && Object.keys(filteredForSlack).length > 0) {
        const extractedFields = Object.entries(filteredForSlack)
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

        if (extractedFields) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 *Extracted Data*\n${extractedFields}`
            }
          })
        }
      }
    }

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

    // Update the main message
    const updateResponse = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        text: `${emoji} ${directionText} ${displayName}`,
        blocks,
      }),
    })
    const updateResult = await updateResponse.json()
    if (!updateResult.ok) {
      console.error('Failed to update Slack message:', updateResult.error)
    }

    // Post full transcript as a thread reply
    if (transcript) {
      const transcriptResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          thread_ts: messageTs,
          text: `💬 *Full Transcript*\n\n${transcript}`,
        }),
      })
      const transcriptResult = await transcriptResponse.json()
      if (!transcriptResult.ok) {
        console.error('Failed to post transcript thread:', transcriptResult.error)
      }
    }

    console.log('✅ Updated Slack message and posted transcript thread')
  } catch (error) {
    console.error('Error updating Slack message:', error)
  }
}
