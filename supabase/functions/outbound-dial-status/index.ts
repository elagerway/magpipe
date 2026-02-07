/**
 * Outbound Dial Status - Logs when outbound <Dial> completes
 * This helps debug why outbound calls might be ending unexpectedly.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const destination = url.searchParams.get('destination')
    const from = url.searchParams.get('from')

    // Parse form data from SignalWire
    const formData = await req.formData()
    const params: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      params[key] = String(value)
    }

    console.log('📞 Outbound Dial Status Callback:', {
      destination,
      from,
      ...params,
    })

    // Log to database for debugging
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('call_state_logs').insert({
      room_name: `outbound_dial_${params.CallSid || 'unknown'}`,
      state: 'dial_completed',
      component: 'signalwire',
      details: JSON.stringify({
        destination,
        from,
        dial_call_status: params.DialCallStatus,
        dial_call_sid: params.DialCallSid,
        dial_call_duration: params.DialCallDuration,
        call_sid: params.CallSid,
        call_status: params.CallStatus,
        ...params,
      }),
    })

    // Key fields to analyze:
    // - DialCallStatus: completed, busy, no-answer, failed, canceled
    // - DialCallDuration: how long the call lasted
    // - CallStatus: status of the parent call

    // After dial ends, we need to keep the parent call alive or it will hang up
    // Return empty response to let the call end naturally
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    })
  } catch (error) {
    console.error('Error in outbound-dial-status:', error)
    return new Response('Error', { status: 500 })
  }
})
