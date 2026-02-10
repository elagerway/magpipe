import { createClient } from 'npm:@supabase/supabase-js@2'

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

    // Get IP address from request headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               req.headers.get('cf-connecting-ip') ||
               null

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Update user with IP address and try to get geolocation
    if (ip) {
      let city = null
      let country = null

      // Try to get geolocation from IP (using ipapi.co - free HTTPS)
      try {
        const geoResponse = await fetch(`https://ipapi.co/${ip}/json/`, {
          signal: AbortSignal.timeout(3000)
        })
        if (geoResponse.ok) {
          const geoData = await geoResponse.json()
          if (geoData.city && geoData.country_name) {
            city = geoData.city
            country = geoData.country_name
          }
        }
      } catch (geoError) {
        console.log('Geolocation lookup failed:', geoError.message)
      }

      // Update user record with IP and location
      const { error: updateError } = await supabase
        .from('users')
        .update({
          signup_ip: ip,
          signup_city: city,
          signup_country: country
        })
        .eq('email', email)

      if (updateError) {
        console.error('Failed to update user IP:', updateError)
      } else {
        console.log(`Captured signup IP for ${email}: ${ip} (${city || 'unknown'}, ${country || 'unknown'})`)
      }
    }

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

    // Get location info from DB (in case we just updated it)
    let locationInfo = ''
    if (ip) {
      const { data: userData } = await supabase
        .from('users')
        .select('signup_city, signup_country')
        .eq('email', email)
        .single()

      if (userData?.signup_city && userData?.signup_country) {
        locationInfo = `\nLocation: ${userData.signup_city}, ${userData.signup_country}`
      } else if (ip) {
        locationInfo = `\nIP: ${ip}`
      }
    }

    // Build SMS
    const smsBody = `New Signup!\n${name ? `Name: ${name}\n` : ''}Email: ${email}${locationInfo}`

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
