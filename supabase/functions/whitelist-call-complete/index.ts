/**
 * whitelist-call-complete — called by SignalWire <Dial action> when a
 * whitelisted call (blind forward) ends.
 *
 * Marks the call_record as completed with duration, sends notifications.
 * Returns an empty <Response/> to hang up the A-leg.
 *
 * Deploy: ./scripts/deploy-functions.sh whitelist-call-complete
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const rawId = url.searchParams.get('call_record_id');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const callRecordId = rawId && UUID_RE.test(rawId) ? rawId : null;

    let dialCallStatus: string | null = null;
    let dialCallDuration: string | null = null;
    try {
      const formData = await req.formData();
      dialCallStatus = formData.get('DialCallStatus') as string;
      dialCallDuration = formData.get('DialCallDuration') as string;
    } catch (formErr) {
      console.error('whitelist-call-complete: failed to parse form data — call record will not be updated:', formErr);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        status: 200, headers: { 'Content-Type': 'application/xml' },
      });
    }

    console.log('whitelist-call-complete:', { callRecordId, dialCallStatus, dialCallDuration });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (callRecordId) {
      const durationSeconds = dialCallDuration ? parseInt(dialCallDuration, 10) : 0;
      const isAnswered = dialCallStatus === 'completed';

      // Scope update to whitelist-created records only — prevents stomping other records if
      // call_record_id is guessed or replayed. Only 'in-progress' forwarding records can be completed here.
      const { error: updateError } = await supabase
        .from('call_records')
        .update({
          status: 'completed',
          disposition: isAnswered ? 'forwarded_answered' : `forwarded_${dialCallStatus || 'no_answer'}`,
          duration_seconds: durationSeconds,
          ended_at: new Date().toISOString(),
        })
        .eq('id', callRecordId)
        .eq('status', 'in-progress')
        .eq('disposition', 'forwarding');

      if (updateError) {
        console.error('whitelist-call-complete: failed to update call record:', updateError);
      }

      // ── Spoofing cooldown ──────────────────────────────────────────────
      // Caller-ID spoofing of a whitelisted caller manifests as a burst of
      // sub-second forward failures (the dial fails fast because the carrier
      // rejects / can't route the spoofed call). When we see ≥SUBSEC_BURST_THRESHOLD
      // such failures (inclusive of this one — the just-updated record is
      // matched by the disposition LIKE 'forward%' query below) for the same
      // (agent_id, caller_number) in the last SUBSEC_WINDOW_MS, put the entry
      // in a COOLDOWN_MS cooldown. While in cooldown, webhook-inbound-call
      // refuses to forward and falls the call through to the AI agent. Auto-
      // expires; legit callers (whose calls last seconds-to-minutes) never
      // trip this. Work runs in the background so SignalWire's <Dial action>
      // callback isn't blocked on extra DB round trips.
      const SUBSEC_THRESHOLD_S = 2;
      const SUBSEC_WINDOW_MS = 5 * 60 * 1000;
      const SUBSEC_BURST_THRESHOLD = 3;
      const COOLDOWN_MS = 60 * 60 * 1000;

      const subSecondFailure = !isAnswered && durationSeconds < SUBSEC_THRESHOLD_S;
      if (subSecondFailure) {
        const detectAndApplyCooldown = async () => {
          const { data: rec } = await supabase
            .from('call_records')
            .select('agent_id, caller_number')
            .eq('id', callRecordId)
            .single();
          if (!rec?.agent_id || !rec?.caller_number) return;

          const sinceIso = new Date(Date.now() - SUBSEC_WINDOW_MS).toISOString();
          // disposition LIKE 'forward%' covers 'forwarding' (set by
          // webhook-inbound-call on insert) and 'forwarded_*' (set by this
          // function on completion). Both can appear depending on whether
          // webhook-call-status raced the action callback.
          const { data: recent } = await supabase
            .from('call_records')
            .select('id, started_at, ended_at, duration_seconds, status')
            .eq('agent_id', rec.agent_id)
            .eq('caller_number', rec.caller_number)
            .like('disposition', 'forward%')
            .gte('started_at', sinceIso);

          let subsecCount = 0;
          for (const r of recent ?? []) {
            const durS = r.duration_seconds ?? (
              r.started_at && r.ended_at
                ? (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000
                : null
            );
            if (durS !== null && durS < SUBSEC_THRESHOLD_S && r.status !== 'completed') subsecCount++;
          }
          if (subsecCount < SUBSEC_BURST_THRESHOLD) return;

          const cooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
          const { error: cooldownErr } = await supabase
            .from('call_whitelist')
            .update({ cooldown_until: cooldownUntil })
            .eq('agent_id', rec.agent_id)
            .eq('caller_number', rec.caller_number);
          if (cooldownErr) {
            console.error('whitelist-call-complete: failed to set cooldown:', cooldownErr);
            return;
          }
          console.warn(
            `[whitelist-call-complete] cooldown set: agent=${rec.agent_id} ` +
            `caller=${rec.caller_number} until=${cooldownUntil} ` +
            `(${subsecCount} sub-second fails / ${SUBSEC_WINDOW_MS / 60000}min)`
          );
          await supabase.from('system_error_logs').insert({
            error_type: 'whitelist_cooldown_triggered',
            error_code: 'sub_second_burst',
            error_message:
              `Whitelist forwarding suppressed for ${rec.caller_number} → agent ${rec.agent_id} ` +
              `until ${cooldownUntil}. ${subsecCount} sub-second forward failures in last ` +
              `${SUBSEC_WINDOW_MS / 60000}min — likely caller-ID spoofing.`,
            source: 'supabase',
          });
        };

        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined') {
          EdgeRuntime.waitUntil(detectAndApplyCooldown());
        } else {
          detectAndApplyCooldown().catch(err =>
            console.error('whitelist-call-complete: cooldown detect error:', err)
          );
        }
      }

      // Fire notifications in background if the call was answered
      if (isAnswered) {
        const notify = async () => {
          // Poll up to 30s for recording URL (forwarded calls record via sip-recording-callback)
          let recordingUrl: string | null = null;
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const { data: rec } = await supabase
              .from('call_records')
              .select('recording_url, recordings, user_id, agent_id, caller_number, contact_phone')
              .eq('id', callRecordId)
              .single();
            const arr: any[] = rec?.recordings || [];
            recordingUrl = rec?.recording_url || arr.find((r: any) => r.url)?.url || null;
            if (recordingUrl) break;
          }

          const { data: rec } = await supabase
            .from('call_records')
            .select('user_id, agent_id, caller_number, contact_phone')
            .eq('id', callRecordId)
            .single();

          if (!rec) return;

          const phoneNumber = rec.contact_phone || rec.caller_number;
          let agentName: string | null = null;
          if (rec.agent_id) {
            const { data: ac } = await supabase.from('agent_configs').select('name').eq('id', rec.agent_id).maybeSingle();
            agentName = ac?.name || null;
          }

          const notificationData = {
            userId: rec.user_id,
            agentId: rec.agent_id,
            type: 'completed_call',
            data: {
              callerNumber: phoneNumber,
              timestamp: new Date().toISOString(),
              duration: durationSeconds,
              successful: true,
              agentName,
              sessionId: callRecordId,
              recordingUrl,
            },
          };

          await Promise.allSettled([
            fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-slack`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
          ]);
        };

        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined') {
          EdgeRuntime.waitUntil(notify());
        } else {
          console.error('whitelist-call-complete: EdgeRuntime not available — notification may be dropped before completing');
          notify().catch(err => console.error('Notification error:', err));
        }
      }
    }

    // Return empty response — hangs up the A-leg
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      status: 200, headers: { 'Content-Type': 'application/xml' },
    });
  } catch (error) {
    console.error('whitelist-call-complete error:', error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      status: 200, headers: { 'Content-Type': 'application/xml' },
    });
  }
});
