/**
 * Re-process SignalWire recordings that weren't uploaded to Supabase Storage
 * Run with: node scripts/reprocess-recordings.js
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const signalwireProjectId = process.env.SIGNALWIRE_PROJECT_ID;
const signalwireApiToken = process.env.SIGNALWIRE_API_TOKEN;
const signalwireSpaceUrl = process.env.SIGNALWIRE_SPACE_URL || 'erik.signalwire.com';

const supabase = createClient(supabaseUrl, supabaseKey);

async function downloadAndUpload(signalwireUrl, callRecordId, label) {
  // Extract recording SID from URL
  const recordingSidMatch = signalwireUrl.match(/Recordings\/([^/.]+)/);
  if (!recordingSidMatch) {
    console.log('    ⚠️ Could not extract recording SID');
    return null;
  }
  const recordingSid = recordingSidMatch[1];

  // Build correct download URL
  const mp3Url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Recordings/${recordingSid}.mp3`;
  console.log(`    📥 Downloading: ${mp3Url.substring(0, 80)}...`);

  // Download with auth
  const auth = Buffer.from(`${signalwireProjectId}:${signalwireApiToken}`).toString('base64');
  let response = await fetch(mp3Url, {
    headers: { 'Authorization': `Basic ${auth}` },
    redirect: 'manual'
  });

  // Follow redirect to pre-signed S3 URL
  if (response.status === 302 || response.status === 301) {
    const redirectUrl = response.headers.get('Location');
    console.log(`    📥 Following redirect...`);
    response = await fetch(redirectUrl);
  }

  if (!response.ok) {
    console.log(`    ❌ Download failed: ${response.status}`);
    return null;
  }

  const audioBuffer = await response.arrayBuffer();
  console.log(`    ✅ Downloaded ${audioBuffer.byteLength} bytes`);

  // Upload to Supabase Storage - unique filename per label
  const fileLabel = label === 'main' ? '' : `_${label}`;
  const fileName = `recordings/${callRecordId}${fileLabel}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from('public')
    .upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (uploadError) {
    console.log(`    ❌ Upload failed:`, uploadError.message);
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from('public').getPublicUrl(fileName);
  console.log(`    ✅ Uploaded to Supabase Storage`);
  return urlData.publicUrl;
}

async function reprocessRecordings() {
  console.log('🔄 Finding recordings to reprocess...\n');

  // Find call_records with recordings array containing SignalWire URLs
  const { data: records, error } = await supabase
    .from('call_records')
    .select('id, recording_url, recordings, duration_seconds')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching records:', error);
    return;
  }

  // Filter to only records with SignalWire URLs in recordings array
  const recordsToProcess = records.filter(r => {
    if (!r.recordings || r.recordings.length === 0) return false;
    return r.recordings.some(rec =>
      rec.url?.includes('signalwire.com') || rec.note === 'fallback_signalwire_url'
    );
  });

  console.log(`Found ${recordsToProcess.length} call records with SignalWire URLs to reprocess\n`);

  for (const record of recordsToProcess) {
    console.log(`📼 Processing call ${record.id}...`);

    let updated = false;
    const updatedRecordings = [];

    for (const rec of record.recordings) {
      if (rec.url?.includes('signalwire.com') || rec.note === 'fallback_signalwire_url') {
        console.log(`  📎 Recording: ${rec.label}`);
        const publicUrl = await downloadAndUpload(rec.url, record.id, rec.label);

        if (publicUrl) {
          updatedRecordings.push({
            ...rec,
            url: publicUrl,
            note: undefined, // Remove fallback note
          });
          updated = true;
        } else {
          updatedRecordings.push(rec); // Keep original if failed
        }
      } else {
        updatedRecordings.push(rec); // Already Supabase URL
      }
    }

    if (updated) {
      // Update recording_url to first Supabase URL if main was updated
      const mainRecording = updatedRecordings.find(r => r.label === 'main');
      const updateData = { recordings: updatedRecordings };
      if (mainRecording && !mainRecording.url?.includes('signalwire.com')) {
        updateData.recording_url = mainRecording.url;
      }

      const { error: updateError } = await supabase
        .from('call_records')
        .update(updateData)
        .eq('id', record.id);

      if (updateError) {
        console.log(`  ❌ DB update failed:`, updateError.message);
      } else {
        console.log(`  ✅ Updated call_record with ${updatedRecordings.length} recordings\n`);
      }
    } else {
      console.log(`  ⏭️ No updates needed\n`);
    }
  }

  console.log('🎉 Done!');
}

reprocessRecordings();
