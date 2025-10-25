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

    const { email, phone_numbers } = await req.json()

    let user

    // Try to get authenticated user first
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: authUser, error: authError } = await supabase.auth.getUser(token)

      if (authUser && !authError) {
        user = { id: authUser.user.id }
      }
    }

    // If no authenticated user, try email lookup (for scripts)
    if (!user && email) {
      const { data: emailUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single()

      if (!userError && emailUser) {
        user = emailUser
      }
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized or user not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'phone_numbers array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    // Calculate scheduled deletion date (35 days from now)
    const scheduledDeletionDate = new Date()
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 35)

    for (const phoneNumber of phone_numbers) {
      // Get service number details
      const { data: serviceNumber, error: fetchError } = await supabase
        .from('service_numbers')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('user_id', user.id)
        .single()

      if (fetchError || !serviceNumber) {
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: 'Service number not found'
        })
        continue
      }

      // Remove from service_numbers table (it will be in numbers_to_delete)
      const { error: deleteError } = await supabase
        .from('service_numbers')
        .delete()
        .eq('phone_number', phoneNumber)
        .eq('user_id', user.id)

      if (deleteError) {
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: 'Failed to remove from service numbers'
        })
        continue
      }

      // Add to deletion queue
      const { error: insertError } = await supabase
        .from('numbers_to_delete')
        .insert({
          user_id: user.id,
          phone_number: phoneNumber,
          phone_sid: serviceNumber.phone_sid,
          provider: serviceNumber.provider || 'signalwire',
          friendly_name: serviceNumber.friendly_name,
          capabilities: serviceNumber.capabilities,
          scheduled_deletion_date: scheduledDeletionDate.toISOString(),
          deletion_notes: 'Queued via queue-number-deletion function'
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        results.push({
          phone_number: phoneNumber,
          success: false,
          error: insertError.message
        })
        continue
      }

      results.push({
        phone_number: phoneNumber,
        success: true,
        scheduled_deletion_date: scheduledDeletionDate.toISOString()
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        scheduled_deletion_date: scheduledDeletionDate.toISOString()
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
