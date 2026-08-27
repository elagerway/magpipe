import { createClient } from 'npm:@supabase/supabase-js@2'
import { reportError } from '../_shared/error-reporter.ts'
import { formatLookupLine, lookupWithCache } from '../_shared/phone-lookup.ts'

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const callDuration = formData.get('CallDuration') as string

    // SignalWire attaches a reject/failure reason to status callbacks. Without
    // capturing these, a failed leg only records status='failed' with no "why"
    // (e.g. whitelist forwards rejected sub-second leave no trace in the DB —
    // the reason was only visible in the SignalWire dashboard). Persist them
    // onto the call_record so failures are diagnosable from Postgres.
    const sipResponseCode = formData.get('SipResponseCode') as string | null
    const errorCode = formData.get('ErrorCode') as string | null
    const errorMessage = formData.get('ErrorMessage') as string | null
    const dialCallStatus = formData.get('DialCallStatus') as string | null

    console.log('Call status update:', {
      callSid, callStatus, callDuration,
      sipResponseCode, errorCode, errorMessage, dialCallStatus,
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // First, get the call record to know user_id and phone info
    const { data: callRecord } = await supabase
      .from('call_records')
      .select('id, user_id, caller_number, contact_phone, direction, agent_id, disposition, service_number, call_summary, user_sentiment, recording_url, metadata')
      .or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)
      .single()

    // Update call record in database
    const updateData: any = {
      status: callStatus.toLowerCase(),
    }

    const durationSeconds = callDuration ? parseInt(callDuration) : 0

    if (callStatus === 'completed' && callDuration) {
      updateData.duration_seconds = durationSeconds
      updateData.ended_at = new Date().toISOString()
    } else if (callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      updateData.ended_at = new Date().toISOString()

      // Record the telephony failure reason (merge into existing metadata so we
      // don't clobber anything already written by other handlers).
      const failureDetail: Record<string, any> = {}
      if (sipResponseCode) failureDetail.sip_response_code = sipResponseCode
      if (errorCode) failureDetail.error_code = errorCode
      if (errorMessage) failureDetail.error_message = errorMessage
      if (dialCallStatus) failureDetail.dial_call_status = dialCallStatus
      if (Object.keys(failureDetail).length > 0) {
        failureDetail.call_status = callStatus.toLowerCase()
        failureDetail.recorded_at = new Date().toISOString()
        updateData.metadata = { ...(callRecord?.metadata || {}), telephony_failure: failureDetail }
        console.warn(`[webhook-call-status] telephony failure for ${callSid}:`, failureDetail)

        // Surface in admin/support → Errors. Forwarding rejects (whitelist
        // auto-forward) are the motivating case — they failed silently before.
        // Tag the disposition so a forward failure is distinguishable from a
        // normal AI-leg failure. Not added to CRITICAL_ERROR_TYPES, so this
        // logs to system_error_logs without paging out on every missed call.
        const isForwardFailure = callRecord?.disposition?.startsWith('forward')
        const failureReport = reportError(supabase, {
          error_type: isForwardFailure ? 'voice_forward_failure' : 'voice_call_failure',
          error_message:
            `${isForwardFailure ? 'Whitelist forward' : 'Voice call'} ${callStatus} — ` +
            `${errorMessage || dialCallStatus || 'no reason given'}` +
            (sipResponseCode ? ` (SIP ${sipResponseCode})` : '') +
            (errorCode ? ` [err ${errorCode}]` : ''),
          error_code: errorCode || sipResponseCode || callStatus,
          source: 'signalwire',
          severity: callStatus === 'no-answer' ? 'warning' : 'error',
          metadata: {
            channel: 'voice',
            call_sid: callSid,
            direction: callRecord?.direction,
            disposition: callRecord?.disposition,
            caller_number: callRecord?.caller_number,
            service_number: callRecord?.service_number,
            ...failureDetail,
          },
          user_id: callRecord?.user_id,
        })
        // @ts-ignore — EdgeRuntime available in Supabase edge runtime
        if (typeof EdgeRuntime !== 'undefined') {
          EdgeRuntime.waitUntil(failureReport)
        } else {
          failureReport.catch(err => console.error('reportError (telephony) failed:', err))
        }
      }
    }

    // Update by vendor_call_id (new multi-vendor architecture)
    // Also update call_sid for backward compatibility
    const { error } = await supabase
      .from('call_records')
      .update(updateData)
      .or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)

    if (error) {
      console.error('Error updating call status:', error)
    } else if (callRecord && (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer')) {
      const phoneNumber = callRecord.contact_phone || callRecord.caller_number
      const isMissed = callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer'

      // Run all notification logic in the background so we can return 200 to SignalWire
      // immediately. Without this, SignalWire retries the webhook (15s timeout) and the
      // user receives duplicate notifications.
      const backgroundWork = async () => {
        // For completed calls, wait for the voice agent to finish writing summary/sentiment
        // (agent.py needs an OpenAI round-trip after hang-up; this webhook fires immediately)
        let enrichedSummary: string | null = callRecord.call_summary || null
        let enrichedSentiment: string | null = callRecord.user_sentiment || null
        let enrichedRecordingUrl: string | null = callRecord.recording_url || null

        // Look up agent name and recording config upfront (needed for poll condition below)
        let agentName: string | null = null
        let agentRecordingEnabled = true
        let agentTranslateTo: string | null = null
        let agentLanguage: string | null = null
        if (callRecord.agent_id) {
          const { data: agentCfg } = await supabase
            .from('agent_configs')
            .select('name, recording_enabled, translate_to, language')
            .eq('id', callRecord.agent_id)
            .maybeSingle()
          agentName = agentCfg?.name || null
          agentRecordingEnabled = agentCfg?.recording_enabled !== false
          agentTranslateTo = agentCfg?.translate_to || null
          agentLanguage = agentCfg?.language || null
        }
        // Target language the caller's speech would have been translated/handled in:
        // the configured translate_to target, else the agent's own language.
        const targetLanguage = (agentTranslateTo ? agentTranslateTo.split('-').pop() : agentLanguage) || null

        // Poll until we have summary, sentiment, AND recording URL (if recording is enabled).
        // The recording callback fires a few seconds after call end — if summary/sentiment
        // are already written, the old condition skipped this loop and recording_url was missed.
        const shouldWaitForRecording = !isMissed && agentRecordingEnabled && !enrichedRecordingUrl
        if (!isMissed && (!enrichedSummary || shouldWaitForRecording)) {
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5000))
            const { data: freshRecord } = await supabase
              .from('call_records')
              .select('call_summary, user_sentiment, recording_url, recordings')
              .eq('id', callRecord.id)
              .single()
            enrichedSummary = freshRecord?.call_summary || null
            enrichedSentiment = freshRecord?.user_sentiment || null
            // Derive recording URL from recording_url column OR first non-null URL in recordings JSONB
            // (sip-recording-callback writes to recordings[] while sync-recording uploads; livekit-egress sets both)
            const recordingsArr: any[] = freshRecord?.recordings || []
            const firstRecordingUrl = recordingsArr.find((r: any) => r.url)?.url || null
            enrichedRecordingUrl = freshRecord?.recording_url || firstRecordingUrl || enrichedRecordingUrl
            const hasSummary = !!enrichedSummary
            const hasRecording = !agentRecordingEnabled || !!enrichedRecordingUrl
            if (hasSummary && hasRecording) {
              console.log(`✅ Got summary${agentRecordingEnabled ? '+recording' : ''} after ${(attempt + 1) * 5}s`)
              break
            }
            console.log(`⏳ Waiting for summary/recording... attempt ${attempt + 1}/12`)
          }
        }

        // Send email/SMS/push notifications for terminal call states
        const notificationType = isMissed ? 'missed_call' : 'completed_call'
        const notificationData = {
          userId: callRecord.user_id,
          agentId: callRecord.agent_id,
          type: notificationType,
          data: {
            callerNumber: phoneNumber,
            timestamp: new Date().toISOString(),
            duration: durationSeconds,
            successful: callStatus === 'completed',
            agentName,
            serviceNumber: callRecord.service_number,
            direction: callRecord.direction || 'inbound',
            callerSpoke: true, // overwritten below once the transcript is read
            callerLookup: null as string | null, // set below for unknown callers
            sessionId: callRecord.id,
            summary: enrichedSummary,
            sentiment: enrichedSentiment,
            recordingUrl: enrichedRecordingUrl,
            targetLanguage,
            sourceLanguage: null as string | null, // filled from the call record below
          }
        }

        // Fetch extracted data for skill trigger context
        let extractedData: Record<string, any> = {}
        let contactName: string | null = null
        // Whether the caller said anything. Gates the Slack delivery inside
        // execute-skill (SMS/email are unaffected) — transcript lines are
        // "Agent: …" / "Caller: …", so a non-empty Caller line is the signal.
        let callerSpoke = true
        {
          const { data: freshCall } = await supabase
            .from('call_records')
            .select('extracted_data, contact_id, source_language, transcript')
            .eq('id', callRecord.id)
            .single()
          extractedData = freshCall?.extracted_data || {}
          notificationData.data.sourceLanguage = freshCall?.source_language || null
          const transcript = freshCall?.transcript
          if (typeof transcript === 'string') callerSpoke = /^caller:\s*\S/im.test(transcript)
          notificationData.data.callerSpoke = callerSpoke
          if (freshCall?.contact_id) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name')
              .eq('id', freshCall.contact_id)
              .single()
            contactName = contact?.name || null
          }

          // Unknown caller → SignalWire number lookup (carrier/CNAM/line type),
          // so the owner has something to judge an unfamiliar number by.
          // SignalWire bills per query, so this is gated three ways: the caller
          // must not be a known contact, the lookup is cached per number, and
          // at least one channel that renders it must be switched on. Failures
          // are non-fatal — the notification goes out without the line.
          if (!freshCall?.contact_id && phoneNumber) {
            try {
              if (await lookupChannelEnabled(supabase, callRecord.user_id, callRecord.agent_id)) {
                const lookup = await lookupWithCache(supabase, phoneNumber)
                if (lookup) notificationData.data.callerLookup = formatLookupLine(lookup)
              }
            } catch (lookupErr) {
              console.warn('[webhook-call-status] caller lookup failed:', lookupErr)
            }
          }
        }

        await Promise.allSettled([
          fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }),
          // Trigger skills (e.g. Slack delivery) — skills handle service integrations
          callRecord.agent_id ? fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({
              event_type: 'call_ends',
              agent_id: callRecord.agent_id,
              trigger_context: {
                caller_phone: phoneNumber,
                contact_name: contactName,
                call_duration_seconds: durationSeconds,
                call_summary: enrichedSummary,
                user_sentiment: enrichedSentiment,
                recording_url: enrichedRecordingUrl,
                extracted_data: extractedData,
                direction: callRecord.direction || 'inbound',
                status: callStatus.toLowerCase(),
                session_id: callRecord.id,
                agent_name: agentName,
                caller_spoke: callerSpoke,
              }
            })
          }) : Promise.resolve(),
        ])
      }

      // Run background work (polls for summary/sentiment, sends notifications)
      // Use EdgeRuntime.waitUntil so the function stays alive after returning 200
      // This prevents SignalWire from retrying the webhook due to timeout
      // @ts-ignore — EdgeRuntime is available in Supabase edge function environment
      if (typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(backgroundWork())
      } else {
        backgroundWork().catch(err => console.error('Background notification error:', err))
      }
    }

    // Deduct credits for completed calls with duration
    if (callRecord && callStatus === 'completed' && durationSeconds > 0) {
      deductCallCredits(
        supabaseUrl,
        supabaseKey,
        callRecord.user_id,
        durationSeconds,
        callRecord.id
      ).catch(err => console.error('Failed to deduct credits:', err))
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error in webhook-call-status:', error)
    return new Response('OK', { status: 200 })
  }
})

