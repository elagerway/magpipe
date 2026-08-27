/**
 * Execute Skill Edge Function
 *
 * Two entry paths:
 * 1. Direct: { agent_skill_id, trigger_type, trigger_context } — execute a specific skill
 * 2. Event: { event_type, agent_id, trigger_context } — find and execute all matching skills for an event
 *
 * Deploy with --no-verify-jwt (service role auth for cron/voice agent, user JWT for dry_run)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import type { SkillExecutionContext, SkillExecutionResult, SkillHandler } from '../_shared/skill-handlers/types.ts'

// Handler registry — maps handler_id to module import
const HANDLER_MODULES: Record<string, () => Promise<{ default: SkillHandler }>> = {
  'post_call_followup': () => import('../_shared/skill-handlers/post-call-followup.ts'),
  'appointment_reminder': () => import('../_shared/skill-handlers/appointment-reminder.ts'),
  'competitor_monitoring': () => import('../_shared/skill-handlers/competitor-monitoring.ts'),
  'daily_news_digest': () => import('../_shared/skill-handlers/daily-news-digest.ts'),
  'auto_crm_update': () => import('../_shared/skill-handlers/auto-crm-update.ts'),
  'social_media_monitoring': () => import('../_shared/skill-handlers/social-media-monitoring.ts'),
  'review_request': () => import('../_shared/skill-handlers/review-request.ts'),
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { agent_skill_id, event_type, agent_id, trigger_type, trigger_context = {} } = body

    // Path 2: Event-based — find all matching enabled skills for this agent + event
    if (event_type && agent_id) {
      return await handleEventTrigger(supabase, supabaseUrl, supabaseKey, agent_id, event_type, trigger_context)
    }

    // Path 1: Direct execution by agent_skill_id
    if (!agent_skill_id) {
      return new Response(JSON.stringify({ error: 'Missing agent_skill_id or event_type + agent_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const result = await executeSkill(supabase, supabaseUrl, supabaseKey, agent_skill_id, trigger_type || 'on_demand', trigger_context)

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('execute-skill error:', message)
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

/**
 * Handle event-based triggers: find all enabled skills for this agent that match the event
 */
