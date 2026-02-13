/**
 * Conference Transfer - Creates a 3-way conference call
 *
 * When a transfer is requested:
 * 1. Creates a SignalWire conference
 * 2. Moves the caller into the conference
 * 3. Moves the agent (LiveKit SIP leg) into the same conference
 * 4. Dials the transferee to join the conference
 *
 * Result: All 3 parties (caller, agent, transferee) are in the same call
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const {
      caller_call_sid,      // The original caller's SignalWire call SID
      livekit_call_sid,     // The LiveKit SIP leg's call SID (if known)
      target_number,        // Number to transfer to
      target_label,         // Human-readable label (e.g., "Sales", "Rick")
      service_number,       // Caller ID for outbound leg
      room_name,            // LiveKit room name for logging
    } = await req.json()

    console.log('📞 Conference Transfer requested:', {
      caller_call_sid,
      livekit_call_sid,
      target_number,
      target_label,
      service_number,
      room_name,
    })

    if (!caller_call_sid || !target_number) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: caller_call_sid, target_number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`)

    // Create unique conference name
    const conferenceName = `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log('📞 Creating conference:', conferenceName)

    // TwiML URL that joins the conference
    const conferenceUrl = `${SUPABASE_URL}/functions/v1/conference-twiml?name=${encodeURIComponent(conferenceName)}&announce=${encodeURIComponent(target_label || 'transfer destination')}`

    // Step 1: Move the caller to the conference
    console.log('📞 Moving caller to conference...')
    const callerResponse = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${caller_call_sid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': signalwireAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `Url=${encodeURIComponent(conferenceUrl)}&Method=GET`,
      }
    )

    if (!callerResponse.ok) {
      const error = await callerResponse.text()
      console.error('Failed to move caller to conference:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to move caller to conference', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Caller moved to conference')

    // Step 2: If we have the LiveKit call SID, move it to the conference too
    // (The LiveKit leg needs to be in the same conference to maintain agent audio)
    if (livekit_call_sid) {
      console.log('📞 Moving LiveKit leg to conference...')
      const livekitResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${livekit_call_sid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(conferenceUrl)}&Method=GET`,
        }
      )

      if (!livekitResponse.ok) {
        console.error('Failed to move LiveKit leg to conference:', await livekitResponse.text())
        // Continue anyway - caller is already in conference
      } else {
        console.log('✅ LiveKit leg moved to conference')
      }
    }

    // Step 3: Dial the transferee to join the conference
    console.log('📞 Dialing transferee:', target_number)

    // Normalize target number
    let normalizedTarget = target_number.replace(/[^\d+]/g, '')
    if (!normalizedTarget.startsWith('+')) {
      if (normalizedTarget.length === 10) {
        normalizedTarget = '+1' + normalizedTarget
      } else if (normalizedTarget.length === 11 && normalizedTarget.startsWith('1')) {
        normalizedTarget = '+' + normalizedTarget
      }
    }

    const dialFormBody = [
      `To=${encodeURIComponent(normalizedTarget)}`,
      `From=${encodeURIComponent(service_number || '+16042566768')}`,
      `Url=${encodeURIComponent(conferenceUrl)}`,
      `Method=GET`,
      `StatusCallback=${encodeURIComponent(`${SUPABASE_URL}/functions/v1/conference-transfer-status`)}`,
      `StatusCallbackEvent=answered`,
      `StatusCallbackEvent=completed`,
      `StatusCallbackMethod=POST`,
    ].join('&')

    const dialResponse = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': signalwireAuth,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: dialFormBody,
      }
    )

    if (!dialResponse.ok) {
      const error = await dialResponse.text()
      console.error('Failed to dial transferee:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to dial transferee', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const dialResult = await dialResponse.json()
    console.log('✅ Transferee call initiated:', dialResult.sid)

    // Log to database
    await supabase.from('call_state_logs').insert({
      room_name: room_name || `conference_${conferenceName}`,
      state: 'conference_transfer_initiated',
      component: 'signalwire',
      details: JSON.stringify({
        conference_name: conferenceName,
        caller_call_sid,
        livekit_call_sid,
        transferee_call_sid: dialResult.sid,
        target_number: normalizedTarget,
        target_label,
      }),
    })

    return new Response(
      JSON.stringify({
        success: true,
        conference_name: conferenceName,
        transferee_call_sid: dialResult.sid,
        message: `Connecting you with ${target_label || 'the transfer destination'}. Please hold...`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in conference-transfer:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