/**
 * Is the unknown-caller lookup worth a billed query for this user? Only if a
 * channel that renders it is actually enabled. Mirrors the per-agent →
 * user-level preference resolution the send-notification-* functions use.
 * `caller_lookup` absent from a saved content_config means the user turned it
 * off; no config at all means the default templates apply, which include it.
 */
async function lookupChannelEnabled(supabase: any, userId: string, agentId: string | null): Promise<boolean> {
  let prefs = null
  if (agentId) {
    const { data } = await supabase.from('notification_preferences').select('sms_enabled, email_enabled, content_config')
      .eq('user_id', userId).eq('agent_id', agentId).maybeSingle()
    prefs = data
  }
  if (!prefs) {
    const { data } = await supabase.from('notification_preferences').select('sms_enabled, email_enabled, content_config')
      .eq('user_id', userId).is('agent_id', null).maybeSingle()
    prefs = data
  }
  if (!prefs) return false

  const renders = (channel: 'sms' | 'email') => {
    const cfg = prefs.content_config?.[channel]
    const fields: string[] = cfg?.fields || []
    // No config for this channel → default template, which carries the lookup.
    if (!cfg || fields.length === 0) return true
    return fields.includes('caller_lookup')
  }

  return (!!prefs.sms_enabled && renders('sms')) || (!!prefs.email_enabled && renders('email'))
}

