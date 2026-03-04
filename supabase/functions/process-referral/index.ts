import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { referral_code } = await req.json()
    if (!referral_code) {
      return new Response(
        JSON.stringify({ error: 'Missing referral_code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find referrer by code
    const { data: referrer, error: referrerError } = await serviceClient
      .from('users')
      .select('id')
      .eq('referral_code', referral_code)
      .single()

    if (referrerError || !referrer) {
      console.log('Referral code not found:', referral_code)
      return new Response(
        JSON.stringify({ error: 'Invalid referral code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent self-referral
    if (referrer.id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot refer yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user was already referred
    const { data: existingUser } = await serviceClient
      .from('users')
      .select('referred_by')
      .eq('id', user.id)
      .single()

    if (existingUser?.referred_by) {
      return new Response(
        JSON.stringify({ error: 'Already referred' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Set referred_by on the new user
    await serviceClient
      .from('users')
      .update({ referred_by: referrer.id })
      .eq('id', user.id)

    // Create referral_rewards row
    const { error: insertError } = await serviceClient
      .from('referral_rewards')
      .insert({
        referrer_id: referrer.id,
        referred_id: user.id,
      })

    if (insertError) {
      // Duplicate is OK (unique constraint)
      if (!insertError.message?.includes('duplicate')) {
        console.error('Error creating referral reward:', insertError)
      }
    }

    console.log(`Referral processed: ${user.id} referred by ${referrer.id} (code: ${referral_code})`)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in process-referral:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
