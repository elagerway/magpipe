/**
 * Warm Transfer - Orchestrates attended call transfers
 *
 * PRIMARY flow (LiveKit room bridging — lowest latency):
 * 1. start: Put caller on hold, dial transferee INTO the LiveKit room via createSipParticipant
 * 2. AI agent briefs transferee in-room using its natural voice
 * 3. complete: Redirect caller back to the same LiveKit room via SIP
 * 4. Both parties are in the LiveKit room — WebRTC media relay, no conference bridge
 *
 * FALLBACK flow (SignalWire conference — if SIP outbound fails):
 * 1. start: Put caller on hold, dial transferee with streamlined whisper TwiML
 * 2. complete: Redirect caller to SignalWire conference
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SipClient, RoomServiceClient } from 'npm:livekit-server-sdk@2.14.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')!
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!
const OUTBOUND_TRUNK_ID = Deno.env.get('LIVEKIT_OUTBOUND_TRUNK_ID') || 'ST_gjX5nwd4CNYq'
const LIVEKIT_TRANSFER_ENABLED = Deno.env.get('LIVEKIT_TRANSFER_ENABLED') === 'true'

interface TransferState {
  actualCallerCallSid: string
  transferee_call_sid?: string
  livekit_participant_id?: string
  conference_name: string
  target_number: string
  target_label?: string
  caller_number: string
  caller_context?: string
  service_number: string
  room_name: string
  voice_id?: string
  call_record_id?: string
  transfer_mode: 'livekit' | 'conference'
  status: 'holding' | 'consulting' | 'bridged' | 'cancelled' | 'declined'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
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
      caller_context = 'a customer',  // Context about the caller for AI briefing
      voice_id = 'Rachel',            // ElevenLabs voice ID
      agent_name = 'your assistant',  // Name of the AI agent
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
        .select('id, vendor_call_id, call_sid')
        .eq('service_number', service_number)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lookupError) {
        console.error('📞 Error looking up call record:', lookupError)
      }

      let actualCallerCallSid = null
      let callRecordId = null
      if (callRecord) {
        actualCallerCallSid = callRecord.vendor_call_id || callRecord.call_sid
        callRecordId = callRecord.id
        console.log('📞 Found SignalWire call SID:', actualCallerCallSid, 'Call record ID:', callRecordId)
      } else {
        console.log('📞 No call record found for service_number:', service_number)
      }

      if (!actualCallerCallSid) {
        return errorResponse('Could not find the caller\'s call to transfer', 404)
      }

      // Generate unique conference name
      const confName = `transfer_${room_name}_${Date.now()}`

      // Step 1: Put caller on hold in a conference
      console.log('📞 Putting caller on hold in conference...')
      const holdUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=hold&conf_name=${encodeURIComponent(confName)}${callRecordId ? `&call_record_id=${encodeURIComponent(callRecordId)}` : ''}`

      const holdResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${actualCallerCallSid}.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(holdUrl)}&Method=GET`,
        }
      )

      if (!holdResponse.ok) {
        const error = await holdResponse.text()
        console.error('Failed to put caller on hold:', error)
        return errorResponse('Failed to put caller on hold', 500)
      }

      console.log('✅ Caller on hold:', confName)

      // Step 2: Dial transferee — try LiveKit room bridging first, fall back to SignalWire conference
      let normalizedTarget = target_number.replace(/[^\d+]/g, '')
      if (!normalizedTarget.startsWith('+')) {
        if (normalizedTarget.length === 10) {
          normalizedTarget = '+1' + normalizedTarget
        } else if (normalizedTarget.length === 11 && normalizedTarget.startsWith('1')) {
          normalizedTarget = '+' + normalizedTarget
        }
      }

      let transferMode: 'livekit' | 'conference' = 'conference'
      let transfereeCallSid: string | undefined
      let livekitParticipantId: string | undefined

      // ──────────────────────────────────────────────────────────────────
      // LIVEKIT ROOM BRIDGING (disabled — 2026-05-27)
      //
      // Goal: dial transferee directly into the LiveKit room via
      // createSipParticipant so both parties are in the WebRTC SFU
      // instead of a SignalWire conference bridge (lower audio latency).
      //
      // Status: DOES NOT WORK with SignalWire. createSipParticipant
      // hangs indefinitely — the SIP INVITE from LiveKit to SignalWire
      // never completes and never errors. This blocks the entire
      // transfer, leaving the caller stuck on hold with no fallback.
      //
      // The same outbound trunk (ST_gjX5nwd4CNYq) works fine for
      // livekit-outbound-call, but that creates a NEW room. Joining
      // an EXISTING room seems to be the issue — possibly a LiveKit
      // dispatch rule or SignalWire trunk config problem.
      //
      // To re-enable: change `false &&` to just test with
      // LIVEKIT_TRANSFER_ENABLED=true env var. The 5s Promise.race
      // timeout will prevent the hang. Needs investigation with
      // LiveKit support before turning on in production.
      // ──────────────────────────────────────────────────────────────────
      if (false && LIVEKIT_TRANSFER_ENABLED) try {
        console.log('📞 [PRIMARY] Dialing transferee into LiveKit room:', room_name)
        const livekitHttpUrl = LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://')
        const sipClient = new SipClient(livekitHttpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

        const sipResult = await Promise.race([
          sipClient.createSipParticipant(OUTBOUND_TRUNK_ID, normalizedTarget, room_name, {
            participantIdentity: `sip-transfer-${Date.now()}`,
            participantName: target_label || normalizedTarget,
            sipNumber: service_number || undefined,
            krispEnabled: true,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('LiveKit SIP timeout after 5s')), 5000)),
        ])

        livekitParticipantId = (sipResult as any).participantId
        transferMode = 'livekit'
        console.log('✅ [PRIMARY] Transferee dialed into LiveKit room:', livekitParticipantId)
      } catch (livekitError) {
        console.warn('⚠️ [PRIMARY] LiveKit SIP outbound failed:', livekitError)
        await supabase.from('call_state_logs').insert({
          room_name,
          state: 'livekit_sip_outbound_failed',
          component: 'warm-transfer',
          error_message: String(livekitError),
          details: JSON.stringify({ LIVEKIT_URL, OUTBOUND_TRUNK_ID, target: normalizedTarget, room: room_name }),
        }).catch(() => {})
      }

      if (transferMode === 'conference') {
        // SignalWire conference path — brief announce then instant conference join
        console.log('📞 [CONFERENCE] Dialing transferee with announce + conference')

        // Pre-warm the TwiML edge function so there's no cold start when the transferee answers
        const transfereeUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=announce_connect&conf_name=${encodeURIComponent(confName)}&agent_name=${encodeURIComponent(agent_name)}&caller_number=${encodeURIComponent(caller_number || 'unknown')}${callRecordId ? `&call_record_id=${encodeURIComponent(callRecordId)}` : ''}&room_name=${encodeURIComponent(room_name)}`
        fetch(transfereeUrl.replace('announce_connect', 'warmup'), { method: 'GET' }).catch(() => {})

        const transfereeRecordingUrl = `${SUPABASE_URL}/functions/v1/sip-recording-callback?label=transferee_consult${callRecordId ? `&call_record_id=${callRecordId}` : ''}`

        const dialFormBody = [
          `To=${encodeURIComponent(normalizedTarget)}`,
          `From=${encodeURIComponent(service_number || '+16042566768')}`,
          `Url=${encodeURIComponent(transfereeUrl)}`,
          `Method=GET`,
          `Record=record-from-answer`,
          `RecordingStatusCallback=${encodeURIComponent(transfereeRecordingUrl)}`,
          `RecordingStatusCallbackMethod=POST`,
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
          await unholdCaller(actualCallerCallSid, room_name, signalwireAuth)
          return errorResponse('Failed to dial transferee', 500)
        }

        const dialResult = await dialResponse.json()
        transfereeCallSid = dialResult.sid
        transferMode = 'conference'
        console.log('✅ [FALLBACK] Transferee call initiated via SignalWire:', transfereeCallSid)
      }

      // Store transfer state
      const transferState: TransferState = {
        actualCallerCallSid,
        transferee_call_sid: transfereeCallSid,
        livekit_participant_id: livekitParticipantId,
        conference_name: confName,
        target_number: normalizedTarget,
        target_label,
        caller_number: caller_number || '',
        caller_context,
        service_number: service_number || '',
        room_name,
        voice_id,
        call_record_id: callRecordId,
        transfer_mode: transferMode,
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
          transfer_mode: transferMode,
          transferee_call_sid: transfereeCallSid,
          livekit_participant_id: livekitParticipantId,
          conference_name: confName,
          message: transferMode === 'livekit'
            ? 'Caller on hold. Transferee dialed into LiveKit room.'
            : 'Caller on hold. Transferee dialed via SignalWire (fallback).',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'complete') {
      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState
      console.log('🔗 Completing warm transfer, mode:', state.transfer_mode)

      if (state.transfer_mode === 'livekit') {
        // PRIMARY: Redirect caller from hold back to the LiveKit room via SIP
        // Transferee is already in the room — caller joins them
        console.log('📞 [LIVEKIT] Redirecting caller back to LiveKit room:', state.room_name)
        await unholdCaller(state.actualCallerCallSid, state.room_name, signalwireAuth)
      } else {
        // FALLBACK (conference): The TwiML gather/callback already redirected the caller
        // into the conference when the transferee accepted. Just update state here.
        console.log('📞 [CONFERENCE] Complete — caller redirect handled by TwiML callback')
      }

      await supabase.from('temp_state').update({
        value: { ...state, status: 'bridged' },
      }).eq('key', stateKey)

      await supabase.from('call_state_logs').insert({
        room_name,
        state: 'warm_transfer_completed',
        component: 'agent',
        details: JSON.stringify({ ...state, status: 'bridged' }),
      })

      console.log('✅ Transfer complete')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'bridged',
          transfer_mode: state.transfer_mode,
          message: 'Transfer complete. Caller and transferee are now connected.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'cancel') {
      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState
      console.log('❌ Cancelling warm transfer, mode:', state.transfer_mode)

      // Hang up transferee
      if (state.transfer_mode === 'livekit' && state.livekit_participant_id) {
        // Remove transferee from LiveKit room
        console.log('📞 [LIVEKIT] Removing transferee from room:', state.livekit_participant_id)
        try {
          const roomClient = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
          await roomClient.removeParticipant(state.room_name, state.livekit_participant_id)
        } catch (e) {
          console.log('Transferee may have already left the room:', e)
        }
      } else if (state.transferee_call_sid) {
        // Hang up SignalWire call
        console.log('📞 [CONFERENCE] Hanging up transferee call:', state.transferee_call_sid)
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
          console.log('Transferee call may have already ended')
        }
      }

      // Bring caller back to LiveKit
      console.log('📞 Bringing caller back to LiveKit...')
      await unholdCaller(state.actualCallerCallSid, state.room_name, signalwireAuth)

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

      console.log('✅ Transfer cancelled - caller returned to agent')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'cancelled',
          message: 'Transfer cancelled. Caller is back with the agent.',
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
  // Redirect caller back to LiveKit room using TwiML with SIP dial
  // This takes them out of the hold conference and back to the agent
  const unholdUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=unhold&room_name=${encodeURIComponent(roomName)}`

  try {
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
  } catch (e) {
    console.error('Error unholding caller:', e)
  }
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
