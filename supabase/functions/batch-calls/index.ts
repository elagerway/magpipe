/**
 * Batch Calls CRUD Edge Function
 * Handles creating, listing, updating, starting, and cancelling batch calls.
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
      case 'get':
        return await handleGet(serviceClient, user.id, params)
      case 'update':
        return await handleUpdate(serviceClient, user.id, params)
      case 'start':
        return await handleStart(serviceClient, user.id, params)
      case 'cancel':
        return await handleCancel(serviceClient, user.id, params)
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

// --- Action Handlers ---

async function handleCreate(client: any, userId: string, params: any) {
  const { name, caller_id, agent_id, status, send_now, scheduled_at,
    window_start_time, window_end_time, window_days,
    reserved_concurrency, template_id, purpose, goal, recipients } = params

  if (!name || !caller_id) {
    return jsonResponse({ error: 'name and caller_id are required' }, 400)
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return jsonResponse({ error: 'recipients array is required and must not be empty' }, 400)
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

  // Create batch record
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

  return jsonResponse({ batch, recipients: recipients || [] })
}

async function handleUpdate(client: any, userId: string, params: any) {
  const { batch_id, ...updates } = params

  if (!batch_id) {
    return jsonResponse({ error: 'batch_id is required' }, 400)
  }

  // Only allow updating draft batches
  const { data: existing } = await client
    .from('batch_calls')
    .select('status')
    .eq('id', batch_id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  if (existing.status !== 'draft') {
    return jsonResponse({ error: 'Can only update draft batches' }, 400)
  }

  // Whitelist updatable fields
  const allowed = ['name', 'caller_id', 'agent_id', 'send_now', 'scheduled_at',
    'window_start_time', 'window_end_time', 'window_days', 'reserved_concurrency',
    'template_id', 'purpose', 'goal']

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

  // Update batch status
  const { error: batchErr } = await client
    .from('batch_calls')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', batch_id)
    .eq('user_id', userId)
    .in('status', ['draft', 'scheduled', 'running', 'paused'])

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

// --- Processing Trigger ---

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
