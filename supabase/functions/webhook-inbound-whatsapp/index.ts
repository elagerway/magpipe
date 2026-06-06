/**
 * Meta WhatsApp Business API Webhook
 * Handles webhook verification (GET) and inbound messages (POST)
 * Routes messages to the assigned WhatsApp agent for AI reply
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { processAndReplyWhatsApp, transcribeWhatsAppAudio, sendWhatsAppMessage } from './ai-reply.ts'
import { fetchAndStoreWhatsAppMedia, type ForwardedMedia } from './media.ts'
import { normalizeE164 } from '../_shared/phone-e164.ts'

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

    // Process each entry (can have multiple)
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const phoneNumberId: string = value?.metadata?.phone_number_id

        if (!phoneNumberId) continue

        // Handle message status updates (delivered, read, failed) — just log, no action
        if (value.statuses && !value.messages) {
          for (const status of value.statuses) {
            console.log(`WhatsApp message status: ${status.status} for ${status.id}`)
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
          const { data: blockHit, error: blockErr } = await supabase
            .from('blocked_callers')
            .select('id, label')
            .eq('user_id', userId)
            .eq('caller_number', normalizedFrom)
            .maybeSingle()
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
            const mediaId: string = message.audio?.id
            if (!mediaId) { console.log('Audio message missing media ID'); continue }
            const transcript = await transcribeWhatsAppAudio(mediaId, waAccount.access_token, supabase, { userId, phoneNumberId, from: contactWaId })
            if (!transcript) {
              await sendWhatsAppMessage(phoneNumberId, contactWaId, "Sorry, I couldn't transcribe your voice message. Please type your report instead.", waAccount.access_token, supabase, { userId })
              continue
            }
            messageText = `[Voice message transcript]: ${transcript}`
            console.log('Transcribed audio:', messageText)
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
          } else {
            console.log('Ignoring unsupported WhatsApp message type:', message.type)
            continue
          }

          // content is NOT NULL — label any image (even one whose re-host failed,
          // so a dropped photo still surfaces as a non-empty event downstream).
          const storedContent: string = messageText || (isImage ? '[image]' : '')

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

          // Fire-and-forget AI reply
          processAndReplyWhatsApp(
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

    return new Response('OK', { status: 200 })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
