import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SipClient, RoomServiceClient } from 'npm:livekit-server-sdk@2.6.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LiveKit outbound SIP trunk ID (with TLS on port 5061)
const OUTBOUND_TRUNK_ID = 'ST_gjX5nwd4CNYq'

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
    const roomName = `outbound-${userId}-${Date.now()}`
    console.log('Creating room:', roomName)

    // Create LiveKit room with agent
    await roomClient.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
      maxParticipants: 10,
    })

    console.log('Room created successfully')

    // Create call record in database
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
      console.error('Failed to create call record:', callError)
      throw new Error(`Failed to create call record: ${callError.message}`)
    }

    console.log('Call record created:', callRecord.id)

    // Create SIP participant (make the outbound call)
    console.log('Creating SIP participant to dial:', phoneNumber)

    const sipParticipant = await sipClient.createSipParticipant(
      OUTBOUND_TRUNK_ID,
      phoneNumber,
      roomName,
      {
        participantIdentity: `sip-outbound-${callRecord.id}`,
        participantName: phoneNumber,
        // Use caller ID if provided
        ...(callerIdNumber && { participantMetadata: JSON.stringify({ callerId: callerIdNumber }) }),
        // Enable noise reduction for better quality
        krispEnabled: true,
        // Enable recording if requested
        ...(recordCall && {
          // Recording will be handled by LiveKit egress webhook
        }),
      }
    )

    console.log('SIP participant created:', sipParticipant.participantId)

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
