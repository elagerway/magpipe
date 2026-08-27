import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSenderNumber, isOptedOut, isUSNumber, CANADA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'
import { reportError } from '../_shared/error-reporter.ts'
import { buildSmsBody, callSummaryLine } from '../_shared/build-notification-body.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'
import { dispatchWebhook } from '../_shared/webhook-dispatcher.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const { userId, agentId, type, data, content_config: reqContentConfig, test: isTest } = await req.json()

    console.log('SMS notification request:', { userId, type, agentId })

    if (!userId || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's timezone for local time formatting
    const { data: userRecord } = await supabase.from('users').select('timezone').eq('id', userId).maybeSingle()
    const userTimezone = userRecord?.timezone || 'UTC'

    // Get user's notification preferences (per-agent first, fallback to user-level)
    let prefs = null
    if (agentId) {
      const { data: agentPrefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .maybeSingle()
      prefs = agentPrefs
    }
    if (!prefs) {
      const { data: userPrefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .is('agent_id', null)
        .maybeSingle()
      prefs = userPrefs
    }

    // Skill executions bypass notification prefs — they have their own consent flow
    // and send to the contact's phone, not the owner's notification phone
    const isSkillExecution = type === 'skill_execution'

    if (!isSkillExecution) {
      if (!prefs || !prefs.sms_enabled) {
        console.log('SMS notifications not enabled for user:', userId)
        return new Response(JSON.stringify({ message: 'Notifications not enabled' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check if this notification type is enabled (skip for test notifications)
      if (!isTest) {
        let typeEnabled = false

        if (type === 'completed_call') {
          typeEnabled = prefs.sms_inbound_calls || prefs.sms_all_calls
        } else if (type === 'missed_call') {
          typeEnabled = prefs.sms_all_calls
        } else if (type === 'new_message') {
          typeEnabled = prefs.sms_inbound_messages || prefs.sms_all_messages

          // "First inbound message in last 12h" rule — the webhook inserts the
          // current sms_messages row before fanning out notifications, so it's
          // already counted. count === 1 means this row is the only inbound
          // from this sender on this channel in the window → it's the first.
          // Channel-scoped so SMS and WhatsApp don't bleed into each other.
          if (!typeEnabled && prefs.sms_first_inbound_message && data?.senderNumber) {
            const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
            const { count } = await supabase
              .from('sms_messages')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('direction', 'inbound')
              .eq('sender_number', data.senderNumber)
              .eq('channel', data.channel || 'sms')
              .gte('sent_at', cutoff)
            typeEnabled = (count ?? 0) === 1
          }
        } else if (type === 'outbound_message') {
          typeEnabled = prefs.sms_all_messages
        }

        if (!typeEnabled) {
          console.log(`SMS notifications for ${type} not enabled for user:`, userId)
          return new Response(JSON.stringify({ message: 'Notification type not enabled' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    }

    // Generate notification ID for tracking
    const notificationId = crypto.randomUUID()

    // Only add STOP opt-out text for US destinations (10DLC compliance)
    // skill_execution uses data.recipientPhone; regular notifications use prefs.sms_phone_number
    const phoneForUsCheck = isSkillExecution ? data.recipientPhone : prefs?.sms_phone_number
    const recipientIsUS = await isUSNumber(phoneForUsCheck, supabase)
    const optOutSuffix = recipientIsUS ? '\n\nSTOP to opt out' : ''

    // Resolve content_config: per-request override → prefs.content_config.sms
    const contentConfig = reqContentConfig || prefs?.content_config?.sms || null

    // Build SMS content based on notification type
    let smsBody = ''

    // Try content_config first (for call notification types)
    if (contentConfig && type !== 'skill_execution') {
      const customBody = buildSmsBody(data, contentConfig, notificationId, optOutSuffix, type)
      if (customBody !== null) {
        smsBody = customBody
      }
    }

    if (!smsBody) {
      // Shared by both default call templates: which of the user's numbers rang
      // and which agent answered. Present here as well as in the content_config
      // path, so a user who never opened "Customize what's included" isn't left
      // with an alert that can't be acted on.
      const callContext = [
        data.serviceNumber ? `${data.direction === 'outbound' ? 'From' : 'To'}: ${data.serviceNumber}` : '',
        data.agentName ? `Agent: ${data.agentName}` : '',
      ].filter(Boolean)
      // Unknown-caller lookup is on by default for SMS (off for Slack).
      const lookupBlock = data.callerLookup ? [`\n${data.callerLookup}`] : []

      switch (type) {
        case 'missed_call':
          smsBody = [
            `Missed call from ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}`,
            ...callContext,
            ...lookupBlock,
          ].join('\n') + `\n\nNotification ID: ${notificationId}${optOutSuffix}`
          break

        case 'completed_call':
          smsBody = [
            `Call ${data.successful ? 'completed' : 'ended'} with ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}${data.duration ? ` (${data.duration}s)` : ''}`,
            ...callContext,
            ...lookupBlock,
            `\nSummary:\n${callSummaryLine(data)}`,
            data.recordingUrl ? `Recording: ${data.recordingUrl}` : '',
          ].filter(Boolean).join('\n') + `\n\nNotification ID: ${notificationId}${optOutSuffix}`
          break

        case 'new_message':
          smsBody = `New message from ${data.senderNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}${optOutSuffix}`
          break

        case 'outbound_message':
          smsBody = `Message sent to ${data.recipientNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}${optOutSuffix}`
          break

        case 'skill_execution':
          smsBody = `${data.message}${optOutSuffix}`
          break

        default:
          return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
      }
    }

    // For skill executions, send to the contact's phone (data.recipientPhone)
    // For regular notifications, send to the owner's notification phone (prefs.sms_phone_number)
    const recipientPhone = isSkillExecution ? data.recipientPhone : prefs.sms_phone_number

    if (!recipientPhone) {
      return new Response(JSON.stringify({ error: 'No recipient phone number' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if recipient has opted out (USA SMS compliance)
    const hasOptedOut = await isOptedOut(supabase, recipientPhone)

    if (hasOptedOut) {
      console.log('Recipient has opted out:', recipientPhone)
      return new Response(JSON.stringify({ message: 'Recipient has opted out' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use dedicated notification sender numbers based on recipient country
    // Canadian/international → +16042431596, US → +14152518686
    const fromNumber = await getSenderNumber(recipientPhone, CANADA_SENDER_NUMBER, supabase)

    // Send SMS via SignalWire
    const smsData = new URLSearchParams({
      From: fromNumber,
      To: recipientPhone,
      Body: smsBody,
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
        source: 'send-notification-sms',
        severity: 'error',
        metadata: { channel: 'sms', from: fromNumber, to: recipientPhone, trigger: 'notification', notification_id: notificationId },
        user_id: userId,
      }).catch(() => {})
      throw new Error(`SignalWire API error: ${errorText}`)
    }

    const smsResult = await smsResponse.json()

    console.log('SMS notification sent:', { notificationId, signalwireSid: smsResult.sid })

    // Fire sms.sent webhook (fire-and-forget). Notification SMS doesn't get
    // a sms_messages row today, so sms_message_id is null. Customers should
    // dedup on `notification_id` for trigger='notification' events.
    dispatchWebhook(supabase, userId, 'sms.sent', {
      sms_message_id: null,
      notification_id: notificationId,
      agent_id: agentId ?? null,
      service_number: fromNumber,
      from_number: fromNumber,
      to_number: recipientPhone,
      body: smsBody,
      trigger: 'notification',
      sent_at: new Date().toISOString(),
    }).catch(err => console.error('🔔 sms.sent dispatch failed:', err))

    // Deduct credits for the notification SMS
    deductSmsCredits(supabaseUrl, supabaseKey, userId, 1)
      .catch(err => console.error('Failed to deduct notification SMS credits:', err))

    return new Response(JSON.stringify({ success: true, notificationId: notificationId, signalwireSid: smsResult.sid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-notification-sms:', error)
    const _sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await reportError(_sb, { error_type: 'edge_function_error', error_message: String(error.message || error), error_code: 'send-notification-sms:outer', source: 'supabase' })
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Deduct credits for SMS messages
 */
async function deductSmsCredits(supabaseUrl: string, supabaseKey: string, userId: string, messageCount: number) {
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
      console.log(`Deducted $${result.cost} for notification SMS, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}
