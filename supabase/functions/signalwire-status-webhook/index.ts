import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
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

        // Trigger skills for completed/ended calls (skills handle Slack/service delivery)
        if (call_state === 'completed' || call_state === 'ended') {
          const serviceNum = callRecord.direction === 'inbound' ? to : from;
          let agentId: string | null = null;
          if (serviceNum) {
            const { data: svcNum } = await supabase
              .from('service_numbers')
              .select('agent_id')
              .eq('phone_number', serviceNum)
              .maybeSingle();
            agentId = svcNum?.agent_id || null;
          }

          if (agentId) {
            const phoneNumber = callRecord.contact_phone || callRecord.caller_number;
            const durationSeconds = duration ? parseInt(duration) : 0;

            // Fetch agent name
            let agentName: string | null = null;
            {
              const { data: agentCfg } = await supabase
                .from('agent_configs')
                .select('name')
                .eq('id', agentId)
                .maybeSingle()
              agentName = agentCfg?.name || null
            }

            // Fetch extracted data and contact name
            let extractedData: Record<string, any> = {}
            let contactName: string | null = null
            let callSummary: string | null = null
            let sentiment: string | null = null
            {
              const { data: freshCall } = await supabase
                .from('call_records')
                .select('extracted_data, contact_id, call_summary, user_sentiment')
                .eq('id', callRecord.id)
                .single()
              extractedData = freshCall?.extracted_data || {}
              callSummary = freshCall?.call_summary || null
              sentiment = freshCall?.user_sentiment || null
              if (freshCall?.contact_id) {
                const { data: contact } = await supabase
                  .from('contacts')
                  .select('name')
                  .eq('id', freshCall.contact_id)
                  .single()
                contactName = contact?.name || null
              }
            }

            const skillWork = fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                event_type: 'call_ends',
                agent_id: agentId,
                trigger_context: {
                  caller_phone: phoneNumber,
                  contact_name: contactName,
                  call_duration_seconds: durationSeconds,
                  call_summary: callSummary,
                  user_sentiment: sentiment,
                  recording_url: recording_url || callRecord.recording_url,
                  extracted_data: extractedData,
                  direction: callRecord.direction,
                  status: newStatus,
                  session_id: callRecord.id,
                  agent_name: agentName,
                }
              })
            }).catch(err => console.error('Failed to trigger skills:', err))

            // Keep the edge function alive until the skill trigger completes
            // @ts-ignore — EdgeRuntime is available in Supabase edge function environment
            if (typeof EdgeRuntime !== 'undefined') {
              EdgeRuntime.waitUntil(skillWork)
            }
          }
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

