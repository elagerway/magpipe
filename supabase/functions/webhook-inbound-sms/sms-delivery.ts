import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { redactPii } from '../_shared/pii-redaction.ts'
import { reportError } from '../_shared/error-reporter.ts'
import { dispatchWebhook } from '../_shared/webhook-dispatcher.ts'
import { describeBridge, languageName, normalizeLanguageCode } from '../_shared/languages.ts'

export async function sendSMS(
  userId: string,
  to: string,
  from: string,
  body: string,
  supabase: any,
  addOptOutText: boolean = true,
  piiStorage: string = 'enabled'
) {
  try {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Always reply from the number that received the message
    // This ensures conversation continuity and proper campaign compliance
    const fromNumber = from

    // Add opt-out instructions (USA SMS compliance) only when sending FROM a US number
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const fromIsUSNumber = await isUSNumber(fromNumber, supabase)
    const shouldAddOptOutText = addOptOutText && fromIsUSNumber
    const messageBody = shouldAddOptOutText ? `${body}\n\nSTOP to opt out` : body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/webhook-sms-status`

    const smsData = new URLSearchParams({
      From: fromNumber,
      To: to,
      Body: messageBody,
      StatusCallback: statusCallbackUrl,
    })

    const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
    const smsResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsData.toString(),
      }
    )

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text()
      console.error('SignalWire SMS send error:', errorText)
      await reportError(supabase, {
        error_type: 'signalwire_sms_send_failure',
        error_message: errorText,
        error_code: String(smsResponse.status),
        source: 'webhook-inbound-sms/sms-delivery',
        severity: 'error',
        metadata: { channel: 'sms', from: fromNumber, to, ai_reply: true },
        user_id: userId,
      }).catch(() => {})
    } else {
      const smsResult = await smsResponse.json()
      const messageSid = smsResult.sid
      console.log('SMS sent:', messageSid)

      // Log the outbound SMS (respect PII storage mode)
      let outboundContent: string | null = body
      if (piiStorage === 'disabled') {
        outboundContent = null
      } else if (piiStorage === 'redacted') {
        outboundContent = await redactPii(body)
      }

      const sentAt = new Date().toISOString()
      const { data: outboundRow } = await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          sender_number: fromNumber,
          recipient_number: to,
          direction: 'outbound',
          content: outboundContent,
          status: 'pending',
          message_sid: messageSid,
          sent_at: sentAt,
          is_ai_generated: true,
        })
        .select('id')
        .single()

      // Fire sms.sent webhook (fire-and-forget, AI-reply path).
      dispatchWebhook(supabase, userId, 'sms.sent', {
        sms_message_id: outboundRow?.id ?? null,
        agent_id: null,
        service_number: fromNumber,
        from_number: fromNumber,
        to_number: to,
        body: outboundContent,
        trigger: 'agent_reply',
        sent_at: sentAt,
      }).catch(err => console.error('🔔 sms.sent dispatch failed:', err))

      // Deduct credits for the AI-generated SMS (fire and forget)
      // Includes AI surcharge ($0.005) on top of base SMS rate ($0.01)
      deductSmsCredits(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        userId,
        1,
        true  // AI-generated reply
      ).catch(err => console.error('Failed to deduct SMS credits:', err))
    }
  } catch (error) {
    console.error('Error sending SMS:', error)
    reportError(supabase, {
      error_type: 'sms_send_failure',
      error_message: String((error as Error)?.message || error),
      error_code: 'sendSMS',
      source: 'supabase',
      severity: 'error',
      metadata: { to, from, user_id: userId },
      user_id: userId,
    }).catch(() => {})
  }
}

/**
 * Translate inbound + outbound SMS messages and cache translations in DB.
 * Called fire-and-forget when agentConfig.translate_to is set (e.g. "fr-en").
 */
export async function translateAndCacheSms(
  supabase: any,
  translateTo: string,
  contactNumber: string,
  serviceNumber: string,
  userId: string,
  inboundText: string,
  outboundText: string,
  slackThread: { channel: string; ts: string; accessToken: string } | null = null,
  slackTranslationsEnabled: boolean = true
) {
  const targetLang = translateTo.split('-').pop() || 'en'
  const targetLangName = languageName(targetLang) || targetLang

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Translate both texts to ${targetLangName}. Also detect the language the FIRST text was originally written in. ` +
            `Return ONLY JSON of the form {"source_lang":"<ISO 639-1 code of first text, e.g. zh, fr, en>","translations":["<first text translated>","<second text translated>"]}.`,
        },
        { role: 'user', content: JSON.stringify([inboundText, outboundText]) },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Translation API error:', errorText)
    await reportError(supabase, {
      error_type: 'openai_chat_failure',
      error_message: errorText,
      error_code: String(response.status),
      source: 'webhook-inbound-sms/translate',
      severity: 'error',
      metadata: { channel: 'sms', from: contactNumber, to: serviceNumber, model: 'gpt-4o-mini', purpose: 'translate' },
      user_id: userId,
    }).catch(() => {})
    return
  }

  const result = await response.json()
  const raw = result.choices[0].message.content.trim()
  let translations: string[]
  let sourceLang: string | null = null
  try {
    const parsed = JSON.parse(raw)
    // New shape: { source_lang, translations[] }. Tolerate the old bare-array shape.
    if (Array.isArray(parsed)) {
      translations = parsed
    } else {
      translations = parsed.translations || []
      sourceLang = normalizeLanguageCode(parsed.source_lang)
    }
  } catch {
    console.error('Failed to parse translation response:', raw)
    return
  }

  if (translations.length < 2) return

  // Only record a source language when it's a real cross-language bridge
  const sourceLangToStore = sourceLang && sourceLang !== normalizeLanguageCode(targetLang) ? sourceLang : null

  // Update the most recent inbound message from this contact
  const { data: inboundMsg } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('sender_number', contactNumber)
    .eq('recipient_number', serviceNumber)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (inboundMsg) {
    await supabase
      .from('sms_messages')
      .update({ translation: translations[0], source_language: sourceLangToStore })
      .eq('id', inboundMsg.id)
  }

  // Update the most recent outbound message to this contact
  const { data: outboundMsg } = await supabase
    .from('sms_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('sender_number', serviceNumber)
    .eq('recipient_number', contactNumber)
    .eq('direction', 'outbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (outboundMsg) {
    await supabase
      .from('sms_messages')
      .update({ translation: translations[1] })
      .eq('id', outboundMsg.id)
  }

  console.log('SMS translations cached for inbound:', inboundMsg?.id, 'outbound:', outboundMsg?.id)

  // Post translation as a Slack thread reply (if translations enabled)
  if (slackThread && translations[0] && slackTranslationsEnabled) {
    try {
      const bridge = describeBridge(sourceLangToStore, targetLang)
      const bridgeLabel = bridge ? ` (${bridge})` : ''
      const slackMessage = {
        channel: slackThread.channel,
        thread_ts: slackThread.ts,
        text: `Translation${bridgeLabel}: ${translations[0]}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Translation${bridgeLabel}:*\n>${translations[0].replace(/\n/g, '\n>')}`
            }
          }
        ]
      }

      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackThread.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      })

      const result = await resp.json()
      if (!result.ok) {
        console.error('Slack translation reply failed:', result.error)
      } else {
        console.log('Slack translation reply sent in thread')
      }
    } catch (err) {
      console.error('Error sending Slack translation reply:', err)
    }
  }
}

/**
 * Deduct credits for SMS messages
 */
export async function deductSmsCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  messageCount: number,
  aiGenerated: boolean = false
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'sms',
        messageCount,
        aiGenerated,
        referenceType: 'sms'
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} SMS${aiGenerated ? ' (AI reply)' : ''}, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}
