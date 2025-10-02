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
    console.log('=== TRANSFER CALL START ===')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Log all headers
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))

    // Log URL and query params
    const url = new URL(req.url)
    console.log('Request URL:', url.href)
    console.log('Query params:', Object.fromEntries(url.searchParams.entries()))

    // Parse the request body from Retell
    const bodyText = await req.text()
    console.log('Request body (raw):', bodyText)
    console.log('Body length:', bodyText.length)

    let requestData
    try {
      requestData = JSON.parse(bodyText || '{}')
    } catch (e) {
      console.error('JSON parse error:', e)
      requestData = {}
    }

    console.log('Parsed request data keys:', Object.keys(requestData))

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
    const requestedPerson = requestData.requested_person || null // Optional parameter from tool call

    console.log('Retell call_id:', retell_call_id)
    console.log('SignalWire CallSid:', signalwire_call_sid)
    console.log('Requested person:', requestedPerson)

    if (!retell_call_id || !signalwire_call_sid) {
      console.error('Missing required call identifiers')
      return new Response(
        JSON.stringify({ error: 'Missing call identifiers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the call record to get user_id and service number
    const { data: callRecord, error: callError } = await supabase
      .from('call_records')
      .select('user_id, service_number')
      .eq('retell_call_id', retell_call_id)
      .single()

    console.log('Found call record:', callRecord, 'Error:', callError)

    if (!callRecord) {
      console.error('Call not found by retell_call_id')
      return new Response(
        JSON.stringify({ error: 'Call not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user_id = callRecord.user_id
    console.log('Found user_id:', user_id)

    // Get transfer number for user
    console.log('Getting transfer number for user:', user_id)

    let transferNumbers
    let configError

    if (requestedPerson) {
      // Look up by label if a specific person was requested
      console.log('Looking up transfer number by label:', requestedPerson)

      // First, let's see all transfer numbers for debugging
      const { data: allTransfers } = await supabase
        .from('transfer_numbers')
        .select('phone_number, label')
        .eq('user_id', user_id)

      console.log('All transfer numbers for user:', allTransfers)

      const result = await supabase
        .from('transfer_numbers')
        .select('phone_number, label')
        .eq('user_id', user_id)
        .ilike('label', requestedPerson)
        .single()

      transferNumbers = result.data
      configError = result.error

      console.log('Lookup result for', requestedPerson, ':', transferNumbers, 'Error:', configError)

      if (!transferNumbers) {
        console.error('No transfer number found for requested person:', requestedPerson)
        return new Response(
          JSON.stringify({ error: 'Person not available', requested_person: requestedPerson }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Get default transfer number
      const result = await supabase
        .from('transfer_numbers')
        .select('phone_number, label')
        .eq('user_id', user_id)
        .eq('is_default', true)
        .single()

      transferNumbers = result.data
      configError = result.error
    }

    console.log('Transfer number:', transferNumbers, 'Error:', configError)

    if (!transferNumbers?.phone_number) {
      console.error('No transfer phone number configured')
      return new Response(
        JSON.stringify({ error: 'No transfer number configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transferTo = transferNumbers.phone_number
    console.log('Transferring call to:', transferTo, 'Label:', transferNumbers.label)

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

    // Update the call using SignalWire API with the CallSid from Retell
    const updateUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls/${signalwire_call_sid}.json`

    console.log('Update URL:', updateUrl)
    console.log('Using SignalWire CallSid:', signalwire_call_sid)

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
      console.error('SignalWire API error. Status:', swResponse.status)
      console.error('Error response:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to transfer call', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await swResponse.json()
    console.log('Call transfer initiated successfully:', result)

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
        message: `Call transferred to ${transferTo}`,
        transferred_to: transferTo,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in transfer-call:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
