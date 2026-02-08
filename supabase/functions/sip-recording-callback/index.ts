/**
 * SIP Recording Callback - Receives recording URL from SignalWire,
 * downloads and stores in Supabase Storage, transcribes with speaker diarization
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
      ConferenceSid,       // Conference SID (for conference recordings)
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

    // Ensure we have a full recording URL (SignalWire may send relative paths)
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';
    let fullRecordingUrl = RecordingUrl as string;
    if (fullRecordingUrl.startsWith('/')) {
      fullRecordingUrl = `https://${signalwireSpaceUrl}${fullRecordingUrl}`;
    } else if (!fullRecordingUrl.startsWith('http')) {
      fullRecordingUrl = `https://${signalwireSpaceUrl}/${fullRecordingUrl}`;
    }

    // Download recording from SignalWire (requires auth)
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN');

    const downloadHeaders: HeadersInit = {};
    if (signalwireProjectId && signalwireApiToken) {
      downloadHeaders['Authorization'] = 'Basic ' + btoa(`${signalwireProjectId}:${signalwireApiToken}`);
    }

    // Build the correct download URL - must use /Recordings/SID.mp3 format
    // SignalWire callback sends URLs like:
    // - /Accounts/.../Calls/.../Recordings/SID (call recordings)
    // - /Accounts/.../Conferences/.../Recordings/SID (conference recordings)
    // Both need to be converted to: /Accounts/.../Recordings/SID.mp3
    let mp3Url = fullRecordingUrl + '.mp3';
    if (mp3Url.includes('/Calls/') || mp3Url.includes('/Conferences/')) {
      // Extract recording SID and rebuild URL
      const recordingSidMatch = mp3Url.match(/Recordings\/([^/.]+)/);
      if (recordingSidMatch && signalwireProjectId) {
        mp3Url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Recordings/${recordingSidMatch[1]}.mp3`;
      }
    }
    console.log(`📥 Downloading recording from: ${mp3Url}`);

    // First request to get redirect URL (SignalWire returns 302 to pre-signed S3 URL)
    let audioResponse = await fetch(mp3Url, {
      headers: downloadHeaders,
      redirect: 'manual'  // Don't auto-follow to see the redirect
    });

    // If we got a redirect, follow it without auth (pre-signed URL)
    if (audioResponse.status === 302 || audioResponse.status === 301) {
      const redirectUrl = audioResponse.headers.get('Location');
      console.log(`📥 Following redirect to: ${redirectUrl?.substring(0, 100)}...`);
      if (redirectUrl) {
        audioResponse = await fetch(redirectUrl);  // No auth needed for pre-signed URL
      }
    }

    if (!audioResponse.ok) {
      console.error(`Failed to download recording: ${audioResponse.status} ${audioResponse.statusText}`);
      // Still update with SignalWire URL as fallback, but also append to recordings array
      const fallbackEntry = {
        url: fullRecordingUrl,
        label: label,
        duration: parseInt(RecordingDuration as string) || 0,
        timestamp: new Date().toISOString(),
        recording_sid: RecordingSid,
        note: 'fallback_signalwire_url',
      };
      const existingRecordings = callRecord.recordings || [];
      const updatedRecordings = [...existingRecordings, fallbackEntry];

      await supabase.from('call_records').update({
        recording_url: callRecord.recording_url || fullRecordingUrl,
        recordings: updatedRecordings,
        duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
        status: 'completed',
        metadata: { ...(callRecord.metadata || {}), recording_sid: RecordingSid },
      }).eq('id', callRecord.id);
      console.log(`✅ Updated call record ${callRecord.id} with fallback recording (label: ${label})`);
      return new Response('OK', { status: 200 });
    }

    const audioBlob = await audioResponse.blob();
    console.log(`   Downloaded ${audioBlob.size} bytes`);

    // Upload to Supabase Storage - use unique filename for each recording segment
    const fileLabel = label === 'main' ? '' : `_${label}`;
    const fileName = `recordings/${callRecord.id}${fileLabel}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('public')
      .upload(fileName, audioBlob, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    let publicRecordingUrl = fullRecordingUrl; // fallback
    if (uploadError) {
      console.error('Failed to upload to storage:', uploadError);
    } else {
      // Get public URL
      const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName);
      publicRecordingUrl = urlData.publicUrl;
      console.log(`✅ Uploaded to Supabase Storage: ${publicRecordingUrl}`);
    }

    // Build recording entry for the array
    const recordingEntry = {
      url: publicRecordingUrl,
      label: label,
      duration: parseInt(RecordingDuration as string) || 0,
      timestamp: new Date().toISOString(),
      recording_sid: RecordingSid,
    };

    // Get existing recordings array or initialize empty
    const existingRecordings = callRecord.recordings || [];
    const updatedRecordings = [...existingRecordings, recordingEntry];

    // Update call record - set recording_url for backward compatibility (first recording)
    // and append to recordings array
    const updateData: Record<string, unknown> = {
      recordings: updatedRecordings,
      duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
      status: 'completed',
      metadata: { ...(callRecord.metadata || {}), recording_sid: RecordingSid, signalwire_url: fullRecordingUrl },
    };

    // Only set recording_url if this is the first/main recording
    if (!callRecord.recording_url || label === 'main') {
      updateData.recording_url = publicRecordingUrl;
    }

    const { error: updateError } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('id', callRecord.id);

    if (updateError) {
      console.error('Error updating call record:', updateError);
      return new Response('Error updating call record', { status: 500 });
    }

    console.log(`✅ Updated call record ${callRecord.id} with recording (label: ${label})`);

    // Transcribe with speaker diarization asynchronously
    // Pass call direction and recording label to store per-recording transcript
    transcribeWithDiarization(audioBlob, callRecord.id, callRecord.direction || 'outbound', supabase, label, RecordingSid as string).catch(err => {
      console.error('Transcription failed:', err);
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error in recording callback:', error);
    return new Response('Internal server error', { status: 500 });
  }
});

/**
 * Transcribe audio with speaker diarization using Deepgram
 * Falls back to OpenAI Whisper if Deepgram not available
 *
 * Speaker labeling based on call direction:
 * - Outbound: Speaker who speaks first is usually the Callee (they answer), our user is Caller
 * - Inbound: Speaker who speaks first is usually the Caller (external), our user is Callee
 */
