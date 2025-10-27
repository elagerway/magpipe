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

    // For outbound calls from LiveKit, "to" is the destination phone
    if (to) {
      const { data, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('contact_phone', to)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!error && data) {
        callRecord = data
        console.log(`✅ Found call record: ${callRecord.id}`)
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
