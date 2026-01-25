import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  isOptOutMessage,
  isOptInMessage,
  recordOptOut,
  recordOptIn,
  getOptOutConfirmation,
  getOptInConfirmation,
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
      // Auto-enrich contact if not exists (fire and forget)
      autoEnrichContact(serviceNumber.user_id, from, supabase)
        .catch(err => console.error('Auto-enrich error:', err))

      // Check for opt-out/opt-in keywords (USA SMS compliance)
      // Only process STOP for US numbers, not Canadian numbers
      const { isUSNumber } = await import('../_shared/sms-compliance.ts')
      const toIsUSNumber = await isUSNumber(to, supabase)

      if (toIsUSNumber && isOptOutMessage(body)) {
        console.log('Opt-out message detected from:', from, 'to US number:', to)
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

      if (toIsUSNumber && isOptInMessage(body)) {
        console.log('Opt-in message detected from:', from, 'to US number:', to)
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

      // Send Slack notification (fire and forget)
      sendSlackNotification(serviceNumber.user_id, from, body, supabase)
        .catch(err => console.error('Failed to send Slack notification:', err))
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
    // Only block if they opted out AND this is a US number
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const toIsUSNumber = await isUSNumber(to, supabase)

    if (toIsUSNumber) {
      const hasOptedOut = await isOptedOut(supabase, from)
      if (hasOptedOut) {
        console.log('Sender has opted out from US number:', to, '- not sending AI reply to:', from)
        return // Don't respond to opted-out users
      }
    }

    // Check if AI is paused for this conversation
    // Note: Separate conversations per service number (different numbers = different threads)
    const { data: context } = await supabase
      .from('conversation_contexts')
      .select('ai_paused_until')
      .eq('user_id', userId)
      .eq('contact_phone', from)
      .eq('service_number', to)
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

    // Get recent conversation history for context
    const { data: recentMessages } = await supabase
      .from('sms_messages')
      .select('content, direction, sent_at')
      .eq('user_id', userId)
      .or(`sender_number.eq.${from},recipient_number.eq.${from}`)
      .order('sent_at', { ascending: false })
      .limit(6) // Get last 6 messages (including the one just received)

    // Build conversation history (exclude the current message, reverse to chronological order)
    const conversationHistory = recentMessages
      ?.filter(m => m.content !== body) // Exclude current message
      ?.reverse()
      ?.map(m => ({
        role: m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content
      })) || []

    const hasExistingConversation = conversationHistory.length > 0
    console.log('Conversation history found:', hasExistingConversation, 'messages:', conversationHistory.length)

    // For SMS, use OpenAI to generate intelligent responses
    // Use SMS-specific prompt or fall back to system_prompt adapted for SMS

    // SMS context suffix - explicitly tells AI this is TEXT, not voice
    const SMS_CONTEXT_SUFFIX = `

IMPORTANT CONTEXT:
- You are responding via SMS TEXT MESSAGE (not a voice call)
- The customer is TEXTING you, not calling
- Keep responses BRIEF: 1-2 sentences maximum
- Use casual, friendly text message language
- NEVER mention: "calling", "call back", "speak", "talk", "phone call", "voice"
- ALWAYS use text-appropriate language: "text", "message", "reply", "send"
- If they ask to talk/call, say: "I can help via text, or you can call ${to} to speak with someone"
- This is asynchronous messaging - they may not respond immediately
${hasExistingConversation ? '- This is an ONGOING conversation - respond naturally to continue it, do NOT give a welcome/intro message' : ''}`

    const smsPrompt = agentConfig.system_prompt
      ? `${agentConfig.system_prompt}${SMS_CONTEXT_SUFFIX}`
      : `You are Pat, a helpful AI assistant. You are responding to an SMS text message. Reply in a friendly and concise way. Keep responses brief (1-2 sentences max). Do not reference phone calls - this is a text message conversation.${SMS_CONTEXT_SUFFIX}`

    const systemPrompt = smsPrompt

    console.log('SMS system prompt applied with context suffix, hasExistingConversation:', hasExistingConversation)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: body }
    ]

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: messages,
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

/**
 * Auto-enrich contact if phone number doesn't exist in contacts
 * Called when new SMS interactions occur
 */
