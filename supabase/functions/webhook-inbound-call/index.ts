import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// This webhook is called by SignalWire, which doesn't send auth headers
// We handle auth by validating the phone number exists in our database
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    console.log('=== WEBHOOK INBOUND CALL START ===')
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

    // Get agent config - prioritize number-specific agent, then default agent
    let agentConfig = null

    if (serviceNumber.agent_id) {
      // Route to the agent assigned to this phone number
      console.log('Routing to agent assigned to number:', serviceNumber.agent_id)
      const { data: assignedAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('id', serviceNumber.agent_id)
        .single()

      agentConfig = assignedAgent
    }

    if (!agentConfig) {
      // Fallback to user's default agent
      console.log('No assigned agent, looking for default agent')
      const { data: defaultAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .eq('is_default', true)
        .single()

      agentConfig = defaultAgent
    }

    if (!agentConfig) {
      // Last fallback: get any agent for this user (for backwards compatibility)
      console.log('No default agent, looking for any agent')
      const { data: anyAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      agentConfig = anyAgent
    }

    if (!agentConfig) {
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

    console.log('Using agent:', agentConfig.id, agentConfig.name || 'Unnamed')

    // Route based on active Voice AI stack
    const activeStack = agentConfig.active_voice_stack || 'retell'
    console.log('Routing call to Voice AI stack:', activeStack)

    // LIVEKIT STACK
    if (activeStack === 'livekit') {
      console.log('=== LIVEKIT STACK SELECTED ===')
      console.log('Processing call with LiveKit stack')

      // LiveKit SIP trunk domain (from LiveKit dashboard SIP URI)
      const livekitSipDomain = '378ads1njtd.sip.livekit.cloud'

      // Dial the called number directly - dispatch rule handles routing
      // Note: Use transport=tls to match working call configuration
      const sipUri = `sip:${to}@${livekitSipDomain};transport=tls`

      console.log('Dialing SIP URI:', sipUri)

      // Log the call to database with agent_id
      const { error: insertError } = await supabase
        .from('call_records')
        .insert({
          user_id: serviceNumber.user_id,
          agent_id: agentConfig.id,             // Track which agent handled the call
          caller_number: from,
          contact_phone: from,
          service_number: to,
          vendor_call_id: callSid,              // SignalWire's CallSid
          telephony_vendor: 'signalwire',       // Track which vendor
          voice_platform: 'livekit',            // Track which AI platform
          livekit_call_id: null,                // Will be set by LiveKit agent
          call_sid: callSid,                    // DEPRECATED: backward compatibility
          direction: 'inbound',
          status: 'in-progress',
          disposition: 'answered_by_pat',
          started_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('Error logging call:', insertError)
      } else {
        // Auto-enrich contact if not exists (fire and forget)
        autoEnrichContact(serviceNumber.user_id, from, supabase)
          .catch(err => console.error('Auto-enrich error:', err))
      }

      // Return TwiML to connect to LiveKit via SIP
      const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Dial>
          <Sip>${sipUri}</Sip>
        </Dial>
      </Response>`

      return new Response(response, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    // RETELL STACK (default)
    if (!agentConfig.retell_agent_id) {
      console.log('No Retell agent configured for user')
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

    // Dynamic webhook URL for this specific call
    const webhookUrl = `${supabaseUrl}/functions/v1/webhook-retellai-analysis`

    const callData = {
      agent_id: agentConfig.retell_agent_id,
      from_number: from,
      to_number: to,
      direction: 'inbound',
      webhook_override: webhookUrl,
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

    // Log the call to database with agent_id
    const { error: insertError } = await supabase
      .from('call_records')
      .insert({
        user_id: serviceNumber.user_id,
        agent_id: agentConfig.id,             // Track which agent handled the call
        caller_number: from,
        contact_phone: from,
        service_number: to,
        call_sid: callSid,
        direction: 'inbound',
        status: 'in-progress',
        disposition: 'answered_by_pat',
        started_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Error logging call:', insertError)
    } else {
      // Auto-enrich contact if not exists (fire and forget)
      autoEnrichContact(serviceNumber.user_id, from, supabase)
        .catch(err => console.error('Auto-enrich error:', err))
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

/**
 * Auto-enrich contact if phone number doesn't exist in contacts
 * Called when new call interactions occur
 */
async function autoEnrichContact(
  userId: string,
  phoneNumber: string,
  supabase: any
) {
  // Normalize phone number (ensure E.164 format)
  const normalizedPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+${phoneNumber.replace(/\D/g, '')}`

  try {
    // Check if contact already exists
    const { data: existingContact, error: checkError } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking for existing contact:', checkError)
      return
    }

    if (existingContact) {
      console.log('Contact already exists for', normalizedPhone)
      return
    }

    console.log('No contact found for', normalizedPhone, '- attempting lookup')

    // Call the contact-lookup Edge Function
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(
      `${supabaseUrl}/functions/v1/contact-lookup`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.notFound || !data.success) {
      // No data found - create a basic contact with just the phone number
      console.log('No enrichment data found for', normalizedPhone, '- creating basic contact')
      const { error: createError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          phone_number: normalizedPhone,
          name: 'Unknown',
          first_name: 'Unknown',
          is_whitelisted: false
        })

      if (createError) {
        console.error('Error creating basic contact:', createError)
      } else {
        console.log('Created basic contact for', normalizedPhone)
      }
      return
    }

    // Create enriched contact
    const contact = data.contact
    const firstName = contact.first_name || (contact.name ? contact.name.split(' ')[0] : 'Unknown')
    const lastName = contact.last_name || (contact.name ? contact.name.split(' ').slice(1).join(' ') : null)
    const fullName = contact.name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'

    const contactData = {
      user_id: userId,
      phone_number: normalizedPhone,
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      email: contact.email || null,
      address: contact.address || null,
      company: contact.company || null,
      job_title: contact.job_title || null,
      avatar_url: contact.avatar_url || null,
      linkedin_url: contact.linkedin_url || null,
      twitter_url: contact.twitter_url || null,
      facebook_url: contact.facebook_url || null,
      enriched_at: new Date().toISOString(),
      is_whitelisted: false
    }

    const { error: createError } = await supabase
      .from('contacts')
      .insert(contactData)

    if (createError) {
      console.error('Error creating enriched contact:', createError)
    } else {
      console.log('Created enriched contact for', normalizedPhone, contactData)
    }

  } catch (error) {
    console.error('Error in autoEnrichContact:', error)
  }
}