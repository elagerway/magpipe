/**
 * Warm Transfer - Orchestrates attended call transfers using SignalWire SWML
 *
 * NEW Flow (using SignalWire AI with ElevenLabs voices):
 * 1. start: Put caller on hold in conference, dial transferee with AI agent
 * 2. AI agent briefs transferee and asks if available
 * 3. If accepted: caller is connected to conference with transferee
 * 4. If declined: caller hears message and is returned to LiveKit
 *
 * This approach uses SignalWire's native AI instead of trying to bridge to LiveKit,
 * which avoids the "new room creation" problem with inbound SIP.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

interface TransferState {
  actualCallerCallSid: string
  transferee_call_sid?: string
  conference_name: string
  target_number: string
  target_label?: string
  caller_number: string
  caller_context?: string
  service_number: string
  room_name: string
  voice_id?: string
  call_record_id?: string
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

      console.log('✅ Caller on hold in conference:', confName)

      // Step 2: Dial transferee with SignalWire AI agent (ElevenLabs voice)
      console.log('📞 Dialing transferee with AI agent:', target_number)

      let normalizedTarget = target_number.replace(/[^\d+]/g, '')
      if (!normalizedTarget.startsWith('+')) {
        if (normalizedTarget.length === 10) {
          normalizedTarget = '+1' + normalizedTarget
        } else if (normalizedTarget.length === 11 && normalizedTarget.startsWith('1')) {
          normalizedTarget = '+' + normalizedTarget
        }
      }

      // TwiML URL for whisper message to transferee
      const transfereeUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=ai_transfer&conf_name=${encodeURIComponent(confName)}&agent_name=${encodeURIComponent(agent_name)}&context=${encodeURIComponent(caller_context)}&voice_id=${encodeURIComponent(voice_id)}${callRecordId ? `&call_record_id=${encodeURIComponent(callRecordId)}` : ''}`

      // Recording callback for the transferee conversation
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
        // Bring caller back from hold
        await unholdCaller(actualCallerCallSid, room_name, signalwireAuth, service_number)
        return errorResponse('Failed to dial transferee', 500)
      }

      const dialResult = await dialResponse.json()
      console.log('✅ Transferee call initiated with AI agent:', dialResult.sid)

      // Store transfer state
      const transferState: TransferState = {
        actualCallerCallSid,
        transferee_call_sid: dialResult.sid,
        conference_name: confName,
        target_number: normalizedTarget,
        target_label,
        caller_number: caller_number || '',
        caller_context,
        service_number: service_number || '',
        room_name,
        voice_id,
        call_record_id: callRecordId,
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
          conference_name: confName,
          message: 'Caller on hold. AI agent is briefing the transferee.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (operation === 'complete') {
      // Note: With the SWML approach, the AI agent handles bridging automatically
      // via the connect_caller SWAIG function. This operation is for manual completion
      // or can be called if we need to programmatically complete the transfer.

      const { data: stateData } = await supabase
        .from('temp_state')
        .select('value')
        .eq('key', stateKey)
        .single()

      if (!stateData?.value) {
        return errorResponse('No active transfer found', 404)
      }

      const state = stateData.value as TransferState
      console.log('🔗 Completing warm transfer manually')
      console.log('📞 State:', JSON.stringify(state))

      // With SWML, the caller is in a conference. The AI agent joins the same
      // conference when transfer is accepted. So we just update state.

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

      console.log('✅ Transfer marked as complete')

      return new Response(
        JSON.stringify({
          success: true,
          status: 'bridged',
          message: 'Transfer complete. Caller and transferee are now connected.',
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

      // Hang up transferee call (the AI agent call)
      if (state.transferee_call_sid) {
        console.log('📞 Hanging up transferee call...')
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

      // Bring caller back to LiveKit from the hold conference
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
