import { createClient } from 'npm:@supabase/supabase-js@2'
import { isFraudBlocked } from '../_shared/fraud.ts'
import { MAGPIPE_MAIN_NUMBER } from '../_shared/sms-compliance.ts'
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

    // ── Spam blocklist ──────────────────────────────────────────────
    // Workspace-wide check: is this caller_number on the user's
    // blocked_callers list? If yes, return <Reject reason="busy"/> so
    // the carrier signals busy back to the caller without ringing
    // through to an agent, billing credits, or producing a call
    // record. Single indexed query on (user_id, caller_number).
    //
    // Trade-off note: SignalWire <Reject> renders SIP 486 Busy Here →
    // standard busy tone. If we want the SIT / "fast busy" sequence
    // specifically, swap reason to "rejected" (SIP 603) — some
    // carriers map that to SIT instead. Started with "busy" because
    // it's unambiguous; revisit if customers report it doesn't
    // discourage the spammer enough.
    if (from) {
      // Global fraud list runs alongside the per-workspace blocklist — a number
      // caught defrauding one workspace is rejected for all of them. A
      // workspace can override its own entry via fraud_allowlist. Both checks
      // are indexed point lookups and both fail open.
      const [{ data: blockHit, error: blockErr }, fraud] = await Promise.all([
        supabase
          .from('blocked_callers')
          .select('id, label')
          .eq('user_id', serviceNumber.user_id)
          .eq('caller_number', from)
          .maybeSingle(),
        isFraudBlocked(supabase, from, serviceNumber.user_id, 'call'),
      ])

      if (fraud.blocked) {
        console.log(`Inbound call from ${from} → GLOBAL FRAUD BLOCK (categories=${(fraud.entry?.categories || []).join(',') || 'n/a'}, risk=${fraud.entry?.risk_score ?? 'n/a'}). Returning busy.`)
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Reject reason="busy"/>
          </Response>`,
          { headers: { 'Content-Type': 'text/xml' }, status: 200 }
        )
      }

      if (blockErr) {
        // Don't fail the call if the lookup blows up — log and continue
        // to the regular agent path. Better to ring through than to
        // strand a legit caller because the blocklist query timed out.
        console.warn('[webhook-inbound-call] blocklist lookup non-fatal:', blockErr.message)
      } else if (blockHit) {
        console.log(`Inbound call from ${from} → blocked (entry ${blockHit.id}, label=${blockHit.label ?? '(none)'}). Returning busy.`)
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Reject reason="busy"/>
          </Response>`,
          {
            headers: { 'Content-Type': 'text/xml' },
            status: 200,
          }
        )
      }
    }

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

    // Check if within calls schedule. Outside scheduled hours the AI must NOT
    // answer: forward straight to after_hours_call_forwarding via a blind
    // <Dial> (same hardened pattern as the whitelist forward below — caller-ID
    // passthrough, XML-escaped callback URLs), or play the off-duty message if
    // no forwarding number is set.
    if (agentConfig.calls_schedule) {
      const inSchedule = isWithinSchedule(agentConfig.calls_schedule, agentConfig.schedule_timezone)
      if (!inSchedule) {
        // Normalize UI-entered numbers like "+1 (780) 800-8423" before validating
        const forwardingNumber = (agentConfig.after_hours_call_forwarding || '').replace(/[\s().-]/g, '')
        const AH_E164 = /^\+[1-9]\d{6,14}$/
        if (AH_E164.test(forwardingNumber)) {
          console.log('Call outside scheduled hours - blind-forwarding to', forwardingNumber)

          const fnBase = `${supabaseUrl}/functions/v1`
          const { data: ahRecord, error: ahRecordError } = await supabase
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
              metadata: { forward_reason: 'after_hours' },
              started_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (ahRecordError) {
            console.error('after-hours: failed to create call record:', ahRecordError)
          }

          if (ahRecord) {
            autoEnrichContact(serviceNumber.user_id, from, supabase)
              .catch(err => console.error('Auto-enrich error:', err))
          }

          const ahRecordingCb = ahRecord?.id
            ? `${fnBase}/sip-recording-callback?call_record_id=${ahRecord.id}&label=main`
            : `${fnBase}/sip-recording-callback?label=main`
          // whitelist-call-complete finalizes any 'forwarding' record (status,
          // disposition, duration); its spoofing-cooldown branch no-ops when the
          // caller has no whitelist entry.
          const ahActionUrl = ahRecord?.id
            ? `${fnBase}/whitelist-call-complete?call_record_id=${ahRecord.id}`
            : `${fnBase}/whitelist-call-complete`

          // Raw '&' in a cXML attribute is illegal XML — SignalWire kills the
          // call sub-second. Must be &amp; (see whitelist forward below).
          const ahXmlAttr = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

          // Present the SERVICE NUMBER (a number we own) as caller ID, NOT the
          // original caller. SignalWire can't STIR/SHAKEN-attest a passthrough
          // number, and screening carriers (e.g. Iristel) answer-and-drop
          // unattested forwards in ~2s. The service number is fully attested
          // and reads as "forwarded business call" to whoever answers. The
          // whitelist forward below keeps passthrough deliberately — its
          // destinations are user-chosen and confirmed working.
          const ahCallerId = to && AH_E164.test(to) ? to : MAGPIPE_MAIN_NUMBER
          const ahResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${ahXmlAttr(ahCallerId)}" record="record-from-answer" recordingStatusCallback="${ahXmlAttr(ahRecordingCb)}" action="${ahXmlAttr(ahActionUrl)}">
    <Number>${ahXmlAttr(forwardingNumber)}</Number>
  </Dial>
</Response>`

          return new Response(ahResponse, { headers: { 'Content-Type': 'text/xml' }, status: 200 })
        } else {
          // No (or malformed) forwarding number - play off-duty message and hang up
          if (agentConfig.after_hours_call_forwarding) {
            console.error('after-hours: forwarding number is not valid E.164, playing off-duty message instead:', agentConfig.after_hours_call_forwarding)
          } else {
            console.log('Call outside scheduled hours, no forwarding number - playing off-duty message')
          }
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
      .select('forward_to, label, cooldown_until')
      .eq('agent_id', agentConfig.id)
      .eq('caller_number', from)
      .maybeSingle()

    const E164_RE = /^\+[1-9]\d{7,14}$/;
    if (!whitelistEntry && !E164_RE.test(from)) {
      console.warn(`Whitelist: from number '${from}' is not E.164 — lookup may have missed a whitelist entry`)
    }

    // Cooldown: if this entry was recently abused by a sub-second failure burst
    // (set by whitelist-call-complete on suspected caller-ID spoofing), suppress
    // the forward and fall through to the AI agent path. Auto-expires.
    const cooldownActive = whitelistEntry?.cooldown_until
      && new Date(whitelistEntry.cooldown_until).getTime() > Date.now()
    if (cooldownActive) {
      console.warn(
        `[webhook-inbound-call] whitelist forward suppressed: from=${from} agent=${agentConfig.id} ` +
        `cooldown_until=${whitelistEntry!.cooldown_until} (entry '${whitelistEntry!.label ?? '(unlabeled)'}' ` +
        `in cooldown after sub-second failure burst — likely spoofing). Routing to agent.`
      )
    }

    if (!cooldownActive && whitelistEntry && E164_RE.test(whitelistEntry.forward_to)) {
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

      // XML-escape any value interpolated into a cXML attribute. The recording
      // callback URL carries TWO query params (?call_record_id=…&label=main), so
      // it contains a raw '&'. A bare '&' is illegal in XML — SignalWire fails to
      // parse the <Dial> document and kills the call sub-second, before any B-leg
      // or the action callback fires. (The AI/LiveKit path never hit this because
      // its recording URL has a single param and no '&'.) Must be &amp;.
      const xmlAttr = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      // Present the ORIGINAL caller's number so the user sees who's actually
      // calling (standard call-forwarding caller-ID passthrough; SignalWire
      // permits this, unlike Twilio's owned-number restriction). This was
      // previously pinned to +16043377899 as a workaround, but the real cause of
      // the sub-second forward failures was the unescaped '&' in the callback URL
      // (fixed above via xmlAttr) — not the caller ID. Fall back to the owned
      // Snapsonic number only if `from` is missing/malformed (so the leg still
      // has a valid callerId and connects).
      const E164 = /^\+[1-9]\d{6,14}$/
      const forwardCallerId = from && E164.test(from) ? from : MAGPIPE_MAIN_NUMBER
      console.log('Whitelist forward callerId:', forwardCallerId, '(original caller:', from, ')')
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${xmlAttr(forwardCallerId)}" record="record-from-answer" recordingStatusCallback="${xmlAttr(recordingCb)}" action="${xmlAttr(actionUrl)}">
    <Number>${xmlAttr(whitelistEntry.forward_to)}</Number>
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
      hourCycle: 'h23', // hour12:false can yield "24:xx" at midnight, breaking string compares
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

    // An overnight window (start > end, e.g. 23:00-05:00) spills past midnight
    // into the NEXT day, so the early-morning portion is owned by yesterday's row
    const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const prevDay = DAY_ORDER[(DAY_ORDER.indexOf(weekday) + 6) % 7]
    const prevSchedule = schedule[prevDay]
    const inPrevOvernight = !!(
      prevSchedule?.enabled &&
      prevSchedule.start > prevSchedule.end &&
      currentTime <= prevSchedule.end
    )

    if (!daySchedule) {
      console.log(`No schedule defined for ${weekday}, defaulting to available`)
      return true
    }

    if (!daySchedule.enabled) {
      console.log(`Schedule disabled for ${weekday}${inPrevOvernight ? ' but within previous day overnight window' : ''}`)
      return inPrevOvernight
    }

    // Compare times as strings (HH:MM format)
    const isWithin = daySchedule.start <= daySchedule.end
      ? currentTime >= daySchedule.start && currentTime <= daySchedule.end
      : currentTime >= daySchedule.start // overnight: tonight's portion; morning spill handled via prev day
    console.log(`Schedule check: ${weekday} ${currentTime} in ${daySchedule.start}-${daySchedule.end}: ${isWithin} (prevOvernight: ${inPrevOvernight})`)

    return isWithin || inPrevOvernight
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