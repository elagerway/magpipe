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
