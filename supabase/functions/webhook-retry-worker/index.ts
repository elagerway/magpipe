// Cron worker: claims and re-fires webhook_deliveries rows whose
// next_retry_at has elapsed. Triggered by pg_cron every minute.
//
// Atomic claim via the claim_webhook_retries RPC (FOR UPDATE SKIP LOCKED) —
// two overlapping cron runs cannot pick up the same row. The RPC clears
// next_retry_at on each claimed row in the same transaction, so once we
// hold a row it's "in flight" and won't be re-selected. If the worker dies
// mid-batch, the cleared rows are not retried — but redeliverWebhook itself
// records a new webhook_deliveries row for each new attempt with its own
// next_retry_at if it also fails, so the retry chain continues across
// worker failures.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { redeliverWebhook, type ApiKeyRow } from '../_shared/webhook-dispatcher.ts'

const BATCH_SIZE = 50

interface PendingDelivery {
  id: string
  api_key_id: string
  event_type: string
  payload: { event: string; timestamp: string; data: Record<string, unknown> }
  attempt_number: number
}

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Atomic claim: returns rows AND clears next_retry_at in one transaction.
    const { data: claimed, error: claimErr } = await supabase
      .rpc('claim_webhook_retries', { batch_size: BATCH_SIZE })

    if (claimErr) {
      console.error('webhook-retry-worker: claim failed', claimErr)
      return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 })
    }

    const pending = (claimed ?? []) as PendingDelivery[]
    if (!pending.length) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
    }

    // Re-fire each. Group by api_key_id so we only fetch each key once.
    const apiKeyIds = [...new Set(pending.map(p => p.api_key_id))]
    const { data: keysData } = await supabase
      .from('api_keys')
      .select('id, webhook_url, webhook_secret, is_active')
      .in('id', apiKeyIds)

    const keysById = new Map<string, ApiKeyRow & { is_active: boolean }>(
      (keysData ?? []).map(k => [k.id, k as ApiKeyRow & { is_active: boolean }])
    )

    let redelivered = 0
    let skipped = 0
    let deadLettered = 0

    for (const row of pending) {
      const key = keysById.get(row.api_key_id)
      // Skip if key was deleted/deactivated/cleared its webhook_url.
      if (!key || !key.is_active || !key.webhook_url) {
        skipped++
        continue
      }
      try {
        await redeliverWebhook(
          supabase,
          { id: key.id, webhook_url: key.webhook_url, webhook_secret: key.webhook_secret },
          row.event_type,
          row.payload,
          row.attempt_number + 1
        )
        redelivered++
      } catch (e) {
        // redeliverWebhook never throws, but defensive guard.
        console.error('webhook-retry-worker: redeliver threw', e)
        deadLettered++
      }
    }

    console.log(`webhook-retry-worker: processed=${pending.length} redelivered=${redelivered} skipped=${skipped}`)
    return new Response(
      JSON.stringify({ processed: pending.length, redelivered, skipped, deadLettered }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('webhook-retry-worker error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500 }
    )
  }
})
