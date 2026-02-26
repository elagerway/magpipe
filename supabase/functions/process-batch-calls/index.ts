/**
 * Process Batch Calls Worker
 * Picks up pending recipients in a running batch and initiates calls.
 * Handles recurring batch spawning when children complete.
 * Called by batch-calls edge function or cron job.
 * Deploy with: npx supabase functions deploy process-batch-calls --no-verify-jwt
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase-client.ts'

const CHUNK_SIZE = 5 // Process this many recipients per invocation
const CALL_DELAY_MS = 1200 // Each recipient fires 2 API calls (agent + PSTN), 1200ms keeps us under SignalWire's 1 CPS limit
const MAX_CONCURRENCY_CEILING = 5 // Hard ceiling regardless of user setting

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const { batch_id, action } = await req.json()
    const client = getServiceClient()

    // Support processing due scheduled batches (from cron)
    if (action === 'process_due') {
      return await processDueBatches(client)
    }

    if (!batch_id) {
      return jsonResponse({ error: 'batch_id is required' }, 400)
    }

    return await processBatch(client, batch_id)
  } catch (err) {
    console.error('process-batch-calls error:', err)
    return jsonResponse({ error: err.message || 'Internal server error' }, 500)
  }
})

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// --- Recurrence helpers (inlined to avoid cross-function imports in Deno edge functions) ---

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

  console.log(`Spawned child batch ${child.id} (run #${occurrenceNumber}) for parent ${parent.id}`)
  return child
}

async function processDueBatches(client: any) {
  let totalProcessed = 0

  // 1. Find scheduled batches that are due
  const { data: dueBatches } = await client
    .from('batch_calls')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10)

  if (dueBatches?.length) {
    for (const batch of dueBatches) {
      await client
        .from('batch_calls')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', batch.id)

      await processBatch(client, batch.id)
    }
    totalProcessed += dueBatches.length
  }

  // 2. Continue running batches
  const { data: runningBatches } = await client
    .from('batch_calls')
    .select('id')
    .eq('status', 'running')
    .limit(10)

  if (runningBatches?.length) {
    for (const batch of runningBatches) {
      await processBatch(client, batch.id)
    }
    totalProcessed += runningBatches.length
  }

  // 3. Handle recurring parents that need next child spawned
  await spawnDueRecurringChildren(client)

  if (totalProcessed === 0) {
    return jsonResponse({ message: 'No batches to process' })
  }

  return jsonResponse({ processed: totalProcessed })
}

async function spawnDueRecurringChildren(client: any) {
  // Find recurring parents that have no active (scheduled/running) children
  const { data: recurringParents } = await client
    .from('batch_calls')
    .select('*')
    .eq('status', 'recurring')
    .limit(20)

  if (!recurringParents?.length) return

  for (const parent of recurringParents) {
    try {
      // Check if there's already an active child
      const { count: activeChildren } = await client
        .from('batch_calls')
        .select('*', { count: 'exact', head: true })
        .eq('parent_batch_id', parent.id)
        .in('status', ['scheduled', 'running'])

      if ((activeChildren || 0) > 0) continue // Already has an active run

      // Check max runs limit
      if (parent.recurrence_max_runs && (parent.recurrence_run_count || 0) >= parent.recurrence_max_runs) {
        console.log(`Recurring batch ${parent.id} reached max runs (${parent.recurrence_max_runs}), marking completed`)
        await client
          .from('batch_calls')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', parent.id)
        continue
      }

      // Check end date
      if (parent.recurrence_end_date && new Date(parent.recurrence_end_date) < new Date()) {
        console.log(`Recurring batch ${parent.id} passed end date, marking completed`)
        await client
          .from('batch_calls')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', parent.id)
        continue
      }

      // Get last completed child to calculate next run time
      const { data: lastChild } = await client
        .from('batch_calls')
        .select('completed_at, started_at, occurrence_number')
        .eq('parent_batch_id', parent.id)
        .order('occurrence_number', { ascending: false })
        .limit(1)
        .single()

      const nextOccurrence = (lastChild?.occurrence_number || 0) + 1
      const baseTime = lastChild?.completed_at || lastChild?.started_at || parent.created_at
      const nextRunTime = calculateNextRunTime(
        new Date(baseTime),
        parent.recurrence_type,
        parent.recurrence_interval || 1
      )

      const now = new Date()
      if (nextRunTime <= now) {
        // Due now — spawn as running
        const child = await spawnChildBatch(client, parent, nextOccurrence, null)
        // Trigger processing
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ batch_id: child.id })
        }).catch(err => console.error('Failed to trigger child processing:', err))
      } else {
        // Future — spawn as scheduled
        await spawnChildBatch(client, parent, nextOccurrence, nextRunTime)
      }
    } catch (err) {
      console.error(`Failed to process recurring parent ${parent.id}:`, err)
    }
  }
}

async function processBatch(client: any, batchId: string) {
  // Fetch batch details
  const { data: batch, error } = await client
    .from('batch_calls')
    .select('*')
    .eq('id', batchId)
    .single()

  if (error || !batch) {
    return jsonResponse({ error: 'Batch not found' }, 404)
  }

  if (batch.status !== 'running') {
    return jsonResponse({ message: `Batch is ${batch.status}, not running` })
  }

  // Check call window
  if (!isWithinCallWindow(batch)) {
    return jsonResponse({ message: 'Outside call window, will retry later' })
  }

  // Check active calls count
  const { count: activeCalls } = await client
    .from('batch_call_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'calling')

  const maxConcurrent = Math.min(MAX_CONCURRENCY_CEILING, Math.max(1, (batch.max_concurrency || 1)))
  const availableSlots = maxConcurrent - (activeCalls || 0)

  if (availableSlots <= 0) {
    return jsonResponse({ message: 'All concurrency slots in use' })
  }

  // Get next pending recipients
  const { data: pending } = await client
    .from('batch_call_recipients')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .order('sort_order')
    .limit(Math.min(availableSlots, CHUNK_SIZE))

  if (!pending?.length) {
    // No more pending — check if batch is done
    const { count: remainingPending } = await client
      .from('batch_call_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .in('status', ['pending', 'calling', 'initiated', 'ringing', 'in_progress'])

    if ((remainingPending || 0) === 0) {
      await client
        .from('batch_calls')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', batchId)

      // If this is a child of a recurring parent, trigger next-run check
      if (batch.parent_batch_id) {
        triggerRecurringCheck().catch(err => console.error('Failed to trigger recurring check:', err))
      }

      return jsonResponse({ message: 'Batch completed', completed: true })
    }

    return jsonResponse({ message: 'Waiting for active calls to finish' })
  }

  // SignalWire credentials for direct PSTN calling
  const swProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
  const swToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
  const swSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!
  const swAuth = btoa(`${swProjectId}:${swToken}`)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Process each pending recipient
  let initiated = 0
  let failed = 0

  for (const recipient of pending) {
    try {
      // Mark as calling
      await client
        .from('batch_call_recipients')
        .update({ status: 'calling', attempted_at: new Date().toISOString() })
        .eq('id', recipient.id)

      // Create call record
      const { data: callRecord, error: insertError } = await client
        .from('call_records')
        .insert({
          user_id: batch.user_id,
          caller_number: recipient.phone_number,
          contact_phone: recipient.phone_number,
          service_number: batch.caller_id,
          direction: 'outbound',
          disposition: 'outbound_completed',
          status: 'initiated',
          started_at: new Date().toISOString(),
          duration_seconds: 0,
          duration: 0,
          voice_platform: 'livekit',
          telephony_vendor: 'signalwire',
          call_purpose: batch.purpose || null,
          call_goal: batch.goal || null,
          template_id: batch.template_id || null,
        })
        .select()
        .single()

      if (insertError) throw new Error(`Failed to create call record: ${insertError.message}`)

      // Link recipient to call record
      await client
        .from('batch_call_recipients')
        .update({ call_record_id: callRecord.id })
        .eq('id', recipient.id)

      // Conference bridge: fire both legs in parallel
      const livekitSipDomain = Deno.env.get('LIVEKIT_SIP_DOMAIN')!
      const livekitSipUri = `sip:${batch.caller_id}@${livekitSipDomain};transport=tls`
      const confName = `batch-${recipient.id}`
      const statusCallbackUrl = `${supabaseUrl}/functions/v1/outbound-call-status`
      const swCallUrl = `https://${swSpaceUrl}/api/laml/2010-04-01/Accounts/${swProjectId}/Calls.json`
      const swHeaders = { 'Authorization': `Basic ${swAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' }

      // Leg 1: Agent SIP
      const agentCxmlUrl = `${supabaseUrl}/functions/v1/batch-call-cxml?leg=agent&conf=${encodeURIComponent(confName)}`
      const agentFormBody = [
        `To=${encodeURIComponent(livekitSipUri)}`,
        `From=${encodeURIComponent(batch.caller_id)}`,
        `Url=${encodeURIComponent(agentCxmlUrl)}`,
        `Method=POST`,
      ].join('&')

      // Leg 2: PSTN recipient (pass call_record_id so recording callback can link it)
      const pstnCxmlUrl = `${supabaseUrl}/functions/v1/batch-call-cxml?leg=pstn&conf=${encodeURIComponent(confName)}&call_record_id=${callRecord.id}`
      const pstnFormBody = [
        `To=${encodeURIComponent(recipient.phone_number)}`,
        `From=${encodeURIComponent(batch.caller_id)}`,
        `Url=${encodeURIComponent(pstnCxmlUrl)}`,
        `Method=POST`,
        `StatusCallback=${encodeURIComponent(statusCallbackUrl)}`,
        `StatusCallbackEvent=initiated`,
        `StatusCallbackEvent=ringing`,
        `StatusCallbackEvent=answered`,
        `StatusCallbackEvent=completed`,
        `StatusCallbackMethod=POST`,
      ].join('&')

      // Fire both simultaneously — agent SIP connects instantly, PSTN takes seconds to ring
      const [agentCallResp, pstnCallResp] = await Promise.all([
        fetch(swCallUrl, { method: 'POST', headers: swHeaders, body: agentFormBody }),
        fetch(swCallUrl, { method: 'POST', headers: swHeaders, body: pstnFormBody }),
      ])

      const [agentCallData, pstnCallData] = await Promise.all([
        agentCallResp.json(),
        pstnCallResp.json(),
      ])

      if (!agentCallResp.ok || !agentCallData.sid) {
        throw new Error(`Agent leg failed: ${agentCallData.message || 'Unknown error'}`)
      }
      console.log(`Agent leg started: ${agentCallData.sid}, conference: ${confName}`)

      if (pstnCallResp.ok && pstnCallData.sid) {
        await client
          .from('call_records')
          .update({ vendor_call_id: pstnCallData.sid })
          .eq('id', callRecord.id)
        initiated++
      } else {
        throw new Error(pstnCallData.message || pstnCallData.error || 'PSTN call failed')
      }

      // Delay between calls
      if (pending.indexOf(recipient) < pending.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CALL_DELAY_MS))
      }
    } catch (err) {
      console.error(`Failed to process recipient ${recipient.id}:`, err)

      await client
        .from('batch_call_recipients')
        .update({
          status: 'failed',
          error_message: err.message || 'Unexpected error',
          completed_at: new Date().toISOString()
        })
        .eq('id', recipient.id)

      // Update batch failed count
      await client
        .from('batch_calls')
        .update({ failed_count: (batch.failed_count || 0) + failed + 1, updated_at: new Date().toISOString() })
        .eq('id', batchId)

      failed++
    }
  }

  // Schedule continuation if more pending recipients exist
  const { count: morePending } = await client
    .from('batch_call_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'pending')

  if ((morePending || 0) > 0) {
    // Re-invoke self for the next chunk
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ batch_id: batchId })
    }).catch(err => console.error('Failed to schedule continuation:', err))
  } else {
    // No more pending — check if all active calls are also done
    // (handles case where all recipients failed within this function,
    // before SignalWire callbacks fire)
    const { count: stillActive } = await client
      .from('batch_call_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .in('status', ['calling', 'initiated', 'ringing', 'in_progress'])

    if ((stillActive || 0) === 0) {
      await client
        .from('batch_calls')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', batchId)
        .eq('status', 'running')

      console.log(`Batch ${batchId} marked completed (all recipients processed in-function)`)

      // If child of a recurring parent, trigger next-run check
      if (batch.parent_batch_id) {
        triggerRecurringCheck().catch(err => console.error('Failed to trigger recurring check:', err))
      }
    }
  }

  return jsonResponse({
    message: `Processed ${initiated + failed} recipients`,
    initiated,
    failed,
    remaining: morePending || 0
  })
}

function isWithinCallWindow(batch: any): boolean {
  const now = new Date()

  // Check day of week
  const dayOfWeek = now.getDay() // 0=Sunday
  const allowedDays = batch.window_days || [0, 1, 2, 3, 4, 5, 6]
  if (!allowedDays.includes(dayOfWeek)) return false

  // Check time window
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const startTime = batch.window_start_time || '00:00'
  const endTime = batch.window_end_time || '23:59'

  return currentTime >= startTime && currentTime <= endTime
}

function triggerRecurringCheck(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  return fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ action: 'process_due' })
  }).then(() => {})
}
