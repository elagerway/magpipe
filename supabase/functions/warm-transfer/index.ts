/**
 * Warm Transfer - Orchestrates attended call transfers
 *
 * Flow:
 * 1. start: Put caller on hold, dial transferee to join agent in LiveKit
 * 2. complete: Bridge all parties together in a conference
 * 3. cancel: Hang up transferee, bring caller back from hold
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') || '378ads1njtd.sip.livekit.cloud'

// Hold music URL
const HOLD_MUSIC_URL = 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B4.mp3'

interface TransferState {
  actualCallerCallSid: string
  transferee_call_sid?: string
  conference_name?: string
  target_number: string
  target_label?: string
  caller_number: string
  service_number: string
  status: 'holding' | 'consulting' | 'bridged' | 'cancelled'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      operation,        // 'start' | 'complete' | 'cancel'
      room_name,        // LiveKit room name
      target_number,    // Transfer destination number
      target_label,     // Optional human-readable label
      caller_call_sid,  // Original caller's SignalWire call SID (optional - will be looked up if not provided)
      caller_number,    // Caller's phone number
      service_number,   // Our service number (caller ID for outbound)
    } = await req.json()

    console.log(`🔄 Warm Transfer: ${operation}`, { room_name, target_number, service_number })

    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`)
    const stateKey = `warm_transfer_${room_name}`

    if (operation === 'start') {
      if (!target_number || !room_name) {
        return errorResponse('Missing required fields: target_number, room_name', 400)
      }

      // ALWAYS look up SignalWire call SID from database
      // The caller_call_sid from agent is the LiveKit SIP call ID (SCL_...), not SignalWire UUID
      console.log('📞 Looking up SignalWire call SID from database...')
      console.log('📞 Service number:', service_number, 'Room name:', room_name)

      const { data: callRecord, error: lookupError } = await supabase
        .from('call_records')
        .select('vendor_call_id, call_sid')
        .eq('service_number', service_number)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lookupError) {
        console.error('📞 Error looking up call record:', lookupError)
      }

      let actualCallerCallSid = null
      if (callRecord) {
        actualCallerCallSid = callRecord.vendor_call_id || callRecord.call_sid
        console.log('📞 Found SignalWire call SID:', actualCallerCallSid)
      } else {
        console.log('📞 No call record found for service_number:', service_number)
      }

      if (!actualCallerCallSid) {
        return errorResponse('Could not find the caller\'s call to transfer', 404)
      }

      // Step 1: Put caller on hold
      console.log('📞 Putting caller on hold...')
      const holdTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please hold while I transfer you to ${target_label || 'our team'}.</Say>
  <Play loop="0">${HOLD_MUSIC_URL}</Play>
</Response>`

      // Create a data URL for the hold TwiML
      const holdTwimlUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=hold&target_label=${encodeURIComponent(target_label || '')}`

      const holdResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${actualCallerCallSid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(holdTwimlUrl)}&Method=GET`,
        }
      )

      if (!holdResponse.ok) {
        const error = await holdResponse.text()
        console.error('Failed to put caller on hold:', error)
        return errorResponse('Failed to put caller on hold', 500)
      }

      console.log('✅ Caller on hold')

      // Step 2: Dial transferee to join the LiveKit room (agent can talk privately)
      console.log('📞 Dialing transferee:', target_number)

      let normalizedTarget = target_number.replace(/[^\d+]/g, '')
      if (!normalizedTarget.startsWith('+')) {
        if (normalizedTarget.length === 10) {
          normalizedTarget = '+1' + normalizedTarget
        } else if (normalizedTarget.length === 11 && normalizedTarget.startsWith('1')) {
          normalizedTarget = '+' + normalizedTarget
        }
      }

      // TwiML to connect transferee to the EXISTING LiveKit room (use room_name, not service_number)
      const consultTwimlUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=consult&room_name=${encodeURIComponent(room_name)}`

      const dialFormBody = [
        `To=${encodeURIComponent(normalizedTarget)}`,
        `From=${encodeURIComponent(service_number || '+16042566768')}`,
        `Url=${encodeURIComponent(consultTwimlUrl)}`,
        `Method=GET`,
        `StatusCallback=${encodeURIComponent(`${SUPABASE_URL}/functions/v1/warm-transfer-status`)}`,
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
        // Bring caller back from hold
        await unholdCaller(actualCallerCallSid, room_name, signalwireAuth, service_number)
        return errorResponse('Failed to dial transferee', 500)
      }

      const dialResult = await dialResponse.json()
      console.log('✅ Transferee call initiated:', dialResult.sid)

      // Store transfer state
      const transferState: TransferState = {
        actualCallerCallSid,
        transferee_call_sid: dialResult.sid,
        target_number: normalizedTarget,
        target_label,
        caller_number: caller_number || '',
        service_number: service_number || '',
        status: 'consulting',
      }

      await supabase.from('temp_state').upsert({
        key: stateKey,
        value: transferState,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_started',
        component: 'agent',
        details: JSON.stringify(transferState),
      })

      return new Response(
        JSON.stringify({
          success: true,
          status: 'consulting',
          transferee_call_sid: dialResult.sid,
          message: 'Caller on hold. You can now speak privately with the transferee.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'complete') {
      // Get transfer state
      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState
      console.log('🔗 Completing warm transfer - bringing caller back to LiveKit')
      console.log('📞 State:', JSON.stringify(state))

      // The transferee is already in LiveKit (via SIP)
      // We need to bring the caller BACK to LiveKit (not to a separate conference)
      // This way all 3 parties (caller, transferee, agent) are in LiveKit together
      // The agent can then go silent and let them talk

      // Redirect caller back to LiveKit SIP using room_name
      const unholdUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=unhold&room_name=${encodeURIComponent(room_name)}`

      console.log('📞 Bringing caller back to LiveKit...')
      const callerResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${state.actualCallerCallSid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(unholdUrl)}&Method=GET`,
        }
      )

      if (!callerResponse.ok) {
        const error = await callerResponse.text()
        console.error('❌ Failed to bring caller back:', error)
        return errorResponse('Failed to reconnect caller', 500)
      }

      console.log('✅ Caller redirected back to LiveKit')

      // Update state
      await supabase.from('temp_state').update({
        value: { ...state, status: 'bridged' },
      }).eq('key', stateKey)

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_completed',
        component: 'agent',
        details: JSON.stringify({ ...state, status: 'bridged' }),
      })

      console.log('✅ All parties now in LiveKit together')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'bridged',
          message: 'Transfer complete. All parties are now connected. You can stay silent while they talk.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'cancel') {
      // Get transfer state
      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState
      console.log('❌ Cancelling warm transfer')

      // Hang up transferee
      if (state.transferee_call_sid) {
        console.log('📞 Hanging up transferee...')
        try {
          await fetch(
            `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${state.transferee_call_sid}.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': signalwireAuth,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'Status=completed',
            }
          )
        } catch (e) {
          console.log('Transferee may have already hung up')
        }
      }

      // Bring caller back
      console.log('📞 Bringing caller back from hold...')
      await unholdCaller(state.actualCallerCallSid, room_name, signalwireAuth, state.service_number)

      // Update state
      await supabase.from('temp_state').update({
        value: { ...state, status: 'cancelled' },
      }).eq('key', stateKey)

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_cancelled',
        component: 'agent',
        details: JSON.stringify(state),
      })

      console.log('✅ Transfer cancelled - caller back on line')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'cancelled',
          message: 'Transfer cancelled. Caller is back on the line.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else {
      return errorResponse(`Unknown operation: ${operation}`, 400)
    }

  } catch (error) {
    console.error('Error in warm-transfer:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function unholdCaller(callerCallSid: string, roomName: string, signalwireAuth: string, _serviceNumber?: string) {
  // Reconnect caller to LiveKit room using room_name in SIP URI
  const unholdUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=unhold&room_name=${encodeURIComponent(roomName)}`

  await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${callerCallSid}.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': signalwireAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `Url=${encodeURIComponent(unholdUrl)}&Method=GET`,
    }
  )
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
