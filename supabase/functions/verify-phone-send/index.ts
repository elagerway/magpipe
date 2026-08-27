import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSenderNumber } from '../_shared/sms-compliance.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { phoneNumber, channel } = await req.json()
    const useVoice = channel === 'voice' // default channel is SMS

    if (!phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    // Store verification code in Supabase with 10 minute expiration
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit: an authenticated user can otherwise loop this into a robocall /
    // toll-fraud primitive (SMS or, worse, outbound voice calls) to any number.
    // Cap sends per user in a rolling 10-minute window.
    const RATE_WINDOW_MS = 10 * 60 * 1000
    const RATE_MAX_SENDS = 5
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count: recentSends } = await supabase
      .from('phone_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart)

    if ((recentSends ?? 0) >= RATE_MAX_SENDS) {
      return new Response(
        JSON.stringify({ error: 'Too many verification attempts. Please wait a few minutes and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store verification code (you might want to create a verification_codes table)
    // For now, we'll use a simple in-memory approach or database table
    const { error: insertError } = await supabase
      .from('phone_verifications')
      .upsert({
        user_id: user.id,
        phone_number: phoneNumber,
        code: verificationCode,
        expires_at: expiresAt,
        verified: false,
      })

    if (insertError) {
      console.error('Error storing verification code:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to store verification code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine sender number based on destination country
    // Default: Canadian number +16042566768 for all SMS
    // US destinations: +14152518686
    // NOTE: International SMS requires SignalWire account-level enablement (error 30006 until enabled)
    let fromNumber = '+16042566768'

    if (phoneNumber.startsWith('+1')) {
      const areaCode = phoneNumber.substring(2, 5)
      const { data: areaCodeData } = await supabase
        .from('area_codes')
        .select('country')
        .eq('area_code', areaCode)
        .single()

      if (areaCodeData?.country !== 'Canada') {
        fromNumber = '+14152518686' // US number for US destinations
      }
    }

    // Send via SignalWire — SMS (default) or a voice call that reads the code
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')

    let signalwireUrl: string
    let body: URLSearchParams

    if (useVoice) {
      // Read the code digit-by-digit, three times, so landline/VoIP users can note it
      const digits = verificationCode.split('').join(', ')
      const sayCode = `<Say>Your code is: ${digits}.</Say><Pause length="1"/>`
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Say>Hello! This is MAGPIPE calling with your verification code. It expires in 10 minutes.</Say><Pause length="1"/>${sayCode}${sayCode}${sayCode}<Say>Goodbye!</Say></Response>`

      signalwireUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls.json`
      body = new URLSearchParams({
        From: fromNumber,
        To: phoneNumber,
        Twiml: twiml,
      })
    } else {
      signalwireUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages.json`

      // Only add STOP opt-out text for US destinations (10DLC compliance)
      const baseMessage = `Your MAGPIPE verification code is: ${verificationCode}. This code expires in 10 minutes.`
      const message = fromNumber === '+14152518686'
        ? `${baseMessage}\n\nSTOP to opt out`
        : baseMessage

      body = new URLSearchParams({
        From: fromNumber,
        To: phoneNumber,
        Body: message,
      })
    }

    const signalwireResponse = await fetch(signalwireUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${signalwireProjectId}:${signalwireToken}`),
      },
      body: body.toString(),
    })

    if (!signalwireResponse.ok) {
      const errorText = await signalwireResponse.text()
      console.error('SignalWire error:', errorText)

      // Parse error details from SignalWire response
      let errorCode = ''
      let errorDetail = ''
      try {
        const errorJson = JSON.parse(errorText)
        errorCode = String(errorJson.code || errorJson.error_code || signalwireResponse.status)
        errorDetail = errorJson.message || errorJson.error_message || errorText
      } catch {
        errorCode = String(signalwireResponse.status)
        errorDetail = errorText
      }

      // Log to system_error_logs
      const { error: logError } = await supabase
        .from('system_error_logs')
        .insert({
          error_type: useVoice ? 'voice_verification' : 'sms_verification',
          error_code: errorCode,
          error_message: errorDetail,
          user_id: user.id,
          metadata: {
            phone_number: phoneNumber,
            from_number: fromNumber,
            channel: useVoice ? 'voice' : 'sms',
            edge_function: 'verify-phone-send',
            signalwire_status: signalwireResponse.status,
          },
        })
      if (logError) console.error('Failed to log error:', logError)

      // Return a user-friendly message
      const failedThing = useVoice ? 'Verification call' : 'SMS delivery'
      const userMessage = errorCode === '30006' || errorDetail.includes('Unrouteable')
        ? `${failedThing} failed to ${phoneNumber} — your country may not be supported yet. Please contact support.`
        : `${failedThing} failed to ${phoneNumber}. Please try again or contact support.`

      return new Response(
        JSON.stringify({ error: userMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: useVoice ? 'Verification call started' : 'Verification code sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in verify-phone-send:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})