import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  isOptOutMessage,
  isOptInMessage,
  recordOptOut,
  recordOptIn,
  getOptOutConfirmation,
  getOptInConfirmation,
  getSenderNumber,
  isOptedOut
} from '../_shared/sms-compliance.ts'

serve(async (req) => {
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

      // Silently ignore - don't respond to SMS on inactive numbers
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    console.log('Number is active, processing SMS for user:', serviceNumber.users.email)

    // Log the message to database
    const { error: insertError } = await supabase
      .from('sms_messages')
      .insert({
        user_id: serviceNumber.user_id,
        sender_number: from,
        recipient_number: to,
        direction: 'inbound',
        content: body,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Error logging SMS:', insertError)
    } else {
      // Check for opt-out/opt-in keywords (USA SMS compliance)
      // Only process STOP for US campaign number, not Canadian numbers
      const { USA_CAMPAIGN_NUMBER } = await import('../_shared/sms-compliance.ts')
      const isUSCampaignNumber = to === USA_CAMPAIGN_NUMBER

      if (isUSCampaignNumber && isOptOutMessage(body)) {
        console.log('Opt-out message detected from:', from, 'to US campaign number')
        await recordOptOut(supabase, from)

        // Send confirmation message (without additional opt-out text)
        const confirmationMessage = getOptOutConfirmation()
        sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)

        // Return early - don't process with AI or send notifications
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }

      if (isUSCampaignNumber && isOptInMessage(body)) {
        console.log('Opt-in message detected from:', from, 'to US campaign number')
        await recordOptIn(supabase, from)

        // Send confirmation message (without additional opt-out text)
        const confirmationMessage = getOptInConfirmation()
        sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)

        // Return early - don't process with AI
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
        type: 'new_message',
        data: {
          senderNumber: from,
          timestamp: new Date().toISOString(),
          content: body
        }
      }

      // Send email notification
      fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send email notification:', err))

      // Send SMS notification
      fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send SMS notification:', err))
    }

    // Respond immediately to SignalWire to avoid timeout
    // Process the SMS asynchronously
    processAndReplySMS(serviceNumber.user_id, from, to, body, supabase)

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

async function processAndReplySMS(
  userId: string,
  from: string,
  to: string,
  body: string,
  supabase: any
) {
  try {
    // Check if sender has opted out (USA SMS compliance)
    // Only block if they opted out AND this is the US campaign number
    const { USA_CAMPAIGN_NUMBER } = await import('../_shared/sms-compliance.ts')
    const isUSCampaignNumber = to === USA_CAMPAIGN_NUMBER

    if (isUSCampaignNumber) {
      const hasOptedOut = await isOptedOut(supabase, from)
      if (hasOptedOut) {
        console.log('Sender has opted out from US campaign number, not sending AI reply:', from)
        return // Don't respond to opted-out users
      }
    }

    // Check if AI is paused for this conversation
    const { data: context } = await supabase
      .from('conversation_contexts')
      .select('ai_paused_until')
      .eq('user_id', userId)
      .eq('contact_phone', from)
      .single()

    if (context?.ai_paused_until) {
      const pausedUntil = new Date(context.ai_paused_until)
      const now = new Date()

      if (pausedUntil > now) {
        console.log(`AI is paused for this conversation until ${pausedUntil.toISOString()}`)
        return // Don't respond
      }
    }

    // Get user's agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!agentConfig || !agentConfig.retell_agent_id) {
      console.log('No agent configured for user')
      return
    }

    // For SMS, use OpenAI to generate intelligent responses
    // Use SMS-specific prompt or fall back to system_prompt adapted for SMS
    const smsPrompt = agentConfig.system_prompt
      ? `${agentConfig.system_prompt}\n\nYou are responding to an SMS text message (not a phone call). Keep your response brief, friendly, and conversational. Limit responses to 1-2 sentences. Do not reference phone calls or calling - this is a text message conversation.`
      : "You are Pat, a helpful AI assistant. You are responding to an SMS text message. Reply in a friendly and concise way. Keep responses brief (1-2 sentences max). Do not reference phone calls - this is a text message conversation."

    const systemPrompt = smsPrompt

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: body,
          },
        ],
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', errorText)
      // Fallback to simple response
      const reply = "Hi! I'm Pat, your AI assistant. Sorry, I'm having trouble processing your message right now. Please try again later."
      await sendSMS(userId, from, to, reply, supabase)
      return
    }

    const openaiResult = await openaiResponse.json()
    const reply = openaiResult.choices[0].message.content

    console.log('OpenAI generated reply:', reply)

    // Send the reply
    await sendSMS(userId, from, to, reply, supabase)
  } catch (error) {
    console.error('Error in processAndReplySMS:', error)
  }
}

async function sendSMS(
  userId: string,
  to: string,
  from: string,
  body: string,
  supabase: any,
  addOptOutText: boolean = true
) {
  try {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Use USA campaign number for US recipients, otherwise use service number
    const fromNumber = await getSenderNumber(to, from, supabase)

    // Add opt-out instructions (USA SMS compliance) only when sending FROM US campaign number
    const { USA_CAMPAIGN_NUMBER } = await import('../_shared/sms-compliance.ts')
    const shouldAddOptOutText = addOptOutText && (fromNumber === USA_CAMPAIGN_NUMBER)
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

      // Log the outbound SMS
      await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          sender_number: fromNumber,
          recipient_number: to,
          direction: 'outbound',
          content: body,
          status: 'sent',
          sent_at: new Date().toISOString(),
          is_ai_generated: true,
        })
    }
  } catch (error) {
    console.error('Error sending SMS:', error)
  }
}