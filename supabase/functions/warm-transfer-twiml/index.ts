/**
 * Warm Transfer TwiML - Returns TwiML for various warm transfer states
 *
 * Actions:
 * - hold: Play hold music for caller
 * - unhold: Reconnect caller to LiveKit room
 * - consult: Connect transferee to LiveKit room for private consultation
 * - conference: Join caller/transferee to a SignalWire conference
 */

const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') || '378ads1njtd.sip.livekit.cloud'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

// Hold music URL - SignalWire's default or a custom one
const HOLD_MUSIC_URL = 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B4.mp3'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const roomName = url.searchParams.get('room')
  const confName = url.searchParams.get('conf_name')
  const serviceNumber = url.searchParams.get('service_number')

  console.log('🎵 Warm Transfer TwiML:', { action, roomName, confName })

  let twiml = ''

  switch (action) {
    case 'hold':
      // Play hold music in a loop
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${HOLD_MUSIC_URL}</Play>
</Response>`
      break

    case 'unhold':
      // Reconnect to LiveKit room
      // Use the original service number as the SIP URI target
      const unholdSipUri = `sip:${serviceNumber || '+16042566768'}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${unholdSipUri}</Sip>
  </Dial>
</Response>`
      break

    case 'consult':
      // Connect transferee to LiveKit room for private consultation with agent
      // The caller is on hold, so only agent + transferee can hear each other
      const consultSipUri = `sip:${serviceNumber || '+16042566768'}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please hold while we connect you.</Say>
  <Dial>
    <Sip>${consultSipUri}</Sip>
  </Dial>
</Response>`
      break

    case 'conference':
      // Join SignalWire conference for final bridged call
      // Record the conference for call recording
      const recordingCallbackUrl = `${SUPABASE_URL}/functions/v1/sip-recording-callback`
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference record="record-from-start" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${confName}</Conference>
  </Dial>
</Response>`
      break

    default:
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred.</Say>
  <Hangup/>
</Response>`
  }

  console.log('Returning TwiML:', twiml)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
})
