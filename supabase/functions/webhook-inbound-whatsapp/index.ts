/**
 * Meta WhatsApp Business API Webhook
 * Handles webhook verification (GET) and inbound messages (POST)
 * Routes messages to the assigned WhatsApp agent for AI reply
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { processAndReplyWhatsApp, transcribeWhatsAppAudio, sendWhatsAppMessage } from './ai-reply.ts'

const VERIFY_TOKEN = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')!

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

        for (const message of value.messages) {
          let messageText: string = ''
          const waMessageId: string = message.id

          if (message.type === 'text') {
            messageText = message.text?.body || ''
          } else if (message.type === 'audio') {
            const mediaId: string = message.audio?.id
            if (!mediaId) { console.log('Audio message missing media ID'); continue }
            const transcript = await transcribeWhatsAppAudio(mediaId, waAccount.access_token)
            if (!transcript) {
              await sendWhatsAppMessage(phoneNumberId, contactWaId, "Sorry, I couldn't transcribe your voice message. Please type your report instead.", waAccount.access_token)
              continue
            }
            messageText = `[Voice message transcript]: ${transcript}`
            console.log('Transcribed audio:', messageText)
          } else {
            console.log('Ignoring non-text/audio WhatsApp message type:', message.type)
            continue
          }

          console.log('Inbound WhatsApp message:', {
            from: contactWaId,
            to: phoneNumberId,
            body: messageText,
            waMessageId,
          })

          // Dedup: skip if we've already processed this message ID
          const { count: existingCount } = await supabase
            .from('sms_messages')
            .select('id', { count: 'exact', head: true })
            .eq('external_id', waMessageId)

          if ((existingCount ?? 0) > 0) {
            console.log('Duplicate WhatsApp message, skipping:', waMessageId)
            continue
          }

          // Store the inbound message
          const { data: insertedMsg, error: insertError } = await supabase
            .from('sms_messages')
            .insert({
              user_id: userId,
              agent_id: agentConfig?.id || null,
              sender_number: contactWaId,
              recipient_number: phoneNumberId,
              direction: 'inbound',
              content: messageText,
              status: 'delivered',
              sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
              channel: 'whatsapp',
              external_id: waMessageId,
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
              content: messageText,
              channel: 'whatsapp',
            }
          }

          fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }).catch(err => console.error('Failed to send email notification:', err))

          fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify(notificationData)
          }).catch(err => console.error('Failed to send push notification:', err))

          // If the account has a webhook_url, forward to external service instead of AI reply
          if (waAccount.webhook_url) {
            fetch(waAccount.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'whatsapp.received',
                from: contactWaId,
                content: messageText,
                phone_number_id: phoneNumberId,
                whatsapp_account_id: waAccount.id,
                message_id: waMessageId,
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

          // Fire-and-forget AI reply
          processAndReplyWhatsApp(
            userId,
            contactWaId,
            phoneNumberId,
            messageText,
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
