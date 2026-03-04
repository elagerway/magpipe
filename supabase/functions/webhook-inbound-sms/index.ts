import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  isOptOutMessage,
  isOptInMessage,
  recordOptOut,
  recordOptIn,
  getOptOutConfirmation,
  getOptInConfirmation,
  isOptedOut
} from '../_shared/sms-compliance.ts'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'
import { shouldNotify, getAppPrefs } from '../_shared/app-function-prefs.ts'
import { redactPii } from '../_shared/pii-redaction.ts'
import { checkBalance } from '../_shared/balance-check.ts'
import { processAndReplySMS } from './ai-reply.ts'
import { sendSMS, deductSmsCredits } from './sms-delivery.ts'
import { autoEnrichContact, sendSlackNotification } from './notifications.ts'

/**
 * Detect a content loop: the sender has sent this exact message more than twice
 * already in this conversation. Stop responding until they send something different.
 * Called AFTER logging the current inbound message so the stored count is accurate.
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
    .limit(20)

  if (!recentInbound || recentInbound.length === 0) return false

  const matchCount = recentInbound.filter(
    (m: any) => m.content && m.content.trim().toLowerCase() === normalized
  ).length

  // More than 2 identical messages stored → loop
  return matchCount > 2
}

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string
    const numMedia = parseInt(formData.get('NumMedia') as string || '0')

    console.log('Inbound SMS:', { to, from, body, messageSid, numMedia })

    // Check if the number is active
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    // 2. Default text agent for this user
    if (!agentConfig) {
      const { data: defaultAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .eq('agent_type', 'text')
        .eq('is_default', true)
        .single()
      agentConfig = defaultAgent
    }

    // 3. Any text agent for this user
    if (!agentConfig) {
      const { data: anyAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .eq('agent_type', 'text')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      agentConfig = anyAgent
    }

    const agentId = agentConfig?.id || null
    console.log('Using agent for SMS:', agentId, agentConfig?.name || 'None')

    // Check if this is the system agent or no text agent assigned — auto-reply once and stop
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002'
    if (!agentConfig || agentConfig.id === SYSTEM_AGENT_ID) {
      // Save the inbound message
      await supabase.from('sms_messages').insert({
        user_id: serviceNumber.user_id,
        agent_id: agentId,
        sender_number: from,
        recipient_number: to,
        direction: 'inbound',
        content: body,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

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

    // Log the message to database with agent_id and sentiment
    const { error: insertError } = await supabase
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
      })

    if (insertError) {
      console.error('Error logging SMS:', insertError)
      const { allowed: hasCreditsOnError } = await checkBalance(supabase, serviceNumber.user_id)
      if (hasCreditsOnError) {
        processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null)
      }
    } else {
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
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }

      if (toIsUSNumber && isOptInMessage(body)) {
        console.log('Opt-in message detected from:', from, 'to US number:', to)
        await recordOptIn(supabase, from)
        const confirmationMessage = getOptInConfirmation()
        sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
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
          content: body
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

      // Content loop detection: if this exact message has been received more than twice
      // already, we're in a bot-to-bot loop. Stop responding until a different message arrives.
      const looping = await isContentLoop(supabase, from, to, body)
      if (looping) {
        console.log(`Content loop detected from ${from}: message repeated >2 times, not responding`)
      } else {
        // Check if user has credits before generating AI reply
        const { allowed: hasCreditsForReply } = await checkBalance(supabase, serviceNumber.user_id)
        if (!hasCreditsForReply) {
          console.log(`Skipping AI SMS reply for user ${serviceNumber.user_id}: insufficient credits`)
        } else {
          const slackSmsEnabled = shouldNotify(agentConfig?.functions, 'slack', 'sms')
          if (slackSmsEnabled) {
            sendSlackNotification(serviceNumber.user_id, from, body, supabase)
              .then(slackThread => {
                processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, slackThread)
              })
              .catch(err => {
                console.error('Failed to send Slack notification:', err)
                processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null)
              })
          } else {
            processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null)
          }
        }
      }
    }

    // Return empty TwiML response (no auto-reply, we'll send async)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-inbound-sms:', error)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  }
})
