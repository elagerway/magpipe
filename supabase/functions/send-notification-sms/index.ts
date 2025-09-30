import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { userId, type, data } = await req.json()

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

    // Get user's notification preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (prefsError || !prefs || !prefs.sms_enabled) {
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

    // Build SMS content based on notification type
    let smsBody = ''

    switch (type) {
      case 'missed_call':
        smsBody = `Missed call from ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}\n\nNotification ID: ${notificationId}`
        break

      case 'completed_call':
        smsBody = `Call ${data.successful ? 'completed' : 'ended'} with ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}${data.duration ? ` (${data.duration}s)` : ''}\n\nNotification ID: ${notificationId}`
        break

      case 'new_message':
        smsBody = `New message from ${data.senderNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}`
        break

      case 'outbound_message':
        smsBody = `Message sent to ${data.recipientNumber || 'Unknown'}: ${data.content}\n\nNotification ID: ${notificationId}`
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }

    // Get user's service number to use as sender
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!serviceNumbers) {
      console.error('No service number found for user:', userId)
      return new Response(JSON.stringify({ error: 'No service number found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Send SMS via SignalWire
    const smsData = new URLSearchParams({
      From: serviceNumbers.phone_number,
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

    console.log('SMS sent successfully:', smsResult, 'Notification ID:', notificationId)

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
