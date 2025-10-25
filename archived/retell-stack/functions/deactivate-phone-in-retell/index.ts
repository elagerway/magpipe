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

    // Get the service number to find retell_phone_id
    const { data: serviceNumber, error: numberError } = await supabase
      .from('service_numbers')
      .select('retell_phone_id')
      .eq('phone_number', phoneNumber)
      .eq('user_id', user.id)
      .single()

    if (numberError || !serviceNumber || !serviceNumber.retell_phone_id) {
      return new Response(
        JSON.stringify({ error: 'Phone number not found or not registered with Retell' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Update phone number in Retell to remove agent association
    const updateData = {
      agent_id: null,
    }

    console.log('Deactivating phone in Retell:', serviceNumber.retell_phone_id)

    const updateResponse = await fetch(`https://api.retellai.com/v2/update-phone-number/${serviceNumber.retell_phone_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    })

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Retell API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to deactivate phone in Retell', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await updateResponse.json()
    console.log('Phone deactivated in Retell:', result)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Phone number disassociated from agent successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in deactivate-phone-in-retell:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})