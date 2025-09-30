import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()

    console.log('=== RETELL WEBHOOK RECEIVED ===')
    console.log('Event type:', payload.event)
    console.log('Call ID:', payload.call?.call_id)
    console.log('From:', payload.call?.from_number)
    console.log('To:', payload.call?.to_number)
    console.log('Has transcript:', !!payload.call?.transcript)
    console.log('Has transcript_object:', !!payload.call?.transcript_object)
    console.log('Has call_analysis:', !!payload.call?.call_analysis)
    console.log('Has recording_url:', !!payload.call?.recording_url)
    console.log('Transcript length:', payload.call?.transcript?.length)
    console.log('Sentiment:', payload.call?.call_analysis?.user_sentiment)
    console.log('================================')

    const callDetails = payload.call
    if (!callDetails) {
      console.error('No call details in payload!')
      return new Response('OK - no call details', { status: 200 })
    }

    const callId = callDetails.call_id
    if (!callId) {
      console.error('No call_id in call details!')
      return new Response('OK - no call_id', { status: 200 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Extract all available data
    const from_number = callDetails.from_number
    const to_number = callDetails.to_number
    const start_timestamp = callDetails.start_timestamp
    const end_timestamp = callDetails.end_timestamp
    const recording_url = callDetails.recording_url
    const recording_url_multichannel = callDetails.recording_url_multichannel
    const transcript = callDetails.transcript
    const transcript_object = callDetails.transcript_object
    const transcript_with_tool_calls = callDetails.transcript_with_tool_calls
    const call_analysis = callDetails.call_analysis
    const call_type = callDetails.call_type
    const disconnection_reason = callDetails.disconnection_reason
    const call_successful = callDetails.call_successful
    const in_voicemail = callDetails.in_voicemail
    const agent_id = callDetails.agent_id
    const latency = callDetails.latency
    const call_cost = callDetails.call_cost

    // Calculate duration if we have timestamps
    let durationSeconds = 0
    if (end_timestamp && start_timestamp) {
      durationSeconds = Math.floor((end_timestamp - start_timestamp) / 1000)
    }

    // Format transcript - Retell provides both a plain string and array
    let transcriptText = ''
    if (transcript && typeof transcript === 'string') {
      // Retell already provides formatted transcript as string
      transcriptText = transcript
    } else if (transcript_object && Array.isArray(transcript_object)) {
      // Fallback: format from transcript_object if transcript string not available
      transcriptText = transcript_object
        .map((entry: any) => `${entry.role === 'agent' ? 'Pat' : 'Caller'}: ${entry.content}`)
        .join('\n\n')
    }

    const userSentiment = call_analysis?.user_sentiment || null
    const callSummary = call_analysis?.call_summary || null

    // Get user_id
    console.log('Looking up service number for:', to_number)
    const { data: serviceNumber, error: serviceError } = await supabase
      .from('service_numbers')
      .select('user_id')
      .eq('phone_number', to_number)
      .eq('is_active', true)
      .single()

    if (serviceError) {
      console.error('Service number lookup error:', serviceError)
    }

    if (!serviceNumber) {
      console.error('No service number found for:', to_number)
      return new Response('OK - no service number', { status: 200 })
    }

    console.log('Found user_id:', serviceNumber.user_id)

    // Try to find existing record by retell_call_id
    const { data: existing } = await supabase
      .from('call_records')
      .select('id')
      .eq('retell_call_id', callId)
      .single()

    const eventType = payload.event

    const recordData = {
      status: eventType || 'unknown',
      ended_at: end_timestamp ? new Date(end_timestamp).toISOString() : null,
      duration_seconds: durationSeconds,
      transcript: transcriptText || null,
      transcript_object: transcript_object || null,
      transcript_with_tool_calls: transcript_with_tool_calls || null,
      recording_url: recording_url || null,
      recording_url_multichannel: recording_url_multichannel || null,
      user_sentiment: userSentiment,
      call_summary: callSummary,
      call_analysis_full: call_analysis || null,
      call_type: call_type || null,
      disconnection_reason: disconnection_reason || null,
      call_successful: call_successful ?? null,
      in_voicemail: in_voicemail ?? null,
      agent_id: agent_id || null,
      llm_latency_p50: latency?.llm?.p50 || null,
      llm_latency_p90: latency?.llm?.p90 || null,
      llm_latency_p99: latency?.llm?.p99 || null,
      e2e_latency_p50: latency?.e2e?.p50 || null,
      e2e_latency_p90: latency?.e2e?.p90 || null,
      e2e_latency_p99: latency?.e2e?.p99 || null,
      call_cost_total: call_cost?.total || null,
      call_cost_llm: call_cost?.llm || null,
      call_cost_tts: call_cost?.tts || null,
      call_cost_stt: call_cost?.stt || null,
      call_cost_telephony: call_cost?.telephony || null,
      event_type: eventType,
      metadata: payload,
    }

    console.log('Saving record with event:', eventType, 'has_transcript:', !!transcriptText)

    if (existing) {
      // Update existing record
      console.log('Updating existing record:', existing.id)
      const { error: updateError } = await supabase
        .from('call_records')
        .update(recordData)
        .eq('id', existing.id)

      if (updateError) {
        console.error('Update error:', updateError)
      } else {
        console.log('Updated call record:', existing.id, 'with event:', eventType)
      }
    } else {
      console.log('No existing record found, creating new...')
      // Insert new record - use safe defaults for required fields
      const insertData = {
        user_id: serviceNumber.user_id,
        retell_call_id: callId,
        caller_number: from_number || 'unknown',
        contact_phone: from_number || 'unknown',
        service_number: to_number || 'unknown',
        direction: 'inbound',
        disposition: 'answered_by_pat',
        started_at: start_timestamp ? new Date(start_timestamp).toISOString() : new Date().toISOString(),
        ...recordData
      }

      console.log('Attempting to insert with data keys:', Object.keys(insertData))
      const { data: insertResult, error: insertError } = await supabase
        .from('call_records')
        .insert(insertData)
        .select()

      if (insertError) {
        console.error('Insert error:', JSON.stringify(insertError))
        console.error('Attempted to insert user_id:', serviceNumber.user_id)
        console.error('Call ID:', callId)
      } else {
        console.log('Successfully created call record:', insertResult?.[0]?.id)
        console.log('Created new call record for:', callId, 'with event:', eventType)
      }
    }

    // Send notifications only for call_analyzed events (to avoid duplicates)
    if (eventType === 'call_analyzed' && serviceNumber?.user_id) {
      // Check if call was missed (short duration, not successful, or went to voicemail)
      const isMissedCall = call_successful === false || in_voicemail === true || durationSeconds < 5

      // Send notification for all calls or just missed calls
      const shouldNotify = isMissedCall // Will check preferences in Edge Function for "all calls"

      if (shouldNotify || true) { // Always send, let Edge Function decide based on preferences
        console.log('Sending call notification for user:', serviceNumber.user_id)

        const notificationData = {
          userId: serviceNumber.user_id,
          type: isMissedCall ? 'missed_call' : 'completed_call',
          data: {
            callerNumber: from_number,
            timestamp: start_timestamp ? new Date(start_timestamp).toISOString() : new Date().toISOString(),
            duration: durationSeconds,
            successful: call_successful
          }
        }

        // Send email notification (fire and forget - don't wait for response)
        fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send email notification:', err))

        // Send SMS notification (fire and forget - don't wait for response)
        fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send SMS notification:', err))
      }
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in webhook-retellai-analysis:', error)
    return new Response('OK - error caught', { status: 200 })
  }
})