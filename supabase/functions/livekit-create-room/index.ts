// LiveKit Room Creation
// Creates a LiveKit room for incoming calls

import { createClient } from 'npm:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2.0.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const livekitUrl = Deno.env.get('LIVEKIT_URL')!
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')!
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')!

    const { userId, callId, callerNumber, callerName } = await req.json()

    if (!userId) {
      throw new Error('userId is required')
    }

    // Get user's agent config
    const { data: config, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (configError || !config) {
      throw new Error(`Agent config not found: ${configError?.message}`)
    }

    // Verify this user is using LiveKit stack
    if (config.active_voice_stack !== 'livekit') {
      throw new Error(`User is not on LiveKit stack (current: ${config.active_voice_stack})`)
    }

    // Generate unique room name
    const roomName = `call-${userId}-${Date.now()}`

    // Create access token for the room
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: `user-${userId}`,
      name: callerName || callerNumber || 'Unknown Caller',
    })

    // Grant permissions
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    })

    const token = await at.toJwt()

    // Store room info in database
    const { error: updateError } = await supabase
      .from('agent_configs')
      .update({
        livekit_room_id: roomName,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Failed to update livekit_room_id:', updateError)
    }

    // Create call record
    const { data: callRecord, error: callError } = await supabase
      .from('call_records')
      .insert({
        user_id: userId,
        direction: 'inbound',
        from_number: callerNumber,
        to_number: config.phone_number,
        status: 'in-progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (callError) {
      console.error('Failed to create call record:', callError)
    }

    return new Response(
      JSON.stringify({
        roomName,
        token,
        livekitUrl,
        callId: callRecord?.id,
        agentConfig: {
          systemPrompt: config.system_prompt,
          voiceId: config.voice_id,
          greeting: config.greeting_template,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error creating LiveKit room:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
