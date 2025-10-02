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
    console.log('=== IMMEDIATE TRANSFER CALL START ===')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse the request body from Retell
    const bodyText = await req.text()
    const requestData = JSON.parse(bodyText || '{}')

    // Extract call data from Retell's request structure
    const callData = requestData.call
    if (!callData) {
      console.error('No call object in request')
      return new Response(
        JSON.stringify({ error: 'Invalid request structure from Retell' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retell_call_id = callData.call_id
    const signalwire_call_sid = callData.retell_llm_dynamic_variables?.['signalwire-callsid']
    const transferNumberId = requestData.transfer_number_id || null

    console.log('Immediate transfer - Retell call_id:', retell_call_id)
    console.log('SignalWire CallSid:', signalwire_call_sid)
    console.log('Transfer number ID:', transferNumberId)

    if (!retell_call_id || !signalwire_call_sid) {
      console.error('Missing required call identifiers')
      return new Response(
        JSON.stringify({ error: 'Missing call identifiers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the call record to get user_id and service number
    const { data: callRecord } = await supabase
      .from('call_records')
      .select('user_id, service_number')
      .eq('retell_call_id', retell_call_id)
      .single()

    if (!callRecord) {
      console.error('Call not found by retell_call_id')
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user_id = callRecord.user_id
    console.log('Immediate transfer for user:', user_id)

    // Get transfer number - either by ID or default
    let transferNumbers
    if (transferNumberId) {
      const result = await supabase
        .from('transfer_numbers')
        .select('phone_number, label')
        .eq('id', transferNumberId)
        .eq('user_id', user_id)
        .single()
      transferNumbers = result.data
      console.log('Looking up transfer number by ID:', transferNumberId)
    } else {
      const result = await supabase
        .from('transfer_numbers')
        .select('phone_number, label')
        .eq('user_id', user_id)
        .eq('is_default', true)
        .single()
      transferNumbers = result.data
      console.log('Using default transfer number')
    }

    if (!transferNumbers?.phone_number) {
      console.error('No transfer phone number configured')
      return new Response(
        JSON.stringify({ error: 'No transfer number configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transferTo = transferNumbers.phone_number
    console.log('Immediately transferring call to:', transferTo, 'Label:', transferNumbers.label)

    // Use SignalWire REST API to update the call with Dial
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Create TwiML/LaML with Dial verb to transfer the call
    const dialXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callRecord.service_number}">
    <Number>${transferTo}</Number>
  </Dial>
</Response>`

    console.log('Transferring call with Dial XML:', dialXml)

    // Update the call using SignalWire API
    const updateUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls/${signalwire_call_sid}.json`

    const authHeader = 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`)

    const swResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        Twiml: dialXml,
      }),
    })

    console.log('SignalWire response status:', swResponse.status)

    if (!swResponse.ok) {
      const errorText = await swResponse.text()
      console.error('SignalWire API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to transfer call', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await swResponse.json()
    console.log('Immediate transfer initiated successfully:', result)

    // Update call record
    await supabase
      .from('call_records')
      .update({
        disposition: 'transferred',
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('retell_call_id', retell_call_id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Call immediately transferred to ${transferTo}`,
        transferred_to: transferTo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in transfer-call-immediate:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
