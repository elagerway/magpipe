/**
 * Transcribe recordings that don't have transcripts yet
 * Run with: node scripts/transcribe-recordings.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function transcribeAudio(audioUrl, direction = 'inbound') {
  console.log(`    📥 Downloading audio...`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`    ✅ Downloaded ${audioBuffer.byteLength} bytes`);

  console.log(`    🎤 Transcribing with Deepgram...`);

  const dgResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${deepgramApiKey}`,
      'Content-Type': 'audio/mpeg',
    },
    body: audioBuffer,
  });

  if (!dgResponse.ok) {
    const errorText = await dgResponse.text();
    throw new Error(`Deepgram error: ${dgResponse.status} ${errorText}`);
  }

  const result = await dgResponse.json();
  const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || [];

  if (words.length === 0) {
    return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  // Build speaker-labeled transcript
  let currentSpeaker = -1;
  let currentText = '';
  const segments = [];

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

  // Format with labels
  const transcript = segments.map(seg => {
    let label;
    if (direction === 'outbound') {
      label = seg.speaker === 0 ? 'Callee' : 'You';
    } else {
      label = seg.speaker === 0 ? 'Caller' : 'You';
    }
    return `${label}: ${seg.text}`;
  }).join('\n');

  return transcript;
}

async function transcribeRecordings() {
  console.log('🔄 Finding recordings without transcripts...\n');

  if (!deepgramApiKey) {
    console.error('❌ DEEPGRAM_API_KEY not set');
    return;
  }

  // Get recent call records with recordings
  const { data: records, error } = await supabase
    .from('call_records')
    .select('id, recordings, direction')
    .not('recordings', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching records:', error);
    return;
  }

  // Filter to records with recordings missing transcripts
  const recordsToProcess = records.filter(r => {
    if (!r.recordings || r.recordings.length === 0) return false;
    return r.recordings.some(rec => rec.url && !rec.transcript);
  });

  console.log(`Found ${recordsToProcess.length} call records with recordings needing transcription\n`);

  for (const record of recordsToProcess) {
    console.log(`📼 Processing call ${record.id}...`);

    let updated = false;
    const updatedRecordings = [];

    for (const rec of record.recordings) {
      if (rec.url && !rec.transcript) {
        console.log(`  📎 ${rec.label}: transcribing...`);
        try {
          const transcript = await transcribeAudio(rec.url, record.direction || 'inbound');
          console.log(`    ✅ Got transcript: ${transcript.substring(0, 50)}...`);
          updatedRecordings.push({ ...rec, transcript });
          updated = true;
        } catch (err) {
          console.log(`    ❌ Error: ${err.message}`);
          updatedRecordings.push(rec);
        }
      } else {
        updatedRecordings.push(rec);
      }
    }

    if (updated) {
      const { error: updateError } = await supabase
        .from('call_records')
        .update({ recordings: updatedRecordings })
        .eq('id', record.id);

      if (updateError) {
        console.log(`  ❌ DB update failed: ${updateError.message}`);
      } else {
        console.log(`  ✅ Updated\n`);
      }
    } else {
      console.log(`  ⏭️ No updates needed\n`);
    }
  }

  console.log('🎉 Done!');
}

transcribeRecordings();
