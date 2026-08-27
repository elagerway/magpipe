import { createClient } from "npm:@supabase/supabase-js@2"
import { resolveUser } from "../_shared/api-auth.ts"
import { getSenderNumber, isOptedOut, isUSNumber } from '../_shared/sms-compliance.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { dispatchWebhook } from '../_shared/webhook-dispatcher.ts'
import { reportError } from '../_shared/error-reporter.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Resolve user via JWT or API key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    )

    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { serviceNumber, contactPhone, message } = await req.json()

    // Create service role client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if the user's *selected* number is an external SIP trunk —
    // those have their own carrier compliance contract via the trunk
    // provider, so we never override their From. We do the lookup against
    // the user's selection (serviceNumber), not the post-swap value
    // below, because the swap only ever picks platform-owned long codes
    // which won't match external_sip_numbers anyway.
    const { data: externalNumber } = await supabase
      .from('external_sip_numbers')
      .select('id, trunk_id, external_sip_trunks!inner(id, name)')
      .eq('phone_number', serviceNumber)
      .eq('is_active', true)
      .single()

    const isExternalTrunk = !!externalNumber

    // A2P 10DLC compliance routing. SignalWire rejects with code 21717
    // ("From must belong to an active campaign") when a non-registered
    // long code (e.g. a user's Canadian +1 number) tries to send to a US
    // destination. getSenderNumber swaps to USA_SENDER_NUMBER for US
    // recipients and leaves the user's selection untouched otherwise.
    // Skip the swap for external SIP trunks — their from-number stays as
    // selected. Trade-off Erik accepted 2026-05-13: US replies land on
    // the platform sender, not the user's original conversation thread.
    let fromNumber = serviceNumber
    if (!isExternalTrunk) {
      const compliantFrom = await getSenderNumber(contactPhone, serviceNumber, supabase)
      if (compliantFrom !== serviceNumber) {
        console.log(`[send-user-sms] A2P swap: ${serviceNumber} → ${compliantFrom} for ${contactPhone}`)
        fromNumber = compliantFrom
      }
    }

    // Check if we're sending FROM a US number (USA SMS compliance) — uses
    // the effective (post-swap) sender so the STOP-to-opt-out footer
    // appends correctly and the opt-out registry lookup applies whenever
    // a US sender is in play, regardless of what the user originally
    // selected.
    const fromIsUSNumber = await isUSNumber(fromNumber, supabase)

    // Short codes (3–6 digit destinations like 7726, 22000, etc.) bypass
    // the consumer compliance gates. Their semantics are carrier-managed:
    // they don't subscribe/unsubscribe to consumer SMS lists, and
    // appending "STOP to opt out" is harmful — STOP is a reserved keyword
    // on short codes (some carrier gateways act on it or treat the
    // message as malformed), and the compliance suffix is noise to a
    // carrier-side spam classifier looking for the suspect E.164. The
    // first call site that hit this in real traffic was the inbox
    // "Mark as Spam → 7726" forward (review finding bug_011).
    const isShortCodeDestination = /^\d{3,6}$/.test(contactPhone)

    // Check if recipient has opted out (only applies to US numbers).
    // Skip for short codes — there's no opt-out concept for a carrier
    // short code, and the sms_opt_outs lookup against a 3–6 digit
    // string would be meaningless.
    if (fromIsUSNumber && !isShortCodeDestination) {
      const hasOptedOut = await isOptedOut(supabase, contactPhone)
      if (hasOptedOut) {
        return new Response(
          JSON.stringify({ error: 'Recipient has opted out of SMS messages' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Append STOP-to-opt-out only for consumer destinations from US
    // senders. Short codes get the bare message.
    const messageBody = (fromIsUSNumber && !isShortCodeDestination)
      ? `${message}\n\nSTOP to opt out`
      : message

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
        await reportError(supabase, {
          error_type: 'twilio_sms_send_failure',
          error_message: errorText,
          error_code: String(smsResponse.status),
          source: 'send-user-sms',
          severity: 'error',
          metadata: { channel: 'sms', from: fromNumber, to: contactPhone, trigger: 'manual' },
          user_id: user.id,
        }).catch(() => {})
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
        await reportError(supabase, {
          error_type: 'signalwire_sms_send_failure',
          error_message: errorText,
          error_code: String(smsResponse.status),
          source: 'send-user-sms',
          severity: 'error',
          metadata: { channel: 'sms', from: fromNumber, to: contactPhone, trigger: 'manual' },
          user_id: user.id,
        }).catch(() => {})
        return new Response(
          JSON.stringify({ error: 'Failed to send message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const smsResult = await smsResponse.json()
      messageSid = smsResult.sid
    }

    // Log the outbound SMS with message_sid for delivery tracking. We
    // record the user's ORIGINAL selection (serviceNumber) as the
    // sender, not the post-swap carrier-hop value (fromNumber), so the
    // user's inbox thread keeps showing this message under the
    // conversation they sent it from. The webhook-sms-status callback
    // updates by message_sid (not by sender_number) so delivery status
    // still flows correctly regardless of the swap.
    const sentAt = new Date().toISOString()
    const { data: outboundRow } = await supabase
      .from('sms_messages')
      .insert({
        user_id: user.id,
        sender_number: serviceNumber,
        recipient_number: contactPhone,
        direction: 'outbound',
        content: message,
        status: 'pending',  // Will be updated by webhook-sms-status
        message_sid: messageSid,
        sent_at: sentAt,
        is_ai_generated: false,
      })
      .select('id')
      .single()

    // Fire sms.sent webhook (fire-and-forget). Use the user's selected
    // number in the public event payload — external consumers track
    // sends by the user-facing From, not the platform-internal carrier
    // hop, so swapping that out would silently break their integrations.
    dispatchWebhook(supabase, user.id, 'sms.sent', {
      sms_message_id: outboundRow?.id ?? null,
      agent_id: null,
      service_number: serviceNumber,
      from_number: serviceNumber,
      to_number: contactPhone,
      body: message,
      trigger: 'manual',
      sent_at: sentAt,
    }).catch(err => console.error('🔔 sms.sent dispatch failed:', err))

    // Pause AI for 10 minutes — keyed to the original service_number so
    // if any inbound traffic does land on the user's selection (e.g.
    // they later send to a Canadian contact and that contact replies),
    // the pause covers the conversation the user actually thinks
    // they're in.
    const pauseUntil = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await supabase
      .from('conversation_contexts')
      .upsert({
        user_id: user.id,
        contact_phone: contactPhone,
        service_number: serviceNumber,
        ai_paused_until: pauseUntil.toISOString(),
        last_updated: new Date().toISOString(),
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