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

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all user's service numbers
    const { data: numbers, error: fetchError } = await supabase
      .from('service_numbers')
      .select('*')
      .eq('user_id', user.id)

    if (fetchError) throw fetchError

    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    // Get all numbers from SignalWire
    const swResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/IncomingPhoneNumbers.json`,
      {
        headers: {
          'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
        },
      }
    )

    if (!swResponse.ok) throw new Error('Failed to fetch SignalWire numbers')

    const swData = await swResponse.json()
    const swNumbers = swData.incoming_phone_numbers || []

    let updated = 0
    let errors = 0

    // Update each number with correct capabilities from SignalWire
    for (const number of numbers || []) {
      const swNumber = swNumbers.find((n: any) => n.phone_number === number.phone_number)

      if (swNumber) {
        const capabilities = swNumber.capabilities || {}
        const existing = number.capabilities || {}

        // Merge: only upgrade capabilities (true wins), never downgrade
        const mergedCapabilities = {
          voice: existing.voice === true || capabilities.voice === true || capabilities.Voice === true,
          sms: existing.sms === true || capabilities.sms === true || capabilities.SMS === true,
          mms: existing.mms === true || capabilities.mms === true || capabilities.MMS === true,
        }

        // Only update if something actually changed
        if (mergedCapabilities.voice !== existing.voice ||
            mergedCapabilities.sms !== existing.sms ||
            mergedCapabilities.mms !== existing.mms) {
          const { error: updateError } = await supabase
            .from('service_numbers')
            .update({ capabilities: mergedCapabilities })
            .eq('id', number.id)

          if (updateError) {
            console.error('Error updating number:', number.phone_number, updateError)
            errors++
          } else {
            console.log('Updated capabilities for:', number.phone_number)
            updated++
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        errors,
        total: numbers?.length || 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in fix-number-capabilities:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
