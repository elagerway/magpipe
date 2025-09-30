import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const formData = await req.formData()
    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const callSid = formData.get('CallSid') as string

    console.log('Inbound call:', { to, from, callSid })

    // Check if the number is active
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: serviceNumber, error } = await supabase
      .from('service_numbers')
      .select('*, users!inner(*)')
      .eq('phone_number', to)
      .eq('is_active', true)
      .single()

    if (error || !serviceNumber) {
      console.log('Number not active or not found:', to)

      // Return TwiML to reject the call or play a message
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">This number is currently not accepting calls. Goodbye.</Say>
          <Hangup/>
        </Response>`,
        {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        }
      )
    }

    console.log('Number is active, processing call for user:', serviceNumber.users.email)

    // Get user's agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', serviceNumber.user_id)
      .single()

    if (!agentConfig || !agentConfig.retell_agent_id) {
      console.log('No agent configured for user')
      const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">Hello! This is Pat. The AI assistant is not configured yet. Please contact the account owner.</Say>
        <Hangup/>
      </Response>`

      return new Response(response, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    // Register Retell phone call for inbound
    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    const callData = {
      agent_id: agentConfig.retell_agent_id,
      from_number: from,
      to_number: to,
      direction: 'inbound',
      metadata: {
        user_id: serviceNumber.user_id,
        service_number_id: serviceNumber.id,
      }
    }

    console.log('Registering Retell inbound call with data:', callData)

    const retellResponse = await fetch('https://api.retellai.com/v2/register-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(callData),
    })

    console.log('Retell response status:', retellResponse.status)

    if (!retellResponse.ok) {
      const errorText = await retellResponse.text()
      console.error('Retell API error - Status:', retellResponse.status)
      console.error('Retell API error - Body:', errorText)
      console.error('Retell API error - Request was:', JSON.stringify(callData))

      const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">We're sorry, there was an error connecting to Pat. Please try again later.</Say>
        <Hangup/>
      </Response>`

      return new Response(response, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    const retellCall = await retellResponse.json()
    console.log('Retell call registered successfully:', retellCall)

    // Retell uses LiveKit for SIP - dial the called number (to) at the LiveKit SIP domain
    const retellSipDomain = '5t4n6j0wnrl.sip.livekit.cloud'
    const sipUri = `sip:${to}@${retellSipDomain}`

    console.log('Dialing SIP URI:', sipUri)

    // Return TwiML to connect to Retell via SIP
    const response = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial>
        <Sip>${sipUri}</Sip>
      </Dial>
    </Response>`

    // Log the call to database
    const { error: insertError } = await supabase
      .from('call_records')
      .insert({
        user_id: serviceNumber.user_id,
        contact_phone: from,
        service_number: to,
        call_sid: callSid,
        direction: 'inbound',
        status: 'in-progress',
        started_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Error logging call:', insertError)
    }

    return new Response(response, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-inbound-call:', error)

    // Return error TwiML
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="alice">We're sorry, there was an error processing your call. Please try again later.</Say>
        <Hangup/>
      </Response>`,
      {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      }
    )
  }
})