async function transcribeWithDiarization(audioBlob: Blob, callRecordId: string, direction: string, supabase: any, recordingLabel: string = 'main', recordingSid: string = '') {
  try {
    const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!deepgramApiKey && !openaiApiKey) {
      console.log('No transcription API key available, skipping');
      return;
    }

    console.log(`🎤 Starting transcription for call ${callRecordId}`);

    let transcript = '';

    if (deepgramApiKey) {
      // Use Deepgram with speaker diarization
      console.log('   Using Deepgram with diarization...');

      const arrayBuffer = await audioBlob.arrayBuffer();

      const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': 'audio/mp3',
        },
        body: arrayBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Deepgram API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      // Format transcript with speaker labels
      // In a 2-party call: Speaker 0 = Caller (user), Speaker 1 = Callee
      const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || [];

      if (words.length > 0) {
        let currentSpeaker = -1;
        let currentText = '';
        const segments: { speaker: number; text: string }[] = [];

        for (const word of words) {
          const speaker = word.speaker ?? 0;
          if (speaker !== currentSpeaker) {
            if (currentText.trim()) {
              segments.push({ speaker: currentSpeaker, text: currentText.trim() });
            }
            currentSpeaker = speaker;
            currentText = word.punctuated_word || word.word;
          } else {
            currentText += ' ' + (word.punctuated_word || word.word);
          }
        }
        if (currentText.trim()) {
          segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        }

        // Format with proper labels based on call direction
        // For outbound: first speaker (0) is usually callee who answers, speaker 1 is our user
        // For inbound: first speaker (0) is usually the external caller, speaker 1 is our user
        transcript = segments.map(seg => {
          let label: string;
          if (direction === 'outbound') {
            // Outbound: our user called someone
            // Speaker 0 = Callee (person who answered), Speaker 1 = You (our user)
            label = seg.speaker === 0 ? 'Callee' : 'You';
          } else {
            // Inbound: someone called our user
            // Speaker 0 = Caller (external person), Speaker 1 = You (our user)
            label = seg.speaker === 0 ? 'Caller' : 'You';
          }
          return `${label}: ${seg.text}`;
        }).join('\n');
      } else {
        // Fallback to full transcript without diarization
        transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      }
    } else {
      // Fallback to OpenAI Whisper (no diarization)
      console.log('   Using OpenAI Whisper (no diarization)...');

      const whisperFormData = new FormData();
      whisperFormData.append('file', audioBlob, 'recording.mp3');
      whisperFormData.append('model', 'whisper-1');
      whisperFormData.append('language', 'en');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: whisperFormData,
      });

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        throw new Error(`Whisper API error: ${whisperResponse.status} ${errorText}`);
      }

      const whisperResult = await whisperResponse.json();
      // Whisper doesn't do diarization, so just provide the raw transcript
      transcript = whisperResult.text;
    }

    console.log(`✅ Transcription completed (${recordingLabel}): ${transcript.substring(0, 100)}...`);

    // Get current call record to update recordings array
    const { data: currentRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('recordings, transcript')
      .eq('id', callRecordId)
      .single();

    if (fetchError) {
      console.error('Error fetching call record for transcript update:', fetchError);
      return;
    }

    // Update the specific recording entry with transcript
    const recordings = currentRecord.recordings || [];
    const updatedRecordings = recordings.map((rec: any) => {
      if (rec.recording_sid === recordingSid || (recordingLabel === 'main' && rec.label === 'main')) {
        return { ...rec, transcript };
      }
      return rec;
    });

    // Build update data - always update recordings array with per-recording transcript
    // Only update call-level transcript for "main" recording
    const updateData: Record<string, unknown> = { recordings: updatedRecordings };
    if (recordingLabel === 'main') {
      updateData.transcript = transcript;
    }

    const { error: transcriptError } = await supabase
      .from('call_records')
      .update(updateData)
      .eq('id', callRecordId);

    if (transcriptError) {
      console.error('Error saving transcript:', transcriptError);
    } else {
      console.log(`✅ Saved transcript for call ${callRecordId} (${recordingLabel})`);
    }
  } catch (error) {
    console.error('Transcription error:', error);
  }
}
