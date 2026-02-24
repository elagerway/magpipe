/**
 * Process Batch Calls Worker
 * Picks up pending recipients in a running batch and initiates calls.
 * Called by batch-calls edge function or cron job.
 * Deploy with: npx supabase functions deploy process-batch-calls --no-verify-jwt
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase-client.ts'

const CHUNK_SIZE = 5 // Process this many recipients per invocation
const CALL_DELAY_MS = 2000 // Delay between initiating calls (avoid overwhelming SignalWire)

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

async function processDueBatches(client: any) {
  // Find scheduled batches that are due
  const { data: dueBatches } = await client
    .from('batch_calls')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .limit(10)

  if (!dueBatches?.length) {
    // Also check running batches that need continuation
    const { data: runningBatches } = await client
      .from('batch_calls')
      .select('id')
      .eq('status', 'running')
      .limit(10)

    if (!runningBatches?.length) {
      return jsonResponse({ message: 'No batches to process' })
    }

    for (const batch of runningBatches) {
      await processBatch(client, batch.id)
    }
    return jsonResponse({ processed: runningBatches.length })
  }

  for (const batch of dueBatches) {
    // Update status to running
    await client
      .from('batch_calls')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', batch.id)

    await processBatch(client, batch.id)
  }

  return jsonResponse({ processed: dueBatches.length })
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

  const maxConcurrent = Math.max(1, (batch.max_concurrency || 1))
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
      .in('status', ['pending', 'calling'])

    if ((remainingPending || 0) === 0) {
      await client
        .from('batch_calls')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', batchId)

      return jsonResponse({ message: 'Batch completed', completed: true })
    }

    return jsonResponse({ message: 'Waiting for active calls to finish' })
  }

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

      // Initiate the call via the existing initiate-bridged-call function
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const callResponse = await fetch(`${supabaseUrl}/functions/v1/initiate-bridged-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'x-batch-user-id': batch.user_id // Pass user context
        },
        body: JSON.stringify({
          phone_number: recipient.phone_number,
          caller_id: batch.caller_id,
          user_id: batch.user_id,
          purpose: batch.purpose || '',
          goal: batch.goal || '',
          template_id: batch.template_id || null,
          batch_id: batchId,
          batch_recipient_id: recipient.id
        })
      })

      const callResult = await callResponse.json()

      if (callResponse.ok && callResult.call_record_id) {
        // Update recipient with call record ID
        await client
          .from('batch_call_recipients')
          .update({ call_record_id: callResult.call_record_id })
          .eq('id', recipient.id)

        initiated++
      } else {
        // Call initiation failed
        await client
          .from('batch_call_recipients')
          .update({
            status: 'failed',
            error_message: callResult.error || 'Failed to initiate call',
            completed_at: new Date().toISOString()
          })
          .eq('id', recipient.id)

        // Update batch failed count
        await client.rpc('increment_batch_failed_count', { batch_id: batchId })
          .catch(() => {
            // Fallback: direct update
            client
              .from('batch_calls')
              .update({ failed_count: (batch.failed_count || 0) + 1 })
              .eq('id', batchId)
          })

        failed++
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
