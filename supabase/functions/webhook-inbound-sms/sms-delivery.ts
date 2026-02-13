import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { redactPii } from '../_shared/pii-redaction.ts'

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

    const smsData = new URLSearchParams({
      From: fromNumber,
      To: to,
      Body: messageBody,
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
    } else {
      const smsResult = await smsResponse.json()
      console.log('SMS sent:', smsResult.sid)

      // Log the outbound SMS (respect PII storage mode)
      let outboundContent: string | null = body
      if (piiStorage === 'disabled') {
        outboundContent = null
      } else if (piiStorage === 'redacted') {
        outboundContent = await redactPii(body)
      }

      await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          sender_number: fromNumber,
          recipient_number: to,
          direction: 'outbound',
          content: outboundContent,
          status: 'sent',
          sent_at: new Date().toISOString(),
          is_ai_generated: true,
        })

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
  const langNames: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' }
  const targetLangName = langNames[targetLang] || targetLang

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
      messages: [
        { role: 'system', content: `Translate to ${targetLangName}. Return a JSON array with exactly 2 strings: translation of first text, then second text.` },
        { role: 'user', content: JSON.stringify([inboundText, outboundText]) },
      ],
    }),
  })

  if (!response.ok) {
    console.error('Translation API error:', await response.text())
    return
  }

  const result = await response.json()
  const raw = result.choices[0].message.content.trim()
  let translations: string[]
  try {
    translations = JSON.parse(raw)
  } catch {
    console.error('Failed to parse translation response:', raw)
    return
  }

  if (translations.length < 2) return

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
      .update({ translation: translations[0] })
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
      const slackMessage = {
        channel: slackThread.channel,
        thread_ts: slackThread.ts,
        text: `🌐 Translation: ${translations[0]}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🌐 *Translation:*\n>${translations[0].replace(/\n/g, '\n>')}`
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
