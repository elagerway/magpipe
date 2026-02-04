import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get a service number to use as sender
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!serviceNumber) {
      console.error('No service number found for SMS')
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Build SMS
    const smsBody = `New Signup!\n${name ? `Name: ${name}\n` : ''}Email: ${email}`

    const smsData = new URLSearchParams({
      From: serviceNumber.phone_number,
      To: '+16045628647',
      Body: smsBody.substring(0, 160),
    })

    const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
    const smsResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsData.toString(),
      }
    )

    if (smsResponse.ok) {
      console.log('Signup SMS notification sent for:', email)
    } else {
      console.error('SMS send failed:', await smsResponse.text())
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in notify-signup:', error)
    // Don't fail - this is just a notification
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
