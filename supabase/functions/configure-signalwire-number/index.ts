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
    const { phoneNumber } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the service number to find the SignalWire SID
    const { data: serviceNumber, error: fetchError } = await supabase
      .from('service_numbers')
      .select('phone_sid')
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id)
      .single()

    console.log('Service number lookup:', { phoneNumber, serviceNumber, error: fetchError })

    if (fetchError || !serviceNumber?.phone_sid) {
      return new Response(
        JSON.stringify({ error: 'Phone number not found', details: fetchError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get SignalWire credentials from env
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Configure the phone number in SignalWire with our webhook URLs
    const webhookBaseUrl = `${supabaseUrl}/functions/v1`

    const updateData = new URLSearchParams({
      VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
      VoiceMethod: 'POST',
      StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
      StatusCallbackMethod: 'POST',
      SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
      SmsMethod: 'POST',
    })

    console.log('Configuring SignalWire number:', serviceNumber.phone_sid)

    const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
    const signalwireResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers/${serviceNumber.phone_sid}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateData.toString(),
      }
    )

    if (!signalwireResponse.ok) {
      const errorText = await signalwireResponse.text()
      console.error('SignalWire API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to configure webhooks', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await signalwireResponse.json()
    console.log('SignalWire number configured:', result)

    // SignalWire SIP termination URI
    const terminationUri = 'erik-4f437f3c6530.sip.signalwire.com'

    console.log('Using termination URI:', terminationUri)

    // Now import the number into Retell
    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Get user's agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('retell_agent_id')
      .eq('user_id', user.id)
      .single()

    if (!agentConfig?.retell_agent_id) {
      console.error('No agent configured for user')
      return new Response(
        JSON.stringify({ error: 'Pat not configured. Please set up your assistant first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Import number to Retell with correct format
    const importData = {
      phone_number: phoneNumber,
      termination_uri: terminationUri,
      inbound_agent_id: agentConfig.retell_agent_id,
      outbound_agent_id: agentConfig.retell_agent_id,
      nickname: phoneNumber,
    }

    console.log('Importing phone to Retell:', importData)

    const retellResponse = await fetch('https://api.retellai.com/import-phone-number', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(importData),
    })

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text()
      console.error('Retell import error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to activate number', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellResult = await retellResponse.json()
    console.log('Phone imported to Retell:', retellResult)

    // Update service_numbers with retell phone ID
    await supabase
      .from('service_numbers')
      .update({
        retell_phone_id: retellResult.phone_number_id,
        termination_uri: terminationUri
      })
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Number activated successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in configure-signalwire-number:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})