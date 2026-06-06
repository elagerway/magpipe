/**
 * Appointment Reminder Skill Handler
 * Polls Cal.com for upcoming bookings, sends SMS/voice reminders to attendees.
 * Deduplicates via skill_executions — won't remind the same booking twice.
 * Requires Cal.com integration.
 */

import type { SkillHandler, SkillExecutionContext, SkillExecutionResult } from './types.ts'
import { resolveTemplate } from './template.ts'

const handler: SkillHandler = {
  async execute(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { config, isDryRun, supabaseClient, userId, agentSkill } = context
    const supabase = supabaseClient as ReturnType<typeof import('npm:@supabase/supabase-js@2').createClient>

    const reminderHours = (config.reminder_hours_before as number) || 24
    const messageTemplate = (config.message_template as string) || 'Hi {{contact_name}}, this is a reminder about your appointment on {{appointment_date}} at {{appointment_time}}.'
    const fallbackToSms = (config.fallback_to_sms as boolean) !== false
    const consentConfirmed = config.consent_confirmed as boolean

    if (!consentConfirmed && !isDryRun) {
      return {
        summary: 'Consent not confirmed. Reminders not sent.',
        actions_taken: ['skipped_no_consent'],
      }
    }

    // Check Cal.com integration
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*, integration_providers!inner(slug)')
      .eq('user_id', userId)
      .eq('integration_providers.slug', 'cal_com')
      .eq('status', 'connected')
      .maybeSingle()

    if (!integration) {
      return {
        summary: 'Cal.com not connected. Please connect your calendar integration first.',
        actions_taken: ['skipped_no_integration'],
      }
    }

    // Fetch upcoming bookings from Cal.com
    const eventTypeIds = (config.event_type_ids as number[]) || []
    const now = new Date()
    const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000)

    let bookings: Array<{
      uid: string
      title: string
      startTime: string
      eventTypeId?: number
      attendees: Array<{ name: string; email: string; phoneNumber?: string }>
    }> = []

    try {
      const calResponse = await fetch('https://api.cal.com/v2/bookings?status=upcoming', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
          'Content-Type': 'application/json',
          'cal-api-version': '2024-08-13',
        },
      })
      if (calResponse.ok) {
        const calData = await calResponse.json()
        bookings = (calData.data || []).filter((b: { startTime: string; eventTypeId?: number }) => {
          const start = new Date(b.startTime)
          const inWindow = start >= now && start <= windowEnd
          // Filter by event type if specific types selected (empty = all)
          const matchesType = eventTypeIds.length === 0 || eventTypeIds.includes(b.eventTypeId!)
          return inWindow && matchesType
        })
      } else {
        const errText = await calResponse.text()
        console.error('Cal.com API error:', calResponse.status, errText)
        return {
          summary: `Failed to fetch appointments from Cal.com (${calResponse.status}).`,
          actions_taken: ['error_cal_api'],
        }
      }
    } catch (err) {
      console.error('Cal.com API error:', err)
      return {
        summary: 'Failed to fetch appointments from Cal.com.',
        actions_taken: ['error_cal_api'],
      }
    }

    if (bookings.length === 0) {
      return {
        summary: 'No upcoming appointments within the reminder window.',
        actions_taken: ['no_appointments'],
      }
    }

    // Dedup: check which bookings already have a reminder execution
    const bookingUids = bookings.map(b => b.uid).filter(Boolean)
    const { data: existingExecutions } = await supabase
      .from('skill_executions')
      .select('trigger_context')
      .eq('agent_skill_id', agentSkill.id)
      .in('status', ['completed', 'running'])

    const remindedUids = new Set<string>()
    for (const exec of (existingExecutions || [])) {
      const uid = (exec.trigger_context as Record<string, unknown>)?.booking_uid
      if (uid) remindedUids.add(String(uid))
    }

    const unremindedBookings = bookings.filter(b => b.uid && !remindedUids.has(b.uid))

    if (unremindedBookings.length === 0) {
      return {
        summary: `${bookings.length} upcoming appointment(s) found, all already reminded.`,
        actions_taken: ['all_already_reminded'],
      }
    }

    // Build reminders
    const reminders = unremindedBookings.map(booking => {
      const startDate = new Date(booking.startTime)
      const attendee = booking.attendees?.[0] || { name: 'there', email: '' }
      const variables: Record<string, string> = {
        contact_name: attendee.name || 'there',
        contact_email: attendee.email || '',
        appointment_date: startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        appointment_time: startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        appointment_title: booking.title || 'your appointment',
        organization_name: (config.organization_name as string) || '',
      }
      return {
        message: resolveTemplate(messageTemplate, variables),
        contact: attendee,
        booking,
      }
    })

    if (isDryRun) {
      return {
        summary: `${reminders.length} appointment reminder(s) would be sent`,
        actions_taken: ['preview'],
        preview: reminders.map(r => `To: ${r.contact.name} (${r.contact.email}) — "${r.message}"`).join('\n\n'),
        data: { reminders: reminders.map(r => ({ message: r.message, contact: r.contact.name, booking_uid: r.booking.uid })) },
      }
    }

    // Send reminders
    const actionsTaken: string[] = []
    const sentBookings: string[] = []
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Get user's service number for sending SMS
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single()

    const deliveryChannels = (agentSkill.delivery_channels || []) as Array<{ channel: string }>
    const wantsVoice = deliveryChannels.some(c => c.channel === 'voice_call')
    const wantsSms = deliveryChannels.some(c => c.channel === 'sms')

    for (const reminder of reminders) {
      const attendeePhone = reminder.contact.phoneNumber
      let sent = false

      // Try voice call first if configured
      if (wantsVoice && attendeePhone) {
        try {
          const callResponse = await fetch(`${supabaseUrl}/functions/v1/initiate-bridged-call`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              userId,
              agentId: agentSkill.agent_id,
              toNumber: attendeePhone,
              context: `Appointment reminder: ${reminder.message}`,
            }),
          })
          if (callResponse.ok) {
            actionsTaken.push(`voice_call_sent:${reminder.booking.uid}`)
            sentBookings.push(reminder.booking.uid)
            sent = true
          }
        } catch (err) {
          console.error('Voice call failed for reminder:', err)
        }
      }

      // SMS fallback (or primary if no voice)
      if (!sent && (wantsSms || (wantsVoice && fallbackToSms)) && attendeePhone && serviceNumber) {
        try {
          // Send via scheduled_actions for proper SMS compliance
          await supabase.from('scheduled_actions').insert({
            user_id: userId,
            action_type: 'send_sms',
            scheduled_at: new Date().toISOString(),
            parameters: {
              recipient_phone: attendeePhone,
              recipient_name: reminder.contact.name,
              message: reminder.message,
              sender_number: serviceNumber.phone_number,
            },
            created_via: 'skill',
          })
          actionsTaken.push(`sms_queued:${reminder.booking.uid}`)
          sentBookings.push(reminder.booking.uid)
          sent = true
        } catch (err) {
          console.error('SMS queue failed for reminder:', err)
        }
      }

      if (!sent) {
        actionsTaken.push(`no_phone:${reminder.booking.uid}`)
      }
    }

    return {
      summary: `${sentBookings.length}/${reminders.length} appointment reminder(s) sent`,
      actions_taken: actionsTaken,
      data: {
        sent_count: sentBookings.length,
        total_count: reminders.length,
        booking_uids: sentBookings,
      },
    }
  }
}

export default handler
