/**
 * SIP Recording Callback - Receives recording URL from SignalWire,
 * downloads and stores in Supabase Storage, transcribes with speaker diarization
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

    // Find the call record by call_sid (set by sip-call-handler)
    let { data: callRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('*')
      .or(`call_sid.eq.${CallSid},vendor_call_id.eq.${CallSid}`)
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

    console.log(`Found call record: ${callRecord.id}`);

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

    // Get the recording as mp3
    const mp3Url = fullRecordingUrl + '.mp3';
    console.log(`📥 Downloading recording from: ${mp3Url}`);

    const audioResponse = await fetch(mp3Url, { headers: downloadHeaders });
    if (!audioResponse.ok) {
      console.error(`Failed to download recording: ${audioResponse.status}`);
      // Still update with SignalWire URL as fallback
      await supabase.from('call_records').update({
        recording_url: fullRecordingUrl,
        duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
        status: 'completed',
        metadata: { ...(callRecord.metadata || {}), recording_sid: RecordingSid },
      }).eq('id', callRecord.id);
      return new Response('OK', { status: 200 });
    }

    const audioBlob = await audioResponse.blob();
    console.log(`   Downloaded ${audioBlob.size} bytes`);

    // Upload to Supabase Storage
    const fileName = `recordings/${callRecord.id}.mp3`;
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

    // Update call record with public recording URL
    const { error: updateError } = await supabase
      .from('call_records')
      .update({
        recording_url: publicRecordingUrl,
        duration_seconds: parseInt(RecordingDuration as string) || callRecord.duration_seconds,
        status: 'completed',
        metadata: { ...(callRecord.metadata || {}), recording_sid: RecordingSid, signalwire_url: fullRecordingUrl },
      })
      .eq('id', callRecord.id);

    if (updateError) {
      console.error('Error updating call record:', updateError);
      return new Response('Error updating call record', { status: 500 });
    }

    console.log(`✅ Updated call record ${callRecord.id} with recording URL`);

    // Transcribe with speaker diarization asynchronously
    transcribeWithDiarization(audioBlob, callRecord.id, supabase).catch(err => {
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
 */
async function transcribeWithDiarization(audioBlob: Blob, callRecordId: string, supabase: any) {
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

        // Format as "User: ... / Caller: ..." for inbox parsing
        transcript = segments.map(seg => {
          const label = seg.speaker === 0 ? 'User' : 'Caller';
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
      // Format as single speaker since Whisper doesn't do diarization
      transcript = `User: ${whisperResult.text}`;
    }

    console.log(`✅ Transcription completed: ${transcript.substring(0, 100)}...`);

    // Update call record with transcript
    const { error: transcriptError } = await supabase
      .from('call_records')
      .update({ transcript })
      .eq('id', callRecordId);

    if (transcriptError) {
      console.error('Error saving transcript:', transcriptError);
    } else {
      console.log(`✅ Saved transcript for call ${callRecordId}`);
    }
  } catch (error) {
    console.error('Transcription error:', error);
  }
}
