import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Get authenticated user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const user = await resolveUser(req, supabaseClient)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { call_id } = await req.json()

    if (!call_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: call_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Terminating call:', { call_id, user_id: user.id })

    // Look up the call record to determine platform
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: callRecord } = await serviceClient
      .from('call_records')
      .select('voice_platform, vendor_call_id, livekit_call_id')
      .or(`id.eq.${call_id},vendor_call_id.eq.${call_id},livekit_call_id.eq.${call_id}`)
      .single()

    // Try LiveKit first (delete room)
    const livekitUrl = Deno.env.get('LIVEKIT_URL')
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')

    if (livekitUrl && livekitApiKey && livekitApiSecret) {
      // The call_id might be a room name (call-xxx format)
      const roomName = call_id.startsWith('call-') ? call_id : `call-${call_id}`

      try {
        // Import LiveKit SDK dynamically
        const { RoomServiceClient } = await import('npm:livekit-server-sdk@2')
        const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret)

        await roomService.deleteRoom(roomName)
        console.log('LiveKit room deleted:', roomName)

        return new Response(
          JSON.stringify({
            success: true,
            call_id: call_id,
            platform: 'livekit',
            status: 'terminated',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      } catch (livekitError) {
        console.log('LiveKit delete failed (may not exist):', livekitError.message)
        // Continue to try SignalWire
      }
    }

    // Try SignalWire
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpace = Deno.env.get('SIGNALWIRE_SPACE') || 'erik.signalwire.com'

    if (signalwireProjectId && signalwireToken) {
      const callSid = callRecord?.vendor_call_id || call_id
      const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`)

      const terminateResponse = await fetch(
        `https://${signalwireSpace}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls/${callSid}.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${signalwireAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'Status=completed',
        }
      )

      if (terminateResponse.ok) {
        console.log('SignalWire call terminated:', callSid)
        return new Response(
          JSON.stringify({
            success: true,
            call_id: call_id,
            platform: 'signalwire',
            status: 'terminated',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      } else {
        const errorText = await terminateResponse.text()
        console.error('SignalWire terminate failed:', errorText)
      }
    }

    // If we get here, neither platform worked
    return new Response(
      JSON.stringify({
        success: false,
        error: 'call_not_found',
        message: 'Call not found or already ended',
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in terminate-call:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
