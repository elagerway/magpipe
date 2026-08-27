import { createClient } from 'npm:@supabase/supabase-js@2'
import { SipClient } from 'npm:livekit-server-sdk@2.14.0'
import { reportError } from '../_shared/error-reporter.ts'

// Watchdog for the voice call path: the Render agent workers' per-call providers
// plus the telephony control plane that has to work for a call to arrive at all.
//
// Written after the 2026-08-20 outage, where an unpinned `anthropic` picked up its
// httpx2 major, livekit-plugins-anthropic could not accept it, and every Claude
// job crashed inside _build_llm — *after* room join, so callers heard endless
// ringing. It went six days undetected because only 5 of ~248 agents run Claude
// and none of them took a call in that window: call volume and durations never
// moved. That is the failure class this exists to catch.
//
// Following composio-health-check, it asserts CAPABILITY, never traffic volume.
// "No calls in N hours" is ambiguous (quiet night vs. dead pipeline) and would
// false-page overnight; "constructing the Anthropic LLM raises TypeError" is not
// ambiguous at all. Concretely it checks:
//   1. both agent workers answer /health/providers with every provider healthy
//      (they construct the real plugins in their own venv — the only place the
//      installed dependency set is observable),
//   2. SignalWire API credentials still authenticate,
//   3. both LiveKit inbound SIP trunks exist and neither has empty numbers
//      (empty numbers == catch-all hazard, see sync-multilingual-dispatch).
//
// Any failure routes through reportError → the SMS/email/Slack fan-out, which
// already throttles to one page per 15 min per error_code.
//
// Invoked by pg_cron (service-role bearer) every 30 min. Read-only throughout.

// Both Render services run `python agent.py healthcheck`, which serves the
// self-test. Kept as a literal list because these are infrastructure endpoints,
// not user data — a DB lookup here would add a failure mode to the watchdog.
const AGENT_WORKERS = [
  { name: 'magpipe (english)', url: 'https://plug-bubs.onrender.com' },
  { name: 'magpipe-multilingual', url: 'https://magpipe-multilingual.onrender.com' },
]

// Same trunk IDs sync-multilingual-dispatch reconciles against (GH #96).
const SIP_TRUNKS = [
  { id: 'ST_wTNU9hLWs9GD', label: 'MAIN' },
  { id: 'ST_AvKG6f67yB3Y', label: 'ML' },
]

const FETCH_TIMEOUT_MS = 15_000

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Poll one agent worker's provider self-test. */
async function checkAgentWorker(
  worker: { name: string; url: string },
  problems: string[],
  detail: Record<string, unknown>,
) {
  // Set in production (2026-08-27); must match AGENT_HEALTH_TOKEN on the Render
  // services or every worker check 404s and pages. Rotate both together.
  const token = Deno.env.get('AGENT_HEALTH_TOKEN')
  try {
    const res = await fetchWithTimeout(`${worker.url}/health/providers`, {
      headers: token ? { 'x-health-token': token } : {},
    })
    const text = await res.text()

    // A cold Render instance or a 404 from the token gate is itself a finding —
    // it means the watchdog is blind to this worker, which is how the last one
    // hid for six days.
    let body: Record<string, any>
    try {
      body = JSON.parse(text)
    } catch {
      problems.push(
        `${worker.name}: /health/providers returned non-JSON (${res.status}): ${text.slice(0, 120)}`,
      )
      detail[worker.name] = { status: res.status, body: text.slice(0, 200) }
      return
    }

    detail[worker.name] = body
    if (!body.healthy) {
      const failed: string[] = Array.isArray(body.failed) ? body.failed : []
      const why = failed
        .map((k) => `${k} (${body.checks?.[k]?.error ?? 'unknown'})`)
        .join(', ')
      problems.push(`${worker.name}: provider(s) DOWN — ${why || 'unspecified'}`)
    }
  } catch (e) {
    problems.push(
      `${worker.name}: /health/providers unreachable — ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

/** SignalWire credentials still authenticate (outbound + inbound both depend on this). */
async function checkSignalWire(problems: string[], detail: Record<string, unknown>) {
  const space = Deno.env.get('SIGNALWIRE_SPACE_URL') || Deno.env.get('SIGNALWIRE_SPACE')
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
  if (!space || !projectId || !apiToken) {
    problems.push('SignalWire env incomplete (space/project/token)')
    return
  }
  try {
    const res = await fetchWithTimeout(
      `https://${space}/api/laml/2010-04-01/Accounts/${projectId}.json`,
      { headers: { Authorization: `Basic ${btoa(`${projectId}:${apiToken}`)}` } },
    )
    if (!res.ok) {
      problems.push(`SignalWire auth failed (${res.status}) — API token may be rotated or revoked`)
      return
    }
    const acct = await res.json()
    detail.signalwire = { status: acct.status }
    // A suspended/closed account still authenticates but cannot carry calls.
    if (acct.status && acct.status !== 'active') {
      problems.push(`SignalWire account status is "${acct.status}" (expected "active")`)
    }
  } catch (e) {
    problems.push(`SignalWire unreachable — ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Both inbound SIP trunks exist and carry numbers — no trunk, no inbound call. */
async function checkLiveKitSip(problems: string[], detail: Record<string, unknown>) {
  const url = Deno.env.get('LIVEKIT_URL')
  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  if (!url || !apiKey || !apiSecret) {
    problems.push('LiveKit env incomplete (url/key/secret)')
    return
  }
  try {
    const sip = new SipClient(url, apiKey, apiSecret)
    const trunks = await sip.listSipInboundTrunk()
    const summary: Record<string, unknown> = {}
    for (const { id, label } of SIP_TRUNKS) {
      const t = trunks.find((x: any) => x.sipTrunkId === id)
      if (!t) {
        problems.push(`LiveKit inbound trunk ${label} (${id}) NOT FOUND — inbound calls to it will not route`)
        continue
      }
      const count = (t.numbers || []).length
      summary[label] = { id, numbers: count }
      // sync-multilingual-dispatch treats an empty trunk as a catch-all hazard,
      // so empty is a real fault here, not just a curiosity.
      if (count === 0) {
        problems.push(`LiveKit inbound trunk ${label} (${id}) has ZERO numbers (catch-all hazard)`)
      }
    }
    detail.livekit_sip = summary
  } catch (e) {
    problems.push(`LiveKit SIP query failed — ${e instanceof Error ? e.message : String(e)}`)
  }
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const problems: string[] = []
  const detail: Record<string, unknown> = {}

  try {
    // Run independently so one dead surface still reports the others.
    await Promise.all([
      ...AGENT_WORKERS.map((w) => checkAgentWorker(w, problems, detail)),
      checkSignalWire(problems, detail),
      checkLiveKitSip(problems, detail),
    ])

    if (problems.length > 0) {
      await reportError(supabase, {
        error_type: 'agent_health_check',
        error_message: `Voice call path UNHEALTHY: ${problems.join('; ')}`,
        error_code: 'agent-health-check',
        source: 'voice-agent',
        severity: 'error',
        metadata: { problems, detail },
      })
    }

    return new Response(JSON.stringify({ healthy: problems.length === 0, problems, detail }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    await reportError(supabase, {
      error_type: 'agent_health_check',
      error_message: e instanceof Error ? e.message : String(e),
      error_code: 'agent-health-check:catch',
      source: 'voice-agent',
      severity: 'error',
    })
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