async function autoEnrichContact(
  userId: string,
  phoneNumber: string,
  supabase: any
) {
  // Normalize phone number (ensure E.164 format)
  const normalizedPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+${phoneNumber.replace(/\D/g, '')}`

  try {
    // Check if contact already exists
    const { data: existingContact, error: checkError } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking for existing contact:', checkError)
      return
    }

    if (existingContact) {
      console.log('Contact already exists for', normalizedPhone)
      return
    }

    console.log('No contact found for', normalizedPhone, '- attempting lookup')

    // Call the contact-lookup Edge Function
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(
      `${supabaseUrl}/functions/v1/contact-lookup`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.notFound || !data.success) {
      // No data found - create a basic contact with just the phone number
      console.log('No enrichment data found for', normalizedPhone, '- creating basic contact')
      const { error: createError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          phone_number: normalizedPhone,
          name: 'Unknown',
          first_name: 'Unknown',
          is_whitelisted: false
        })

      if (createError) {
        console.error('Error creating basic contact:', createError)
      } else {
        console.log('Created basic contact for', normalizedPhone)
      }
      return
    }

    // Create enriched contact
    const contact = data.contact
    const firstName = contact.first_name || (contact.name ? contact.name.split(' ')[0] : 'Unknown')
    const lastName = contact.last_name || (contact.name ? contact.name.split(' ').slice(1).join(' ') : null)
    const fullName = contact.name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'

    const contactData = {
      user_id: userId,
      phone_number: normalizedPhone,
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      email: contact.email || null,
      address: contact.address || null,
      company: contact.company || null,
      job_title: contact.job_title || null,
      avatar_url: contact.avatar_url || null,
      linkedin_url: contact.linkedin_url || null,
      twitter_url: contact.twitter_url || null,
      facebook_url: contact.facebook_url || null,
      enriched_at: new Date().toISOString(),
      is_whitelisted: false
    }

    const { error: createError } = await supabase
      .from('contacts')
      .insert(contactData)

    if (createError) {
      console.error('Error creating enriched contact:', createError)
    } else {
      console.log('Created enriched contact for', normalizedPhone, contactData)
    }

  } catch (error) {
    console.error('Error in autoEnrichContact:', error)
  }
}

/**
 * Send Slack notification for incoming SMS
 */
async function sendSlackNotification(
  userId: string,
  senderPhone: string,
  messageContent: string,
  supabase: any
) {
  try {
    // Check if user has Slack connected
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('access_token, config')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .eq('provider_id', (
        await supabase
          .from('integration_providers')
          .select('id')
          .eq('slug', 'slack')
          .single()
      ).data?.id)
      .single()

    if (integrationError || !integration?.access_token) {
      // User doesn't have Slack connected - silently skip
      return
    }

    // Get contact name if available
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('user_id', userId)
      .eq('phone_number', senderPhone)
      .single()

    const senderName = contact?.name || senderPhone

    // Get notification channel from config, default to DM
    const notificationChannel = integration.config?.notification_channel

    let channelId = notificationChannel

    // If no channel configured, send as DM to the user
    if (!channelId) {
      // Get the Slack user ID for the bot owner (open DM with self)
      const authResponse = await fetch('https://slack.com/api/auth.test', {
        headers: { 'Authorization': `Bearer ${integration.access_token}` }
      })
      const authResult = await authResponse.json()

      if (!authResult.ok) {
        console.error('Slack auth.test failed:', authResult.error)
        return
      }

      // Open a DM - we'll use a special channel for notifications
      // For now, post to #general or first available channel
      const channelsResponse = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel&limit=10',
        { headers: { 'Authorization': `Bearer ${integration.access_token}` } }
      )
      const channelsResult = await channelsResponse.json()

      if (channelsResult.ok && channelsResult.channels?.length > 0) {
        // Look for a pat-notifications channel, otherwise use general
        const patChannel = channelsResult.channels.find((c: any) => c.name === 'pat-notifications')
        const generalChannel = channelsResult.channels.find((c: any) => c.name === 'general')
        channelId = patChannel?.id || generalChannel?.id || channelsResult.channels[0].id
      }
    }

    if (!channelId) {
      console.log('No Slack channel available for notification')
      return
    }

    // Try to join the channel first (in case not a member)
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    })

    // Format the message nicely
    const slackMessage = {
      channel: channelId,
      text: `📱 New SMS from ${senderName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📱 *New SMS from ${senderName}*\n>${messageContent.replace(/\n/g, '\n>')}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `From: ${senderPhone} • ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('Slack notification failed:', result.error)
    } else {
      console.log('Slack notification sent for SMS from', senderPhone)
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}