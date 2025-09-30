import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const systemPrompt = agentConfig.prompt || "You are Pat, a helpful AI assistant. Respond to the user's message in a friendly and concise way suitable for SMS. Keep responses brief (1-2 sentences max)."

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
  supabase: any
) {
  try {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    const smsData = new URLSearchParams({
      From: from,
      To: to,
      Body: body,
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
          sender_number: from,
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