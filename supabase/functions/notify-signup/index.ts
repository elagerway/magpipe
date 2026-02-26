import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { CANADA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
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
      let lat = null
      let lng = null

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
            lat = geoData.latitude || null
            lng = geoData.longitude || null
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
          signup_country: country,
          signup_lat: lat,
          signup_lng: lng
        })
        .eq('email', email)

      if (updateError) {
        console.error('Failed to update user IP:', updateError)
      } else {
        console.log(`Captured signup IP for ${email}: ${ip} (${city || 'unknown'}, ${country || 'unknown'})`)
      }
    }

    // Use dedicated Canadian sender number for signup notifications
    // (Erik's cell +16045628647 is Canadian, so always use Canadian sender)
    const serviceNumber = { phone_number: CANADA_SENDER_NUMBER }

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

    // Also send via configurable admin notification system (fire and forget)
    fetch(`${supabaseUrl}/functions/v1/admin-send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        category: 'signups',
        title: 'New User Signup',
        body: `${name || 'Unknown'} (${email})${locationInfo}`,
      }),
    }).catch(err => console.error('Admin notification failed:', err))

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
