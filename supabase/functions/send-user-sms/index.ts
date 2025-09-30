import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSenderNumber, isOptedOut } from '../_shared/sms-compliance.ts'

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

    // Check if recipient has opted out (USA SMS compliance)
    const hasOptedOut = await isOptedOut(supabase, contactPhone)
    if (hasOptedOut) {
      return new Response(
        JSON.stringify({ error: 'Recipient has opted out of SMS messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send SMS via SignalWire
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Use USA campaign number for US recipients, otherwise use service number
    const fromNumber = await getSenderNumber(contactPhone, serviceNumber, supabase)

    // Add opt-out instructions (USA SMS compliance)
    const messageBody = `${message}\n\nSTOP to opt out`

    const smsData = new URLSearchParams({
      From: fromNumber,
      To: contactPhone,
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
      return new Response(
        JSON.stringify({ error: 'Failed to send message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const smsResult = await smsResponse.json()

    // Log the outbound SMS
    await supabase
      .from('sms_messages')
      .insert({
        user_id: user.id,
        sender_number: fromNumber,
        recipient_number: contactPhone,
        direction: 'outbound',
        content: message,
        status: 'sent',
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
        ai_paused_until: pauseUntil.toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,contact_phone'
      })

    console.log(`User sent message - AI paused until ${pauseUntil.toISOString()}`)

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