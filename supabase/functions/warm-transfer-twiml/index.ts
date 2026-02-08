/**
 * Warm Transfer TwiML - Returns TwiML for various warm transfer states
 *
 * Actions:
 * - hold: Put caller on hold in conference with music
 * - unhold: Reconnect caller to LiveKit room
 * - ai_transfer: Use SignalWire AI with ElevenLabs to brief transferee
 * - conference: Join all parties to a SignalWire conference
 * - consult: (Legacy) Connect transferee to LiveKit room
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const LIVEKIT_SIP_DOMAIN = Deno.env.get('LIVEKIT_SIP_DOMAIN') || '378ads1njtd.sip.livekit.cloud'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Hold music URL - pleasant hold music
const HOLD_MUSIC_URL = 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B4.mp3'

// Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const confName = url.searchParams.get('conf_name')
  const serviceNumber = url.searchParams.get('service_number')
  const targetLabel = url.searchParams.get('target_label')
  const agentName = url.searchParams.get('agent_name') || 'your assistant'
  const callerContext = url.searchParams.get('context') || 'a customer'
  const voiceId = url.searchParams.get('voice_id') || 'Rachel'
  const callRecordId = url.searchParams.get('call_record_id') || ''

  console.log('🎵 Warm Transfer TwiML:', { action, confName, agentName, voiceId, callRecordId })

  let twiml = ''

  switch (action) {
    case 'hold':
      // Put caller on hold in a conference with music
      // They will be muted and hear hold music until the transfer completes
      const holdRecordingCallback = `${SUPABASE_URL}/functions/v1/sip-recording-callback?label=transfer_conference${callRecordId ? `&call_record_id=${callRecordId}` : ''}`
      if (confName) {
        // Caller joins conference and hears hold music until transferee joins
        // NOT muted - they can speak once transferee joins and music stops
        // Record the conference for the full transfer conversation
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="false" endConferenceOnExit="true" waitUrl="${HOLD_MUSIC_URL}" record="record-from-start" recordingStatusCallback="${holdRecordingCallback}">${escapeXml(confName)}</Conference>
  </Dial>
</Response>`
      } else {
        // Fallback to simple hold music if no conference name
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${HOLD_MUSIC_URL}</Play>
</Response>`
      }
      break

    case 'ai_transfer':
      // Wait for transferee to speak first (hello), then play whisper
      if (!confName) {
        console.error('❌ ai_transfer action requires conf_name parameter')
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transfer error. Please try again.</Say>
  <Hangup/>
</Response>`
        break
      }

      // First, wait for them to say hello - any speech triggers the whisper
      const whisperUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=whisper&conf_name=${encodeURIComponent(confName)}&agent_name=${encodeURIComponent(agentName)}`

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="10" speechTimeout="auto" action="${escapeXml(whisperUrl)}" method="POST">
    <Pause length="10"/>
  </Gather>
  <Redirect>${escapeXml(whisperUrl)}</Redirect>
</Response>`
      break

    case 'whisper':
      // Play the whisper message after they said hello, then gather response
      const whisperConfName = confName
      const neuralVoice = 'Polly.Joanna-Neural'
      const gatherCallbackUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=gather_response&conf_name=${encodeURIComponent(whisperConfName || '')}&agent_name=${encodeURIComponent(agentName)}`

      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="7" speechTimeout="auto" numDigits="1" action="${escapeXml(gatherCallbackUrl)}" method="POST">
    <Say voice="${neuralVoice}">Call from ${escapeXml(agentName)} on Magpipe. Hold the line to be connected, or say you're busy.</Say>
  </Gather>
  <Say voice="${neuralVoice}">Connecting you now.</Say>
  <Dial>
    <Conference beep="true" startConferenceOnEnter="true" endConferenceOnExit="true">${escapeXml(whisperConfName || 'default')}</Conference>
  </Dial>
</Response>`
      break

    case 'gather_response':
      // Handle the gather response from transferee
      // SignalWire sends form data in POST body
      let digits = url.searchParams.get('Digits')
      let speechResult = url.searchParams.get('SpeechResult')?.toLowerCase() || ''
      const gatherConfName = confName

      // Try to get from POST body if not in URL
      if (req.method === 'POST') {
        try {
          const formData = await req.formData()
          digits = digits || formData.get('Digits')?.toString() || null
          speechResult = speechResult || formData.get('SpeechResult')?.toString()?.toLowerCase() || ''
          console.log('📞 Form data:', { digits, speechResult })
        } catch (e) {
          console.log('📞 Could not parse form data:', e)
        }
      }

      console.log('📞 Gather response:', { digits, speechResult, confName: gatherConfName })

      // Only decline if they explicitly say no, busy, etc or press 2
      // Default to connecting for anything else (including hello, yes, silence, etc)
      const declined = digits === '2' ||
        speechResult.includes('no') ||
        speechResult.includes('busy') ||
        speechResult.includes('not available') ||
        speechResult.includes('can\'t') ||
        speechResult.includes('cannot') ||
        speechResult.includes('decline') ||
        speechResult.includes('later')

      console.log('📞 Decline check:', { declined, speechResult, digits })

      if (declined) {
        // Explicitly declined - trigger callback to notify caller and return to agent
        const declineCallbackUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-callback?action=decline&conf_name=${encodeURIComponent(gatherConfName || '')}&agent_name=${encodeURIComponent(agentName)}`

        // Make async call to callback (don't await - let TwiML finish)
        fetch(declineCallbackUrl, { method: 'POST' }).catch(e => console.error('Decline callback error:', e))

        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'll let ${escapeXml(agentName)} know. Goodbye.</Say>
  <Hangup/>
</Response>`
      } else {
        // Accept by default (including hello, yes, silence timeout, etc)
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you now.</Say>
  <Dial>
    <Conference beep="true" startConferenceOnEnter="true" endConferenceOnExit="true">${escapeXml(gatherConfName || 'default')}</Conference>
  </Dial>
</Response>`
      }
      break

    case 'caller_declined':
      // Notify the caller that the transferee is busy, then reconnect to agent
      const declinedRoomName = url.searchParams.get('room_name')
      const declinedServiceNumber = url.searchParams.get('service_number')
      const declinedCallerNumber = url.searchParams.get('From') // Original caller's number
      const declinedTargetLabel = url.searchParams.get('target_label') || ''
      const declinedCallerContext = url.searchParams.get('caller_context') || ''
      const declinedAgentName = agentName

      console.log('📞 caller_declined:', { declinedRoomName, declinedServiceNumber, declinedCallerNumber, declinedTargetLabel, declinedAgentName })

      // Log to database for debugging
      await supabase.from('call_state_logs').insert({
        room_name: declinedRoomName || 'unknown',
        state: 'caller_declined_twiml',
        component: 'twiml',
        details: JSON.stringify({ declinedRoomName, declinedServiceNumber, declinedCallerNumber, declinedTargetLabel, agentName: declinedAgentName, url: req.url }),
      })

      if (!declinedServiceNumber) {
        console.error('❌ Missing service_number for caller_declined')
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'm sorry, they're not available right now. Goodbye.</Say>
  <Hangup/>
</Response>`
        break
      }

      // Dial service number directly - let LiveKit dispatch a fresh agent
      // Use original caller's number as caller ID so LiveKit sees the right From
      // Pass transfer context via SIP headers so agent knows this is a reconnect
      const declinedSipUri = `sip:${declinedServiceNumber}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      const dialCallerId = declinedCallerNumber || declinedServiceNumber
      console.log('📞 Declined SIP URI (fresh dispatch):', declinedSipUri, 'callerId:', dialCallerId)

      // Add action URL to capture dial result
      const dialActionUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=dial_result&room_name=${encodeURIComponent(declinedRoomName || 'unknown')}`

      const reconnectRecordingCallback = `${SUPABASE_URL}/functions/v1/sip-recording-callback?label=reconnect_to_agent${callRecordId ? `&call_record_id=${callRecordId}` : ''}`
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I'm sorry, they're not available right now. Let me reconnect you.</Say>
  <Dial action="${escapeXml(dialActionUrl)}" callerId="${escapeXml(dialCallerId)}" timeout="30" record="record-from-answer" recordingStatusCallback="${reconnectRecordingCallback}">
    <Sip>${escapeXml(declinedSipUri)}</Sip>
  </Dial>
  <Say voice="Polly.Joanna-Neural">I was unable to reconnect you. Please call back.</Say>
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
      // Use raw room name but XML-escape for TwiML
      const unholdSipUri = `sip:${unholdRoomName}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      const unholdRecordingCallback = `${SUPABASE_URL}/functions/v1/sip-recording-callback?label=back_to_agent${callRecordId ? `&call_record_id=${callRecordId}` : ''}`
      console.log('📞 Unhold SIP URI:', unholdSipUri)
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer" recordingStatusCallback="${unholdRecordingCallback}">
    <Sip>${escapeXml(unholdSipUri)}</Sip>
  </Dial>
</Response>`
      break

    case 'consult':
      // Connect transferee to the EXISTING LiveKit room
      const roomName = url.searchParams.get('room_name')
      const consultServiceNumber = url.searchParams.get('service_number')
      if (!consultServiceNumber || !roomName) {
        console.error('❌ Consult action requires service_number and room_name parameters')
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transfer error. Please try again.</Say>
  <Hangup/>
</Response>`
        break
      }
      // Use service number to match the LiveKit trunk
      // Pass room name in X-Lk-Room-Name SIP header to join existing room
      const consultSipUri = `sip:${consultServiceNumber}@${LIVEKIT_SIP_DOMAIN};transport=tls`
      console.log('📞 Consult SIP URI:', consultSipUri, 'Target room:', roomName)

      // Use SignalWire's SIP header syntax
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>
      <Uri>${consultSipUri}</Uri>
      <Header name="X-Lk-Room-Name" value="${roomName}"/>
    </Sip>
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

    case 'dial_result':
      // Log the result of a SIP dial attempt
      const dialRoomName = url.searchParams.get('room_name')
      let dialStatus = url.searchParams.get('DialCallStatus') || url.searchParams.get('DialStatus')
      let sipResponseCode = url.searchParams.get('DialSipResponseCode') || url.searchParams.get('SipResponseCode')

      // Try to get from POST body
      if (req.method === 'POST') {
        try {
          const formData = await req.formData()
          dialStatus = dialStatus || formData.get('DialCallStatus')?.toString() || formData.get('DialStatus')?.toString()
          sipResponseCode = sipResponseCode || formData.get('DialSipResponseCode')?.toString() || formData.get('SipResponseCode')?.toString()
        } catch (e) {
          console.log('📞 Could not parse form data:', e)
        }
      }

      console.log('📞 Dial result:', { dialRoomName, dialStatus, sipResponseCode, allParams: Object.fromEntries(url.searchParams) })

      await supabase.from('call_state_logs').insert({
        room_name: dialRoomName || 'unknown',
        state: 'dial_result',
        component: 'twiml',
        details: JSON.stringify({ dialStatus, sipResponseCode, url: req.url }),
      })

      // If dial failed, say goodbye
      if (dialStatus !== 'answered' && dialStatus !== 'completed') {
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">I was unable to reconnect you. Please call back. Goodbye.</Say>
  <Hangup/>
</Response>`
      } else {
        // Dial succeeded - shouldn't really get here but just in case
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`
      }
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
