import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { email, phone_number } = await req.json()

    if (!email || !phone_number) {
      return new Response(
        JSON.stringify({ error: 'email and phone_number are required' }),
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

    // Deactivate ALL other numbers for this user
    const { error: deactivateError } = await supabase
      .from('service_numbers')
      .update({ is_active: false })
      .eq('user_id', user.id)

    if (deactivateError) {
      console.error('Error deactivating numbers:', deactivateError)
    }

    // Activate the specified number
    const { data, error } = await supabase
      .from('service_numbers')
      .update({ is_active: true })
      .eq('user_id', user.id)
      .eq('phone_number', phone_number)
      .select()

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to activate number', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Number not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, activated_number: phone_number, data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
