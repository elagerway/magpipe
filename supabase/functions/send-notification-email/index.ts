import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
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
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's notification preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (prefsError || !prefs || !prefs.email_enabled) {
      console.log('Email notifications not enabled for user:', userId)
      return new Response(JSON.stringify({ message: 'Notifications not enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if this notification type is enabled
    let typeEnabled = false

    if (type === 'completed_call') {
      // For completed calls, check if "inbound calls" or "all calls" is enabled
      typeEnabled = prefs.email_inbound_calls || prefs.email_all_calls
    } else if (type === 'missed_call') {
      // For missed calls, only send if "all calls" is enabled (not for "inbound calls" only)
      typeEnabled = prefs.email_all_calls
    } else if (type === 'new_message') {
      // For inbound messages, check if "inbound messages" or "all messages" is enabled
      typeEnabled = prefs.email_inbound_messages || prefs.email_all_messages
    } else if (type === 'outbound_message') {
      // For outbound messages, only send if "all messages" is enabled
      typeEnabled = prefs.email_all_messages
    }

    if (!typeEnabled) {
      console.log(`Email notifications for ${type} not enabled for user:`, userId)
      return new Response(JSON.stringify({ message: 'Notification type not enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Generate notification ID for tracking
    const notificationId = crypto.randomUUID()

    // Build email content based on notification type
    let subject = ''
    let htmlBody = ''
    let textBody = ''

    switch (type) {
      case 'missed_call':
        subject = `Missed Call from ${data.callerNumber || 'Unknown'}`
        htmlBody = `
          <h2>You have a missed call</h2>
          <p><strong>From:</strong> ${data.callerNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
          ${data.duration ? `<p><strong>Duration:</strong> ${data.duration} seconds</p>` : ''}
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `You have a missed call from ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'completed_call':
        subject = `Call ${data.successful ? 'Completed' : 'Ended'} - ${data.callerNumber || 'Unknown'}`
        htmlBody = `
          <h2>Call ${data.successful ? 'completed' : 'ended'}</h2>
          <p><strong>From:</strong> ${data.callerNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
          ${data.duration ? `<p><strong>Duration:</strong> ${data.duration} seconds</p>` : ''}
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `Call ${data.successful ? 'completed' : 'ended'} with ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString()}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'new_message':
        subject = `New Message from ${data.senderNumber || 'Unknown'}`
        htmlBody = `
          <h2>You have a new message</h2>
          <p><strong>From:</strong> ${data.senderNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 1rem; margin: 1rem 0;">
            ${data.content}
          </blockquote>
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">Reply in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `New message from ${data.senderNumber || 'Unknown'}: ${data.content}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'outbound_message':
        subject = `Message Sent to ${data.recipientNumber || 'Unknown'}`
        htmlBody = `
          <h2>You sent a message</h2>
          <p><strong>To:</strong> ${data.recipientNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 1rem; margin: 1rem 0;">
            ${data.content}
          </blockquote>
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `Message sent to ${data.recipientNumber || 'Unknown'}: ${data.content}\n\n---\nNotification ID: ${notificationId}`
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
    }

    // Send email via Postmark
    const emailResponse = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': postmarkApiKey
      },
      body: JSON.stringify({
        From: 'notifications@snapsonic.com',
        To: prefs.email_address,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound'
      })
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Postmark error:', emailResult)
      throw new Error(`Postmark API error: ${emailResult.Message || 'Unknown error'}`)
    }

    console.log('Email sent successfully:', emailResult, 'Notification ID:', notificationId)

    return new Response(JSON.stringify({ success: true, notificationId: notificationId, postmarkMessageId: emailResult.MessageID }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-notification-email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})