import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSenderNumber, isOptedOut, isUSNumber, CANADA_SENDER_NUMBER } from '../_shared/sms-compliance.ts'

Deno.serve(async (req) => {
  try {
    const { userId, agentId, type, data } = await req.json()

    console.log('SMS notification request:', { userId, type, agentId })

    if (!userId || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    if (!prefs || !prefs.sms_enabled) {
      console.log('SMS notifications not enabled for user:', userId)
      return new Response(JSON.stringify({ message: 'Notifications not enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if this notification type is enabled
    let typeEnabled = false

    if (type === 'completed_call') {
      // For completed calls, check if "inbound calls" or "all calls" is enabled
      typeEnabled = prefs.sms_inbound_calls || prefs.sms_all_calls
    } else if (type === 'missed_call') {
      // For missed calls, only send if "all calls" is enabled (not for "inbound calls" only)
      typeEnabled = prefs.sms_all_calls
    } else if (type === 'new_message') {
      // For inbound messages, check if "inbound messages" or "all messages" is enabled
      typeEnabled = prefs.sms_inbound_messages || prefs.sms_all_messages
    } else if (type === 'outbound_message') {
      // For outbound messages, only send if "all messages" is enabled
      typeEnabled = prefs.sms_all_messages
    }

    if (!typeEnabled) {
      console.log(`SMS notifications for ${type} not enabled for user:`, userId)
      return new Response(JSON.stringify({ message: 'Notification type not enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Generate notification ID for tracking
    const notificationId = crypto.randomUUID()

    // Only add STOP opt-out text for US destinations (10DLC compliance)
    const recipientIsUS = await isUSNumber(prefs.sms_phone_number, supabase)
    const optOutSuffix = recipientIsUS ? '\n\nSTOP to opt out' : ''

    // Build SMS content based on notification type
    let smsBody = ''

    switch (type) {
      case 'missed_call':
        smsBody = `Missed call from ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}\n\nNotification ID: ${notificationId}${optOutSuffix}`
        break

      case 'completed_call':
        smsBody = `Call ${data.successful ? 'completed' : 'ended'} with ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}${data.duration ? ` (${data.duration}s)` : ''}\n\nNotification ID: ${notificationId}${optOutSuffix}`
        break

      case 'new_message':
        smsBody = `New message from ${data.senderNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}${optOutSuffix}`
        break

      case 'outbound_message':
        smsBody = `Message sent to ${data.recipientNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}${optOutSuffix}`
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }

    // Check if recipient has opted out (USA SMS compliance)
    const hasOptedOut = await isOptedOut(supabase, prefs.sms_phone_number)

    if (hasOptedOut) {
      console.log('Recipient has opted out:', prefs.sms_phone_number)
      return new Response(JSON.stringify({ message: 'Recipient has opted out' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Use dedicated notification sender numbers based on recipient country
    // Canadian/international → +16042431596, US → +14152518686
    const fromNumber = await getSenderNumber(prefs.sms_phone_number, CANADA_SENDER_NUMBER, supabase)

    // Send SMS via SignalWire
    const smsData = new URLSearchParams({
      From: fromNumber,
      To: prefs.sms_phone_number,
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
      throw new Error(`SignalWire API error: ${errorText}`)
    }

    const smsResult = await smsResponse.json()

    console.log('SMS notification sent:', { notificationId, signalwireSid: smsResult.sid })

    // Deduct credits for the notification SMS
    deductSmsCredits(supabaseUrl, supabaseKey, userId, 1)
      .catch(err => console.error('Failed to deduct notification SMS credits:', err))

    return new Response(JSON.stringify({ success: true, notificationId: notificationId, signalwireSid: smsResult.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-notification-sms:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
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
