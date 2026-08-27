// enforce-jwt-policy — runs every 5 minutes via pg_cron.
//
// Why: bare `npx supabase functions deploy <name>` silently flips
// verify_jwt back to TRUE, which gates the function at the gateway
// layer and blocks API-key auth + external webhooks before the
// function code ever runs. This has caused multiple production
// incidents (most recently 2026-05-08, when 13 functions were drifted
// — including webhook-inbound-call, killing all inbound calls).
//
// What: reads `_shared/jwt-policy.json` (single source of truth, also
// used by scripts/deploy-functions.sh), pulls every function's
// current verify_jwt state from the Supabase Management API, and
// PATCHes any drifted function back via
// `PATCH /v1/projects/{ref}/functions/{slug}`. PATCH flips the flag
// in seconds — no redeploy needed. For each fix, writes a row to
// system_error_logs with error_type='jwt_policy_drift_autohealed' so
// the existing log-error critical-alert path fires SMS to oncall.
//
// Auth: deployed with verify_jwt=false (in jwt-policy.json) so pg_cron
// doesn't have to embed a JWT in the SQL — that trips Cloudflare WAF
// when migrations are applied via the Management API. Instead this
// function gates internally on the X-Cron-Secret header matching the
// MAGPIPE_CRON_SECRET env var. Wrong/missing secret → 401, function
// body never runs. Reads MAGPIPE_MGMT_TOKEN secret (the sbp_ personal
// access token, NOT the service role key) for the management API calls.

import { createClient } from 'npm:@supabase/supabase-js@2'
import policyData from '../_shared/jwt-policy.json' with { type: 'json' }

const PROJECT_REF = Deno.env.get('SUPABASE_PROJECT_REF') || 'mtxbiyilvgwhbdptysex'
const MGMT_TOKEN = Deno.env.get('MAGPIPE_MGMT_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface DeployedFn {
  slug: string
  verify_jwt: boolean
  status: string
  version: number
}

interface DriftIncident {
  slug: string
  was: boolean
  fixed: boolean
  error?: string
}

const CRON_SECRET = Deno.env.get('MAGPIPE_CRON_SECRET')

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Internal auth check — replaces gateway-level JWT verification.
  // Function is deployed with verify_jwt=false so pg_cron doesn't have
  // to embed a JWT in the SQL (Cloudflare WAF blocks JWT-shaped strings
  // in /v1/projects/{ref}/database/query). The cron sends a non-JWT
  // hex secret in the x-cron-secret header instead.
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!MGMT_TOKEN) {
    console.error('🛡️ enforce-jwt-policy: MAGPIPE_MGMT_TOKEN not set')
    return new Response(
      JSON.stringify({ error: 'MAGPIPE_MGMT_TOKEN not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const expectedNoVerify = new Set<string>(policyData.no_verify_jwt as string[])

  // 1. Pull current state from Management API.
  const listRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`,
    { headers: { Authorization: `Bearer ${MGMT_TOKEN}` } },
  )
  if (!listRes.ok) {
    const body = await listRes.text()
    console.error(`🛡️ list functions failed: ${listRes.status} ${body.slice(0, 200)}`)
    return new Response(
      JSON.stringify({ error: 'list functions failed', status: listRes.status }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const deployed = (await listRes.json()) as DeployedFn[]

  // 2. Diff against the policy.
  const drifted: DriftIncident[] = []
  for (const fn of deployed) {
    const shouldNoVerify = expectedNoVerify.has(fn.slug)
    if (shouldNoVerify && fn.verify_jwt === true) {
      drifted.push({ slug: fn.slug, was: true, fixed: false })
    }
  }

  if (drifted.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, drift_count: 0, checked: deployed.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.warn(`🛡️ JWT policy drift detected on ${drifted.length} function(s):`, drifted.map((d) => d.slug))

  // 3. PATCH each drifted function back.
  for (const incident of drifted) {
    try {
      const patchRes = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${incident.slug}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${MGMT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verify_jwt: false }),
        },
      )
      if (patchRes.ok) {
        incident.fixed = true
        console.log(`🛡️ healed ${incident.slug}: verify_jwt true → false`)
      } else {
        const body = await patchRes.text()
        incident.error = `${patchRes.status}: ${body.slice(0, 200)}`
        console.error(`🛡️ heal failed for ${incident.slug}: ${incident.error}`)
      }
    } catch (e) {
      incident.error = String((e as Error)?.message || e).slice(0, 200)
      console.error(`🛡️ heal threw for ${incident.slug}: ${incident.error}`)
    }
  }

  // 4. Log incident to system_error_logs so the SMS alert path fires.
  // Critical: log-error must have 'jwt_policy_drift_autohealed' in
  // CRITICAL_ERROR_TYPES for SMS to actually go out.
  try {
    const logRes = await fetch(`${SUPABASE_URL}/functions/v1/log-error`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error_type: 'jwt_policy_drift_autohealed',
        error_code: `count=${drifted.length}`,
        error_message: `JWT policy drift auto-healed on ${drifted.length} function(s): ${
          drifted.map((d) => `${d.slug}${d.fixed ? '' : `(HEAL FAILED: ${d.error || 'unknown'})`}`).join(', ')
        }`,
        source: 'enforce-jwt-policy',
        metadata: { drifted, total_checked: deployed.length },
      }),
    })
    if (!logRes.ok) {
      console.error(`🛡️ log-error post failed: ${logRes.status}`)
    }
  } catch (e) {
    console.error('🛡️ log-error post threw:', e)
  }

  // 5. Also persist to a dedicated audit table for forensics.
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    await sb.from('jwt_policy_drift_log').insert({
      drifted_count: drifted.length,
      details: drifted,
    })
  } catch (e) {
    console.error('🛡️ jwt_policy_drift_log insert threw:', e)
  }

  return new Response(
    JSON.stringify({
      ok: drifted.every((d) => d.fixed),
      drift_count: drifted.length,
      drifted,
      total_checked: deployed.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
