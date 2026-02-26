/**
 * Batch Calls CRUD Edge Function
 * Handles creating, listing, updating, starting, and cancelling batch calls.
 * Supports recurring batches (parent-child model).
 * Deploy with: npx supabase functions deploy batch-calls --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase-client.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const user = await resolveUser(req, anonClient)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const serviceClient = getServiceClient()
    const body = await req.json()
    const { action, ...params } = body

    switch (action) {
      case 'create':
        return await handleCreate(serviceClient, user.id, params)
      case 'list':
        return await handleList(serviceClient, user.id, params)
      case 'list_runs':
        return await handleListRuns(serviceClient, user.id, params)
      case 'get':
        return await handleGet(serviceClient, user.id, params)
      case 'update':
        return await handleUpdate(serviceClient, user.id, params)
      case 'start':
        return await handleStart(serviceClient, user.id, params)
      case 'cancel':
        return await handleCancel(serviceClient, user.id, params)
      case 'admin_list':
        return await handleAdminList(serviceClient, user.id, params)
      case 'pause_series':
        return await handlePauseSeries(serviceClient, user.id, params)
      case 'resume_series':
        return await handleResumeSeries(serviceClient, user.id, params)
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error('batch-calls error:', err)
    return jsonResponse({ error: err.message || 'Internal server error' }, 500)
  }
})

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// --- Recurrence Helpers ---

function calculateNextRunTime(fromTime: Date, recurrenceType: string, interval: number): Date {
  const next = new Date(fromTime)
  switch (recurrenceType) {
    case 'hourly':
      next.setHours(next.getHours() + interval)
      break
    case 'daily':
      next.setDate(next.getDate() + interval)
      break
    case 'weekly':
      next.setDate(next.getDate() + (interval * 7))
      break
    case 'monthly':
      next.setMonth(next.getMonth() + interval)
      break
  }
  return next
}

async function spawnChildBatch(client: any, parent: any, occurrenceNumber: number, scheduledAt: Date | null): Promise<any> {
  // Clone parent config into a child batch
  const { data: child, error: childErr } = await client
    .from('batch_calls')
    .insert({
      user_id: parent.user_id,
      name: `${parent.name} — Run #${occurrenceNumber}`,
      caller_id: parent.caller_id,
      agent_id: parent.agent_id,
      status: scheduledAt ? 'scheduled' : 'running',
      send_now: !scheduledAt,
      scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
      window_start_time: parent.window_start_time,
      window_end_time: parent.window_end_time,
      window_days: parent.window_days,
      max_concurrency: parent.max_concurrency,
      reserved_concurrency: parent.reserved_concurrency,
      template_id: parent.template_id,
      purpose: parent.purpose,
      goal: parent.goal,
      parent_batch_id: parent.id,
      occurrence_number: occurrenceNumber,
      total_recipients: parent.total_recipients
    })
    .select()
    .single()

  if (childErr) {
    console.error('Failed to spawn child batch:', childErr)
    throw new Error('Failed to spawn child batch: ' + childErr.message)
  }

  // Clone recipients from parent
  const { data: parentRecipients } = await client
    .from('batch_call_recipients')
    .select('phone_number, name, contact_id, sort_order')
    .eq('batch_id', parent.id)
    .order('sort_order')

  if (parentRecipients?.length) {
    const childRecipients = parentRecipients.map((r: any) => ({
      batch_id: child.id,
      phone_number: r.phone_number,
      name: r.name,
      contact_id: r.contact_id,
      sort_order: r.sort_order
    }))

    const { error: recipErr } = await client
      .from('batch_call_recipients')
      .insert(childRecipients)

    if (recipErr) {
      console.error('Failed to clone recipients to child:', recipErr)
      await client.from('batch_calls').delete().eq('id', child.id)
      throw new Error('Failed to clone recipients: ' + recipErr.message)
    }
  }

  // Increment parent run count
  await client
    .from('batch_calls')
    .update({
      recurrence_run_count: (parent.recurrence_run_count || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', parent.id)

  return child
}

// --- Action Handlers ---

async function handleCreate(client: any, userId: string, params: any) {
  const { name, caller_id, agent_id, status, send_now, scheduled_at,
    window_start_time, window_end_time, window_days,
    max_concurrency, reserved_concurrency, template_id, purpose, goal, recipients,
    recurrence_type, recurrence_interval, recurrence_end_date, recurrence_max_runs } = params

  if (!name || !caller_id) {
    return jsonResponse({ error: 'name and caller_id are required' }, 400)
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return jsonResponse({ error: 'recipients array is required and must not be empty' }, 400)
  }

  if (recipients.length > 500) {
    return jsonResponse({ error: 'Maximum 500 recipients per batch' }, 400)
  }

  // Validate caller_id belongs to user
  const { data: numberCheck } = await client
    .from('service_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .eq('phone_number', caller_id)
    .eq('is_active', true)
    .single()

  if (!numberCheck) {
    return jsonResponse({ error: 'Invalid caller_id — not found in your service numbers' }, 400)
  }

  const isRecurring = recurrence_type && recurrence_type !== 'none'

  if (isRecurring) {
    // Create parent batch with 'recurring' status
    const { data: parent, error: parentErr } = await client
      .from('batch_calls')
      .insert({
        user_id: userId,
        name,
        caller_id,
        agent_id: agent_id || null,
        status: 'recurring',
        send_now: send_now ?? true,
        scheduled_at: scheduled_at || null,
        window_start_time: window_start_time || '00:00',
        window_end_time: window_end_time || '23:59',
        window_days: window_days || [0, 1, 2, 3, 4, 5, 6],
        max_concurrency: Math.min(5, Math.max(1, max_concurrency || 1)),
        reserved_concurrency: reserved_concurrency ?? 5,
        template_id: template_id || null,
        purpose: purpose || null,
        goal: goal || null,
        total_recipients: recipients.length,
        recurrence_type,
        recurrence_interval: recurrence_interval || 1,
        recurrence_end_date: recurrence_end_date || null,
        recurrence_max_runs: recurrence_max_runs || null,
        recurrence_run_count: 0
      })
      .select()
      .single()

    if (parentErr) {
      console.error('Failed to create recurring parent:', parentErr)
      return jsonResponse({ error: 'Failed to create batch: ' + parentErr.message }, 500)
    }

    // Insert recipients on the parent (template for cloning)
    const recipientRows = recipients.map((r: any, i: number) => ({
      batch_id: parent.id,
      phone_number: r.phone_number,
      name: r.name || null,
      contact_id: r.contact_id || null,
      sort_order: i
    }))

    const { error: recipErr } = await client
      .from('batch_call_recipients')
      .insert(recipientRows)

    if (recipErr) {
      console.error('Failed to insert parent recipients:', recipErr)
      await client.from('batch_calls').delete().eq('id', parent.id)
      return jsonResponse({ error: 'Failed to insert recipients: ' + recipErr.message }, 500)
    }

    // Spawn the first child run
    try {
      const firstChildSchedule = (send_now || !scheduled_at) ? null : new Date(scheduled_at)
      const child = await spawnChildBatch(client, parent, 1, firstChildSchedule)

      // Trigger processing for the first child if send_now
      if (!firstChildSchedule) {
        await triggerProcessing(child.id)
      }

      return jsonResponse({ batch: parent, first_run: child })
    } catch (err) {
      console.error('Failed to spawn first child:', err)
      return jsonResponse({ error: 'Batch created but first run failed: ' + err.message }, 500)
    }
  }

  // Non-recurring: original logic
  const { data: batch, error: batchErr } = await client
    .from('batch_calls')
    .insert({
      user_id: userId,
      name,
      caller_id,
      agent_id: agent_id || null,
      status: status || 'draft',
      send_now: send_now ?? true,
      scheduled_at: scheduled_at || null,
      window_start_time: window_start_time || '00:00',
      window_end_time: window_end_time || '23:59',
      window_days: window_days || [0, 1, 2, 3, 4, 5, 6],
      max_concurrency: Math.min(5, Math.max(1, max_concurrency || 1)),
      reserved_concurrency: reserved_concurrency ?? 5,
      template_id: template_id || null,
      purpose: purpose || null,
      goal: goal || null,
      total_recipients: recipients.length
    })
    .select()
    .single()

  if (batchErr) {
    console.error('Failed to create batch:', batchErr)
    return jsonResponse({ error: 'Failed to create batch: ' + batchErr.message }, 500)
  }

  // Bulk insert recipients
  const recipientRows = recipients.map((r: any, i: number) => ({
    batch_id: batch.id,
    phone_number: r.phone_number,
    name: r.name || null,
    contact_id: r.contact_id || null,
    sort_order: i
  }))

  const { error: recipErr } = await client
    .from('batch_call_recipients')
    .insert(recipientRows)

  if (recipErr) {
    console.error('Failed to insert recipients:', recipErr)
    // Clean up the batch record
    await client.from('batch_calls').delete().eq('id', batch.id)
    return jsonResponse({ error: 'Failed to insert recipients: ' + recipErr.message }, 500)
  }

  // If status is 'running' and send_now, trigger processing
  if ((status === 'running' || status === 'scheduled') && send_now) {
    try {
      await triggerProcessing(batch.id)
    } catch (err) {
      console.error('Failed to trigger processing:', err)
    }
  }

  return jsonResponse({ batch })
}

async function handleList(client: any, userId: string, params: any) {
  const { status: filterStatus, limit = 50, offset = 0 } = params || {}

  let query = client
    .from('batch_calls')
    .select('*')
    .eq('user_id', userId)
    .is('parent_batch_id', null) // Hide children from top-level list
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filterStatus) {
    query = query.eq('status', filterStatus)
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ batches: data || [] })
}

async function handleAdminList(client: any, userId: string, params: any) {
  // Verify caller is admin/god
  const { data: userProfile } = await client
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (!userProfile || (userProfile.role !== 'admin' && userProfile.role !== 'god')) {
    return jsonResponse({ error: 'Admin access required' }, 403)
  }

  const { status: filterStatus, limit = 50, offset = 0 } = params || {}

  let query = client
    .from('batch_calls')
    .select('*')
    .is('parent_batch_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filterStatus) {
    if (filterStatus === 'active') {
      query = query.in('status', ['running', 'scheduled', 'recurring'])
    } else {
      query = query.eq('status', filterStatus)
    }
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  // Look up user emails for the batches
  const userIds = [...new Set((data || []).map((b: any) => b.user_id))]
  const emailMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await client
      .from('users')
      .select('id, email')
      .in('id', userIds)
    if (users) {
      for (const u of users) emailMap[u.id] = u.email
    }
  }

  const batches = (data || []).map((b: any) => ({
    ...b,
    user_email: emailMap[b.user_id] || 'Unknown'
  }))

  return jsonResponse({ batches })
}

async function handleListRuns(client: any, userId: string, params: any) {
  const { parent_batch_id, limit = 50, offset = 0 } = params || {}

  if (!parent_batch_id) {
    return jsonResponse({ error: 'parent_batch_id is required' }, 400)
  }

  // Verify parent belongs to user
  const { data: parent } = await client
    .from('batch_calls')
    .select('id')
    .eq('id', parent_batch_id)
    .eq('user_id', userId)
    .single()

  if (!parent) {
    return jsonResponse({ error: 'Parent batch not found' }, 404)
  }

  const { data: runs, error } = await client
    .from('batch_calls')
    .select('*')
    .eq('parent_batch_id', parent_batch_id)
    .order('occurrence_number', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ runs: runs || [] })
}

async function handleGet(client: any, userId: string, params: any) {
  const { batch_id } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  const { data: batch, error } = await client
    .from('batch_calls')
    .select('*')
    .eq('id', batch_id)
    .eq('user_id', userId)
    .single()

  if (error || !batch) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  // Fetch recipients
  const { data: recipients } = await client
    .from('batch_call_recipients')
    .select('*')
    .eq('batch_id', batch_id)
    .order('sort_order')

  // For recurring parents, also fetch child runs
  let runs = null
  if (batch.status === 'recurring' || batch.status === 'paused') {
    const { data: childRuns } = await client
      .from('batch_calls')
      .select('id, occurrence_number, status, started_at, completed_at, completed_count, failed_count, total_recipients')
      .eq('parent_batch_id', batch_id)
      .order('occurrence_number', { ascending: false })
      .limit(20)
    runs = childRuns || []
  }

  return jsonResponse({ batch, recipients: recipients || [], runs })
}

async function handleUpdate(client: any, userId: string, params: any) {
  const { batch_id, ...updates } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  const { data: existing } = await client
    .from('batch_calls')
    .select('status')
    .eq('id', batch_id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  // Allow updating draft or recurring batches
  if (existing.status !== 'draft' && existing.status !== 'recurring') {
    return jsonResponse({ error: 'Can only update draft or recurring batches' }, 400)
  }

  // Whitelist updatable fields (including recurrence fields)
  const allowed = ['name', 'caller_id', 'agent_id', 'send_now', 'scheduled_at',
    'window_start_time', 'window_end_time', 'window_days', 'reserved_concurrency',
    'template_id', 'purpose', 'goal',
    'recurrence_type', 'recurrence_interval', 'recurrence_end_date', 'recurrence_max_runs']

  const safeUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key]
  }

  const { data: batch, error } = await client
    .from('batch_calls')
    .update(safeUpdates)
    .eq('id', batch_id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ batch })
}

async function handleStart(client: any, userId: string, params: any) {
  const { batch_id } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  const { data: batch } = await client
    .from('batch_calls')
    .select('*')
    .eq('id', batch_id)
    .eq('user_id', userId)
    .single()

  if (!batch) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  if (!['draft', 'scheduled', 'paused', 'cancelled', 'failed', 'completed', 'running'].includes(batch.status)) {
    return jsonResponse({ error: `Cannot start batch in ${batch.status} status` }, 400)
  }

  const isRerun = ['cancelled', 'failed', 'completed'].includes(batch.status)

  // Reset all recipients back to pending for re-runs
  if (isRerun) {
    const { error: resetErr, count: resetCount } = await client
      .from('batch_call_recipients')
      .update({ status: 'pending', call_record_id: null, error_message: null, attempted_at: null, completed_at: null })
      .eq('batch_id', batch_id)
      .neq('status', 'pending')

    console.log(`Re-run reset: ${resetCount ?? '?'} recipients reset to pending, error: ${resetErr?.message || 'none'}`)

    if (resetErr) {
      return jsonResponse({ error: 'Failed to reset recipients: ' + resetErr.message }, 500)
    }
  }

  const { error } = await client
    .from('batch_calls')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(isRerun ? { completed_count: 0, failed_count: 0 } : {})
    })
    .eq('id', batch_id)

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  // Trigger processing (must await — fire-and-forget can race with recipient reset)
  try {
    await triggerProcessing(batch_id)
  } catch (err) {
    console.error('Failed to trigger processing:', err)
  }

  return jsonResponse({ success: true, message: isRerun ? 'Batch re-started' : 'Batch started' })
}

async function handleCancel(client: any, userId: string, params: any) {
  const { batch_id } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  // Check if user is admin/god (can cancel any user's batch)
  const { data: userProfile } = await client
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'god'

  // Build query — admins skip ownership check
  let batchQuery = client
    .from('batch_calls')
    .select('status, recurrence_type')
    .eq('id', batch_id)
  if (!isAdmin) batchQuery = batchQuery.eq('user_id', userId)

  const { data: batch } = await batchQuery.single()

  if (!batch) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  if (batch.status === 'recurring' || (batch.recurrence_type && batch.recurrence_type !== 'none')) {
    // Cancel recurring parent
    let cancelParentQuery = client
      .from('batch_calls')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', batch_id)
    if (!isAdmin) cancelParentQuery = cancelParentQuery.eq('user_id', userId)
    await cancelParentQuery

    // Cancel all scheduled/running children
    const { data: activeChildren } = await client
      .from('batch_calls')
      .select('id')
      .eq('parent_batch_id', batch_id)
      .in('status', ['draft', 'scheduled', 'running', 'paused'])

    if (activeChildren?.length) {
      for (const child of activeChildren) {
        await client
          .from('batch_calls')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', child.id)

        // Skip pending recipients in each child
        await client
          .from('batch_call_recipients')
          .update({ status: 'skipped' })
          .eq('batch_id', child.id)
          .eq('status', 'pending')
      }
    }

    return jsonResponse({ success: true, message: 'Recurring series cancelled', cancelled_children: activeChildren?.length || 0 })
  }

  // Non-recurring: cancel batch
  let cancelQuery = client
    .from('batch_calls')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', batch_id)
    .in('status', ['draft', 'scheduled', 'running', 'paused'])
  if (!isAdmin) cancelQuery = cancelQuery.eq('user_id', userId)

  const { error: batchErr } = await cancelQuery

  if (batchErr) {
    return jsonResponse({ error: batchErr.message }, 500)
  }

  // Skip all pending recipients
  await client
    .from('batch_call_recipients')
    .update({ status: 'skipped' })
    .eq('batch_id', batch_id)
    .eq('status', 'pending')

  return jsonResponse({ success: true, message: 'Batch cancelled' })
}

async function handlePauseSeries(client: any, userId: string, params: any) {
  const { batch_id } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  const { error } = await client
    .from('batch_calls')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', batch_id)
    .eq('user_id', userId)
    .eq('status', 'recurring')

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ success: true, message: 'Series paused — no new runs will be spawned' })
}

async function handleResumeSeries(client: any, userId: string, params: any) {
  const { batch_id } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  const { error } = await client
    .from('batch_calls')
    .update({ status: 'recurring', updated_at: new Date().toISOString() })
    .eq('id', batch_id)
    .eq('user_id', userId)
    .eq('status', 'paused')

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  // Trigger process_due to check if next run should spawn now
  triggerProcessDue().catch(err => console.error('Failed to trigger process_due:', err))

  return jsonResponse({ success: true, message: 'Series resumed' })
}

// --- Processing Triggers ---

async function triggerProcessing(batchId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  await fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ batch_id: batchId })
  })
}

async function triggerProcessDue() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  await fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ action: 'process_due' })
  })
}

// Export for use by process-batch-calls
export { spawnChildBatch, calculateNextRunTime }
