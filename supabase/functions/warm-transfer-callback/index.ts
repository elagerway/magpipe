/**
 * Warm Transfer Callback - Handles callbacks from SignalWire AI functions
 *
 * Actions:
 * - connect: Transfer accepted, caller will be connected to conference
 * - decline: Transfer declined, notify caller and return to agent
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com'
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const confName = url.searchParams.get('conf_name')

  console.log('🔄 Warm Transfer Callback:', { action, confName })

  // Log the request body for debugging
  let body = {}
  try {
    body = await req.json()
    console.log('📥 Request body:', JSON.stringify(body))
  } catch {
    console.log('📥 No JSON body or parse error')
  }

  const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Find the transfer state by conference name
  const { data: stateRecords } = await supabase
    .from('temp_state')
    .select('key, value')
    .like('key', 'warm_transfer_%')

  let transferState = null
  let stateKey = null

  for (const record of stateRecords || []) {
    if (record.value?.conference_name === confName) {
      transferState = record.value
      stateKey = record.key
      break
    }
  }

  if (!transferState) {
    console.error('❌ No transfer state found for conference:', confName)
    // Return success anyway to not break the AI flow
    return new Response(
      JSON.stringify({ success: true, message: 'State not found, proceeding anyway' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  console.log('📋 Found transfer state:', JSON.stringify(transferState))

  if (action === 'connect') {
    // Transfer accepted - the caller is already in the conference (muted)
    // The transferee will join the conference after the AI finishes
    // We need to unmute the caller

    console.log('✅ Transfer accepted, unmuting caller in conference')

    // Update the transfer state
    await supabase.from('temp_state').update({
      value: { ...transferState, status: 'bridged' },
    }).eq('key', stateKey)

    await supabase.from('call_state_logs').insert({
      room_name: transferState.room_name,
      state: 'warm_transfer_connected',
      component: 'callback',
      details: JSON.stringify({ confName, action }),
    })

    // Note: The caller unmuting happens when they join the non-muted conference
    // We may need to update the caller's conference settings via SignalWire API
    // For now, the flow should work as the conference TwiML handles this

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transfer connected. Caller will be unmuted.',
        response: 'Great, connecting you now.'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } else if (action === 'decline') {
    // Transfer declined - notify caller and return to agent
    console.log('❌ Transfer declined, notifying caller and returning to agent')
    console.log('📋 Transfer state for decline:', JSON.stringify(transferState))

    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`)
    const agentNameParam = url.searchParams.get('agent_name') || 'your assistant'
    const roomName = transferState.room_name || ''
    const serviceNumber = transferState.service_number || ''
    const targetLabel = transferState.target_label || 'the person you requested'
    const callerContext = transferState.caller_context || ''
    const callRecordId = transferState.call_record_id || ''

    console.log('📞 Room name for decline redirect:', roomName, 'Service number:', serviceNumber, 'Target:', targetLabel, 'Call record:', callRecordId)

    // Redirect caller to declined notification, then back to LiveKit
    // Pass transfer context so agent knows this is a reconnect after declined transfer
    const declinedUrl = `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=caller_declined&room_name=${encodeURIComponent(roomName)}&agent_name=${encodeURIComponent(agentNameParam)}&service_number=${encodeURIComponent(serviceNumber)}&target_label=${encodeURIComponent(targetLabel)}&caller_context=${encodeURIComponent(callerContext)}&call_record_id=${encodeURIComponent(callRecordId)}`
    console.log('📞 Declined URL:', declinedUrl)

    console.log('📞 Calling SignalWire to redirect caller:', transferState.actualCallerCallSid)

    // Log to database for debugging
    await supabase.from('call_state_logs').insert({
      room_name: transferState.room_name,
      state: 'decline_redirect_attempt',
      component: 'callback',
      details: JSON.stringify({
        roomName,
        callerCallSid: transferState.actualCallerCallSid,
        declinedUrl
      }),
    })

    try {
      const swUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${transferState.actualCallerCallSid}.json`

      const response = await fetch(swUrl, {
          method: 'POST',
          headers: {
            'Authorization': signalwireAuth,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `Url=${encodeURIComponent(declinedUrl)}&Method=GET`,
        }
      )

      const responseText = await response.text()

      // Log result to database
      await supabase.from('call_state_logs').insert({
        room_name: transferState.room_name,
        state: response.ok ? 'decline_redirect_success' : 'decline_redirect_failed',
        component: 'callback',
        details: JSON.stringify({ status: response.status, response: responseText }),
      })

      if (!response.ok) {
        console.error('❌ Failed to redirect caller:', responseText)
      } else {
        console.log('✅ Caller redirect initiated')
      }
    } catch (e) {
      console.error('❌ Error redirecting caller:', e)
      await supabase.from('call_state_logs').insert({
        room_name: transferState.room_name,
        state: 'decline_redirect_error',
        component: 'callback',
        error_message: String(e),
      })
    }

    // Update the transfer state
    await supabase.from('temp_state').update({
      value: { ...transferState, status: 'declined' },
    }).eq('key', stateKey)

    await supabase.from('call_state_logs').insert({
      room_name: transferState.room_name,
      state: 'warm_transfer_declined',
      component: 'callback',
      details: JSON.stringify({ confName, action, target_label: targetLabel }),
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transfer declined. Caller returned to agent.',
        response: 'I understand. The caller will be notified.'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Unknown action' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  )
})
