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

    const { phone_number } = await req.json()

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: authUser, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: 'phone_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the number from deletion queue
    const { data: deletionRecord, error: fetchError } = await supabase
      .from('numbers_to_delete')
      .select('*')
      .eq('phone_number', phone_number)
      .eq('user_id', authUser.user.id)
      .single()

    if (fetchError || !deletionRecord) {
      return new Response(
        JSON.stringify({ error: 'Number not found in deletion queue' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Restore number to service_numbers table as inactive
    const { data: restoredNumber, error: insertError} = await supabase
      .from('service_numbers')
      .insert({
        user_id: authUser.user.id,
        phone_number: deletionRecord.phone_number,
        phone_sid: deletionRecord.phone_sid,
        friendly_name: deletionRecord.friendly_name,
        capabilities: deletionRecord.capabilities,
        is_active: false
        // Note: created_at and purchased_at will be auto-set by database
        // provider field doesn't exist in service_numbers (only in numbers_to_delete)
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to restore number', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Remove from deletion queue
    const { error: deleteError } = await supabase
      .from('numbers_to_delete')
      .delete()
      .eq('id', deletionRecord.id)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      // Number was restored but not removed from queue - not critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cancelled deletion of ${phone_number}. Number restored to inactive status.`,
        number: restoredNumber
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
