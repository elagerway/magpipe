import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const MAX_ACTIONS_PER_RUN = 50
const MAX_RETRIES = 3

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // SignalWire credentials for sending SMS
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    console.log('Processing scheduled actions...')

    // Check appointment reminders (runs every cron cycle)
    await checkAppointmentReminders(supabaseUrl, supabaseKey, supabase)

    // Get pending actions that are due
    const now = new Date().toISOString()
    const { data: pendingActions, error: fetchError } = await supabase
      .from('scheduled_actions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(MAX_ACTIONS_PER_RUN)

    if (fetchError) {
      console.error('Error fetching scheduled actions:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch actions', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pendingActions || pendingActions.length === 0) {
      console.log('No scheduled actions to process')
      return new Response(
        JSON.stringify({ message: 'No scheduled actions to process', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${pendingActions.length} scheduled actions to process`)

    const results = []

    for (const action of pendingActions) {
      console.log(`Processing action ${action.id}: ${action.action_type}`)

      // Mark as processing
      await supabase
        .from('scheduled_actions')
        .update({ status: 'processing' })
        .eq('id', action.id)

      try {
        if (action.action_type === 'send_sms') {
          await processSendSms(action, supabase, {
            signalwireProjectId,
            signalwireApiToken,
            signalwireSpaceUrl,
            supabaseUrl,
          })

          // Mark as completed
          await supabase
            .from('scheduled_actions')
            .update({
              status: 'completed',
              executed_at: new Date().toISOString(),
            })
            .eq('id', action.id)

          results.push({ id: action.id, success: true })
          console.log(`Action ${action.id} completed successfully`)

        } else if (action.action_type === 'execute_skill') {
          await processExecuteSkill(action, supabaseUrl, supabaseKey)

          // Mark as completed
          await supabase
            .from('scheduled_actions')
            .update({
              status: 'completed',
              executed_at: new Date().toISOString(),
            })
            .eq('id', action.id)

          // Schedule next execution based on skill's schedule_config
          await scheduleNextExecution(action, supabase)

          results.push({ id: action.id, success: true })
          console.log(`Action ${action.id} (execute_skill) completed successfully`)

        } else {
          // Unknown action type
          throw new Error(`Unknown action type: ${action.action_type}`)
        }

      } catch (error) {
        console.error(`Error processing action ${action.id}:`, error)

        const newRetryCount = (action.retry_count || 0) + 1
        const shouldRetry = newRetryCount < MAX_RETRIES

        await supabase
          .from('scheduled_actions')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            error_message: error.message,
            retry_count: newRetryCount,
            // If retrying, push back 5 minutes
            ...(shouldRetry && {
              scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
            }),
          })
          .eq('id', action.id)

        results.push({
          id: action.id,
          success: false,
          error: error.message,
          willRetry: shouldRetry,
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        message: 'Scheduled actions processing complete',
        processed: pendingActions.length,
        succeeded: successCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-scheduled-actions:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Process a scheduled SMS action
 */
async function processSendSms(
  action: any,
  supabase: any,
  config: {
    signalwireProjectId: string
    signalwireApiToken: string
    signalwireSpaceUrl: string
    supabaseUrl: string
  }
) {
  const { parameters } = action
  const { recipient_phone, recipient_name, message, sender_number } = parameters

  if (!recipient_phone || !message) {
    throw new Error('Missing required parameters: recipient_phone and message')
  }

  // Get sender number - use provided or get user's default
  let fromNumber = sender_number
  if (!fromNumber) {
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', action.user_id)
      .limit(1)
      .single()

    if (!serviceNumber) {
      throw new Error('No service number available to send from')
    }
    fromNumber = serviceNumber.phone_number
  }

  // Check opt-out status
  const { data: optOut } = await supabase
    .from('sms_opt_outs')
    .select('id')
    .eq('phone_number', recipient_phone)
    .single()

  if (optOut) {
    throw new Error('Recipient has opted out of SMS messages')
  }

  // Send SMS via SignalWire
  const statusCallbackUrl = `${config.supabaseUrl}/functions/v1/webhook-sms-status`

  // Check if sending from US number for compliance
  const isUSNumber = fromNumber.startsWith('+1')
  const messageBody = isUSNumber ? `${message}\n\nSTOP to opt out` : message

  const smsData = new URLSearchParams({
    From: fromNumber,
    To: recipient_phone,
    Body: messageBody,
    StatusCallback: statusCallbackUrl,
  })

  const auth = btoa(`${config.signalwireProjectId}:${config.signalwireApiToken}`)
  const smsResponse = await fetch(
    `https://${config.signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${config.signalwireProjectId}/Messages`,
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
    throw new Error(`SignalWire SMS send failed: ${errorText}`)
  }

  const smsResult = await smsResponse.json()
  const messageSid = smsResult.sid

  // Log the outbound SMS
  await supabase
    .from('sms_messages')
    .insert({
      user_id: action.user_id,
      sender_number: fromNumber,
      recipient_number: recipient_phone,
      direction: 'outbound',
      content: message,
      status: 'pending',
      message_sid: messageSid,
      sent_at: new Date().toISOString(),
      is_ai_generated: false,
    })

  // Deduct credits for the scheduled SMS
  await deductSmsCredits(config.supabaseUrl, action.user_id, 1)

  console.log(`Scheduled SMS sent to ${recipient_phone} (SID: ${messageSid})`)
}

/**
 * Process a scheduled skill execution action
 */
async function processExecuteSkill(
  action: any,
  supabaseUrl: string,
  supabaseKey: string
) {
  const { parameters } = action
  const { agent_skill_id, trigger_context } = parameters

  if (!agent_skill_id) {
    throw new Error('Missing required parameter: agent_skill_id')
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      agent_skill_id,
      trigger_type: 'schedule',
      trigger_context: trigger_context || {},
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`execute-skill failed (${response.status}): ${errorText}`)
  }

  const result = await response.json()
  if (!result.success) {
    throw new Error(`Skill execution failed: ${result.error || 'Unknown error'}`)
  }

  console.log(`Skill execution completed: ${result.execution_id}`)
}

/**
 * Schedule the next execution of a recurring skill.
 * Reads the agent_skill's schedule_config to determine the next run time.
 */
async function scheduleNextExecution(action: any, supabase: any) {
  const { parameters } = action
  const { agent_skill_id } = parameters

  if (!agent_skill_id) return

  // Load the agent skill to get schedule config
  const { data: agentSkill } = await supabase
    .from('agent_skills')
    .select('schedule_config, is_enabled')
    .eq('id', agent_skill_id)
    .single()

  if (!agentSkill || !agentSkill.is_enabled) return

  const schedule = agentSkill.schedule_config
  if (!schedule || !schedule.interval) return

  let nextRun: Date | null = null
  const now = new Date()

  switch (schedule.interval) {
    case 'hours': {
      const hours = schedule.every || 6
      nextRun = new Date(now.getTime() + hours * 60 * 60 * 1000)
      break
    }
    case 'daily': {
      // Next day at the configured time
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      nextRun = new Date(now)
      nextRun.setDate(nextRun.getDate() + 1)
      nextRun.setHours(hours, minutes, 0, 0)
      break
    }
    case 'weekly': {
      // Next occurrence of configured days
      const days = schedule.days || ['mon']
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      const currentDay = now.getDay()

      // Find next matching day
      let daysToAdd = 7
      for (const day of days) {
        const targetDay = dayMap[day]
        if (targetDay === undefined) continue
        let diff = targetDay - currentDay
        if (diff <= 0) diff += 7
        if (diff < daysToAdd) daysToAdd = diff
      }

      nextRun = new Date(now)
      nextRun.setDate(nextRun.getDate() + daysToAdd)
      nextRun.setHours(hours, minutes, 0, 0)
      break
    }
    case 'monthly': {
      const day = schedule.day || 1
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      nextRun = new Date(now)
      nextRun.setMonth(nextRun.getMonth() + 1)
      nextRun.setDate(day)
      nextRun.setHours(hours, minutes, 0, 0)
      break
    }
  }

  if (nextRun) {
    const { error: insertError } = await supabase.from('scheduled_actions').insert({
      user_id: action.user_id,
      action_type: 'execute_skill',
      scheduled_at: nextRun.toISOString(),
      parameters: {
        agent_skill_id,
        ...parameters,
      },
      created_via: 'agent',
    })
    if (insertError) {
      console.error(`Failed to schedule next skill execution:`, insertError)
    } else {
      console.log(`Next skill execution scheduled for ${nextRun.toISOString()}`)
    }
  }
}

/**
 * Check all enabled appointment_reminder skills and execute them.
 * Runs every cron cycle. The handler itself handles dedup per booking.
 */
async function checkAppointmentReminders(
  supabaseUrl: string,
  supabaseKey: string,
  supabase: any
) {
  try {
    // Find all enabled appointment_reminder skills
    const { data: reminderSkills, error } = await supabase
      .from('agent_skills')
      .select('id, agent_id, skill_definitions!inner(slug, handler_id)')
      .eq('is_enabled', true)
      .eq('skill_definitions.slug', 'appointment_reminder')

    if (error || !reminderSkills || reminderSkills.length === 0) return

    console.log(`Found ${reminderSkills.length} active appointment reminder skill(s)`)

    for (const skill of reminderSkills) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            agent_skill_id: skill.id,
            trigger_type: 'event',
            trigger_context: { event: 'appointment_check' },
          }),
        })

        if (response.ok) {
          const result = await response.json()
          console.log(`Appointment reminder check for skill ${skill.id}: ${result.result?.summary || 'done'}`)
        } else {
          console.error(`Appointment reminder check failed for skill ${skill.id}:`, await response.text())
        }
      } catch (err) {
        console.error(`Error checking appointment reminders for skill ${skill.id}:`, err)
      }
    }
  } catch (err) {
    console.error('Error in checkAppointmentReminders:', err)
  }
}

/**
 * Deduct credits for SMS messages
 */
async function deductSmsCredits(supabaseUrl: string, userId: string, messageCount: number) {
  try {
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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
      console.log(`Deducted $${result.cost} for ${messageCount} scheduled SMS, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}
