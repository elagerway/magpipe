import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { AccessToken } from 'npm:livekit-server-sdk@2.6.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { roomName, identity, name } = await req.json()

    if (!roomName || !identity) {
      throw new Error('roomName and identity are required')
    }

    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')!
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')!

    // Create access token
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: name || identity,
      ttl: '10m', // Token valid for 10 minutes
    })

    // Grant permissions
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    })

    const jwt = await token.toJwt()

    console.log('✅ Generated LiveKit token for', identity, 'in room', roomName)

    return new Response(
      JSON.stringify({ token: jwt }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error generating LiveKit token:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
