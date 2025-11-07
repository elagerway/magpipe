/**
 * SIP Call Status Callback - Starts recording when call is answered
 */

Deno.serve(async (req) => {
  try {
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('SIP Call Status:', params);

    const { CallSid, CallStatus, Direction } = params;

    // Only record outbound calls when they're answered
    if (Direction === 'outbound-api' && CallStatus === 'in-progress') {
      console.log(`Call ${CallSid} answered, starting recording...`);

      const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
      const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN');
      const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL');

      if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
        console.error('SignalWire credentials missing');
        return new Response('OK', { status: 200 });
      }

      const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`);

      // Start recording via REST API
      const recordingResponse = await fetch(
        `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls/${CallSid}/Recordings.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${signalwireAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `RecordingStatusCallback=${encodeURIComponent('https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/sip-recording-callback')}&RecordingStatusCallbackMethod=POST`,
        }
      );

      if (recordingResponse.ok) {
        const recordingData = await recordingResponse.json();
        console.log('Recording started:', recordingData.sid);
      } else {
        const errorText = await recordingResponse.text();
        console.error('Failed to start recording:', errorText);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error in sip-call-status:', error);
    return new Response('OK', { status: 200 });
  }
});