/**
 * Deduct credits for a completed call
 */
async function deductCallCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  durationSeconds: number,
  callRecordId: string
) {
  try {
    // Get user's agent config to determine voice, LLM, and add-on rates
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('voice_id, llm_model, language, memory_enabled, semantic_memory_enabled, knowledge_source_ids, pii_storage')
      .eq(callRecord?.agent_id ? 'id' : 'user_id', callRecord?.agent_id || userId)
      .limit(1)
      .maybeSingle()

    // Determine active add-ons
    const addons: string[] = []
    const kbIds = agentConfig?.knowledge_source_ids || []
    if (kbIds.length > 0) addons.push('knowledge_base')
    if (agentConfig?.memory_enabled) addons.push('memory')
    if (agentConfig?.semantic_memory_enabled) addons.push('semantic_memory')
    if (agentConfig?.pii_storage === 'redacted') addons.push('pii_removal')

    // Call deduct-credits function
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'voice',
        durationSeconds,
        voiceId: agentConfig?.voice_id,
        aiModel: agentConfig?.llm_model,
        agentLanguage: agentConfig?.language,
        addons: addons.length > 0 ? addons : undefined,
        referenceType: 'call',
        referenceId: callRecordId
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${durationSeconds}s call (addons: ${addons.join(',') || 'none'}), balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting call credits:', error)
  }
}

