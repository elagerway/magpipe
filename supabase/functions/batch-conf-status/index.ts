/**
 * batch-conf-status — Conference participant status callback
 *
 * Called by SignalWire when a participant joins or leaves the agent
 * conference leg in outbound bridged calls (batch-call-cxml agent leg).
 *
 * On participant-leave: if conference is now empty, close the call record.
 *
 * Deploy: npx supabase functions deploy batch-conf-status --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const conf = new URL(req.url).searchParams.get('conf') || 'unknown'

    let event = 'unknown'
    let callSid = ''
    let currentParticipants = ''

    if (req.method === 'POST') {
      const body = await req.formData().catch(() => null)
      if (body) {
        event = body.get('StatusCallbackEvent') as string || 'unknown'
        callSid = body.get('CallSid') as string || ''
        currentParticipants = body.get('CurrentParticipants') as string || ''
      }
    }

    console.log(`batch-conf-status: conf=${conf} event=${event} callSid=${callSid} participants=${currentParticipants}`)

    // conf name is "outbound-{call_record_id}"
    const callRecordId = conf.replace(/^outbound-/, '')
    const isOutbound = !!(callRecordId && callRecordId !== conf)

    if (isOutbound) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      // When PSTN callee answers, stamp pstn_joined_at so the voice agent can detect it
      // and speak the greeting immediately instead of waiting for the callee to say something.
      // 2 participants = agent leg + PSTN leg (callee answered).
      if (event === 'participant-join' && parseInt(currentParticipants) >= 2) {
        const { error } = await supabase
          .from('call_records')
          .update({ pstn_joined_at: new Date().toISOString() })
          .eq('id', callRecordId)
          .is('pstn_joined_at', null) // only stamp once

        if (error) {
          console.error(`batch-conf-status: failed to stamp pstn_joined_at for ${callRecordId}:`, error)
        } else {
          console.log(`batch-conf-status: stamped pstn_joined_at for ${callRecordId}`)
        }
      }

      // When a participant leaves and conference is now empty, close the call record
      if (event === 'participant-leave' && currentParticipants === '0') {
        const { error } = await supabase
          .from('call_records')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString(),
          })
          .eq('id', callRecordId)
          .is('ended_at', null) // only update if not already closed

        if (error) {
          console.error(`batch-conf-status: failed to close call record ${callRecordId}:`, error)
        } else {
          console.log(`batch-conf-status: closed call record ${callRecordId} (conference empty)`)
        }
      }
    }

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  } catch (error) {
    console.error('batch-conf-status error:', error)
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
})
