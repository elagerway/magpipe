/**
 * SIP Recording Callback - Receives recording URL from SignalWire and updates call record
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  try {
    // Parse the incoming SignalWire recording callback
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('Recording callback received:', params);

    const {
      RecordingUrl,        // URL of the recording
      RecordingSid,        // Recording SID
      RecordingDuration,   // Duration in seconds
      CallSid,             // Call SID
      RecordingStatus,     // Status: completed, failed, etc.
    } = params;

    if (RecordingStatus !== 'completed') {
      console.log(`Recording not completed, status: ${RecordingStatus}`);
      return new Response('OK', { status: 200 });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the call record by call_sid or by timestamp and phone numbers
    // Try to match by CallSid first (if we stored it)
    let { data: callRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('*')
      .eq('call_sid', CallSid)
      .single();

    if (fetchError || !callRecord) {
      console.log(`No call record found with call_sid: ${CallSid}`);

      // Fallback: try to find by recent outbound call without recording
      const { data: recentCall, error: recentError } = await supabase
        .from('call_records')
        .select('*')
        .eq('direction', 'outbound')
        .is('recording_url', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recentError || !recentCall) {
        console.error('Could not find matching call record');
        return new Response('Call record not found', { status: 404 });
      }

      callRecord = recentCall;
    }

    // Update call record with recording URL and duration
    const { error: updateError } = await supabase
      .from('call_records')
      .update({
        recording_url: RecordingUrl as string,
        recording_sid: RecordingSid as string,
        duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
      })
      .eq('id', callRecord.id);

    if (updateError) {
      console.error('Error updating call record:', updateError);
      return new Response('Error updating call record', { status: 500 });
    }

    console.log(`✅ Updated call record ${callRecord.id} with recording URL`);

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error in recording callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
