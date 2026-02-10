/**
 * SIP Recording Callback - Receives recording notification from SignalWire
 * Stores metadata only - actual download/transcription happens on-demand when user views call
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // Parse query params for label and call_record_id
    const url = new URL(req.url);
    const label = url.searchParams.get('label') || 'main';
    const callRecordId = url.searchParams.get('call_record_id');

    // Parse the incoming SignalWire recording callback
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('Recording callback received:', { label, callRecordId, ...params });

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

    let callRecord = null;

    // If call_record_id is provided, use it directly (for transfer legs)
    if (callRecordId) {
      const { data, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('id', callRecordId)
        .single();

      if (data) {
        callRecord = data;
        console.log(`Found call record by ID: ${callRecord.id}`);
      } else {
        console.log(`No call record found with ID: ${callRecordId}`, error?.message);
      }
    }

    // Fall back to looking up by CallSid
    if (!callRecord) {
      const { data, error: fetchError } = await supabase
        .from('call_records')
        .select('*')
        .or(`call_sid.eq.${CallSid},vendor_call_id.eq.${CallSid}`)
        .single();

      if (data) {
        callRecord = data;
      } else if (fetchError) {
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
    }

    console.log(`Using call record: ${callRecord.id}`);

    // Build the SignalWire recording URL for later on-demand fetch
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');

    // Build canonical download URL: /Accounts/{project}/Recordings/{sid}.mp3
    const signalwireRecordingUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Recordings/${RecordingSid}.mp3`;

    // Build recording entry - mark as pending sync (will be fetched on-demand)
    const recordingEntry = {
      signalwire_url: signalwireRecordingUrl,  // Original URL for on-demand fetch
      url: null,                                // Will be set when synced to Supabase Storage
      label: label,
      duration: parseInt(RecordingDuration as string) || 0,
      timestamp: new Date().toISOString(),
      recording_sid: RecordingSid,
      status: 'pending_sync',                   // Indicates needs to be fetched
    };

    // Get existing recordings array or initialize empty
    const existingRecordings = callRecord.recordings || [];
    const updatedRecordings = [...existingRecordings, recordingEntry];

    // Update call record with recording metadata
    const updateData: Record<string, unknown> = {
      recordings: updatedRecordings,
      duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
      status: 'completed',
    };

    const { error: updateError } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('id', callRecord.id);

    if (updateError) {
      console.error('Error updating call record:', updateError);
      return new Response('Error updating call record', { status: 500 });
    }

    console.log(`✅ Stored recording metadata for ${callRecord.id} (label: ${label}, sid: ${RecordingSid})`);

    // Deduct credits for completed calls
    // Bill for: main, transfer_conference, back_to_agent, reconnect_conversation
    // Don't bill for: transferee_consult (AI briefing transferee, very short)
    const billableLabels = ['main', 'transfer_conference', 'back_to_agent', 'reconnect_conversation'];
    const durationSeconds = parseInt(RecordingDuration as string) || 0;
    if (billableLabels.includes(label) && durationSeconds > 0 && callRecord.user_id) {
      deductCallCredits(
        supabaseUrl,
        supabaseKey,
        callRecord.user_id,
        durationSeconds,
        callRecord.id,
        callRecord.agent_id
      ).catch(err => console.error('Failed to deduct credits:', err));
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error in recording callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});

/**
 * Deduct credits for a completed call
 */
async function deductCallCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  durationSeconds: number,
  callRecordId: string,
  agentId?: string
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if credits were already deducted for this call (avoid double billing)
    const { data: existingTransaction } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('reference_id', callRecordId)
      .eq('reference_type', 'call')
      .single();

    if (existingTransaction) {
      console.log(`Credits already deducted for call ${callRecordId}, skipping`);
      return;
    }

    // Get agent config to determine voice and LLM rates
    let voiceId = null;
    let aiModel = null;

    if (agentId) {
      const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('voice_id, llm_model')
        .eq('id', agentId)
        .single();

      if (agentConfig) {
        voiceId = agentConfig.voice_id;
        aiModel = agentConfig.llm_model;
      }
    }

    // Call deduct-credits function
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'voice',
        durationSeconds,
        voiceId,
        aiModel,
        referenceType: 'call',
        referenceId: callRecordId
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`💰 Deducted $${result.cost} for ${durationSeconds}s call (${callRecordId}), balance: $${result.balanceAfter}`);
    } else {
      console.error('Failed to deduct credits:', result.error);
    }
  } catch (error) {
    console.error('Error deducting call credits:', error);
  }
}
