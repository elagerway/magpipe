/**
 * Meta WhatsApp Business API Webhook
 * Handles webhook verification (GET) and inbound messages (POST)
 * Routes messages to the assigned WhatsApp agent for AI reply
 */

import { isFraudBlocked } from '../_shared/fraud.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { processAndReplyWhatsApp, transcribeWhatsAppAudio, sendWhatsAppMessage } from './ai-reply.ts'
import { fetchAndStoreWhatsAppMedia, type ForwardedMedia } from './media.ts'
import { normalizeE164 } from '../_shared/phone-e164.ts'
import { reportError } from '../_shared/error-reporter.ts'

const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')!

/**
 * Bigram-set Jaccard similarity in [0, 1]. Robust to small paraphrase edits
 * that defeat exact string equality. Mirrors the SMS implementation in
 * `webhook-inbound-sms/index.ts`.
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
 * Detect a content loop on the WhatsApp channel: 3+ of the last 5 inbound
 * messages from this contact on this phone-number-id are >=70% similar to the
 * current body. Called AFTER the current inbound row is logged.
 */
async function isContentLoop(supabase: any, from: string, phoneNumberId: string, body: string): Promise<boolean> {
  const normalized = body.trim().toLowerCase()
  if (normalized.length === 0) return false

  const { data: recentInbound } = await supabase
    .from('sms_messages')
    .select('content')
    .eq('sender_number', from)
    .eq('recipient_number', phoneNumberId)
    .eq('direction', 'inbound')
    .eq('channel', 'whatsapp')
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
 * Per-contact AI-reply rate limit on the WhatsApp channel. Backstops AI-to-AI
 * loops that paraphrase past the similarity threshold by capping AI replies
 * from a given phone-number-id to a given external WA number inside a short
 * window.
 */
async function isAiReplyRateLimited(
  supabase: any,
  phoneNumberId: string,
  externalNumber: string,
  withinMinutes = 5,
  maxReplies = 8
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString()
  const { count } = await supabase
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_number', phoneNumberId)
    .eq('recipient_number', externalNumber)
    .eq('direction', 'outbound')
    .eq('channel', 'whatsapp')
    .eq('is_ai_generated', true)
    .gte('sent_at', since)
  return (count ?? 0) >= maxReplies
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── Webhook Verification (GET) ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WhatsApp webhook verified')
      return new Response(challenge, { status: 200 })
    }

    console.error('WhatsApp webhook verification failed. Token mismatch.')
    return new Response('Forbidden', { status: 403 })
  }

  // ── Inbound Message (POST) ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response('Bad Request', { status: 400 })
    }

    // Verify this is a WhatsApp event
    if (body.object !== 'whatsapp_business_account') {
      return new Response('OK', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ACK Meta immediately, then run all heavy work (media re-host, Whisper
    // transcription, AI reply) in the background. Doing it inline blows Meta's
    // short webhook deadline on a voice note and the isolate gets frozen
    // mid-chain (ack sent, but transcript/store/reply never finish).
    const processInbound = async () => {
     for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId: string = value?.metadata?.phone_number_id

        if (!phoneNumberId) continue

        // Handle message status callbacks (sent / delivered / read / failed).
        // Meta posts these to the same webhook (field stays "messages", with a
        // `statuses` array). Persist them so delivery state is visible: prior
        // code only console.logged, so `delivered_at` was never set and silent
        // drops (e.g. Meta dropping duplicate templates → error 131049) looked
        // identical to a successful "sent". Now a drop flips the row to failed
        // and lands in admin → Support → Errors with Meta's reason code.
        if (value.statuses && !value.messages) {
          // Monotonic ranking: Meta can deliver callbacks out of order or
          // duplicate them (it retries non-200s), so we never regress a row
          // to a lower-ranked status. 'read' and 'failed' are terminal.
          const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 3 }
          for (const status of value.statuses) {
            const wamid: string | undefined = status.id
            if (!wamid) continue
            const newStatus: string = status.status // sent | delivered | read | failed
            const tsIso = status.timestamp
              ? new Date(Number(status.timestamp) * 1000).toISOString()
              : new Date().toISOString()

            // One read up front: current status (monotonic guard + failure
            // dedup), delivered_at (don't clobber a real delivery time), and
            // user_id (failure attribution).
            const { data: msgRow } = await supabase
              .from('sms_messages')
              .select('status, delivered_at, user_id, metadata')
              .eq('external_id', wamid)
              .eq('channel', 'whatsapp')
              .maybeSingle()

            const curRank = STATUS_RANK[msgRow?.status ?? ''] ?? 0
            const newRank = STATUS_RANK[newStatus] ?? 0
            const alreadyFailed = msgRow?.status === 'failed'
            // Drop stale/duplicate callbacks that wouldn't advance the row.
            if (newRank < curRank || (newRank === curRank && newStatus === msgRow?.status)) {
              continue
            }

            // Parse Meta's failure detail up front so we can both stamp the row
            // and report it.
            const metaErr = newStatus === 'failed' && Array.isArray(status.errors) ? status.errors[0] : null
            const code = metaErr?.code != null ? String(metaErr.code) : 'unknown'
            const title = metaErr?.title || metaErr?.message || 'WhatsApp message failed'

            const update: Record<string, unknown> = { status: newStatus }
            // 'delivered' is the authoritative device-arrival event. 'read'
            // only backfills delivered_at when no 'delivered' callback arrived
            // (Meta sometimes skips it) — never overwrite a real delivery time.
            if (newStatus === 'delivered' || (newStatus === 'read' && !msgRow?.delivered_at)) {
              update.delivered_at = tsIso
            }
            // Stamp the failure reason onto the row so get_message/list_messages
            // can surface WHY a send failed (e.g. 131042 business-eligibility),
            // not just a bare "failed". Merge into existing metadata — never
            // clobber the customer/attribution data already stored there.
            if (newStatus === 'failed') {
              const existing = (msgRow?.metadata && typeof msgRow.metadata === 'object' && !Array.isArray(msgRow.metadata))
                ? msgRow.metadata as Record<string, unknown>
                : {}
              update.metadata = { ...existing, delivery_error: { code, reason: title, at: tsIso } }
            }

            const { error: upErr } = await supabase
              .from('sms_messages')
              .update(update)
              .eq('external_id', wamid)
              .eq('channel', 'whatsapp')
            if (upErr) console.error(`Failed to persist WA status for ${wamid}:`, upErr)

            // Report a failure once (the first 'failed' callback for this message).
            if (newStatus === 'failed' && !alreadyFailed) {
              console.error(`WhatsApp send failed for ${wamid}: [${code}] ${title}`)
              // severity 'error' for dashboard visibility; this error_type is NOT
              // in log-error's CRITICAL_ERROR_TYPES, so it does NOT fire SMS/Slack
              // alerts — benign duplicate-drops shouldn't page anyone.
              await reportError(supabase, {
                error_type: 'meta_whatsapp_delivery_failure',
                error_message: `WhatsApp delivery failed: ${title}`,
                error_code: code,
                source: 'webhook-inbound-whatsapp:status',
                severity: 'error',
                metadata: {
                  channel: 'whatsapp',
                  phone_number_id: phoneNumberId,
                  recipient_id: status.recipient_id ?? null,
                  wamid,
                  meta_error: metaErr ?? null,
                },
                user_id: msgRow?.user_id ?? undefined,
              }).catch(() => {})
            }
          }
          continue
        }

        if (!value.messages || value.messages.length === 0) continue

        // Look up the WhatsApp account and its owner
        const { data: waAccount, error: waError } = await supabase
          .from('whatsapp_accounts')
          .select('*, agent_configs(*, custom_functions(*))')
          .eq('phone_number_id', phoneNumberId)
          .eq('is_active', true)
          .single()

        if (waError || !waAccount) {
          console.log('No active WhatsApp account found for phone_number_id:', phoneNumberId)
          continue
        }

        const userId: string = waAccount.user_id
        const agentConfig = waAccount.agent_configs || null
        const contactProfile = value.contacts?.[0]
        const contactWaId: string = value.messages[0].from // e.g. "15551234567"

        // Blocklist gate. WhatsApp delivers `from` as bare digits without +,
        // so we normalize to E.164 before comparing against blocked_callers
        // (which stores +E164). Mirrors the SMS and call-webhook block paths.
        // Skip the entire batch if the contact is blocked — drop silently
        // (no inbox row, no notification, no AI reply).
        const normalizedFrom = normalizeE164(contactWaId)
        if (normalizedFrom) {
          const [{ data: blockHit, error: blockErr }, fraud] = await Promise.all([
            supabase
              .from('blocked_callers')
              .select('id, label')
              .eq('user_id', userId)
              .eq('caller_number', normalizedFrom)
              .maybeSingle(),
            // Global fraud list — same gate as the call and SMS paths.
            isFraudBlocked(supabase, normalizedFrom, userId, 'whatsapp'),
          ])

          if (fraud.blocked) {
            console.log(`Inbound WhatsApp from ${normalizedFrom} → GLOBAL FRAUD BLOCK (risk=${fraud.entry?.risk_score ?? 'n/a'}). Silent drop.`)
            continue
          }

          if (blockErr) {
            console.warn('[webhook-inbound-whatsapp] blocklist lookup non-fatal:', blockErr.message)
          } else if (blockHit) {
            console.log(`Inbound WhatsApp from ${normalizedFrom} → blocked (entry ${blockHit.id}). Silent drop.`)
            continue
          }
        }

        for (const message of value.messages) {
          const waMessageId: string = message.id
          // Meta sets context.id to the wamid being replied to when the super
          // taps "reply" on one of our outbound messages — an exact thread link.
          const replyContextId: string | null = message.context?.id || null

          // Dedup early — before any media download / transcription — so a
          // retried webhook doesn't re-upload media or re-run Whisper.
          const { count: existingCount } = await supabase
            .from('sms_messages')
            .select('id', { count: 'exact', head: true })
            .eq('external_id', waMessageId)

          if ((existingCount ?? 0) > 0) {
            console.log('Duplicate WhatsApp message, skipping:', waMessageId)
            continue
          }

          let messageText: string = ''
          let isImage = false
          const mediaItems: ForwardedMedia[] = []

          if (message.type === 'text') {
            messageText = message.text?.body || ''
          } else if (message.type === 'audio') {
            // Voice notes: re-host the audio (so it persists + forwards as the
            // customer's fallback, exactly like images) AND best-effort transcribe
            // it for the agent. NEVER drop the message — a failed transcription
            // must still leave a trace and forward the media, not silent nothing
            // (which is the bug this fixes).
            const mediaId: string = message.audio?.id
            if (mediaId) {
              // Instant ack while we transcribe; the contextual reply follows
              // once the transcript reaches the agent's LLM below.
              try {
                await sendWhatsAppMessage(phoneNumberId, contactWaId, 'Thanks for that, transcribing now…', waAccount.access_token, supabase, { userId })
              } catch (e) { console.warn('WA transcribing-ack send failed:', e) }
              const stored = await fetchAndStoreWhatsAppMedia(supabase, waAccount.access_token, mediaId, null, { phoneNumberId })
              if (stored) mediaItems.push(stored)
              else console.warn('WA audio could not be re-hosted:', mediaId)
              let transcript: string | null = null
              try {
                transcript = await transcribeWhatsAppAudio(mediaId, waAccount.access_token, supabase, { userId, phoneNumberId, from: contactWaId }, stored ? { url: stored.url, mime_type: stored.mime_type } : undefined)
              } catch (e) {
                console.error('WA audio transcription threw:', e)
              }
              if (transcript) {
                messageText = transcript  // feed to the agent as if it were typed text
                console.log('Transcribed audio:', transcript.slice(0, 120))
              } else {
                messageText = '[Voice note]'
                console.warn('WA audio transcription returned no text for media:', mediaId)
              }
            } else {
              console.log('Audio message missing media ID')
              messageText = '[Voice note]'
            }
          } else if (message.type === 'image') {
            // Re-host the photo (Meta media needs our token to download) so it
            // can reach whichever consumer this account uses — the Path B webhook
            // forward (media[]) or the agent's report tool (injected as images).
            isImage = true
            const mediaId: string = message.image?.id
            const caption: string = message.image?.caption || ''
            if (mediaId) {
              const stored = await fetchAndStoreWhatsAppMedia(supabase, waAccount.access_token, mediaId, caption, { phoneNumberId })
              if (stored) mediaItems.push(stored)
              else console.warn('WA image could not be re-hosted:', mediaId)
            }
            messageText = caption
          } else if (message.type === 'video' || message.type === 'document') {
            // Re-host video/document the same way so they persist + forward to
            // the customer's webhook (media[]) and surface in the inbox.
            const media: any = (message as any)[message.type]
            const mediaId: string = media?.id
            const caption: string = media?.caption || media?.filename || ''
            let stored: ForwardedMedia | null = null
            if (mediaId) {
              stored = await fetchAndStoreWhatsAppMedia(supabase, waAccount.access_token, mediaId, caption || null, { phoneNumberId })
              if (stored) mediaItems.push(stored)
              else console.warn(`WA ${message.type} could not be re-hosted:`, mediaId)
            }
            // An audio recording shared as a FILE/attachment (not a push-to-talk
            // voice note) arrives as document/video — still transcribe it so the
            // agent gets the report text, exactly like a voice note.
            const mimeType: string = stored?.mime_type || media?.mime_type || ''
            const isAudioFile = mimeType.startsWith('audio') ||
              /\.(opus|ogg|mp3|m4a|aac|wav|amr|mpeg|mpga)$/i.test(media?.filename || '')
            if (mediaId && isAudioFile) {
              try {
                await sendWhatsAppMessage(phoneNumberId, contactWaId, 'Thanks for that, transcribing now…', waAccount.access_token, supabase, { userId })
              } catch (e) { console.warn('WA transcribing-ack send failed:', e) }
              let transcript: string | null = null
              try {
                transcript = await transcribeWhatsAppAudio(mediaId, waAccount.access_token, supabase, { userId, phoneNumberId, from: contactWaId }, stored ? { url: stored.url, mime_type: stored.mime_type } : undefined)
              } catch (e) {
                console.error('WA audio-file transcription threw:', e)
              }
              messageText = transcript || caption || '[Voice note]'
              if (transcript) console.log('Transcribed audio file:', transcript.slice(0, 120))
              else console.warn('WA audio-file transcription returned no text for media:', mediaId)
            } else {
              messageText = caption || (message.type === 'video' ? '[video]' : '[document]')
            }
          } else {
            console.log('Ignoring unsupported WhatsApp message type:', message.type)
            continue
          }

          // content is NOT NULL — label any image (even one whose re-host failed,
          // so a dropped photo still surfaces as a non-empty event downstream).
          // Cap to stay under the sms_messages content CHECK (<=20000): a long
          // voice-note transcript must store + reply, never be rejected outright.
          const storedContent: string = (messageText || (isImage ? '[image]' : '')).slice(0, 19000)

          console.log('Inbound WhatsApp message:', {
            from: contactWaId,
            to: phoneNumberId,
            body: storedContent,
            waMessageId,
            media: mediaItems.length,
          })

          // Store the inbound message
          const { data: insertedMsg, error: insertError } = await supabase
            .from('sms_messages')
            .insert({
              user_id: userId,
              agent_id: agentConfig?.id || null,
              sender_number: contactWaId,
              recipient_number: phoneNumberId,
              direction: 'inbound',
              content: storedContent,
              status: 'delivered',
              sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
              channel: 'whatsapp',
              external_id: waMessageId,
              // Persist re-hosted photos so the AI reply path can attach them to
              // the report tool across turns, and so the inbox can display them.
              // Store `path` (durable, re-signable after the url expires) plus the
              // current signed `url` (used as-is within the live session).
              metadata: mediaItems.length
                ? { media: mediaItems.map(m => ({ url: m.url, path: m.path, mime_type: m.mime_type, caption: m.caption })) }
                : null,
            })
            .select('id')
            .single()

          const sessionId: string | null = insertedMsg?.id || null

          if (insertError) {
            console.error('Error storing WhatsApp message:', insertError)
            continue
          }

          // Send notifications (fire and forget)
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          const notificationData = {
            userId,
            agentId: agentConfig?.id || null,
            type: 'new_message',
            data: {
              senderNumber: contactWaId,
              timestamp: new Date().toISOString(),
              content: storedContent,
              channel: 'whatsapp',
            }
          }

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

          // If the account has a webhook_url, forward to external service instead
          // of AI reply (Path B — the customer owns the dialog). The forward
          // carries a stable thread id, any re-hosted media, and — for replies
          // to our outbound — the originating message's customer metadata.
          if (waAccount.webhook_url) {
            // Stable conversation/thread id: reuse the conversation_contexts row
            // (unique per super × our-number, shared with AI-pause bookkeeping).
            let conversationId: string | null = null
            const { data: convo } = await supabase
              .from('conversation_contexts')
              .upsert({
                user_id: userId,
                contact_phone: contactWaId,
                service_number: phoneNumberId,
                last_updated: new Date().toISOString(),
              }, { onConflict: 'user_id,contact_phone,service_number' })
              .select('id')
              .single()
            conversationId = convo?.id || null

            // Attribution. When the super taps "reply" on a specific outbound,
            // Meta gives us its wamid — trust that link verbatim, even if that
            // message carried no metadata (the customer can map it by the echoed
            // in_reply_to id). Only when there's no explicit reply do we fall
            // back to the most recent metadata-bearing outbound to this contact.
            // Falling back AFTER an explicit reply would risk attaching a
            // different project's metadata when a super is active on two
            // projects on the same number — exactly the case we must not break.
            let originMetadata: unknown = null
            let inReplyToMessageId: string | null = null
            let resolvedViaReply = false
            if (replyContextId) {
              const { data: orig } = await supabase
                .from('sms_messages')
                .select('external_id, metadata')
                .eq('user_id', userId)
                .eq('external_id', replyContextId)
                .maybeSingle()
              if (orig) {
                originMetadata = orig.metadata ?? null
                inReplyToMessageId = orig.external_id ?? replyContextId
                resolvedViaReply = true
              }
            }
            // normalizedFrom can be null for an unparseable wa_id; skip the
            // fallback then, or `null === null` would match an unrelated row.
            if (!resolvedViaReply && normalizedFrom) {
              // recipient_number is stored bare-digits by send-whatsapp-message
              // and +E164 by send-whatsapp-template, so normalize both sides.
              const { data: recentOut } = await supabase
                .from('sms_messages')
                .select('external_id, metadata, recipient_number')
                .eq('user_id', userId)
                .eq('channel', 'whatsapp')
                .eq('direction', 'outbound')
                .eq('sender_number', phoneNumberId)
                .not('metadata', 'is', null)  // only metadata-bearing rows, so a busy
                .order('sent_at', { ascending: false })  // non-metadata stream can't
                .limit(25)                                 // push the match out of range
              const match = recentOut?.find((r: any) =>
                normalizeE164(r.recipient_number) === normalizedFrom && r.metadata)
              if (match) {
                originMetadata = match.metadata
                inReplyToMessageId = match.external_id
              }
            }

            fetch(waAccount.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'whatsapp.received',
                conversation_id: conversationId,
                from: contactWaId,
                content: storedContent,
                // Strip the internal storage path — consumers get {url, mime_type, caption}.
                media: mediaItems.map(({ path: _p, ...m }) => m),
                phone_number_id: phoneNumberId,
                whatsapp_account_id: waAccount.id,
                message_id: waMessageId,
                context: inReplyToMessageId ? { in_reply_to_message_id: inReplyToMessageId } : null,
                metadata: originMetadata,
                timestamp: message.timestamp,
                contact_name: contactProfile?.profile?.name || null,
              }),
            }).catch(err => console.error('Failed to forward WhatsApp message to webhook_url:', err))
            continue
          }

          // Generate and send AI reply if agent is configured
          if (!agentConfig) {
            console.log('No WhatsApp agent configured for account:', waAccount.id)
            continue
          }

          if (agentConfig.is_active === false) {
            console.log('WhatsApp agent is inactive, not responding:', agentConfig.id)
            continue
          }

          // Loop guards — parity with SMS path. Run after the inbound row is
          // logged and notifications fire, so customer mirroring and human
          // operator alerts are unaffected; only the AI reply short-circuits.
          if (await isContentLoop(supabase, contactWaId, phoneNumberId, storedContent)) {
            console.log(`WhatsApp content loop detected from ${contactWaId}: paraphrased repeat in recent window, not responding`)
            continue
          }

          if (await isAiReplyRateLimited(supabase, phoneNumberId, contactWaId)) {
            console.log(`WhatsApp AI-reply rate limit hit for ${contactWaId} on ${phoneNumberId}: skipping reply`)
            continue
          }

          // AI reply — awaited so the background processInbound() (run via
          // EdgeRuntime.waitUntil) stays alive until the reply is actually sent,
          // instead of the isolate freezing mid-reply.
          await processAndReplyWhatsApp(
            userId,
            contactWaId,
            phoneNumberId,
            storedContent,
            supabase,
            agentConfig,
            waAccount.access_token,
            sessionId
          ).catch(err => console.error('Error processing WhatsApp reply:', err))
        }
      }
     }
    }
    // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processInbound().catch((e) => console.error('WA inbound processing error:', e)))
    } else {
      await processInbound().catch((e) => console.error('WA inbound processing error:', e))
    }

    return new Response('OK', { status: 200 })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
