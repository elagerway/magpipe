#!/usr/bin/env node

/**
 * Script to generate voice previews for Retell voices
 * Usage: node scripts/generate-voice-preview.js <voice_id>
 * Example: node scripts/generate-voice-preview.js 11labs-Kate
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE3MTY5OSwiZXhwIjoyMDc0NzQ3Njk5fQ.vbMKmrJEtOCJlpP0VxKdVoHGqQoVgNVx6_D9c4shBDM';

if (!RETELL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  console.error('Required: RETELL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const voiceId = process.argv[2];
if (!voiceId) {
  console.error('Usage: node scripts/generate-voice-preview.js <voice_id>');
  console.error('Example: node scripts/generate-voice-preview.js 11labs-Kate');
  process.exit(1);
}

const previewText = "Hi! Thanks for calling. I'm here to help answer your questions and assist you today. How can I help you?";

console.log('Generating preview for voice:', voiceId);
console.log('Preview text:', previewText);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generatePreview() {
  try {
    // Step 1: Create a temporary Retell LLM
    console.log('\n1. Creating temporary LLM...');
    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        general_prompt: previewText,
        begin_message: previewText,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      throw new Error(`Failed to create LLM: ${errorText}`);
    }

    const llm = await llmResponse.json();
    console.log('✓ Created LLM:', llm.llm_id);

    // Step 2: Create a temporary agent
    console.log('\n2. Creating temporary agent...');
    const agentResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_name: `Preview Generator - ${voiceId}`,
        voice_id: voiceId,
        response_engine: {
          type: 'retell-llm',
          llm_id: llm.llm_id,
        },
        enable_backchannel: false,
        enable_transcript_persistence: true,
        enable_call_recording: true,
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      // Clean up LLM
      await fetch(`https://api.retellai.com/delete-retell-llm/${llm.llm_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
      });
      throw new Error(`Failed to create agent: ${errorText}`);
    }

    const agent = await agentResponse.json();
    console.log('✓ Created agent:', agent.agent_id);

    // Step 3: Create a web call
    console.log('\n3. Creating web call...');
    console.log('⚠️  Note: You need to manually connect to this web call to generate the preview');

    const callResponse = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agent.agent_id,
      }),
    });

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      // Clean up
      await fetch(`https://api.retellai.com/delete-agent/${agent.agent_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
      });
      await fetch(`https://api.retellai.com/delete-retell-llm/${llm.llm_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
      });
      throw new Error(`Failed to create web call: ${errorText}`);
    }

    const call = await callResponse.json();
    console.log('✓ Created web call:', call.call_id);
    console.log('\nAccess Token:', call.access_token);
    console.log('\n📞 Connect to the web call to generate the preview:');
    console.log('   1. Go to: https://retellai.com/dashboard');
    console.log('   2. Click on "Calls" → Find call ID:', call.call_id);
    console.log('   3. Or use the Retell SDK with access_token:', call.access_token);
    console.log('\nWaiting for call to complete (60 seconds max)...');

    // Step 4: Poll for call completion
    let attempts = 0;
    let callData = null;

    while (attempts < 60) {
      await sleep(1000);

      const statusResponse = await fetch(`https://api.retellai.com/v2/get-call/${call.call_id}`, {
        headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
      });

      if (statusResponse.ok) {
        callData = await statusResponse.json();

        if (callData.end_timestamp) {
          console.log('\n✓ Call completed');

          if (callData.recording_url) {
            console.log('✓ Recording available');
            break;
          } else {
            console.log('⚠️  Call completed but no recording available');
            console.log('   Waiting a bit longer for recording to be processed...');
          }
        }
      }

      attempts++;
      if (attempts % 5 === 0) {
        console.log(`  Still waiting... (${attempts}s)`);
      }
    }

    // Clean up temporary resources
    console.log('\n4. Cleaning up temporary resources...');
    await fetch(`https://api.retellai.com/delete-agent/${agent.agent_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
    });
    console.log('✓ Deleted agent');

    await fetch(`https://api.retellai.com/delete-retell-llm/${llm.llm_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
    });
    console.log('✓ Deleted LLM');

    if (!callData?.recording_url) {
      throw new Error('No recording available. The call may have timed out or failed to connect.');
    }

    // Step 5: Download and upload recording
    console.log('\n5. Downloading recording...');
    const recordingResponse = await fetch(callData.recording_url);
    const audioData = await recordingResponse.arrayBuffer();
    console.log('✓ Downloaded recording:', (audioData.byteLength / 1024).toFixed(2), 'KB');

    // Step 6: Upload to Supabase storage
    console.log('\n6. Uploading to Supabase storage...');
    const storagePath = `voice-previews/${voiceId}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('public')
      .upload(storagePath, audioData, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload to storage: ${uploadError.message}`);
    }

    const { data: publicUrl } = supabase.storage
      .from('public')
      .getPublicUrl(storagePath);

    console.log('✓ Uploaded to storage');
    console.log('\n✅ Preview generated successfully!');
    console.log('Public URL:', publicUrl.publicUrl);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

generatePreview();
