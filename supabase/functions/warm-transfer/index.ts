/**
 * Warm Transfer - Orchestrates warm (attended) call transfers
 *
 * Operations:
 * - start: Put caller on hold, dial transferee to join LiveKit room
 * - complete: Bridge caller and transferee together
 * - cancel: Hang up transferee, bring caller back
 *
 * Flow:
 * 1. Caller is on SignalWire -> LiveKit SIP -> Agent
 * 2. Start: Update caller's call to play hold music, dial transferee to LiveKit
 * 3. Agent talks privately with transferee in LiveKit room
 * 4. Complete: Create SignalWire conference with caller + transferee + LiveKit (for recording)
 * 5. OR Cancel: Hang up transferee, update caller to rejoin LiveKit
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

interface TransferState {
  caller_call_sid: string
  transferee_call_sid?: string
  conference_name?: string
  target_number: string
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
      room_name,        // LiveKit room name (used as session key)
      target_number,    // Transfer destination number
      target_label,     // Optional human-readable label
      caller_call_sid,  // Original caller's SignalWire call SID
      caller_number,    // Caller's phone number (for context)
      service_number,   // Our service number (caller ID for outbound)
    } = await req.json()

    console.log(`🔄 Warm Transfer: ${operation}`, { room_name, target_number, caller_call_sid })

    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`)

    // Get/create transfer state from database
    const stateKey = `warm_transfer_${room_name}`

    if (operation === 'start') {
      if (!caller_call_sid || !target_number || !room_name) {
        return errorResponse('Missing required fields: caller_call_sid, target_number, room_name', 400)
      }

      // Step 1: Put caller on hold by updating their call with hold music TwiML
      console.log('📞 Putting caller on hold...')
      const holdTwimlUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=hold&room=${encodeURIComponent(room_name)}`

      const holdResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${caller_call_sid}.json`,
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

      // Step 2: Dial transferee to join LiveKit room
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

      // Create consultation room TwiML URL that connects to LiveKit
      const consultTwimlUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=consult&room=${encodeURIComponent(room_name)}&service_number=${encodeURIComponent(service_number || '')}`

      // Dial the transferee
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
        // Bring caller back off hold
        await unholdCaller(caller_call_sid, room_name, signalwireAuth)
        return errorResponse('Failed to dial transferee', 500)
      }

      const dialResult = await dialResponse.json()
      console.log('✅ Transferee call initiated:', dialResult.sid)

      // Store transfer state
      const transferState: TransferState = {
        caller_call_sid,
        transferee_call_sid: dialResult.sid,
        target_number: normalizedTarget,
        caller_number: caller_number || '',
        service_number: service_number || '',
        status: 'consulting',
      }

      // Store in call_state_logs for tracking
      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_started',
        metadata: transferState,
      })

      // Also store in a simple key-value for retrieval
      await supabase.from('temp_state').upsert({
        key: stateKey,
        value: transferState,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      })

      return new Response(
        JSON.stringify({
          success: true,
          status: 'consulting',
          transferee_call_sid: dialResult.sid,
          message: 'Caller on hold. Transferee being dialed. You can now speak with them privately.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'complete') {
      // Retrieve transfer state
      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState

      console.log('🔗 Completing warm transfer - bridging calls')

      // Create a unique conference name
      const conferenceName = `warm_xfer_${room_name}_${Date.now()}`

      // Update both calls to join the same conference
      const conferenceUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=conference&conf_name=${encodeURIComponent(conferenceName)}&room=${encodeURIComponent(room_name)}`

      // Move caller to conference
      console.log('📞 Moving caller to conference...')
      const callerConfResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${state.caller_call_sid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(conferenceUrl)}&Method=GET`,
        }
      )

      if (!callerConfResponse.ok) {
        console.error('Failed to move caller to conference')
      }

      // Move transferee to conference
      if (state.transferee_call_sid) {
        console.log('📞 Moving transferee to conference...')
        const transfereeConfResponse = await fetch(
          `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${state.transferee_call_sid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': signalwireAuth,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `Url=${encodeURIComponent(conferenceUrl)}&Method=GET`,
          }
        )

        if (!transfereeConfResponse.ok) {
          console.error('Failed to move transferee to conference')
        }
      }

      // Update state
      await supabase.from('temp_state').update({
        value: { ...state, status: 'bridged', conference_name: conferenceName },
      }).eq('key', stateKey)

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_completed',
        metadata: { ...state, conference_name: conferenceName },
      })

      console.log('✅ Warm transfer completed - all parties in conference:', conferenceName)

      return new Response(
        JSON.stringify({
          success: true,
          status: 'bridged',
          conference_name: conferenceName,
          message: 'Transfer complete. Caller and transferee are now connected.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'cancel') {
      // Retrieve transfer state
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

      // Hang up transferee if still connected
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
          console.log('Transferee may have already hung up:', e)
        }
      }

      // Bring caller back from hold
      console.log('📞 Bringing caller back from hold...')
      await unholdCaller(state.caller_call_sid, room_name, signalwireAuth)

      // Update state
      await supabase.from('temp_state').update({
        value: { ...state, status: 'cancelled' },
      }).eq('key', stateKey)

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_cancelled',
        metadata: state,
      })

      console.log('✅ Warm transfer cancelled - caller back on line')

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

async function unholdCaller(callerCallSid: string, roomName: string, signalwireAuth: string) {
  const unholdUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=unhold&room=${encodeURIComponent(roomName)}`

  const response = await fetch(
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

  if (!response.ok) {
    console.error('Failed to unhold caller:', await response.text())
  }
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
