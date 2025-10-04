import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber } = await req.json()

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: 'SignalWire configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Provisioning number:', phoneNumber, 'for user:', user.id)

    const webhookBaseUrl = `${supabaseUrl}/functions/v1`

    // Step 1: Purchase the phone number from SignalWire with webhooks configured
    const purchaseUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers.json`

    const purchaseBody = new URLSearchParams({
      PhoneNumber: phoneNumber,
      VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
      VoiceMethod: 'POST',
      StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
      StatusCallbackMethod: 'POST',
      SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
      SmsMethod: 'POST',
      FriendlyName: `Pat AI - ${user.email}`,
    })

    console.log('Purchasing number from SignalWire...')

    const purchaseResponse = await fetch(purchaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
      },
      body: purchaseBody.toString(),
    })

    if (!purchaseResponse.ok) {
      const errorText = await purchaseResponse.text()
      console.error('SignalWire purchase error:', errorText)

      let errorMessage = 'Failed to purchase phone number from SignalWire'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorMessage
      } catch (e) {
        // Use default error message
      }

      return new Response(
        JSON.stringify({ error: errorMessage, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const purchaseResult = await purchaseResponse.json()
    console.log('Number purchased successfully:', purchaseResult)

    const phoneSid = purchaseResult.sid

    // Normalize capabilities to lowercase (SignalWire uses uppercase)
    const capabilities = purchaseResult.capabilities || {}
    const normalizedCapabilities = {
      voice: capabilities.voice === true || capabilities.Voice === true,
      sms: capabilities.sms === true || capabilities.SMS === true,
      mms: capabilities.mms === true || capabilities.MMS === true,
    }

    // Step 2: Save the service number to service_numbers table
    const { error: insertError } = await supabase
      .from('service_numbers')
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        phone_sid: phoneSid,
        friendly_name: `Pat AI - ${user.email}`,
        is_active: false, // Inactive by default - user must activate
        capabilities: normalizedCapabilities,
      })

    if (insertError) {
      console.error('Error saving service number:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save service number to database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        phoneNumber,
        phoneSid,
        message: 'Phone number purchased and configured successfully',
        webhooks: {
          voice: `${webhookBaseUrl}/webhook-inbound-call`,
          voiceStatus: `${webhookBaseUrl}/webhook-call-status`,
          sms: `${webhookBaseUrl}/webhook-inbound-sms`,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in provision-phone-number:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})