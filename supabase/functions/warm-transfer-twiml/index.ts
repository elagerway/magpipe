/**
 * Warm Transfer TwiML - Returns TwiML for various warm transfer states
 *
 * Actions:
 * - hold: Play hold music for caller (with announcement)
 * - unhold: Reconnect caller to LiveKit room
 * - consult: Connect transferee to LiveKit room for private consultation
 * - conference: Join all parties to a SignalWire conference
 */

const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') || '378ads1njtd.sip.livekit.cloud'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

// Hold music URL - pleasant hold music
const HOLD_MUSIC_URL = 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B4.mp3'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const confName = url.searchParams.get('conf_name')
  const serviceNumber = url.searchParams.get('service_number')
  const targetLabel = url.searchParams.get('target_label')

  console.log('🎵 Warm Transfer TwiML:', { action, confName, serviceNumber, targetLabel })

  let twiml = ''

  switch (action) {
    case 'hold':
      // Play hold music only - agent speaks the announcement before this
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${HOLD_MUSIC_URL}</Play>
</Response>`
      break

    case 'unhold':
      // Reconnect to EXISTING LiveKit room via SIP - use room_name in URI
      const unholdRoomName = url.searchParams.get('room_name')
      if (!unholdRoomName) {
        console.error('❌ Unhold action requires room_name parameter')
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Unable to reconnect. Please call back.</Say>
  <Hangup/>
</Response>`
        break
      }
      const unholdSipUri = `sip:${unholdRoomName}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      console.log('📞 Unhold SIP URI:', unholdSipUri)
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${unholdSipUri}</Sip>
  </Dial>
</Response>`
      break

    case 'consult':
      // Connect transferee to the EXISTING LiveKit room - use room_name in SIP URI
      // Using room_name ensures they join the same room where agent/caller are
      const roomName = url.searchParams.get('room_name')
      if (!roomName) {
        console.error('❌ Consult action requires room_name parameter')
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transfer error. Please try again.</Say>
  <Hangup/>
</Response>`
        break
      }
      // Use room name as the SIP destination - this joins the existing room
      const consultSipUri = `sip:${roomName}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      console.log('📞 Consult SIP URI:', consultSipUri)
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${consultSipUri}</Sip>
  </Dial>
</Response>`
      break

    case 'conference':
      // Join SignalWire conference for final bridged call
      // All parties (caller, transferee, optionally agent) are now connected
      const recordingCallbackUrl = `${SUPABASE_URL}/functions/v1/sip-recording-callback`
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference record="record-from-start" recordingStatusCallback="${recordingCallbackUrl}" recordingStatusCallbackMethod="POST" beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${confName || 'default_conference'}</Conference>
  </Dial>
</Response>`
      break

    default:
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">An error occurred with the transfer.</Say>
  <Hangup/>
</Response>`
  }

  console.log('Returning TwiML:', twiml)

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
})
