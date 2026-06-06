/**
 * register-dncl — kick off an automated registration of a Magpipe service
 * number on the Canadian National Do Not Call List (CRTC).
 *
 * The DNCL system at 1-866-580-3625 identifies the registering number by
 * Caller ID (ANI) — there is no DTMF entry of the phone number. The
 * outbound call must originate from the exact service number being
 * registered. See docs/dncl-ivr-map.md for the full menu map.
 *
 * DTMF sequence (verified by probes 2026-05-11):
 *   t=40s  press 1   → enter "register on DNCL" flow
 *   t=65s  press 1   → confirm "this is the number I want to register"
 *
 * Flow:
 *   POST  { service_number_id }
 *     - Validates ownership.
 *     - Skips if already 'completed' (idempotent return) or in-flight 'pending'.
 *     - Sets status='pending'.
 *     - Places outbound LaML call from the service number to +18665803625
 *       with the DTMF script inline and StatusCallback → register-dncl-status.
 *     - Returns { call_sid, status: 'pending' }.
 *
 *   The actual outcome is determined by register-dncl-status after the call
 *   ends, which transcribes the recording and updates the row.
 *
 * Auth: deployed with verify_jwt=false (listed in jwt-policy.json). resolveUser
 * gates frontend (Supabase JWT) and mgp_ API key callers.
 *
 * Deploy: ./scripts/deploy-functions.sh register-dncl
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DNCL_NUMBER = '+18665803625'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()
  if (req.method !== 'POST') return err('method_not_allowed', 'POST required', 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })
    const user = await resolveUser(req, anonClient)
    if (!user) return err('unauthorized', 'Unauthorized', 401)

    const body = await req.json().catch(() => ({}))
    const serviceNumberId = body?.service_number_id
    if (!serviceNumberId || !UUID_RE.test(serviceNumberId)) {
      return err('missing_param', 'service_number_id is required and must be a UUID')
    }

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verify ownership + fetch current state. `updated_at` drives the
    // stuck-state recovery check below.
    const { data: sn, error: snErr } = await supabase
      .from('service_numbers')
      .select('id, user_id, phone_number, dncl_registered_at, dncl_registration_status, updated_at')
      .eq('id', serviceNumberId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (snErr) throw snErr
    if (!sn) return err('not_found', 'Service number not found', 404)

    // Only +1 NANP numbers can register on the Canadian DNCL via this IVR.
    // (US numbers are technically NANP too — the IVR will reject them, but
    // we let it because we have no reliable signal that distinguishes a
    // Canada-vs-US +1 number at this layer.)
    if (!sn.phone_number?.startsWith('+1')) {
      return err(
        'unsupported_number',
        'DNCL registration is only available for North American (+1) numbers',
      )
    }

    // Fast-path: terminal-completed → idempotent return, no call placed.
    if (sn.dncl_registration_status === 'completed') {
      return json({ status: 'completed', message: 'Already registered', service_number_id: sn.id })
    }

    // Stuck-state recovery (review finding bug_016). A 'pending' row is
    // normally an in-flight IVR call (~2 minutes worst case). If the
    // status hasn't moved past 'pending' in much longer than that, the
    // StatusCallback / RecordingStatusCallback never landed (deferred
    // task killed mid-Whisper, deploy outage during the call window,
    // etc.) and the row would otherwise wedge forever — the only
    // operator recourse before this fix was direct SQL. Treat any
    // 'pending' older than the staleness cutoff as eligible for a
    // fresh claim. 15 min is well past the worst-case pipeline
    // (~110s call + ~30s Whisper) but tight enough that a real user
    // retry kicks off the new IVR call promptly.
    const STALE_PENDING_MIN = 15
    const isStalePending =
      sn.dncl_registration_status === 'pending' &&
      sn.updated_at &&
      (Date.now() - new Date(sn.updated_at).getTime()) > STALE_PENDING_MIN * 60_000

    if (sn.dncl_registration_status === 'pending' && !isStalePending) {
      return json({ status: 'pending', message: 'Registration already in progress', service_number_id: sn.id })
    }

    // Atomic claim. Two concurrent POSTs could both pass the fast-path
    // check above; this conditional UPDATE ensures only one wins. We
    // accept three claim sources:
    //   - null (never attempted)
    //   - 'failed' (prior failure — retry path)
    //   - 'pending' AND updated_at < cutoff (stale, recovered)
    // The loser returns the same "in progress" response as the duplicate
    // fast-path instead of placing a second SignalWire call.
    const stalePendingCutoff = new Date(Date.now() - STALE_PENDING_MIN * 60_000).toISOString()
    const claimOr =
      `dncl_registration_status.is.null,` +
      `dncl_registration_status.eq.failed,` +
      `and(dncl_registration_status.eq.pending,updated_at.lt.${stalePendingCutoff})`

    const { data: claimed } = await supabase
      .from('service_numbers')
      .update({ dncl_registration_status: 'pending' })
      .eq('id', sn.id)
      .or(claimOr)
      .select('id')
    if (!claimed || claimed.length === 0) {
      return json({
        status: 'pending',
        message: 'Registration already in progress',
        service_number_id: sn.id,
      })
    }

    // Build the StatusCallback URL pointing to register-dncl-status with
    // the service_number_id encoded so the status handler knows which row
    // to update. SignalWire will POST form-encoded status events here on
    // call status transitions (initiated, ringing, answered, completed,
    // failed, etc.). We act on terminal events only.
    const statusCallback =
      `${supabaseUrl}/functions/v1/register-dncl-status?service_number_id=${sn.id}`

    // Inline TwiML — verified working in probe-6 (2026-05-11). Pauses are
    // tied to the IVR's prompt timing; if the IVR changes its script we
    // re-probe and update docs/dncl-ivr-map.md.
    const twiml =
      '<Response>' +
      '<Pause length="40"/>' +
      '<Play digits="1"/>' +
      '<Pause length="25"/>' +
      '<Play digits="1"/>' +
      '<Pause length="45"/>' +
      '<Hangup/>' +
      '</Response>'

    const project = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const token = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const space = Deno.env.get('SIGNALWIRE_SPACE_URL')
    if (!project || !token || !space) {
      // Rollback the pending state — we never placed the call.
      await supabase
        .from('service_numbers')
        .update({ dncl_registration_status: null })
        .eq('id', sn.id)
      return err('signalwire_not_configured', 'SignalWire credentials missing on edge function', 500)
    }

    // We wire BOTH callback flavors at the same URL — register-dncl-status
    // dispatches by event shape (RecordingStatus vs CallStatus). The
    // recording-status event is required because the call-status event
    // races with recording post-processing — `RecordingUrl` is best-
    // effort on the call event, and a missed-due-to-race recording would
    // mark a successful registration as failed (review finding bug_002).
    // Matches the warm-transfer/index.ts pattern in this codebase.
    const formBody = new URLSearchParams({
      From: sn.phone_number,
      To: DNCL_NUMBER,
      Twiml: twiml,
      Record: 'true',
      RecordingChannels: 'dual',
      RecordingTrack: 'both',
      Trim: 'do-not-trim',
      StatusCallback: statusCallback,
      StatusCallbackEvent: 'completed',
      StatusCallbackMethod: 'POST',
      RecordingStatusCallback: statusCallback,
      RecordingStatusCallbackEvent: 'completed',
      RecordingStatusCallbackMethod: 'POST',
    })

    const swUrl = `https://${space}/api/laml/2010-04-01/Accounts/${project}/Calls.json`
    const swAuth = 'Basic ' + btoa(`${project}:${token}`)
    const swResp = await fetch(swUrl, {
      method: 'POST',
      headers: {
        Authorization: swAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    })

    if (!swResp.ok) {
      const errBody = await swResp.text()
      console.error('[register-dncl] SignalWire LaML error:', swResp.status, errBody)
      // Rollback.
      await supabase
        .from('service_numbers')
        .update({ dncl_registration_status: 'failed' })
        .eq('id', sn.id)
      return err('signalwire_error', `Failed to place DNCL call: ${swResp.status}`, 502)
    }

    const swData = await swResp.json()
    const callSid = swData?.sid
    console.log(`[register-dncl] placed DNCL call ${callSid} for service_number ${sn.id}`)

    return json({
      status: 'pending',
      call_sid: callSid,
      service_number_id: sn.id,
      message: 'Registration call placed. Result will be available within a few minutes.',
    }, 202)
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    console.error('[register-dncl]', msg)
    return err('internal_error', msg, 500)
  }
})
