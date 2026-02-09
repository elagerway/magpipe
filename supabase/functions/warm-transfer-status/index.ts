/**
 * Warm Transfer Status Callback
 *
 * Handles status updates for the transferee call during warm transfer.
 * Useful for detecting if transferee doesn't answer or hangs up early.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const params = Object.fromEntries(formData.entries())

    console.log('📞 Warm Transfer Status Callback:', params)

    const {
      CallSid,
      CallStatus,
      To,
      From,
    } = params

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Log the status change
    await supabase.from('call_state_logs').insert({
      room_name: `transferee_${CallSid}`,
      state: `transferee_${CallStatus}`,
      metadata: params,
    })

    // If transferee didn't answer or hung up, we could notify the agent
    // For now, just log it - the agent will handle this via the transfer tools

    if (CallStatus === 'completed' || CallStatus === 'no-answer' || CallStatus === 'busy' || CallStatus === 'failed') {
      console.log(`📞 Transferee call ended: ${CallStatus}`)

      // Find the call_record_id from temp_state or call_state_logs
      const { data: stateLogs } = await supabase
        .from('call_state_logs')
        .select('details')
        .eq('state', 'warm_transfer_started')
        .like('details', `%${CallSid}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (stateLogs && stateLogs.length > 0) {
        try {
          const details = typeof stateLogs[0].details === 'string'
            ? JSON.parse(stateLogs[0].details.replace(/^"|"$/g, '').replace(/\\"/g, '"'))
            : stateLogs[0].details

          const callRecordId = details.call_record_id
          if (callRecordId) {
            console.log(`📥 Fetching recordings for call_record_id: ${callRecordId}`)

            // Fetch recordings with 5s delay (fire and forget)
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

            fetch(`${supabaseUrl}/functions/v1/fetch-call-recordings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                call_record_id: callRecordId,
                call_sid: CallSid,
                delay_seconds: 5,  // Wait for recordings to finalize
              }),
            }).catch(e => console.error('Error fetching recordings:', e))
          }
        } catch (e) {
          console.error('Error parsing state details:', e)
        }
      }
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in warm-transfer-status:', error)
    return new Response('Error', { status: 500 })
  }
})
