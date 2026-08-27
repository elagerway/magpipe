/**
 * sync-multilingual-dispatch  (GH #96)
 *
 * Reconciles LiveKit inbound-trunk membership from the DB so multilingual
 * agents route to Service B (worker "SW Telephony Agent ML") and everyone
 * else stays on Service A ("SW Telephony Agent"). DB is the source of truth.
 *
 * Routing model (see #96): a phone number lives on exactly ONE inbound trunk.
 *   - MAIN trunk  ST_wTNU9hLWs9GD  → rule → "SW Telephony Agent"     (Service A, default)
 *   - ML   trunk  ST_AvKG6f67yB3Y  → rule → "SW Telephony Agent ML"  (Service B)
 * LiveKit picks the trunk by matching the dialed number against trunk.numbers,
 * then applies that trunk's dispatch rule. So "route to B" == "be on the ML trunk".
 *
 * Desired ML set = active service_numbers whose agent language ∈ ML_LANGUAGES.
 * Everything else belongs on MAIN. The ANCHOR number is pinned to ML so the
 * trunk is never left with empty numbers (empty numbers == catch-all hazard).
 *
 * Idempotent. POST {"dry_run": true} to see the plan without applying.
 * Invoked by pg_cron (~10 min) with the service-role bearer; also runnable by hand.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SipClient } from 'npm:livekit-server-sdk@2.14.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { reportError } from '../_shared/error-reporter.ts'

const MAIN_TRUNK = Deno.env.get('LIVEKIT_MAIN_TRUNK_ID') ?? 'ST_wTNU9hLWs9GD'
const ML_TRUNK = Deno.env.get('LIVEKIT_ML_TRUNK_ID') ?? 'ST_AvKG6f67yB3Y'
// Pinned to the ML trunk so it always has ≥1 number (empty numbers == catch-all).
// Inactive outbound caller-ID line; harmless to keep here. See #96.
const ANCHOR = Deno.env.get('LIVEKIT_ML_ANCHOR_NUMBER') ?? '+16043731965'
// Agent languages that require the multilingual worker (Service B).
const ML_LANGUAGES = ['multi', 'fr', 'es', 'de']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    let dryRun = false
    try {
      const body = await req.json()
      dryRun = body?.dry_run === true
    } catch (_) { /* no body → apply */ }

    const sip = new SipClient(
      Deno.env.get('LIVEKIT_URL')!,
      Deno.env.get('LIVEKIT_API_KEY')!,
      Deno.env.get('LIVEKIT_API_SECRET')!,
    )

    // 1) Desired ML set: active numbers whose agent speaks a multilingual language.
    //    Two-step (no embed): service_numbers↔agent_configs has multiple FKs, so a
    //    PostgREST embed is ambiguous. Resolve agent ids first, then the numbers.
    const { data: mlAgents, error: aErr } = await supabase
      .from('agent_configs')
      .select('id')
      .in('language', ML_LANGUAGES)
    if (aErr) throw new Error(`DB query (agents) failed: ${aErr.message}`)
    const mlAgentIds = (mlAgents ?? []).map((a: any) => a.id)
    let desired = new Set<string>()
    if (mlAgentIds.length > 0) {
      const { data: rows, error: qErr } = await supabase
        .from('service_numbers')
        .select('phone_number')
        .eq('is_active', true)
        .in('agent_id', mlAgentIds)
      if (qErr) throw new Error(`DB query (numbers) failed: ${qErr.message}`)
      desired = new Set<string>((rows ?? []).map((r: any) => r.phone_number))
    }

    // 2) Current trunk membership.
    const trunks = await sip.listSipInboundTrunk()
    const main = trunks.find((t) => t.sipTrunkId === MAIN_TRUNK)
    const ml = trunks.find((t) => t.sipTrunkId === ML_TRUNK)
    if (!main) throw new Error(`MAIN trunk ${MAIN_TRUNK} not found`)
    if (!ml) throw new Error(`ML trunk ${ML_TRUNK} not found`)
    const currentMain = new Set<string>(main.numbers ?? [])
    const currentML = new Set<string>(ml.numbers ?? [])

    // 3) Compute moves (scoped to the MAIN ↔ ML axis only).
    const promote: string[] = []   // MAIN → ML  (became multilingual)
    const demote: string[] = []    // ML → MAIN  (no longer multilingual)
    const skipped: { number: string; reason: string }[] = []

    for (const n of desired) {
      if (currentML.has(n)) continue                 // already correct
      if (currentMain.has(n)) promote.push(n)
      else skipped.push({ number: n, reason: 'desired-ML but on neither MAIN nor ML trunk' })
    }
    for (const n of currentML) {
      if (n === ANCHOR) continue                      // pinned
      if (desired.has(n)) continue                    // correctly on ML
      demote.push(n)                                  // stale → back to MAIN
    }

    // Safety: the ML trunk must never end empty.
    const mlAfter = new Set(currentML)
    promote.forEach((n) => mlAfter.add(n))
    demote.forEach((n) => mlAfter.delete(n))
    if (mlAfter.size === 0) {
      throw new Error('refusing to apply: ML trunk would be left with zero numbers (lost anchor?)')
    }

    const plan = { dryRun, desired: [...desired], promote, demote, skipped,
                   currentMLCount: currentML.size, currentMainCount: currentMain.size }
    console.log('[sync-multilingual-dispatch] plan:', JSON.stringify(plan))
    for (const s of skipped) console.warn(`[sync-multilingual-dispatch] SKIP ${s.number}: ${s.reason}`)

    // 4) Apply. Per-number remove-from-source THEN add-to-dest to keep the
    //    "on no trunk" window to a single round-trip (LiveKit rejects the
    //    add while the number is still on the other trunk — uniqueness).
    const applied: string[] = []
    if (!dryRun) {
      for (const n of promote) {
        await sip.updateSipInboundTrunkFields(MAIN_TRUNK, { numbers: { remove: [n] } })
        await sip.updateSipInboundTrunkFields(ML_TRUNK, { numbers: { add: [n] } })
        applied.push(`promote ${n} → ML`)
        console.log(`[sync-multilingual-dispatch] promoted ${n} MAIN→ML`)
      }
      for (const n of demote) {
        await sip.updateSipInboundTrunkFields(ML_TRUNK, { numbers: { remove: [n] } })
        await sip.updateSipInboundTrunkFields(MAIN_TRUNK, { numbers: { add: [n] } })
        applied.push(`demote ${n} → MAIN`)
        console.log(`[sync-multilingual-dispatch] demoted ${n} ML→MAIN`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...plan, applied, changed: promote.length + demote.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[sync-multilingual-dispatch] error:', error)
    await reportError(supabase, {
      error_type: 'edge_function_error',
      error_message: String((error as any)?.message ?? error),
      error_code: 'sync-multilingual-dispatch',
      source: 'supabase',
    }).catch(() => {})
    return new Response(
      JSON.stringify({ success: false, error: String((error as any)?.message ?? error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
