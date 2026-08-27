/**
 * Skill API helpers for the Agent Skills Framework.
 * CRUD operations on skill_definitions, agent_skills, skill_executions.
 */

import { supabase, getCurrentUser } from './supabase.js'

/**
 * List all active skill definitions from the catalog.
 */
export async function listSkillDefinitions() {
  const { data, error } = await supabase
    .from('skill_definitions')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('sort_order')

  if (error) throw error
  return data || []
}

/**
 * List skills enabled for a specific agent, with full definition data.
 */
export async function listAgentSkills(agentId) {
  const { data, error } = await supabase
    .from('agent_skills')
    .select('*, skill_definitions(*)')
    .eq('agent_id', agentId)

  if (error) throw error
  return data || []
}

/**
 * Enable a skill for an agent with initial configuration.
 */
export async function enableSkill(agentId, skillDefinitionId, config = {}) {
  const { user } = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('agent_skills')
    .upsert({
      user_id: user.id,
      agent_id: agentId,
      skill_definition_id: skillDefinitionId,
      is_enabled: false,
      config,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'agent_id,skill_definition_id',
    })
    .select('*, skill_definitions(*)')
    .single()

  if (error) throw error
  return data
}

/**
 * Update skill configuration (config, trigger, delivery channels, etc.)
 */
export async function updateSkillConfig(agentSkillId, updates) {
  const { data, error } = await supabase
    .from('agent_skills')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentSkillId)
    .select('*, skill_definitions(*)')
    .single()

  if (error) throw error
  return data
}

/**
 * Disable a skill (keeps config, stops execution).
 */
export async function disableSkill(agentSkillId) {
  const { error } = await supabase
    .from('agent_skills')
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq('id', agentSkillId)

  if (error) throw error
}

/**
 * Delete a skill configuration entirely.
 */
export async function deleteSkill(agentSkillId) {
  const { error } = await supabase
    .from('agent_skills')
    .delete()
    .eq('id', agentSkillId)

  if (error) throw error
}

/**
 * Test/dry-run a skill — returns preview without sending anything.
 */
export async function testSkill(agentSkillId) {
  const { data, error } = await supabase.functions.invoke('execute-skill', {
    body: {
      agent_skill_id: agentSkillId,
      trigger_type: 'dry_run',
      trigger_context: {
        caller_phone: '+10005551234',
        caller_name: 'Test Contact',
        call_duration_seconds: 120,
        call_summary: 'This is a test call preview.',
        extracted_data: { sample_field: 'Sample value' },
      },
    },
  })

  if (error) throw error
  return data
}

/**
 * List execution history for an agent, with optional filters.
 */
export async function listExecutions(agentId, { status, limit = 50 } = {}) {
  let query = supabase
    .from('skill_executions')
    .select('*, skill_definitions(name, icon, slug)')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Cancel a pending execution.
 */
export async function cancelExecution(executionId) {
  const { error } = await supabase
    .from('skill_executions')
    .update({ status: 'cancelled' })
    .eq('id', executionId)
    .eq('status', 'pending')

  if (error) throw error
}

/**
 * Create a scheduled action for a schedule-triggered skill.
 * Called when a user saves a skill with schedule trigger type.
 */
export async function createScheduledAction(agentSkillId, scheduleConfig) {
  const { user } = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  // Calculate next run time from schedule config
  const nextRun = calculateNextRun(scheduleConfig)
  if (!nextRun) throw new Error('Invalid schedule configuration')

  const { error } = await supabase
    .from('scheduled_actions')
    .insert({
      user_id: user.id,
      action_type: 'execute_skill',
      scheduled_at: nextRun.toISOString(),
      parameters: { agent_skill_id: agentSkillId },
      created_via: 'ui',
    })

  if (error) throw error
}

/**
 * Fetch the agent's dynamic variables for field mapping UI.
 */
export async function fetchAgentDynamicVariables(agentId) {
  const { data, error } = await supabase
    .from('dynamic_variables')
    .select('id, name, description')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Fetch HubSpot contact properties via mcp-execute.
 * Returns an array of { name, label, type, group }.
 */
export async function fetchCrmFields() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        tool_name: 'hubspot_list_contact_properties',
        arguments: {},
        mode: 'execute',
      }),
    }
  )

  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to fetch CRM fields')
  }

  return result.result?.properties || []
}

/**
 * Fetch Cal.com event types via mcp-execute.
 * Returns an array of { id, slug, title, length }.
 */
export async function fetchCalEventTypes() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        tool_name: 'cal_com_list_event_types',
        arguments: {},
        mode: 'execute',
      }),
    }
  )

  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to fetch event types')
  }

  return result.result?.event_types || []
}

/**
 * Calculate the next run time from a schedule config.
 */
function calculateNextRun(schedule) {
  if (!schedule || !schedule.interval) return null

  const now = new Date()

  switch (schedule.interval) {
    case 'hours': {
      const hours = schedule.every || 6
      return new Date(now.getTime() + hours * 60 * 60 * 1000)
    }
    case 'daily': {
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      const next = new Date(now)
      next.setHours(hours, minutes, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      return next
    }
    case 'weekly': {
      const days = schedule.days || ['mon']
      const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      const currentDay = now.getDay()

      let daysToAdd = 7
      for (const day of days) {
        const targetDay = dayMap[day]
        if (targetDay === undefined) continue
        let diff = targetDay - currentDay
        if (diff <= 0) diff += 7
        if (diff < daysToAdd) daysToAdd = diff
      }

      const next = new Date(now)
      next.setDate(next.getDate() + daysToAdd)
      next.setHours(hours, minutes, 0, 0)
      return next
    }
    case 'monthly': {
      const day = schedule.day || 1
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number)
      const next = new Date(now)
      next.setMonth(next.getMonth() + 1)
      next.setDate(day)
      next.setHours(hours, minutes, 0, 0)
      return next
    }
    default:
      return null
  }
}
