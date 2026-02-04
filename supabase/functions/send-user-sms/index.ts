import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isOptedOut, isUSNumber } from '../_shared/sms-compliance.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceNumber, contactPhone, message } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Always use the service number the user selected
    // This ensures conversation continuity and proper campaign compliance
    const fromNumber = serviceNumber

    // Check if this is an external SIP trunk number (Twilio)
    const { data: externalNumber } = await supabase
      .from('external_sip_numbers')
      .select('id, trunk_id, external_sip_trunks!inner(id, name)')
      .eq('phone_number', fromNumber)
      .eq('is_active', true)
      .single()

    const isExternalTrunk = !!externalNumber

    // Check if we're sending FROM a US number (USA SMS compliance)
    const fromIsUSNumber = await isUSNumber(fromNumber, supabase)

    // Check if recipient has opted out (only applies to US numbers)
    if (fromIsUSNumber) {
      const hasOptedOut = await isOptedOut(supabase, contactPhone)
      if (hasOptedOut) {
        return new Response(
          JSON.stringify({ error: 'Recipient has opted out of SMS messages' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Add opt-out instructions (USA SMS compliance) only when sending FROM a US number
    const messageBody = fromIsUSNumber ? `${message}\n\nSTOP to opt out` : message

    let messageSid: string

    if (isExternalTrunk) {
      // Send via Twilio for external trunk numbers
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
      const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID')
      const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET')

      if (!accountSid || !apiKeySid || !apiKeySecret) {
        console.error('Twilio credentials not configured')
        return new Response(
          JSON.stringify({ error: 'Twilio not configured for external numbers' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const auth = btoa(`${apiKeySid}:${apiKeySecret}`)
      const smsResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: contactPhone,
            Body: messageBody,
          }),
        }
      )

      if (!smsResponse.ok) {
        const errorText = await smsResponse.text()
        console.error('Twilio SMS send error:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to send message via Twilio' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const smsResult = await smsResponse.json()
      messageSid = smsResult.sid
      console.log('Sent SMS via Twilio:', { from: fromNumber, to: contactPhone, sid: messageSid })
    } else {
      // Send via SignalWire for regular service numbers
      const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
      const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
      const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

      // Build status callback URL for delivery receipts
      const statusCallbackUrl = `${supabaseUrl}/functions/v1/webhook-sms-status`

      const smsData = new URLSearchParams({
        From: fromNumber,
        To: contactPhone,
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
        return new Response(
          JSON.stringify({ error: 'Failed to send message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const smsResult = await smsResponse.json()
      messageSid = smsResult.sid
    }

    // Log the outbound SMS with message_sid for delivery tracking
    await supabase
      .from('sms_messages')
      .insert({
        user_id: user.id,
        sender_number: fromNumber,
        recipient_number: contactPhone,
        direction: 'outbound',
        content: message,
        status: 'pending',  // Will be updated by webhook-sms-status
        message_sid: messageSid,
        sent_at: new Date().toISOString(),
        is_ai_generated: false,
      })

    // Pause AI for 10 minutes
    const pauseUntil = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await supabase
      .from('conversation_contexts')
      .upsert({
        user_id: user.id,
        contact_phone: contactPhone,
        service_number: fromNumber,
        ai_paused_until: pauseUntil.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,contact_phone,service_number'
      })

    console.log(`User sent message - AI paused until ${pauseUntil.toISOString()}`)

    // Deduct credits for the SMS (fire and forget)
    deductSmsCredits(supabaseUrl, supabaseKey, user.id, 1)
      .catch(err => console.error('Failed to deduct SMS credits:', err))

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Message sent and AI paused for 10 minutes',
        paused_until: pauseUntil.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-user-sms:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Deduct credits for SMS messages
 */
async function deductSmsCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  messageCount: number
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
        referenceType: 'sms'
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} SMS, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}