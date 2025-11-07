import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SipClient, RoomServiceClient, AgentDispatchClient } from 'npm:livekit-server-sdk@2.14.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LiveKit outbound SIP trunk ID
const OUTBOUND_TRUNK_ID = 'ST_3DmaaWbHL9QT'

// Helper function to log call state to database
async function logCallState(
  supabase: any,
  callId: string | null,
  roomName: string,
  state: string,
  component: string,
  details?: any,
  errorMessage?: string
) {
  try {
    await supabase.from('call_state_logs').insert({
      call_id: callId,
      room_name: roomName,
      state,
      component,
      details: details ? JSON.stringify(details) : null,
      error_message: errorMessage,
    })
  } catch (err) {
    console.error('Failed to log call state:', err)
    // Don't throw - logging should never break the call flow
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('=== LIVEKIT OUTBOUND CALL START ===')

    const { phoneNumber, callerIdNumber, userId, recordCall } = await req.json()

    if (!phoneNumber || !userId) {
      throw new Error('phoneNumber and userId are required')
    }

    console.log('Outbound call request:', { phoneNumber, callerIdNumber, userId, recordCall })

    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const livekitUrl = Deno.env.get('LIVEKIT_URL')!
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')!
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')!

    const sipClient = new SipClient(livekitUrl, livekitApiKey, livekitApiSecret)
    const roomClient = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret)
    const dispatchClient = new AgentDispatchClient(livekitUrl, livekitApiKey, livekitApiSecret)

    // Get user's agent config
    console.log('Querying agent_configs for user_id:', userId)
    const { data: agentConfig, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (configError) {
      console.error('Agent config query error:', configError)
      throw new Error(`Agent config not found for user ${userId}: ${configError.message}. Please configure your voice AI agent in Settings.`)
    }

    if (!agentConfig) {
      throw new Error(`No agent configuration found for user ${userId}. Please configure your voice AI agent in Settings.`)
    }

    console.log('Agent config found:', { userId, active_voice_stack: agentConfig.active_voice_stack })

    // Verify user is on LiveKit stack
    if (agentConfig.active_voice_stack !== 'livekit') {
      throw new Error(`Outbound calling requires LiveKit stack (current: ${agentConfig.active_voice_stack || 'not set'}). Please switch to LiveKit in Settings.`)
    }

    // Generate unique room name for this call
    // Use 'call-' prefix to match LiveKit dispatch rules (same as inbound calls)
    // This ensures the agent automatically joins outbound rooms
    const roomName = `call-${userId}-${Date.now()}`
    console.log('Creating room:', roomName)

    // Log: Call initiated
    await logCallState(supabase, null, roomName, 'initiated', 'edge_function', {
      phone_number: phoneNumber,
      caller_id: callerIdNumber,
      user_id: userId,
    })

    // Create LiveKit room
    await roomClient.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 10,
      metadata: JSON.stringify({
        user_id: userId,
        direction: 'outbound',
        contact_phone: phoneNumber,
        service_number: callerIdNumber,
      }),
    })

    console.log('✅ Room created successfully')

    // Log: Room created
    await logCallState(supabase, null, roomName, 'room_created', 'edge_function', {
      room_name: roomName,
      max_participants: 10,
    })

    // Explicitly dispatch agent to the room
    // This replicates what SIP dispatch rules do for inbound calls
    console.log('📤 Dispatching agent to room...')
    try {
      const dispatch = await dispatchClient.createDispatch(roomName, 'SW Telephony Agent', {
        metadata: JSON.stringify({
          user_id: userId,
          direction: 'outbound',
          contact_phone: phoneNumber,
        }),
      })
      console.log('✅ Agent dispatched:', dispatch.id)

      // Log: Agent dispatched
      await logCallState(supabase, null, roomName, 'agent_dispatched', 'edge_function', {
        dispatch_id: dispatch.id,
        agent_name: 'SW Telephony Agent',
      })
    } catch (dispatchError) {
      console.error('❌ Failed to dispatch agent:', dispatchError)
      await logCallState(supabase, null, roomName, 'error', 'agent_dispatch', {
        error_type: 'agent_dispatch_failed',
      }, (dispatchError as any).message || String(dispatchError))
      // Don't throw - continue with call even if agent dispatch fails
    }

    // Create call record in database
    console.log('📝 Creating call record in database...')
    const { data: callRecord, error: callError } = await supabase
      .from('call_records')
      .insert({
        user_id: userId,
        caller_number: callerIdNumber || '+10000000000', // From number (service number)
        contact_phone: phoneNumber, // To number
        service_number: callerIdNumber || '+10000000000',
        direction: 'outbound',
        status: 'initiated',
        disposition: 'transferred_to_user',
        started_at: new Date().toISOString(),
        livekit_room_id: roomName,
      })
      .select()
      .single()

    if (callError) {
      console.error('❌ Failed to create call record:', callError)
      throw new Error(`Failed to create call record: ${callError.message}`)
    }

    console.log('✅ Call record created:', callRecord.id)

    // Create SIP participant (make the outbound call)
    console.log('📞 Creating SIP participant...')
    console.log('  → Dialing:', phoneNumber)
    console.log('  → From:', callerIdNumber)
    console.log('  → Trunk:', OUTBOUND_TRUNK_ID)
    console.log('  → Room:', roomName)
    console.log('  → Record:', recordCall)

    const sipOptions = {
      participantIdentity: `sip-outbound-${callRecord.id}`,
      participantName: phoneNumber,
      // Set the outbound caller ID number
      ...(callerIdNumber && { sipNumber: callerIdNumber }),
      // Enable noise reduction for better quality
      krispEnabled: true,
      // Enable recording if requested
      ...(recordCall && {
        // Recording will be handled by LiveKit egress webhook
      }),
    }

    console.log('  → SIP Options:', JSON.stringify(sipOptions, null, 2))

    let sipParticipant
    try {
      sipParticipant = await sipClient.createSipParticipant(
        OUTBOUND_TRUNK_ID,
        phoneNumber,
        roomName,
        sipOptions
      )
      console.log('✅ SIP participant created:', sipParticipant.participantId)
      console.log('  → SIP Call ID:', sipParticipant.sipCallId || 'N/A')

      // Log: SIP participant created
      await logCallState(supabase, callRecord.id, roomName, 'sip_participant_created', 'edge_function', {
        participant_id: sipParticipant.participantId,
        sip_call_id: sipParticipant.sipCallId,
        trunk_id: OUTBOUND_TRUNK_ID,
        to_number: phoneNumber,
        from_number: callerIdNumber,
      })
    } catch (sipError) {
      console.error('❌ Failed to create SIP participant:', sipError)
      console.error('  → Error details:', JSON.stringify(sipError, null, 2))

      // Log: SIP participant error
      await logCallState(supabase, callRecord.id, roomName, 'error', 'sip', {
        error_type: 'sip_participant_creation_failed',
        trunk_id: OUTBOUND_TRUNK_ID,
      }, (sipError as any).message || String(sipError))

      throw new Error(`Failed to create SIP participant: ${(sipError as any).message}`)
    }

    console.log('✅ SIP participant created - agent has been dispatched to room')

    // Update call record with SIP participant info
    await supabase
      .from('call_records')
      .update({
        status: 'ringing',
        livekit_call_id: sipParticipant.participantId,
      })
      .eq('id', callRecord.id)

    console.log('✅ Outbound call initiated successfully')

    return new Response(
      JSON.stringify({
        success: true,
        callId: callRecord.id,
        roomName,
        participantId: sipParticipant.participantId,
        message: 'Outbound call initiated'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in livekit-outbound-call:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
