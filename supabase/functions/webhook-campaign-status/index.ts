import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const payload = await req.json()

    console.log('Campaign status webhook received:', JSON.stringify(payload, null, 2))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Extract relevant information from payload
    const {
      id: orderId,
      campaign_id: campaignId,
      state,
      phone_numbers,
      processed_at,
      created_at,
      updated_at
    } = payload

    // Log the campaign status update to a tracking table
    const { error: logError } = await supabase
      .from('campaign_registrations')
      .upsert({
        order_id: orderId,
        campaign_id: campaignId,
        state: state,
        phone_numbers: phone_numbers,
        processed_at: processed_at,
        created_at: created_at,
        updated_at: updated_at,
        raw_payload: payload
      }, {
        onConflict: 'order_id'
      })

    if (logError) {
      console.error('Error logging campaign status:', logError)
    }

    // If state is 'approved' or 'rejected', we might want to notify the user
    if (state === 'approved') {
      console.log('✅ Campaign registration approved for phone numbers:', phone_numbers)
      // TODO: Send notification to user
    } else if (state === 'rejected') {
      console.log('❌ Campaign registration rejected for phone numbers:', phone_numbers)
      // TODO: Send notification to user
    } else if (state === 'pending') {
      console.log('⏳ Campaign registration pending for phone numbers:', phone_numbers)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-campaign-status:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
