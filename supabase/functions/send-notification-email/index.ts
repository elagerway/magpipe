import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildEmailBody } from '../_shared/build-notification-body.ts'
import { handleCors, corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const { userId, agentId, type, data, content_config: reqContentConfig } = await req.json()

    if (!userId || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')!
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

    // Skill executions bypass notification prefs — they have their own delivery config
    const isSkillExecution = type === 'skill_execution'

    if (!isSkillExecution) {
      if (!prefs || !prefs.email_enabled) {
        console.log('Email notifications not enabled for user:', userId)
        return new Response(JSON.stringify({ message: 'Notifications not enabled' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check if this notification type is enabled
      let typeEnabled = false

      if (type === 'completed_call') {
        typeEnabled = prefs.email_inbound_calls || prefs.email_all_calls
      } else if (type === 'missed_call') {
        typeEnabled = prefs.email_all_calls
      } else if (type === 'new_message') {
        typeEnabled = prefs.email_inbound_messages || prefs.email_all_messages
      } else if (type === 'outbound_message') {
        typeEnabled = prefs.email_all_messages
      }

      if (!typeEnabled) {
        console.log(`Email notifications for ${type} not enabled for user:`, userId)
        return new Response(JSON.stringify({ message: 'Notification type not enabled' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Generate notification ID for tracking
    const notificationId = crypto.randomUUID()

    // Resolve content_config: per-request override → prefs.content_config.email
    const contentConfig = reqContentConfig || prefs?.content_config?.email || null

    // Try content_config first (for call notification types)
    let subject = ''
    let htmlBody = ''
    let textBody = ''

    if (contentConfig && type !== 'skill_execution') {
      const custom = buildEmailBody(type, data, contentConfig, notificationId)
      if (custom) {
        subject = custom.subject
        htmlBody = custom.htmlBody
        textBody = custom.textBody
      }
    }

    // Inline formatting for a single line (bold, links)
    const formatLine = (line: string): string => line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .replace(/(https?:\/\/[^\s&<]+)/g, '<a href="$1" style="color: #6366f1; text-decoration: none;">$1</a>')

    // Build email content based on notification type (fallback when no content_config)
    if (!subject) switch (type) {
      case 'missed_call':
        subject = `Missed Call from ${data.callerNumber || 'Unknown'}`
        htmlBody = `
          <h2>You have a missed call</h2>
          <p><strong>From:</strong> ${data.callerNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}</p>
          ${data.duration ? `<p><strong>Duration:</strong> ${data.duration} seconds</p>` : ''}
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `You have a missed call from ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'completed_call':
        subject = `Call ${data.successful ? 'Completed' : 'Ended'} - ${data.callerNumber || 'Unknown'}`
        htmlBody = `
          <h2>Call ${data.successful ? 'completed' : 'ended'}</h2>
          <p><strong>From:</strong> ${data.callerNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}</p>
          ${data.duration ? `<p><strong>Duration:</strong> ${data.duration} seconds</p>` : ''}
          ${data.recordingUrl && String(data.recordingUrl).startsWith('https://') ? `<p><strong>Recording:</strong> <a href="${String(data.recordingUrl).replace(/"/g, '%22')}" style="color: #6366f1;">Listen to recording</a></p>` : ''}
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `Call ${data.successful ? 'completed' : 'ended'} with ${data.callerNumber || 'Unknown'} at ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}${data.recordingUrl && String(data.recordingUrl).startsWith('https://') ? `\nRecording: ${data.recordingUrl}` : ''}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'new_message':
        subject = `New Message from ${data.senderNumber || 'Unknown'}`
        htmlBody = `
          <h2>You have a new message</h2>
          <p><strong>From:</strong> ${data.senderNumber || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}</p>
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
          <p><strong>Time:</strong> ${new Date(data.timestamp).toLocaleString('en-US', { timeZone: userTimezone })}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 1rem; margin: 1rem 0;">
            ${data.content}
          </blockquote>
          <p><a href="${supabaseUrl.replace('supabase.co', 'vercel.app')}/inbox">View in Inbox</a></p>
          <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
        `
        textBody = `Message sent to ${data.recipientNumber || 'Unknown'}: ${data.content}\n\n---\nNotification ID: ${notificationId}`
        break

      case 'skill_execution': {
        subject = data.subject || 'Skill Execution Result'
        const rawMessage = data.message || ''
        textBody = rawMessage

        // Convert markdown-like text to HTML, processing line by line
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const lines = rawMessage.split('\n')
        const htmlLines: string[] = []
        let inList = false

        for (const line of lines) {
          if (line.trim() === '---') {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push('<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;">')
            continue
          }

          const bulletMatch = line.match(/^[•\-] (.+)$/)
          if (bulletMatch) {
            if (!inList) { htmlLines.push('<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">'); inList = true }
            htmlLines.push(`<li style="margin-bottom: 0.35rem;">${formatLine(esc(bulletMatch[1]))}</li>`)
            continue
          }

          if (inList) { htmlLines.push('</ul>'); inList = false }

          if (line.trim() === '') {
            htmlLines.push('<br>')
          } else {
            htmlLines.push(`<p style="margin: 0.25rem 0;">${formatLine(esc(line))}</p>`)
          }
        }
        if (inList) htmlLines.push('</ul>')

        htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto; line-height: 1.6; color: #1f2937;">
            ${htmlLines.join('\n')}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0 1rem;">
            <p style="color: #9ca3af; font-size: 0.75rem;">Sent by Magpipe Skills · <a href="https://magpipe.ai" style="color: #6b7280;">magpipe.ai</a></p>
          </div>
        `
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    // Resolve recipient email — prefs may be null for skill executions
    let recipientEmail = prefs?.email_address
    if (!recipientEmail && isSkillExecution) {
      // Fall back to user's auth email
      const { data: userData } = await supabase.auth.admin.getUserById(userId).then(r => ({ data: r.data?.user }))
      recipientEmail = userData?.email
    }
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'No recipient email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
        From: Deno.env.get('NOTIFICATION_EMAIL') || 'info@magpipe.ai',
        To: recipientEmail,
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in send-notification-email:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})