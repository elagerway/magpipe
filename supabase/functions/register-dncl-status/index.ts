/**
 * register-dncl-status — SignalWire callback handler for the automated
 * DNCL-registration call placed by `register-dncl`.
 *
 * Receives TWO distinct callback flavors at this URL (the register-dncl
 * LaML POST wires both endpoints here):
 *
 *   1. Call-status callback. Fires when the outbound IVR call hits a
 *      terminal state (completed / failed / busy / no-answer / canceled).
 *      Carries `CallStatus` and never carries reliable recording metadata
 *      on first dispatch — recording post-processing is its own pipeline.
 *
 *   2. Recording-status callback. Fires once the dual-channel recording
 *      is finalized. Carries `RecordingStatus=completed`, `RecordingUrl`,
 *      `RecordingSid` — this is the event we drive transcription off of.
 *
 * Without both callbacks wired, a successful CRTC registration whose
 * recording finished a beat after the call ended would race-mark the row
 * as `failed` (the recording URL would be absent from the call-status
 * event). See review finding bug_002.
 *
 * Behavior summary:
 *   - Recording event with `RecordingStatus=completed` + `RecordingUrl`:
 *       Validate the URL's host is in our allow-list (signalwire/aws),
 *       download, transcribe via Whisper, scan for failure keywords,
 *       update service_numbers.dncl_registration_status to
 *       'completed' or 'failed'. Sets `dncl_registered_at` on success.
 *   - Call-status event with terminal non-completed status:
 *       Mark row as 'failed' — guarded by `.neq('dncl_registration_status',
 *       'completed')` so a delayed stale callback can't overwrite the
 *       success state of a later retry (review finding bug_006).
 *   - Anything else (intermediate call states, recording-in-progress,
 *       call-status='completed' which now waits for the recording event):
 *       no-op.
 *
 * Auth: deployed with verify_jwt=false. SECURITY: the `RecordingUrl` is
 * attacker-supplied if anyone POSTs to this endpoint, so before we ever
 * attach Authorization: Basic <SignalWire creds> we host-allowlist the
 * URL against our SignalWire space + signalwire.com + amazonaws.com (the
 * S3 presigned URL host). Otherwise this endpoint would leak SignalWire
 * project credentials to an attacker-controlled URL on a single
 * unauthenticated POST (review finding bug_001).
 *
 * Deploy: ./scripts/deploy-functions.sh register-dncl-status
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const TERMINAL_CALL_STATUSES = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled'])

/** Failure-keyword scan over the transcript. Bilingual EN+FR; drawn from
 *  the 6 outbound probes captured 2026-05-11 (docs/dncl-ivr-map.md). */
const FAILURE_KEYWORDS = [
  'technical difficulties',
  'unable to complete',
  'no option was selected',
  'no option selected',
  'difficultés techniques',
  'unable to complete your request',
]

function classifyOutcome(transcript: string): 'completed' | 'failed' {
  const lower = transcript.toLowerCase()
  if (FAILURE_KEYWORDS.some((k) => lower.includes(k))) return 'failed'
  // Optimistic: no failure keyword → assume the IVR moved past the commit
  // step. Will tighten this once a business-hours probe captures the
  // exact success-message text.
  return 'completed'
}

/** Host allow-list for the `RecordingUrl` we forward Basic auth to.
 *  SignalWire serves recordings from `${space}/api/laml/.../Recordings/{sid}`
 *  and then redirects to `*.amazonaws.com` presigned URLs (which we follow
 *  manually with auth stripped). Anything outside this set is treated as
 *  an attacker-controlled URL — see review finding bug_001. */
function isAllowedRecordingHost(rawUrl: string, signalwireSpace: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:') return false
    const spaceHost = signalwireSpace.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (u.host === spaceHost) return true
    if (u.host.endsWith('.signalwire.com')) return true
    if (u.host.endsWith('.amazonaws.com')) return true
    return false
  } catch {
    return false
  }
}

