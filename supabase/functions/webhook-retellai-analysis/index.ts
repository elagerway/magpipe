import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()

    console.log('=== RETELL WEBHOOK RECEIVED ===')
    console.log('Event type:', payload.event_type)
    console.log('Full payload:', JSON.stringify(payload, null, 2))
    console.log('================================')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Only process call_ended events
    if (payload.event_type !== 'call_ended') {
      console.log('Ignoring non-call_ended event')
      return new Response('OK', { status: 200 })
    }

    // Extract call ID from webhook
    const { call_id } = payload

    console.log('Fetching full call details from Retell API for call:', call_id)

    // Fetch full call details from Retell API
    const retellApiKey = Deno.env.get('RETELL_API_KEY')!
    const callDetailsResponse = await fetch(`https://api.retellai.com/v2/get-call/${call_id}`, {
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
      },
    })

    if (!callDetailsResponse.ok) {
      console.error('Failed to fetch call details from Retell:', await callDetailsResponse.text())
      return new Response('Failed to fetch call details', { status: 500 })
    }

    const callDetails = await callDetailsResponse.json()
    console.log('Call details from Retell:', JSON.stringify(callDetails, null, 2))

    // Extract data from call details
    const from_number = callDetails.from_number
    const to_number = callDetails.to_number
    const start_timestamp = callDetails.start_timestamp
    const end_timestamp = callDetails.end_timestamp
    const recording_url = callDetails.recording_url
    const transcript = callDetails.transcript
    const call_analysis = callDetails.call_analysis

    // Calculate duration
    const durationMs = end_timestamp - start_timestamp
    const durationSeconds = Math.floor(durationMs / 1000)

    // Format transcript from array to string
    let transcriptText = ''
    if (transcript && Array.isArray(transcript)) {
      transcriptText = transcript
        .map((entry: any) => `${entry.role === 'agent' ? 'Pat' : 'Caller'}: ${entry.content}`)
        .join('\n\n')
    }

    // Extract sentiment from call_analysis
    const userSentiment = call_analysis?.user_sentiment || call_analysis?.sentiment || null

    console.log('Processed data:', {
      from_number,
      to_number,
      durationSeconds,
      has_transcript: !!transcriptText,
      has_recording: !!recording_url,
      sentiment: userSentiment,
    })

    // Find the call record by contact_phone (from_number) and approximate timing
    // We'll match on from_number and status='in-progress' or recent calls
    const { data: callRecords, error: findError } = await supabase
      .from('call_records')
      .select('*')
      .eq('contact_phone', from_number)
      .eq('service_number', to_number)
      .or('status.eq.in-progress,status.eq.ringing')
      .order('started_at', { ascending: false })
      .limit(1)

    if (findError) {
      console.error('Error finding call record:', findError)
      return new Response('Error finding call', { status: 500 })
    }

    if (!callRecords || callRecords.length === 0) {
      console.warn('No matching call record found for:', from_number, to_number)
      return new Response('No matching call found', { status: 404 })
    }

    const callRecord = callRecords[0]
    console.log('Updating call record:', callRecord.id)

    // Update the call record with transcript, recording, and sentiment
    const { error: updateError } = await supabase
      .from('call_records')
      .update({
        status: 'completed',
        duration_seconds: durationSeconds,
        ended_at: new Date(end_timestamp).toISOString(),
        transcript: transcriptText,
        recording_url: recording_url,
        user_sentiment: userSentiment,
      })
      .eq('id', callRecord.id)

    if (updateError) {
      console.error('Error updating call record:', updateError)
      return new Response('Error updating call', { status: 500 })
    }

    console.log('Call record updated successfully with transcript and recording')

    // If there's a call summary, we could also update conversation context here
    if (call_analysis?.call_summary) {
      console.log('Call summary:', call_analysis.call_summary)
      // TODO: Update conversation_contexts table with summary and key_points
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in webhook-retellai-analysis:', error)
    return new Response('Error', { status: 500 })
  }
})