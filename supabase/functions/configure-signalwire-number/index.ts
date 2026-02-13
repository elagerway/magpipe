import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
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

    // Verify user has an agent configured
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!agentConfig) {
      console.error('No agent configured for user')
      return new Response(
        JSON.stringify({ error: 'AI assistant not configured. Please set up your assistant first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Using LiveKit stack - SignalWire webhooks handle routing to LiveKit SIP
    console.log('Number configured for LiveKit - webhook will route to SIP')

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