import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkBalance } from '../_shared/balance-check.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { reportError } from '../_shared/error-reporter.ts'

// This webhook is called by SignalWire, which doesn't send auth headers
// We handle auth by validating the phone number exists in our database

Deno.serve(async (req) => {
  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }
  try {
    console.log('=== WEBHOOK INBOUND CALL START ===')
    const formData = await req.formData()
    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const callSid = formData.get('CallSid') as string

    console.log('Inbound call:', { to, from, callSid })

    // All numbers should have an agent_id (system agent as default)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get the service number with its assigned agent
    const { data: serviceNumber, error } = await supabase
      .from('service_numbers')
      .select('*')
      .eq('phone_number', to)
      .eq('is_active', true)
      .single()

    if (error || !serviceNumber) {
      console.log('Number not found or inactive:', to, error?.message)
      // This shouldn't happen - all numbers should be active with system agent as default
      // Use TwiML fallback only for truly unknown numbers
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">This number is not currently in service. Goodbye.</Say>
          <Hangup/>
        </Response>`,
        {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        }
      )
    }

    console.log('Number is active, processing call for user:', serviceNumber.user_id)

    // Check if the user has sufficient credits
    const { allowed: hasCredits } = await checkBalance(supabase, serviceNumber.user_id)
    if (!hasCredits) {
      console.log(`Blocking inbound call for user ${serviceNumber.user_id}: insufficient credits`)
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">This number is temporarily unavailable. Please try again later.</Say>
          <Hangup/>
        </Response>`,
        {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        }
      )
    }

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
        <Say voice="alice">Hello! This is Maggie. The AI assistant is not configured yet. Please contact the account owner.</Say>
        <Hangup/>
      </Response>`

      return new Response(response, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    // Check if agent is active
    if (agentConfig.is_active === false) {
      console.log('Agent is inactive:', agentConfig.id, agentConfig.name || 'Unnamed')

      // Use TwiML for inactive agents
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">This number is not currently assigned. Go to Magpipe dot A I to assign your number.</Say>
          <Hangup/>
        </Response>`,
        {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        }
      )
    }

    // Check if within calls schedule
    if (agentConfig.calls_schedule) {
      const inSchedule = isWithinSchedule(agentConfig.calls_schedule, agentConfig.schedule_timezone)
      if (!inSchedule) {
        const forwardingNumber = agentConfig.after_hours_call_forwarding
        if (forwardingNumber) {
          // Has forwarding number - route to LiveKit so agent can transfer
          console.log('Call outside scheduled hours - routing to LiveKit for after-hours transfer to', forwardingNumber)
        } else {
          // No forwarding number - play off-duty message and hang up
          console.log('Call outside scheduled hours, no forwarding number - playing off-duty message')
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
            <Response>
              <Say voice="alice">This Magpipe agent is currently off duty.</Say>
              <Hangup/>
            </Response>`,
            {
              headers: { 'Content-Type': 'text/xml' },
              status: 200,
            }
          )
        }
      }
    }

    console.log('Using agent:', agentConfig.id, agentConfig.name || 'Unnamed')

    // ── Call Whitelist: auto-forward whitelisted callers ──────────────────
    const { data: whitelistEntry } = await supabase
      .from('call_whitelist')
      .select('forward_to, label')
      .eq('agent_id', agentConfig.id)
      .eq('caller_number', from)
      .maybeSingle()

    const E164_RE = /^\+[1-9]\d{7,14}$/;
    if (!whitelistEntry && !E164_RE.test(from)) {
      console.warn(`Whitelist: from number '${from}' is not E.164 — lookup may have missed a whitelist entry`)
    }
    if (whitelistEntry && E164_RE.test(whitelistEntry.forward_to)) {
      console.log(`Whitelist match: forwarding ${from} → ${whitelistEntry.forward_to} (${whitelistEntry.label || 'unlabeled'})`)

      const fnBase = `${supabaseUrl}/functions/v1`

      // Create call record for the forwarded call
      const { data: callRecord, error: callRecordError } = await supabase
        .from('call_records')
        .insert({
          user_id: serviceNumber.user_id,
          agent_id: agentConfig.id,
          caller_number: from,
          contact_phone: from,
          service_number: to,
          vendor_call_id: callSid,
          call_sid: callSid,
          telephony_vendor: 'signalwire',
          direction: 'inbound',
          status: 'in-progress',
          disposition: 'forwarding',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (callRecordError) {
        console.error('whitelist: failed to create call record:', callRecordError)
      }

      // Auto-enrich contact (fire and forget)
      if (callRecord) {
        autoEnrichContact(serviceNumber.user_id, from, supabase)
          .catch(err => console.error('Auto-enrich error:', err))
      }

      const recordingCb = callRecord?.id
        ? `${fnBase}/sip-recording-callback?call_record_id=${callRecord.id}&label=main`
        : `${fnBase}/sip-recording-callback?label=main`
      const actionUrl = callRecord?.id
        ? `${fnBase}/whitelist-call-complete?call_record_id=${callRecord.id}`
        : `${fnBase}/whitelist-call-complete`

      const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer" recordingStatusCallback="${recordingCb}" action="${actionUrl}">
    <Number>${whitelistEntry.forward_to}</Number>
  </Dial>
</Response>`

      return new Response(response, { headers: { 'Content-Type': 'text/xml' }, status: 200 })
    }
    // ─────────────────────────────────────────────────────────────────────

    // Route to LiveKit voice AI stack
    console.log('=== ROUTING TO LIVEKIT ===')

    // LiveKit SIP trunk domain (from LiveKit dashboard SIP URI)
    const livekitSipDomain = '378ads1njtd.sip.livekit.cloud'

    // Dial the called number directly - dispatch rule handles routing
    // Note: Use transport=tls to match working call configuration
    const sipUri = `sip:${to}@${livekitSipDomain};transport=tls`

    console.log('Dialing SIP URI:', sipUri)

    // Log the call to database with agent_id
    const { data: callRecord, error: insertError } = await supabase
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
      .select('id')
      .single()

    if (insertError) {
      console.error('Error logging call:', insertError)
    } else {
      // Auto-enrich contact if not exists (fire and forget)
      autoEnrichContact(serviceNumber.user_id, from, supabase)
        .catch(err => console.error('Auto-enrich error:', err))

      // If this is a test call, link it to the pending test run immediately
      if (callRecord?.id) {
        const { data: configRow } = await supabase
          .from('test_framework_config').select('test_phone_number').eq('id', 1).single()
        if (configRow?.test_phone_number && from === configRow.test_phone_number) {
          // Find the most recent running test_run targeting this agent, not yet linked
          const { data: linkedRun } = await supabase
            .from('test_runs')
            .select('id, test_cases!inner(agent_id)')
            .eq('status', 'running')
            .is('call_record_id', null)
            .eq('test_cases.agent_id', agentConfig.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (linkedRun) {
            await supabase.from('test_runs').update({ call_record_id: callRecord.id }).eq('id', linkedRun.id)
            await supabase.from('call_records').update({ test_run_id: linkedRun.id }).eq('id', callRecord.id)
            console.log(`Linked test run ${linkedRun.id} to call record ${callRecord.id} on inbound`)
          }
        }
      }
    }

    // Return TwiML to connect to LiveKit via SIP
    const supabaseFunctionsUrl = `${supabaseUrl}/functions/v1`
    const recordingEnabled = agentConfig?.recording_enabled !== false // default true
    const recordingAttrs = recordingEnabled
      ? `record="record-from-ringing" recordingStatusCallback="${supabaseFunctionsUrl}/sip-recording-callback?label=main"`
      : ''

    const response = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Dial ${recordingAttrs}>
        <Sip>${sipUri}</Sip>
      </Dial>
    </Response>`

    return new Response(response, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-inbound-call:', error)
    const _sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await reportError(_sb, { error_type: 'edge_function_error', error_message: String(error.message || error), error_code: 'webhook-inbound-call:outer', source: 'supabase' })

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
 * Check if the current time is within the agent's schedule
 * @param schedule - Schedule object with days as keys
 * @param timezone - IANA timezone string
 * @returns boolean - true if within schedule, false if outside
 */
function isWithinSchedule(
  schedule: Record<string, { enabled: boolean; start: string; end: string }>,
  timezone?: string
): boolean {
  try {
    const tz = timezone || 'America/Los_Angeles'
    const now = new Date()

    // Get current day and time in the agent's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase()
    const hour = parts.find(p => p.type === 'hour')?.value
    const minute = parts.find(p => p.type === 'minute')?.value

    if (!weekday || !hour || !minute) {
      console.error('Failed to parse current time for schedule check')
      return true // Default to available on parse error
    }

    const currentTime = `${hour}:${minute}`
    const daySchedule = schedule[weekday]

    if (!daySchedule) {
      console.log(`No schedule defined for ${weekday}, defaulting to available`)
      return true
    }

    if (!daySchedule.enabled) {
      console.log(`Schedule disabled for ${weekday}`)
      return false
    }

    // Compare times as strings (HH:MM format)
    const isWithin = currentTime >= daySchedule.start && currentTime <= daySchedule.end
    console.log(`Schedule check: ${weekday} ${currentTime} in ${daySchedule.start}-${daySchedule.end}: ${isWithin}`)

    return isWithin
  } catch (error) {
    console.error('Error checking schedule:', error)
    return true // Default to available on error
  }
}

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