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
      // The agent should detect this and handle accordingly
      // Either the agent initiated the hangup via cancel_transfer,
      // or the transferee hung up - either way the agent needs to bring caller back
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in warm-transfer-status:', error)
    return new Response('Error', { status: 500 })
  }
})