async function downloadRecording(url: string, project: string, token: string): Promise<Uint8Array | null> {
  // SignalWire's recording endpoint 302s to a presigned S3 URL that
  // rejects re-sent Basic auth. Manually follow one hop with auth
  // stripped on the redirect. The caller is responsible for host-
  // allowlisting `url` before we get here — never construct the
  // Authorization header without that check (bug_001).
  const auth = 'Basic ' + btoa(`${project}:${token}`)
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: auth },
    redirect: 'manual',
  })
  if (resp.status === 200) {
    return new Uint8Array(await resp.arrayBuffer())
  }
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get('location')
    if (!loc) return null
    const next = await fetch(loc, { method: 'GET' })
    if (!next.ok) return null
    return new Uint8Array(await next.arrayBuffer())
  }
  return null
}

async function transcribeAudio(audio: Uint8Array, openaiKey: string): Promise<string | null> {
  const boundary = '----dncl-' + Math.random().toString(36).slice(2)
  const parts: Array<Uint8Array | string> = []
  const enc = new TextEncoder()
  const push = (s: string) => parts.push(enc.encode(s))

  push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dncl.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`)
  parts.push(audio)
  push('\r\n')
  push(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`)
  push(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n`)
  push(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nCanada DNCL IVR bilingual. Registration confirmation, technical difficulties, no option was selected.\r\n`)
  push(`--${boundary}--\r\n`)

  let total = 0
  for (const p of parts) total += typeof p === 'string' ? enc.encode(p).length : p.length
  const body = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    const bytes = typeof p === 'string' ? enc.encode(p) : p
    body.set(bytes, offset)
    offset += bytes.length
  }

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })
  if (!resp.ok) {
    console.error('[register-dncl-status] Whisper error:', resp.status, await resp.text())
    return null
  }
  return await resp.text()
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const serviceNumberId = url.searchParams.get('service_number_id')
    if (!serviceNumberId) {
      console.warn('[register-dncl-status] missing service_number_id')
      return new Response('OK', { status: 200 })
    }

    const form = await req.formData()
    const callStatus = String(form.get('CallStatus') || '').toLowerCase()
    const recordingStatus = String(form.get('RecordingStatus') || '').toLowerCase()
    const callSid = form.get('CallSid') as string | null
    const recordingUrl = form.get('RecordingUrl') as string | null
    const recordingSid = form.get('RecordingSid') as string | null

    console.log(
      `[register-dncl-status] sn=${serviceNumberId} call=${callSid} ` +
      `call_status=${callStatus || '-'} recording_status=${recordingStatus || '-'} ` +
      `rec_sid=${recordingSid || '-'}`
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Branch 1: Recording-status callback with finalized audio ──────
    // This is the event we drive transcription off of. The call-status
    // 'completed' event used to be our trigger, but it races with
    // recording post-processing (bug_002) — sometimes RecordingUrl is
    // absent there. RecordingStatusCallback fires only once the audio
    // is actually ready.
    if (recordingStatus === 'completed' && recordingUrl) {
      const processRecording = async () => {
        try {
          // Idempotency: skip if the row is already in a terminal state.
          // Belt-and-suspenders against duplicate callbacks.
          const { data: current } = await supabase
            .from('service_numbers')
            .select('dncl_registration_status')
            .eq('id', serviceNumberId)
            .maybeSingle()
          if (
            current?.dncl_registration_status === 'completed' ||
            current?.dncl_registration_status === 'failed'
          ) {
            console.log(
              `[register-dncl-status] sn=${serviceNumberId} already terminal ` +
              `(${current.dncl_registration_status}), skipping recording processing`,
            )
            return
          }

          const project = Deno.env.get('SIGNALWIRE_PROJECT_ID')
          const token = Deno.env.get('SIGNALWIRE_API_TOKEN')
          const openaiKey = Deno.env.get('OPENAI_API_KEY')
          const space = Deno.env.get('SIGNALWIRE_SPACE_URL')
          if (!project || !token || !openaiKey || !space) {
            console.error('[register-dncl-status] missing creds; marking failed')
            await supabase
              .from('service_numbers')
              .update({ dncl_registration_status: 'failed' })
              .eq('id', serviceNumberId)
              .neq('dncl_registration_status', 'completed')
            return
          }

          // SECURITY (bug_001): the RecordingUrl field is attacker-supplied
          // for any unauthenticated POST to this endpoint. Validate the
          // host before we ever attach the SignalWire Basic auth header
          // in downloadRecording — otherwise an attacker who POSTs with
          // RecordingUrl=https://evil.example/log harvests our project
          // credentials in plaintext.
          const audioUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`
          if (!isAllowedRecordingHost(audioUrl, space)) {
            console.error(
              `[register-dncl-status] REJECTED non-allowlisted RecordingUrl host: ${audioUrl} ` +
              `(possible spoofed callback; sn=${serviceNumberId})`
            )
            return
          }

          const audio = await downloadRecording(audioUrl, project, token)
          if (!audio || audio.length < 1000) {
            console.warn(`[register-dncl-status] recording ${recordingSid} empty or unfetchable, marking failed`)
            await supabase
              .from('service_numbers')
              .update({ dncl_registration_status: 'failed' })
              .eq('id', serviceNumberId)
              .neq('dncl_registration_status', 'completed')
            return
          }

          const transcript = await transcribeAudio(audio, openaiKey)
          if (!transcript) {
            console.warn('[register-dncl-status] transcription failed, marking failed')
            await supabase
              .from('service_numbers')
              .update({ dncl_registration_status: 'failed' })
              .eq('id', serviceNumberId)
              .neq('dncl_registration_status', 'completed')
            return
          }

          const outcome = classifyOutcome(transcript)
          console.log(
            `[register-dncl-status] sn=${serviceNumberId} outcome=${outcome} ` +
            `transcript_excerpt="${transcript.slice(0, 200).replace(/\s+/g, ' ')}"`
          )

          const update: { dncl_registration_status: string; dncl_registered_at?: string } = {
            dncl_registration_status: outcome,
          }
          if (outcome === 'completed') {
            update.dncl_registered_at = new Date().toISOString()
          }

          // No .neq guard on the completed-write — if a stale 'failed' was
          // written by an earlier StatusCallback retry for the same call,
          // we *want* to overwrite it with the truth from the recording.
          await supabase
            .from('service_numbers')
            .update(update)
            .eq('id', serviceNumberId)
        } catch (e) {
          console.error('[register-dncl-status] processRecording error:', e)
          await supabase
            .from('service_numbers')
            .update({ dncl_registration_status: 'failed' })
            .eq('id', serviceNumberId)
            .neq('dncl_registration_status', 'completed')
        }
      }

      const work = processRecording()
      // @ts-ignore — EdgeRuntime is the Supabase-provided runtime global.
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-ignore
        EdgeRuntime.waitUntil(work)
      }
      return new Response('OK', { status: 200 })
    }

    // ── Branch 2: Call-status terminal, non-completed ─────────────────
    // The call failed before reaching the IVR (busy/no-answer/canceled)
    // or got rejected mid-flight (failed). No recording is coming.
    // Idempotency guard via .neq('dncl_registration_status', 'completed')
    // — see bug_006: without it, a delayed stale 'failed' callback for
    // an earlier call can overwrite a later retry's success.
    if (TERMINAL_CALL_STATUSES.has(callStatus) && callStatus !== 'completed') {
      await supabase
        .from('service_numbers')
        .update({ dncl_registration_status: 'failed' })
        .eq('id', serviceNumberId)
        .neq('dncl_registration_status', 'completed')
      return new Response('OK', { status: 200 })
    }

    // ── Branch 3: call-status='completed' OR any other intermediate ───
    // No-op. For 'completed' we wait on the recording event (Branch 1)
    // to drive the actual outcome. For intermediate call states there
    // is nothing to do.
    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('[register-dncl-status] outer error:', e)
    return new Response('OK', { status: 200 })
  }
})
