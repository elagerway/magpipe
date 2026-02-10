/**
 * Sync Recording - On-demand download and transcription of a single recording
 *
 * Called when user views a call with pending_sync recordings.
 * Downloads from SignalWire, uploads to Supabase Storage, transcribes with Deepgram.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { analyzeSentiment, extractCallerMessages } from '../_shared/sentiment-analysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNALWIRE_SPACE_URL = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';
const SIGNALWIRE_PROJECT_ID = Deno.env.get('SIGNALWIRE_PROJECT_ID')!;
const SIGNALWIRE_API_TOKEN = Deno.env.get('SIGNALWIRE_API_TOKEN')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signalwireAuth = 'Basic ' + btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

    // Parse request
    const body = await req.json().catch(() => ({}));
    const { call_record_id, recording_index } = body;

    if (!call_record_id) {
      return new Response(
        JSON.stringify({ error: 'call_record_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get call record
    const { data: callRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('id, recordings, agent_id, direction')
      .eq('id', call_record_id)
      .single();

    if (fetchError || !callRecord) {
      return new Response(
        JSON.stringify({ error: 'Call record not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recordings = callRecord.recordings || [];

    // Find pending recordings to sync (need download)
    const pendingRecordings = recordings
      .map((rec: any, idx: number) => ({ ...rec, _index: idx }))
      .filter((rec: any) => {
        // Sync if: status is pending_sync, OR no URL, OR URL is SignalWire (not Supabase)
        if (rec.status === 'pending_sync') return true;
        if (!rec.url && rec.signalwire_url) return true;
        if (rec.url && rec.url.includes('signalwire.com')) return true;
        return false;
      });

    // Find recordings that are synced but need transcription
    const needsTranscription = recordings
      .map((rec: any, idx: number) => ({ ...rec, _index: idx }))
      .filter((rec: any) => {
        // Has Supabase URL but no transcript
        return rec.url && rec.url.includes('supabase.co') && !rec.transcript;
      });

    if (pendingRecordings.length === 0 && needsTranscription.length === 0) {
      // Update total duration even if no sync needed
      const totalDuration = recordings.reduce((sum: number, r: any) => {
        return sum + (parseInt(r.duration) || 0);
      }, 0);
      if (totalDuration > 0 && callRecord.duration_seconds !== totalDuration) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('call_records').update({ duration_seconds: totalDuration }).eq('id', call_record_id);
      }
      return new Response(
        JSON.stringify({ success: true, message: 'No pending recordings to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If specific index provided, only sync that one
    const toSync = recording_index !== undefined
      ? pendingRecordings.filter((r: any) => r._index === recording_index)
      : pendingRecordings;

    // If nothing to sync or transcribe, return early
    if (toSync.length === 0 && needsTranscription.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending recordings to sync or transcribe' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📥 Syncing ${toSync.length} recording(s), transcribing ${needsTranscription.length} for call ${call_record_id}`);

    // Get agent name for transcription
    let agentName = 'Maggie';
    if (callRecord.agent_id) {
      const { data: agentConfig } = await supabase
        .from('agent_configs')
        .select('name, agent_name')
        .eq('id', callRecord.agent_id)
        .single();
      if (agentConfig) {
        agentName = agentConfig.agent_name || agentConfig.name || 'Maggie';
      }
    }

    const results: any[] = [];
    let updatedRecordings = [...recordings];

    for (const rec of toSync) {
      const idx = rec._index;
      const signalwireUrl = rec.signalwire_url;
      const recordingSid = rec.recording_sid;
      const label = rec.label || 'main';

      if (!signalwireUrl) {
        console.log(`⚠️ No SignalWire URL for recording ${idx}, skipping`);
        results.push({ index: idx, status: 'error', error: 'No SignalWire URL' });
        continue;
      }

      console.log(`📥 Downloading ${label} (${recordingSid || 'unknown'})...`);

      try {
        // Download the recording using manual redirect (auth headers shouldn't go to S3)
        const initialResp = await fetch(signalwireUrl, {
          headers: { 'Authorization': signalwireAuth },
          redirect: 'manual'
        });

        let audioResponse: Response;
        if (initialResp.status === 302 || initialResp.status === 301) {
          const redirectUrl = initialResp.headers.get('Location');
          if (!redirectUrl) {
            console.error(`No redirect URL for ${recordingSid}`);
            results.push({ index: idx, status: 'error', error: 'No redirect URL' });
            continue;
          }
          // Follow redirect without auth headers
          audioResponse = await fetch(redirectUrl);
        } else if (initialResp.ok) {
          audioResponse = initialResp;
        } else {
          console.error(`Failed to download ${recordingSid}: ${initialResp.status}`);
          results.push({ index: idx, status: 'error', error: `HTTP ${initialResp.status}` });
          continue;
        }

        if (!audioResponse.ok) {
          console.error(`Download failed after redirect: ${audioResponse.status}`);
          results.push({ index: idx, status: 'error', error: `HTTP ${audioResponse.status}` });
          continue;
        }

        const audioBlob = await audioResponse.blob();
        console.log(`   Downloaded ${audioBlob.size} bytes`);

        // Upload to Supabase Storage
        const fileLabel = label === 'main' ? '' : `_${label}`;
        const fileName = `recordings/${call_record_id}${fileLabel}.mp3`;

        const { error: uploadError } = await supabase.storage
          .from('public')
          .upload(fileName, audioBlob, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        let publicRecordingUrl = signalwireUrl;
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName);
          publicRecordingUrl = urlData.publicUrl;
          console.log(`✅ Uploaded: ${fileName}`);
        } else {
          console.error('Upload error:', uploadError);
        }

        // Transcribe with Deepgram
        let transcript = '';
        try {
          transcript = await transcribeAudio(
            audioBlob,
            agentName,
            callRecord.direction || 'inbound'
          );
          console.log(`✅ Transcribed: ${transcript.substring(0, 80)}...`);
        } catch (err) {
          console.error('Transcription error:', err);
        }

        // Update the recording entry
        updatedRecordings[idx] = {
          ...updatedRecordings[idx],
          url: publicRecordingUrl,
          transcript: transcript || undefined,
          status: 'synced',
        };

        results.push({
          index: idx,
          status: 'synced',
          url: publicRecordingUrl,
          has_transcript: !!transcript
        });

      } catch (recError: any) {
        console.error(`Error processing recording ${idx}:`, recError);
        results.push({ index: idx, status: 'error', error: recError.message });
      }
    }

    // Handle recordings that need transcription only (already have Supabase URL)
    for (const rec of needsTranscription) {
      const idx = rec._index;
      const label = rec.label || 'main';

      console.log(`🎤 Transcribing ${label} (already synced)...`);

      try {
        // Download from Supabase Storage URL
        const audioResponse = await fetch(rec.url);
        if (!audioResponse.ok) {
          console.error(`Failed to download for transcription: ${audioResponse.status}`);
          results.push({ index: idx, status: 'error', error: 'Download failed' });
          continue;
        }

        const audioBlob = await audioResponse.blob();

        // Transcribe with Deepgram
        let transcript = '';
        try {
          transcript = await transcribeAudio(
            audioBlob,
            agentName,
            callRecord.direction || 'inbound'
          );
          console.log(`✅ Transcribed: ${transcript.substring(0, 80)}...`);
        } catch (err) {
          console.error('Transcription error:', err);
        }

        if (transcript) {
          // Update the recording entry with transcript
          updatedRecordings[idx] = {
            ...updatedRecordings[idx],
            transcript,
          };

          results.push({
            index: idx,
            status: 'transcribed',
            has_transcript: true
          });
        }
      } catch (recError: any) {
        console.error(`Error transcribing recording ${idx}:`, recError);
        results.push({ index: idx, status: 'error', error: recError.message });
      }
    }

    // Update call record with synced recordings
    const updateData: Record<string, any> = { recordings: updatedRecordings };

    // Set recording_url to first recording if not already set
    const { data: currentRecord } = await supabase
      .from('call_records')
      .select('recording_url, transcript')
      .eq('id', call_record_id)
      .single();

    if (!currentRecord?.recording_url && updatedRecordings.length > 0) {
      const mainRecording = updatedRecordings.find((r: any) => r.label === 'main') || updatedRecordings[0];
      if (mainRecording?.url) {
        updateData.recording_url = mainRecording.url;
      }
    }

    // Set call-level transcript from main recording if not already set
    if (!currentRecord?.transcript) {
      const mainRecording = updatedRecordings.find((r: any) => r.label === 'main');
      if (mainRecording?.transcript) {
        updateData.transcript = mainRecording.transcript;
      }
    }

    // Analyze sentiment from caller messages in main transcript
    const mainRecording = updatedRecordings.find((r: any) => r.label === 'main');
    if (mainRecording?.transcript) {
      try {
        const callerMessages = extractCallerMessages(mainRecording.transcript);
        if (callerMessages) {
          const sentiment = await analyzeSentiment(callerMessages);
          updateData.user_sentiment = sentiment;
          console.log(`📊 Sentiment: ${sentiment}`);
        }
      } catch (err) {
        console.error('Sentiment analysis error:', err);
      }
    }

    // Calculate total duration from all recordings
    const totalDuration = updatedRecordings.reduce((sum: number, r: any) => {
      return sum + (parseInt(r.duration) || 0);
    }, 0);
    if (totalDuration > 0) {
      updateData.duration_seconds = totalDuration;
    }

    await supabase
      .from('call_records')
      .update(updateData)
      .eq('id', call_record_id);

    const syncedCount = results.filter(r => r.status === 'synced').length;
    console.log(`✅ Synced ${syncedCount} recording(s) for call ${call_record_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCount,
        total_duration: totalDuration,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in sync-recording:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Transcribe audio with Deepgram
 */
async function transcribeAudio(
  audioBlob: Blob,
  agentName: string,
  direction: string
): Promise<string> {
  const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!deepgramApiKey) {
    console.log('No Deepgram API key, skipping transcription');
    return '';
  }

  const arrayBuffer = await audioBlob.arrayBuffer();

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/mp3',
      },
      body: arrayBuffer,
    }
  );

  if (!response.ok) {
    throw new Error(`Deepgram API error: ${response.status}`);
  }

  const result = await response.json();
  const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || [];

  if (words.length === 0) {
    return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  // Group words by speaker
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

  // Format with speaker labels based on direction
  return segments.map(seg => {
    let speakerLabel: string;
    if (direction === 'outbound') {
      // Outbound: Speaker 0 = Callee, Speaker 1 = Agent
      speakerLabel = seg.speaker === 0 ? 'Callee' : agentName;
    } else {
      // Inbound: Speaker 0 = Caller, Speaker 1 = Agent
      speakerLabel = seg.speaker === 0 ? 'Caller' : agentName;
    }
    return `${speakerLabel}: ${seg.text}`;
  }).join('\n');
}
