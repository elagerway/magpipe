import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function autoEnrichContact(
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
 * Check if the current time is within the agent's schedule
 * @param schedule - Schedule object with days as keys
 * @param timezone - IANA timezone string
 * @returns boolean - true if within schedule, false if outside
 */
export function isWithinSchedule(
  schedule: Record<string, { enabled: boolean; start: string; end: string }>,
  timezone?: string
): boolean {
  try {
    const tz = timezone || 'America/Los_Angeles'
    const now = new Date()

    // Get current day and time in the agent's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase()
    const hour = parts.find(p => p.type === 'hour')?.value
    const minute = parts.find(p => p.type === 'minute')?.value

    if (!weekday || !hour || !minute) {
      console.error('Failed to parse current time for schedule check')
      return true // Default to available on parse error
    }

    const currentTime = `${hour}:${minute}`
    const daySchedule = schedule[weekday]

    if (!daySchedule) {
      console.log(`No schedule defined for ${weekday}, defaulting to available`)
      return true
    }

    if (!daySchedule.enabled) {
      console.log(`Schedule disabled for ${weekday}`)
      return false
    }

    // Compare times as strings (HH:MM format)
    const isWithin = currentTime >= daySchedule.start && currentTime <= daySchedule.end
    console.log(`Schedule check: ${weekday} ${currentTime} in ${daySchedule.start}-${daySchedule.end}: ${isWithin}`)

    return isWithin
  } catch (error) {
    console.error('Error checking schedule:', error)
    return true // Default to available on error
  }
}

/**
 * Send Slack notification for incoming SMS
 * Returns thread info so agent response can be added as reply
 */
export async function sendSlackNotification(
  userId: string,
  senderPhone: string,
  messageContent: string,
  supabase: any
): Promise<{ channel: string; ts: string; accessToken: string } | null> {
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
      return null
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
        return null
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
      return null
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
      return null
    } else {
      console.log('Slack notification sent for SMS from', senderPhone, 'ts:', result.ts)
      return {
        channel: channelId,
        ts: result.ts,
        accessToken: integration.access_token
      }
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
    return null
  }
}

/**
 * Send agent response as a thread reply to the Slack notification
 */
export async function sendSlackAgentReply(
  slackThread: { channel: string; ts: string; accessToken: string },
  agentName: string,
  agentReply: string
) {
  try {
    const slackMessage = {
      channel: slackThread.channel,
      thread_ts: slackThread.ts,
      text: `🤖 ${agentName} replied`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤖 *${agentName} replied:*\n>${agentReply.replace(/\n/g, '\n>')}`
          }
        }
      ]
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackThread.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('Slack agent reply failed:', result.error)
    } else {
      console.log('Slack agent reply sent in thread')
    }
  } catch (error) {
    console.error('Error sending Slack agent reply:', error)
  }
