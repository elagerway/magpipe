import { isFraudBlocked } from '../_shared/fraud.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { reportError } from '../_shared/error-reporter.ts'
import {
  isOptOutMessage,
  isOptInMessage,
  recordOptOut,
  recordOptIn,
  getOptOutConfirmation,
  getOptInConfirmation,
  isOptedOut,
  USA_SENDER_NUMBER,
  CANADA_SENDER_NUMBER
} from '../_shared/sms-compliance.ts'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'
import { shouldNotify, getAppPrefs } from '../_shared/app-function-prefs.ts'
import { redactPii } from '../_shared/pii-redaction.ts'
import { checkBalance } from '../_shared/balance-check.ts'
import { processAndReplySMS } from './ai-reply.ts'
import { sendSMS, deductSmsCredits } from './sms-delivery.ts'
import { autoEnrichContact, sendSlackNotification } from './notifications.ts'
import { dispatchWebhook } from '../_shared/webhook-dispatcher.ts'
import { rehostInboundMedia } from '../_shared/inbound-media.ts'

/**
 * Bigram-set Jaccard similarity in [0, 1]. Robust to small paraphrase edits
 * ("Just let me know..." vs "Sure! Just let me know...") that defeat exact
 * string equality.
 */
function bigramSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.substring(i, i + 2))
    return set
  }
  const A = bigrams(norm(a))
  const B = bigrams(norm(b))
  if (A.size === 0 || B.size === 0) return 0
  let intersection = 0
  for (const g of A) if (B.has(g)) intersection++
  return intersection / Math.max(A.size, B.size)
}

/**
 * Detect a content loop: 3+ of the last 5 inbound messages from this sender
 * on this number are >=70% similar to the current body. Catches paraphrased
 * echoes from chatty counter-AIs that vary each reply. Called AFTER the
 * current inbound message is logged, so the current row contributes to the count.
 */
async function isContentLoop(supabase: any, from: string, to: string, body: string): Promise<boolean> {
  const normalized = body.trim().toLowerCase()
  if (!normalized) return false

  const { data: recentInbound } = await supabase
    .from('sms_messages')
    .select('content')
    .eq('sender_number', from)
    .eq('recipient_number', to)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!recentInbound || recentInbound.length === 0) return false

  const SIMILARITY_THRESHOLD = 0.7
  let similarCount = 0
  for (const m of recentInbound) {
    if (!m.content) continue
    if (bigramSimilarity(normalized, m.content) >= SIMILARITY_THRESHOLD) similarCount++
  }
  return similarCount >= 3
}

/**
 * Per-sender AI-reply rate limit. Backstops AI-to-AI loops where each side
 * paraphrases (so exact-match content-loop misses) by capping how many AI
 * replies we'll send to the same external number from the same service number
 * inside a short window. Real human SMS rarely exceeds this; bot loops blow
 * past it in seconds.
 */
async function isAiReplyRateLimited(
  supabase: any,
  serviceNumber: string,
  externalNumber: string,
  withinMinutes = 5,
  maxReplies = 8
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString()
  const { count } = await supabase
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_number', serviceNumber)
    .eq('recipient_number', externalNumber)
    .eq('direction', 'outbound')
    .eq('is_ai_generated', true)
    .gte('sent_at', since)
  return (count ?? 0) >= maxReplies
}

/**
 * Re-host SignalWire MMS media (which needs our Basic auth to download) into the
 * private media bucket and return fetchable signed URLs + the durable paths to
 * persist. Falls back to the raw URL per item on failure. MUST be called AFTER
 * the TwiML response is returned — downloading/uploading several images can
 * otherwise blow SignalWire's HTTP retrieval window (11200) and trigger retries.
 */
