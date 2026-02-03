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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { email, phone_number, phone_sid, is_active = true } = await req.json()

    if (!email || !phone_number || !phone_sid) {
      return new Response(
        JSON.stringify({ error: 'email, phone_number, and phone_sid are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If this should be active, deactivate all other numbers first
    if (is_active) {
      const { error: deactivateError } = await supabase
        .from('service_numbers')
        .update({ is_active: false })
        .eq('user_id', user.id)

      if (deactivateError) {
        console.error('Error deactivating numbers:', deactivateError)
      }
    }

    // Insert the new number
    const { data, error } = await supabase
      .from('service_numbers')
      .insert({
        user_id: user.id,
        phone_number,
        phone_sid,
        friendly_name: `Magpipe - ${email.split('@')[0]}`,
        is_active,
        capabilities: ['voice', 'SMS'],
        purchased_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to add number', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Added ${phone_number} as ${is_active ? 'active' : 'inactive'} number`,
        number: data
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
