// Outbound webhook dispatcher — TS port of agent.py:send_webhooks.
//
// Used by edge functions to fire webhook events (sms.received, sms.sent,
// chat.session.completed, etc.) to all api_keys with a webhook_url set for
// the user. Logs each attempt to webhook_deliveries; on retryable failure,
// schedules a re-fire via next_retry_at for webhook-retry-worker to pick up.
//
// MUST never throw: webhook delivery failure must not break the underlying
// SMS/chat/voice flow.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const WEBHOOK_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 5

// Backoff after attempt N (index = N). attempt 1 fails → next_retry_at = +5s
// (slot 2), etc. Slot 0 is unused; slot 5 is the post-final cap (unused since
// MAX_ATTEMPTS=5 means after attempt 5 we go to dead-letter).
const BACKOFF_MS = [0, 5_000, 30_000, 120_000, 600_000, 1_800_000]

// HTTP statuses we retry. Everything else 4xx is a client error we can't fix
// by retrying. 410 Gone explicitly means "stop sending" — never retry.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export interface ApiKeyRow {
  id: string
  webhook_url: string
  webhook_secret: string | null
}

/**
 * Fire a webhook event to every active api_key for `userId` that has a
 * webhook_url configured. Logs each attempt; queues retries for transient
 * failures. Fire-and-forget safe.
 */
export async function dispatchWebhook(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, webhook_url, webhook_secret')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('webhook_url', 'is', null)

    if (error) {
      console.error('🔔 dispatchWebhook: api_keys query failed:', error.message)
      return
    }
    if (!keys?.length) return

    // Per-number scoping. When the event names a service_number, a key with
    // explicit number associations only hears about its own numbers. An
    // UNassociated key receives everything ONLY on a single-key account
    // (backward-compatible for the normal one-business-per-user case); on a
    // multi-key account (multiple businesses under one user) an unassociated key
    // receives nothing — otherwise a freshly-created webhook key would leak every
    // other business's events. Events with no service_number (e.g.
    // chat.session.completed) are never filtered.
    let deliverKeys = keys
    const sn = data.service_number
    const scopeNumber = typeof sn === 'string' ? sn : null
    if (scopeNumber) {
      const { data: assoc, error: assocErr } = await supabase
        .from('api_key_numbers')
        .select('api_key_id, service_number')
        .in('api_key_id', keys.map((k) => k.id))
      if (assocErr) {
        // Fail open (deliver to all) rather than silently drop events.
        console.error('🔔 dispatchWebhook: api_key_numbers query failed:', assocErr.message)
      } else {
        const byKey = new Map<string, Set<string>>()
        for (const a of assoc ?? []) {
          const set = byKey.get(a.api_key_id) ?? new Set<string>()
          set.add(a.service_number)
          byKey.set(a.api_key_id, set)
        }
        const multiKey = keys.length > 1
        deliverKeys = keys.filter((k) => {
          const set = byKey.get(k.id)
          if (set) return set.has(scopeNumber)  // associated: must list this number
          return !multiKey                        // unassociated: only on single-key accounts
        })
      }
    }
    if (!deliverKeys.length) return

    const envelope = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    }
    const body = JSON.stringify(envelope)

    for (const key of deliverKeys) {
      await deliverWithLogging(supabase, key as ApiKeyRow, eventType, envelope, body, 1)
    }
  } catch (e) {
    console.error('🔔 dispatchWebhook fatal:', e)
  }
}

/**
 * Re-fire a previously-recorded delivery. Used by webhook-retry-worker.
 * `originalEnvelope` is the full {event, timestamp, data} as stored in
 * webhook_deliveries.payload — re-sending the same envelope gives the
 * customer a stable body across retries, so their dedup logic is simple.
 */
export async function redeliverWebhook(
  supabase: SupabaseClient,
  apiKey: ApiKeyRow,
  eventType: string,
  originalEnvelope: { event: string; timestamp: string; data: Record<string, unknown> },
  attemptNumber: number
): Promise<void> {
  try {
    const body = JSON.stringify(originalEnvelope)
    await deliverWithLogging(supabase, apiKey, eventType, originalEnvelope, body, attemptNumber)
  } catch (e) {
    console.error('🔔 redeliverWebhook fatal:', e)
  }
}

async function deliverWithLogging(
  supabase: SupabaseClient,
  apiKey: ApiKeyRow,
  eventType: string,
  envelope: { event: string; timestamp: string; data: Record<string, unknown> },
  body: string,
  attemptNumber: number
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey.webhook_secret) {
    headers['x-magpipe-signature'] = `sha256=${await hmacSha256Hex(apiKey.webhook_secret, body)}`
  }

  const start = Date.now()
  let statusCode: number | null = null
  let responseBody: string | null = null
  let errorMessage: string | null = null

  try {
    const res = await fetch(apiKey.webhook_url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    statusCode = res.status
    responseBody = (await res.text()).slice(0, 2000)
    console.log(`🔔 ${eventType} → ${apiKey.webhook_url} status=${statusCode} attempt=${attemptNumber}`)
  } catch (e) {
    errorMessage = String(e instanceof Error ? e.message : e).slice(0, 500)
    console.warn(`🔔 ${eventType} → ${apiKey.webhook_url} failed attempt=${attemptNumber}: ${errorMessage}`)
  }

  const durationMs = Date.now() - start
  const isSuccess = statusCode !== null && statusCode >= 200 && statusCode < 400
  const isStop = statusCode === 410
  const isRetryable = !isSuccess && !isStop && (
    errorMessage !== null ||
    (statusCode !== null && RETRYABLE_STATUS.has(statusCode))
  )

  let nextRetryAt: string | null = null
  if (isRetryable && attemptNumber < MAX_ATTEMPTS) {
    nextRetryAt = computeNextRetry(attemptNumber + 1)
  }

  try {
    await supabase.from('webhook_deliveries').insert({
      api_key_id: apiKey.id,
      event_type: eventType,
      payload: envelope,
      status_code: statusCode,
      response_body: responseBody,
      error_message: errorMessage,
      duration_ms: durationMs,
      attempt_number: attemptNumber,
      next_retry_at: nextRetryAt,
    })
  } catch (logErr) {
    console.warn('🔔 webhook_deliveries insert failed:', logErr)
  }

  // Any failure that isn't "stop sending" and isn't queued for retry lands
  // in the dead-letter queue — including non-retryable 4xx (customer's
  // endpoint broke its contract; they can fix it and replay).
  const isFinalFailure = !isSuccess && !isStop && !nextRetryAt
  if (isFinalFailure) {
    try {
      await supabase.from('webhook_dead_letter').insert({
        api_key_id: apiKey.id,
        event_type: eventType,
        payload: envelope,
        total_attempts: attemptNumber,
        last_status_code: statusCode,
        last_error: errorMessage,
      })
    } catch (dlErr) {
      console.warn('🔔 webhook_dead_letter insert failed:', dlErr)
    }
  }
}

function computeNextRetry(nextAttempt: number): string {
  const baseMs = BACKOFF_MS[Math.min(nextAttempt, BACKOFF_MS.length - 1)]
  const jitter = baseMs * 0.25 * (Math.random() * 2 - 1)
  return new Date(Date.now() + baseMs + jitter).toISOString()
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