async function handleEventTrigger(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseKey: string,
  agentId: string,
  eventType: string,
  triggerContext: Record<string, unknown>
) {
  // Idempotency for call_ends: the inbound voice path fires this event TWICE for
  // one call — once from agent.py at session end and once from webhook-call-status
  // on the SignalWire 'completed' callback — which delivered duplicate Slack/skill
  // notifications (with different durations). Atomically claim the call so only the
  // first caller delivers; the second is suppressed. The two callers pass the call
  // record id under different keys (call_record_id vs session_id). Fail-open: if the
  // claim errors (e.g. column missing), proceed with delivery rather than drop it. (#102)
  if (eventType === 'call_ends') {
    const callId = (triggerContext.call_record_id || triggerContext.session_id) as string | undefined
    if (callId) {
      const { data: claimed, error: claimErr } = await supabase
        .from('call_records')
        .update({ call_ends_delivered_at: new Date().toISOString() })
        .eq('id', callId)
        .is('call_ends_delivered_at', null)
        .select('id')
      if (!claimErr && (!claimed || claimed.length === 0)) {
        console.log(`[execute-skill] call_ends already delivered for call ${callId} — suppressing duplicate`)
        return new Response(JSON.stringify({ success: true, message: 'Duplicate call_ends suppressed', deduped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }
  }

  // Find all enabled skills for this agent that listen for this event
  const { data: agentSkills, error } = await supabase
    .from('agent_skills')
    .select('*, skill_definitions(*)')
    .eq('agent_id', agentId)
    .eq('is_enabled', true)
    .eq('trigger_type', 'event')

  if (error) {
    console.error('Error fetching agent skills:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Filter to skills that match this event type
  const matchingSkills = (agentSkills || []).filter((as: Record<string, unknown>) => {
    const def = as.skill_definitions as Record<string, unknown>
    const events = (def?.supported_events as string[]) || []
    return events.includes(eventType)
  })

  if (matchingSkills.length === 0) {
    // Fallback: if no skills configured but agent has extract_data.send_to for a service,
    // send extracted data directly. This bridges the old app_functions config to the new
    // skill-based delivery while users migrate to skills.
    if (eventType === 'call_ends') {
      const fallbackDeliveries = await deliverExtractDataFallback(supabase, supabaseUrl, supabaseKey, agentId, triggerContext)
      if (fallbackDeliveries.length > 0) {
        return new Response(JSON.stringify({ success: true, message: 'Delivered via extract_data fallback', deliveries: fallbackDeliveries }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'No matching skills', executed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Execute each matching skill (fire-and-forget, don't block on each)
  const results = await Promise.allSettled(
    matchingSkills.map((as: Record<string, unknown>) =>
      executeSkill(supabase, supabaseUrl, supabaseKey, as.id as string, 'event', triggerContext)
    )
  )

  const successes = results.filter(r => r.status === 'fulfilled').length
  const failures = results.filter(r => r.status === 'rejected').length

  return new Response(JSON.stringify({
    success: true,
    executed: matchingSkills.length,
    successes,
    failures,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/**
 * Execute a single skill by agent_skill_id
 */
async function executeSkill(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseKey: string,
  agentSkillId: string,
  triggerType: string,
  triggerContext: Record<string, unknown>
): Promise<{ success: boolean; execution_id?: string; status?: string; result?: SkillExecutionResult; dry_run?: boolean; error?: string; deliveries?: unknown[] }> {
  // 1. Load agent_skill + skill_definition
  const { data: agentSkill, error: skillError } = await supabase
    .from('agent_skills')
    .select('*, skill_definitions(*)')
    .eq('id', agentSkillId)
    .single()

  if (skillError || !agentSkill) {
    console.error('Skill not found:', agentSkillId, skillError)
    return { success: false, error: `Skill not found: ${agentSkillId}` }
  }

  const skillDef = agentSkill.skill_definitions

  // 2. Validate: enabled, handler exists
  if (!agentSkill.is_enabled && triggerType !== 'dry_run') {
    return { success: false, error: 'Skill is disabled' }
  }

  const isDryRun = triggerType === 'dry_run'

  // 3. Check for event delay — if delay configured, create scheduled_action instead
  if (triggerType === 'event' && !isDryRun) {
    const delayMinutes = (agentSkill.event_config as Record<string, unknown>)?.delay_minutes as number
    if (delayMinutes && delayMinutes > 0) {
      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
      await supabase.from('scheduled_actions').insert({
        user_id: agentSkill.user_id,
        action_type: 'execute_skill',
        scheduled_at: scheduledAt,
        parameters: {
          agent_skill_id: agentSkillId,
          skill_definition_id: skillDef.id,
          handler_id: skillDef.handler_id,
          trigger_context: triggerContext,
        },
        created_via: 'agent',
      })
      return { success: true, status: 'scheduled', result: { summary: `Scheduled for ${scheduledAt}`, actions_taken: ['scheduled'] } }
    }
  }

  // 4. Dedup: check for existing running execution of same skill
  if (!isDryRun) {
    const { data: running } = await supabase
      .from('skill_executions')
      .select('id')
      .eq('agent_skill_id', agentSkillId)
      .eq('status', 'running')
      .limit(1)

    if (running && running.length > 0) {
      return { success: false, error: 'Skill is already running' }
    }
  }

  // 5. Create execution row
  let executionId: string | undefined
  if (!isDryRun) {
    const { data: execution, error: insertError } = await supabase
      .from('skill_executions')
      .insert({
        user_id: agentSkill.user_id,
        agent_id: agentSkill.agent_id,
        agent_skill_id: agentSkillId,
        skill_definition_id: skillDef.id,
        trigger_type: triggerType,
        trigger_context: triggerContext,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating execution:', insertError)
      return { success: false, error: insertError.message }
    }
    executionId = execution.id
  }

  const startTime = Date.now()

  try {
    // 6. Load and execute handler
    const handlerId = skillDef.handler_id as string
    const handlerLoader = HANDLER_MODULES[handlerId]
    if (!handlerLoader) {
      throw new Error(`Unknown handler: ${handlerId}`)
    }

    const handlerModule = await handlerLoader()
    const handler: SkillHandler = handlerModule.default

    // Fetch agent config for template variables
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('name, organization_name, owner_name')
      .eq('id', agentSkill.agent_id)
      .single()

    const context: SkillExecutionContext = {
      agentSkill,
      skillDefinition: skillDef,
      triggerContext,
      config: { ...(agentSkill.config || {}), ...(agentConfig || {}) },
      isDryRun,
      supabaseClient: supabase,
      userId: agentSkill.user_id,
    }

    const result = await handler.execute(context)

    // 7. Dry run — return preview without delivery
    if (isDryRun) {
      return {
        success: true,
        status: 'completed',
        dry_run: true,
        result,
      }
    }

    // 8. Deliver results to configured channels
    const deliveries = await deliverResults(supabaseUrl, supabaseKey, agentSkill, result, triggerContext)

    // 9. Update execution to completed
    const executionTimeMs = Date.now() - startTime
    await supabase
      .from('skill_executions')
      .update({
        status: 'completed',
        result: result,
        deliveries: deliveries,
        completed_at: new Date().toISOString(),
        execution_time_ms: executionTimeMs,
      })
      .eq('id', executionId!)

    // 10. Update agent_skills counters
    await supabase.rpc('increment_skill_execution_count', { skill_id: agentSkillId })
      .then(() => {})
      .catch(() => {
        // Fallback: direct update if RPC doesn't exist
        supabase
          .from('agent_skills')
          .update({
            last_executed_at: new Date().toISOString(),
            execution_count: (agentSkill.execution_count || 0) + 1,
          })
          .eq('id', agentSkillId)
      })

    return {
      success: true,
      execution_id: executionId,
      status: 'completed',
      result,
      deliveries,
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Handler execution failed'
    console.error(`Skill handler error (${skillDef.handler_id}):`, message)

    if (executionId) {
      // Check retry count
      const { data: exec } = await supabase
        .from('skill_executions')
        .select('retry_count')
        .eq('id', executionId)
        .single()

      const retryCount = (exec?.retry_count || 0) + 1

      if (retryCount < 3) {
        // Re-queue for retry
        await supabase
          .from('skill_executions')
          .update({
            status: 'pending',
            retry_count: retryCount,
            error_message: message,
          })
          .eq('id', executionId)
      } else {
        // Terminal failure
        await supabase
          .from('skill_executions')
          .update({
            status: 'failed',
            retry_count: retryCount,
            error_message: message,
            completed_at: new Date().toISOString(),
            execution_time_ms: Date.now() - startTime,
          })
          .eq('id', executionId)
      }
    }

    return {
      success: false,
      execution_id: executionId,
      status: 'failed',
      error: message,
    }
  }
}

/**
 * Fallback: deliver extracted data to services when no skills are configured.
 * Checks agent_configs.functions.extract_data.send_to and dynamic_variables.send_to
 * to determine which services to deliver to. Bridges the old config to the new system.
 */
async function deliverExtractDataFallback(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseKey: string,
  agentId: string,
  triggerContext: Record<string, unknown>
): Promise<Array<{ channel: string; status: string; to?: string; error?: string }>> {
  const deliveries: Array<{ channel: string; status: string; to?: string; error?: string }> = []

  // Load agent config to check extract_data.send_to
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('user_id, functions')
    .eq('id', agentId)
    .single()

  if (!agentConfig) return deliveries

  const functions = agentConfig.functions as Record<string, any> || {}
  const extractDataConfig = functions.extract_data || {}

  // Check if Slack delivery is enabled via extract_data.send_to.slack
  if (!extractDataConfig.send_to?.slack) return deliveries

  // Load dynamic variables to get per-variable send_to and channel config
  const { data: dynamicVars } = await supabase
    .from('dynamic_variables')
    .select('name, description, send_to')
    .eq('agent_id', agentId)

  const vars = dynamicVars || []

  // Determine Slack channel from first variable with a slack_channel config
  let slackChannel: string | null = null
  for (const v of vars) {
    if (v.send_to?.slack_channel) {
      slackChannel = v.send_to.slack_channel
      break
    }
  }

  // Filter extracted data to only variables marked for Slack
  const extracted = (triggerContext.extracted_data as Record<string, unknown>) || {}
  const filteredData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(extracted)) {
    const varDef = vars.find(v => v.name === key)
    // Include if: variable explicitly marked for Slack, or no per-variable config (use global)
    if (varDef?.send_to?.slack !== false) {
      filteredData[key] = value
    }
  }

  if (Object.keys(filteredData).length === 0 && !triggerContext.call_summary) return deliveries

  // A silent call used to fall out one line above — no extracted data and no
  // summary. Now that a silent call HAS a summary, that guard alone would let
  // instant hang-ups back into customer channels (the #152 regression). Slack
  // only; SMS and email still report the call.
  if (triggerContext.caller_spoke === false) {
    console.log('[execute-skill] extract_data fallback: skipping Slack — caller never spoke')
    return deliveries
  }

  // Build rich Slack message (same format as skill delivery)
  const parts: string[] = []
  const tc = triggerContext

  if (tc.caller_phone || tc.contact_name) {
    const callerDisplay = tc.contact_name
      ? `${tc.contact_name} (${tc.caller_phone})`
      : String(tc.caller_phone)
    const direction = tc.direction === 'outbound' ? 'Outbound call to' : 'Inbound call from'
    parts.push(`*${direction} ${callerDisplay}*`)

    const meta: string[] = []
    if (tc.call_duration_seconds) {
      const mins = Math.floor(Number(tc.call_duration_seconds) / 60)
      const secs = Number(tc.call_duration_seconds) % 60
      meta.push(`Duration: ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`)
    }
    if (tc.user_sentiment) {
      meta.push(`Sentiment: ${tc.user_sentiment}`)
    }
    if (meta.length > 0) parts.push(meta.join(' • '))
  }

  if (tc.call_summary) {
    const summary = String(tc.call_summary)
    parts.push(`*Summary:* ${summary.length > 500 ? summary.substring(0, 500) + '...' : summary}`)
  }

  // Extracted data fields
  const dataEntries = Object.entries(filteredData)
    .filter(([key]) => key !== 'caller_name')

  if (dataEntries.length > 0) {
    const lines = dataEntries.map(([key, value]) => {
      const displayKey = key.replace(/_/g, ' ')
      let displayValue: string
      if (value === true) displayValue = 'Yes'
      else if (value === false) displayValue = 'No'
      else if (typeof value === 'string' && value.length > 100) displayValue = value.substring(0, 100) + '...'
      else displayValue = String(value ?? '')
      return `• *${displayKey}:* ${displayValue}`
    })
    parts.push(`*Extracted Data*\n${lines.join('\n')}`)
  }

  if (parts.length === 0) return deliveries

  try {
    await callNotificationFunction(supabaseUrl, supabaseKey, 'send-notification-slack', {
      userId: agentConfig.user_id,
      agentId,
      type: 'skill_execution',
      data: {
        message: parts.join('\n\n'),
        channel: slackChannel || undefined,
      }
    })
    deliveries.push({ channel: 'slack', status: 'sent', to: slackChannel || 'default' })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Delivery failed'
    deliveries.push({ channel: 'slack', status: 'failed', error: errMsg })
  }

  return deliveries
}

/**
 * Deliver skill results to configured channels.
 * Calls existing send-notification-* edge functions.
 */
async function deliverResults(
  supabaseUrl: string,
  supabaseKey: string,
  agentSkill: Record<string, unknown>,
  result: SkillExecutionResult,
  triggerContext: Record<string, unknown>
): Promise<Array<{ channel: string; status: string; to?: string; error?: string; sent_at?: string }>> {
  const channels = (agentSkill.delivery_channels || []) as Array<{ channel: string; to?: string; channel_name?: string; webhook_url?: string }>
  const deliveries: Array<{ channel: string; status: string; to?: string; error?: string; sent_at?: string }> = []

  for (const ch of channels) {
    try {
      switch (ch.channel) {
        case 'sms': {
          const to = ch.to === 'contact'
            ? (triggerContext.caller_phone as string)
            : (triggerContext.user_phone as string)

          if (!to) {
            deliveries.push({ channel: 'sms', status: 'skipped', error: 'No phone number available' })
            break
          }

          // Build message: prepend custom_text if set, then skill summary
          const smsMessage = ch.content_config?.custom_text
            ? `${ch.content_config.custom_text}\n\n${result.summary}`
            : result.summary

          await callNotificationFunction(supabaseUrl, supabaseKey, 'send-notification-sms', {
            userId: agentSkill.user_id,
            agentId: agentSkill.agent_id,
            type: 'skill_execution',
            data: {
              message: smsMessage,
              recipientPhone: to,
              skillName: (agentSkill as Record<string, unknown>).skill_definitions
                ? ((agentSkill as Record<string, unknown>).skill_definitions as Record<string, unknown>).name
                : 'Skill',
            }
          })
          deliveries.push({ channel: 'sms', status: 'sent', to, sent_at: new Date().toISOString() })
          break
        }

        case 'email': {
          const emailMessage = ch.content_config?.custom_text
            ? `${ch.content_config.custom_text}\n\n${result.summary}`
            : result.summary

          await callNotificationFunction(supabaseUrl, supabaseKey, 'send-notification-email', {
            userId: agentSkill.user_id,
            agentId: agentSkill.agent_id,
            type: 'skill_execution',
            data: {
              message: emailMessage,
              subject: `Skill Result: ${result.summary.substring(0, 50)}`,
            }
          })
          deliveries.push({ channel: 'email', status: 'sent', sent_at: new Date().toISOString() })
          break
        }

        case 'slack': {
          // A caller who never spoke produces no work, and customers read their
          // Slack channels as a work queue (see #152 — instant hang-ups used to
          // spam them). Slack only: the SMS and email alerts still go out, so
          // nothing is hidden from the owner.
          if (triggerContext.caller_spoke === false) {
            console.log('[execute-skill] skipping Slack delivery — caller never spoke')
            deliveries.push({ channel: 'slack', status: 'skipped', error: 'caller_never_spoke' })
            break
          }

          // Build rich Slack message with extracted data from trigger context
          const parts: string[] = []

          // Custom text header
          if (ch.content_config?.custom_text) {
            parts.push(ch.content_config.custom_text)
          }

          // Call metadata (if this was triggered by a call)
          const tc = triggerContext
          if (tc.caller_phone || tc.contact_name) {
            const callerDisplay = tc.contact_name
              ? `${tc.contact_name} (${tc.caller_phone})`
              : String(tc.caller_phone)
            const direction = tc.direction === 'outbound' ? 'Outbound call to' : 'Inbound call from'
            parts.push(`*${direction} ${callerDisplay}*`)

            const meta: string[] = []
            if (tc.call_duration_seconds) {
              const mins = Math.floor(Number(tc.call_duration_seconds) / 60)
              const secs = Number(tc.call_duration_seconds) % 60
              meta.push(`Duration: ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`)
            }
            if (tc.user_sentiment) {
              meta.push(`Sentiment: ${tc.user_sentiment}`)
            }
            if (meta.length > 0) parts.push(meta.join(' • '))
          }

          // Call summary
          if (tc.call_summary) {
            const summary = String(tc.call_summary)
            parts.push(`*Summary:* ${summary.length > 500 ? summary.substring(0, 500) + '...' : summary}`)
          }

          // Extracted data — filter by content_config.fields if specified
          const extracted = (tc.extracted_data as Record<string, unknown>) || {}
          const configuredFields = ch.content_config?.fields
          const dataEntries = Object.entries(extracted)
            .filter(([key]) => key !== 'caller_name') // caller_name is used for contact, not display
            .filter(([key]) => !configuredFields || configuredFields.length === 0 || configuredFields.includes(key))

          if (dataEntries.length > 0) {
            const lines = dataEntries.map(([key, value]) => {
              const displayKey = key.replace(/_/g, ' ')
              let displayValue: string
              if (value === true) displayValue = 'Yes'
              else if (value === false) displayValue = 'No'
              else if (typeof value === 'string' && value.length > 100) displayValue = value.substring(0, 100) + '...'
              else displayValue = String(value ?? '')
              return `• *${displayKey}:* ${displayValue}`
            })
            parts.push(`*Extracted Data*\n${lines.join('\n')}`)
          }

          // Fallback to skill result summary if no call context
          if (parts.length === 0 || (!tc.caller_phone && !tc.contact_name)) {
            parts.push(result.summary)
          }

          const slackMessage = parts.join('\n\n')

          await callNotificationFunction(supabaseUrl, supabaseKey, 'send-notification-slack', {
            userId: agentSkill.user_id,
            agentId: agentSkill.agent_id,
            type: 'skill_execution',
            data: {
              message: slackMessage,
              channel: ch.channel_name,
            }
          })
          deliveries.push({ channel: 'slack', status: 'sent', to: ch.channel_name, sent_at: new Date().toISOString() })
          break
        }

        case 'webhook': {
          if (ch.webhook_url) {
            await fetch(ch.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'skill_execution',
                skill: (agentSkill as Record<string, unknown>).skill_definitions,
                result,
                trigger_context: triggerContext,
              })
            })
            deliveries.push({ channel: 'webhook', status: 'sent', to: ch.webhook_url, sent_at: new Date().toISOString() })
          }
          break
        }

        default:
          deliveries.push({ channel: ch.channel, status: 'unsupported' })
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Delivery failed'
      console.error(`Delivery error (${ch.channel}):`, errMsg)
      deliveries.push({ channel: ch.channel, status: 'failed', error: errMsg })
    }
  }

  return deliveries
}

/**
 * Call an existing notification edge function via internal fetch
 */
async function callNotificationFunction(
  supabaseUrl: string,
  supabaseKey: string,
  functionName: string,
  body: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${functionName} failed (${response.status}): ${text}`)
  }
}
