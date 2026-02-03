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
    const { userEmail } = await req.json()

    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'User email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all numbers from SignalWire
    const listUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers.json?PageSize=50`

    const listResponse = await fetch(listUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
      },
    })

    const result = await listResponse.json()
    const numbers = result.incoming_phone_numbers || []

    const webhookBaseUrl = `${supabaseUrl}/functions/v1`
    const processedNumbers = []

    for (const num of numbers) {
      // Update webhooks
      const updateUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers/${num.sid}.json`

      const updateBody = new URLSearchParams({
        VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
        VoiceMethod: 'POST',
        StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
        StatusCallbackMethod: 'POST',
        SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
        SmsMethod: 'POST',
        FriendlyName: `Magpipe - ${userEmail}`,
      })

      await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
        },
        body: updateBody.toString(),
      })

      // Add to database with original purchase date from SignalWire
      const { error: insertError } = await supabase
        .from('service_numbers')
        .upsert({
          user_id: user.id,
          phone_number: num.phone_number,
          phone_sid: num.sid,
          friendly_name: `Magpipe - ${userEmail}`,
          is_active: false,
          capabilities: num.capabilities || { voice: true, sms: true, mms: true },
          purchased_at: num.date_created, // Use SignalWire's original purchase date
        }, {
          onConflict: 'phone_number'
        })

      if (!insertError) {
        processedNumbers.push(num.phone_number)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processedCount: processedNumbers.length,
        numbers: processedNumbers
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})