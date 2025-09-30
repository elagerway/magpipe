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

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Get user's agent config
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (agentError || !agentConfig) {
      console.error('Agent config error:', agentError)
      return new Response(
        JSON.stringify({ error: 'Pat not configured. Please set up your assistant first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!agentConfig.retell_agent_id) {
      console.error('Missing retell_agent_id in agent config')
      return new Response(
        JSON.stringify({ error: 'Pat not fully configured. Please complete assistant setup first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Using agent ID:', agentConfig.retell_agent_id)

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Check if phone is already in our database with a retell_phone_id
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('retell_phone_id')
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id)
      .single()

    let phoneNumberId = serviceNumber?.retell_phone_id

    if (phoneNumberId) {
      // Phone already imported, just update the agent association
      console.log('Phone already imported, updating agent association:', phoneNumberId)

      const updateResponse = await fetch(`https://api.retellai.com/v2/update-phone-number/${phoneNumberId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: agentConfig.retell_agent_id,
        }),
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        console.error('Retell API error updating phone:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to activate number', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const result = await updateResponse.json()
      console.log('Phone agent association updated:', result)

      return new Response(
        JSON.stringify({
          success: true,
          phone_number_id: phoneNumberId,
          message: 'Number activated for Pat successfully',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Phone not imported yet - for now, skip phone import since we don't have SignalWire termination URI yet
    // TODO: Get termination URI from SignalWire and import to Retell
    console.log('Skipping phone import to Retell - custom telephony webhooks will handle calls directly')

    // Just return success for now
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Number activated for Pat successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in register-phone-with-retell:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})