async function rehostMms(
  supabase: any,
  rawUrls: string[],
  messageSid: string,
): Promise<{ mediaUrls: string[]; mediaMetadata: { media: { url: string; path: string; mime_type: string }[] } | null }> {
  if (!rawUrls.length) return { mediaUrls: rawUrls, mediaMetadata: null }
  const swAuth = 'Basic ' + btoa(
    `${Deno.env.get('SIGNALWIRE_PROJECT_ID')}:${Deno.env.get('SIGNALWIRE_API_TOKEN')}`
  )
  const results = await Promise.all(rawUrls.map((raw, i) =>
    rehostInboundMedia(supabase, {
      downloadUrl: raw,
      authHeader: swAuth,
      bucket: 'whatsapp-media',
      pathPrefix: `sms/${messageSid}/${i}`,
    }).then(stored => ({ raw, stored }))
  ))
  const stored = results.filter(r => r.stored).map(r => ({ url: r.stored!.url, path: r.stored!.path, mime_type: r.stored!.mime_type }))
  return {
    mediaUrls: results.map(r => r.stored?.url ?? r.raw),
    mediaMetadata: stored.length ? { media: stored } : null,
  }
}

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string
    const numMedia = parseInt(formData.get('NumMedia') as string || '0')
    // Raw SignalWire MediaUrls — require our Basic auth to download, so they're
    // re-hosted to fetchable signed URLs below before any webhook forward.
    let mediaUrls: string[] = []
    for (let i = 0; i < numMedia; i++) {
      const url = formData.get(`MediaUrl${i}`)
      if (typeof url === 'string') mediaUrls.push(url)
    }

    console.log('Inbound SMS:', { to, from, body, messageSid, numMedia })

    // Check if the number is active
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Log inbound SMS webhook for observability
    supabase.from('webhook_logs').insert({
      webhook_type: 'sms',
      source: 'signalwire',
      event_type: 'inbound_sms',
      payload: { to, from, body: body?.substring(0, 200), messageSid, numMedia },
    }).then(({ error: logErr }) => { if (logErr) console.error('Webhook log insert error:', logErr) })

    // Loopback guard: drop SMS that is an echo of our own recent outbound.
    // Some carriers/forwarders deliver our outbound replies back as inbound
    // (e.g. a number where from === to), which would otherwise feed the AI
    // its own reply and spiral. Detect by checking for an outbound row with
    // the same from/to/body within the last 60s.
    //
    // Legit external messages with from === to (e.g. booking-system
    // notifications) have NO matching prior outbound and pass through.
    if (from && body && from === to) {
      const echoCutoff = new Date(Date.now() - 60_000).toISOString()
      const { count: echoCount } = await supabase
        .from('sms_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_number', from)
        .eq('recipient_number', to)
        .eq('direction', 'outbound')
        .eq('content', body)
        .gte('sent_at', echoCutoff)
      if ((echoCount ?? 0) > 0) {
        console.log('Dropping echo of our own outbound SMS:', from, '→', to)
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }
    }
    // Always drop SMS originating from our dedicated notification sender numbers
    // (send-notification-sms). These are Magpipe-internal and must never feed the AI.
    if (from === USA_SENDER_NUMBER || from === CANADA_SENDER_NUMBER) {
      console.log('Dropping SMS from Magpipe notification sender:', from, '→', to)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    const { data: serviceNumber, error } = await supabase
      .from('service_numbers')
      .select('*, users!inner(*)')
      .eq('phone_number', to)
      .eq('is_active', true)
      .single()

    if (error || !serviceNumber) {
      console.log('Number not active or not found:', to)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    // Blocklist gate. If `from` is on the recipient's per-user blocklist
    // (workspace-wide), drop the SMS silently: no AI reply, no inbox row,
    // no notifications. Mirrors webhook-inbound-call's <Reject reason="busy"/>
    // path. SignalWire delivers `from` already in E.164 so a direct .eq is
    // safe here.
    if (from) {
      // Global fraud list alongside the per-workspace blocklist — a fraudster
      // who can't call will text.
      const [{ data: blockHit, error: blockErr }, fraud] = await Promise.all([
        supabase
          .from('blocked_callers')
          .select('id, label')
          .eq('user_id', serviceNumber.user_id)
          .eq('caller_number', from)
          .maybeSingle(),
        isFraudBlocked(supabase, from, serviceNumber.user_id, 'sms'),
      ])

      if (fraud.blocked) {
        console.log(`Inbound SMS from ${from} → GLOBAL FRAUD BLOCK (risk=${fraud.entry?.risk_score ?? 'n/a'}). Silent drop.`)
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }

      if (blockErr) {
        console.warn('[webhook-inbound-sms] blocklist lookup non-fatal:', blockErr.message)
      } else if (blockHit) {
        console.log(`Inbound SMS from ${from} → blocked (entry ${blockHit.id}). Silent drop.`)
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }
    }

    console.log('Number is active, processing SMS for user:', serviceNumber.users.email)

    // Get agent config — only route to text agents (agent_type = 'text').
    // Voice agents are NEVER used for SMS even if assigned to the number.
    let agentConfig = null

    // 1. Explicit text agent assigned to this number
    if (serviceNumber.text_agent_id) {
      console.log('Routing SMS to assigned text_agent_id:', serviceNumber.text_agent_id)
      const { data: assignedAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('id', serviceNumber.text_agent_id)
        .eq('agent_type', 'text')
        .single()
      agentConfig = assignedAgent
    }

    // No fallback — if no text agent is explicitly assigned, don't guess.
    // The system agent check below will send the generic setup message.

    const agentId = agentConfig?.id || null
    console.log('Using agent for SMS:', agentId, agentConfig?.name || 'None')

    // Check if this is the system agent or no text agent assigned — auto-reply once and stop
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002'
    if (!agentConfig || agentConfig.id === SYSTEM_AGENT_ID) {
      // Save the inbound message
      const { data: sysInserted } = await supabase.from('sms_messages').insert({
        user_id: serviceNumber.user_id,
        agent_id: agentId,
        sender_number: from,
        recipient_number: to,
        direction: 'inbound',
        content: body || (numMedia > 0 ? '[image]' : ''),
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select('id').single()

      // Fire sms.received webhook even when no real agent is assigned —
      // customers tracking inbound messages on their numbers still need it.
      dispatchWebhook(supabase, serviceNumber.user_id, 'sms.received', {
        sms_message_id: sysInserted?.id ?? null,
        agent_id: agentId,
        service_number: to,
        from_number: from,
        to_number: to,
        body,
        media_urls: mediaUrls,
        received_at: new Date().toISOString(),
      }).catch(err => console.error('🔔 sms.received dispatch failed (system-agent path):', err))

      // Only send the auto-reply once — check if we've already replied to this sender on this number
      const { count } = await supabase
        .from('sms_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_number', to)
        .eq('recipient_number', from)
        .eq('direction', 'outbound')

      if ((count ?? 0) === 0) {
        console.log('No text agent on', to, '- sending one-time auto-reply to', from)
        const autoReply = 'This number is not currently assigned to an agent. Visit magpipe.ai to set up your messaging agent.'
        sendSMS(serviceNumber.user_id, from, to, autoReply, supabase, false)
      } else {
        console.log('No text agent on', to, '- auto-reply already sent to', from, ', staying silent')
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    // Return TwiML immediately to avoid SignalWire 11200 HTTP retrieval timeout.
    // All processing (sentiment, logging, AI reply, notifications) runs async after response.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    const response = new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })

    // Process the inbound SMS asynchronously (Deno keeps the promise alive after response)
    const processInbound = async () => {
      try {
        // Re-host MMS media now — after the TwiML response — so a multi-image MMS
        // can't blow SignalWire's HTTP retrieval window. Signed URLs go on the
        // sms.received forward; the durable paths are persisted on the row.
        const rehosted = await rehostMms(supabase, mediaUrls, messageSid)
        mediaUrls = rehosted.mediaUrls
        const mediaMetadata = rehosted.mediaMetadata

        // Analyze sentiment of the incoming message
        let messageSentiment: string | null = null
        try {
          messageSentiment = await analyzeSentiment(body)
          console.log(`SMS sentiment: ${messageSentiment}`)
        } catch (err) {
          console.error('Sentiment analysis failed:', err)
        }

        // Check PII storage mode
        const piiStorage = agentConfig?.pii_storage || 'enabled'

        // Determine what content to store based on PII mode
        let storeContent: string | null = body
        if (piiStorage === 'disabled') {
          storeContent = null
        } else if (piiStorage === 'redacted') {
          storeContent = await redactPii(body)
        }
        // Image-only MMS has no Body — keep content non-null (NOT NULL column)
        // and give the inbox a placeholder when we have the photo.
        if (!storeContent && piiStorage !== 'disabled' && mediaMetadata) {
          storeContent = '[image]'
        }

        // Log the message to database with agent_id and sentiment
        const { data: insertedMsg, error: insertError } = await supabase
          .from('sms_messages')
          .insert({
            user_id: serviceNumber.user_id,
            agent_id: agentId,
            sender_number: from,
            recipient_number: to,
            direction: 'inbound',
            content: storeContent,
            status: 'sent',
            sent_at: new Date().toISOString(),
            sentiment: messageSentiment,
            metadata: mediaMetadata,
          })
          .select('id')
          .single()

        const sessionId: string | null = insertedMsg?.id || null

        if (insertError) {
          console.error('Error logging SMS:', insertError)
          const { allowed: hasCreditsOnError } = await checkBalance(supabase, serviceNumber.user_id)
          if (hasCreditsOnError) {
            processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null, null)
          }
          return
        }

        // Run the content-loop check once and reuse the result for both the
        // sms.received dispatch gate (skip for traps) and the AI-reply gate
        // further down. Avoids a duplicate DB query and a duplicate `const`.
        const looping = await isContentLoop(supabase, from, to, body)

        // Fire sms.received webhook (fire-and-forget). Skip for content-loop
        // traps since those are noise — but still fire on opt-out replies, so
        // customers can track them. Body respects pii_storage same as the
        // stored sms_messages row.
        if (!looping) {
          dispatchWebhook(supabase, serviceNumber.user_id, 'sms.received', {
            sms_message_id: sessionId,
            agent_id: agentId,
            service_number: to,
            from_number: from,
            to_number: to,
            body: storeContent,
            media_urls: mediaUrls,
            received_at: new Date().toISOString(),
          }).catch(err => console.error('🔔 sms.received dispatch failed:', err))
        }

        // Deduct credits for inbound SMS (fire and forget)
        deductSmsCredits(supabaseUrl, supabaseKey, serviceNumber.user_id, 1)
          .catch(err => console.error('Failed to deduct inbound SMS credits:', err))

        // Auto-enrich contact if not exists (fire and forget)
        autoEnrichContact(serviceNumber.user_id, from, supabase)
          .catch(err => console.error('Auto-enrich error:', err))

        // Check for opt-out/opt-in keywords (USA SMS compliance)
        const { isUSNumber } = await import('../_shared/sms-compliance.ts')
        const toIsUSNumber = await isUSNumber(to, supabase)

        if (toIsUSNumber && isOptOutMessage(body)) {
          console.log('Opt-out message detected from:', from, 'to US number:', to)
          await recordOptOut(supabase, from)
          const confirmationMessage = getOptOutConfirmation()
          sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)
          return
        }

        if (toIsUSNumber && isOptInMessage(body)) {
          console.log('Opt-in message detected from:', from, 'to US number:', to)
          await recordOptIn(supabase, from)
          const confirmationMessage = getOptInConfirmation()
          sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)
          return
        }

        // Send new message notification (fire and forget)
        console.log('Sending new message notification for user:', serviceNumber.user_id)

        const notificationData = {
          userId: serviceNumber.user_id,
          agentId: agentId,
          type: 'new_message',
          data: {
            senderNumber: from,
            timestamp: new Date().toISOString(),
            content: body,
            channel: 'sms'
          }
        }

        // Send email, SMS, push notifications (fire and forget)
        fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send email notification:', err))

        fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send SMS notification:', err))

        fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send push notification:', err))

        fetch(`${supabaseUrl}/functions/v1/send-notification-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify(notificationData)
        }).catch(err => console.error('Failed to send Slack notification:', err))

        // Content loop detection — already computed above for the webhook gate.
        if (looping) {
          console.log(`Content loop detected from ${from}: paraphrased repeat in recent window, not responding`)
          return
        }

        // Per-sender AI-reply rate limit. Catches AI-to-AI loops that slip the
        // similarity check because both sides keep rewording.
        if (await isAiReplyRateLimited(supabase, to, from)) {
          console.log(`AI-reply rate limit hit for ${from} on ${to}: skipping reply`)
          return
        }

        // Check if user has credits before generating AI reply
        const { allowed: hasCreditsForReply } = await checkBalance(supabase, serviceNumber.user_id)
        if (!hasCreditsForReply) {
          console.log(`Skipping AI SMS reply for user ${serviceNumber.user_id}: insufficient credits`)
          return
        }

        const slackSmsEnabled = shouldNotify(agentConfig?.functions, 'slack', 'sms')
        if (slackSmsEnabled) {
          sendSlackNotification(serviceNumber.user_id, from, body, supabase)
            .then(slackThread => {
              processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, slackThread, sessionId)
            })
            .catch(err => {
              console.error('Failed to send Slack notification:', err)
              processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null, sessionId)
            })
        } else {
          processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null, sessionId)
        }
      } catch (err) {
        console.error('Error in async SMS processing:', err)
        reportError(supabase, {
          error_type: 'sms_processing_failure',
          error_message: String((err as Error)?.message || err),
          error_code: 'processInbound',
          source: 'supabase',
          severity: 'error',
          metadata: { from, to },
          user_id: serviceNumber.user_id,
        }).catch(() => {})
      }
    }

    // Fire async processing — don't await
    processInbound()

    return response
  } catch (error) {
    console.error('Error in webhook-inbound-sms:', error)
    const _sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await reportError(_sb, { error_type: 'edge_function_error', error_message: String(error.message || error), error_code: 'webhook-inbound-sms:outer', source: 'supabase' })
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  }
})
