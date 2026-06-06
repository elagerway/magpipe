// POST /functions/v1/replay-webhook-delivery
//
// Re-fires past webhook deliveries. Two modes:
//
//   { "delivery_id": "uuid" }
//     Re-fire one delivery (by id from webhook_deliveries or webhook_dead_letter).
//
//   { "event_type": "sms.received", "from": "ISO", "to": "ISO" }
//     Re-fire all deliveries in a time window matching event_type. Useful when
//     the customer's endpoint was down and they want to backfill.
//
// Auth: requires the caller's mgp_ API key. Replays are scoped to deliveries
// that belong to one of the caller's api_keys — you can never replay another
// tenant's events.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { redeliverWebhook, type ApiKeyRow } from '../_shared/webhook-dispatcher.ts'

const MAX_WINDOW_REPLAY = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const user = await resolveUser(req, anonClient)
    if (!user) return json({ error: 'unauthorized' }, 401)

    const { delivery_id, event_type, from, to } = await req.json()

    // Caller's api_keys (replay scope guard).
    const { data: callerKeys } = await supabase
      .from('api_keys')
      .select('id, webhook_url, webhook_secret, is_active')
      .eq('user_id', user.id)

    const keysById = new Map<string, ApiKeyRow & { is_active: boolean }>(
      (callerKeys ?? []).map(k => [k.id, k as ApiKeyRow & { is_active: boolean }])
    )

    if (delivery_id) {
      return await replaySingle(supabase, keysById, delivery_id)
    }

    if (event_type && from && to) {
      return await replayWindow(supabase, keysById, event_type, from, to)
    }

    return json({ error: 'provide either delivery_id, or event_type + from + to' }, 400)
  } catch (error) {
    console.error('replay-webhook-delivery error:', error)
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})

async function replaySingle(
  supabase: ReturnType<typeof createClient>,
  keysById: Map<string, ApiKeyRow & { is_active: boolean }>,
  deliveryId: string
): Promise<Response> {
  // Try webhook_deliveries first, then webhook_dead_letter.
  const { data: delivery } = await supabase
    .from('webhook_deliveries')
    .select('id, api_key_id, event_type, payload')
    .eq('id', deliveryId)
    .maybeSingle()

  let row: { api_key_id: string; event_type: string; payload: any; source: 'delivery' | 'dead_letter' } | null = null

  if (delivery) {
    row = { ...delivery, source: 'delivery' }
  } else {
    const { data: dl } = await supabase
      .from('webhook_dead_letter')
      .select('id, api_key_id, event_type, payload')
      .eq('id', deliveryId)
      .maybeSingle()
    if (dl) row = { ...dl, source: 'dead_letter' }
  }

  if (!row) return json({ error: 'delivery not found' }, 404)

  const key = keysById.get(row.api_key_id)
  if (!key) return json({ error: 'forbidden — delivery belongs to a different tenant' }, 403)
  if (!key.is_active || !key.webhook_url) {
    return json({ error: 'api_key is inactive or has no webhook_url' }, 400)
  }

  await redeliverWebhook(
    supabase,
    { id: key.id, webhook_url: key.webhook_url, webhook_secret: key.webhook_secret },
    row.event_type,
    row.payload,
    1  // replay = fresh attempt 1, separate from any retry chain
  )

  if (row.source === 'dead_letter') {
    await supabase
      .from('webhook_dead_letter')
      .update({ replayed_at: new Date().toISOString() })
      .eq('id', deliveryId)
  }

  return json({ success: true, replayed: 1, source: row.source }, 200)
}

async function replayWindow(
  supabase: ReturnType<typeof createClient>,
  keysById: Map<string, ApiKeyRow & { is_active: boolean }>,
  eventType: string,
  fromIso: string,
  toIso: string
): Promise<Response> {
  const apiKeyIds = [...keysById.keys()]
  if (!apiKeyIds.length) return json({ error: 'caller has no api_keys' }, 400)

  // Pull past deliveries whose ENVELOPE timestamp falls in the window. The
  // envelope timestamp is captured at first dispatch and stays stable across
  // retries, so a window like "events on 2026-05-01" matches event occurrence
  // — not the timing of any individual retry attempt. Restricting to
  // attempt_number = 1 collapses retry chains down to one row per event.
  const { data: rows, error } = await supabase
    .from('webhook_deliveries')
    .select('id, api_key_id, event_type, payload')
    .in('api_key_id', apiKeyIds)
    .eq('event_type', eventType)
    .eq('attempt_number', 1)
    .gte('payload->>timestamp', fromIso)
    .lte('payload->>timestamp', toIso)
    .order('delivered_at', { ascending: true })
    .limit(MAX_WINDOW_REPLAY)

  if (error) return json({ error: error.message }, 500)
  if (!rows?.length) return json({ success: true, replayed: 0 }, 200)

  let replayed = 0
  for (const r of rows) {
    const key = keysById.get(r.api_key_id)
    if (!key || !key.is_active || !key.webhook_url) continue
    await redeliverWebhook(
      supabase,
      { id: key.id, webhook_url: key.webhook_url, webhook_secret: key.webhook_secret },
      r.event_type,
      r.payload,
      1
    )
    replayed++
  }

  return json({ success: true, replayed }, 200)
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
