#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Script to generate voice previews for Retell voices
 * Usage: deno run --allow-net --allow-env --allow-read scripts/generate-voice-preview.ts <voice_id>
 * Example: deno run --allow-net --allow-env --allow-read scripts/generate-voice-preview.ts 11labs-Kate
 */

import { load } from "https://deno.land/std@0.218.0/dotenv/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Load environment variables
const env = await load();
const RETELL_API_KEY = env.RETELL_API_KEY || Deno.env.get('RETELL_API_KEY');
const SUPABASE_URL = env.SUPABASE_URL || Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!RETELL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  console.error('Required: RETELL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}

const voiceId = Deno.args[0];
if (!voiceId) {
  console.error('Usage: deno run --allow-net --allow-env --allow-read scripts/generate-voice-preview.ts <voice_id>');
  console.error('Example: deno run --allow-net --allow-env --allow-read scripts/generate-voice-preview.ts 11labs-Kate');
  Deno.exit(1);
}

const previewText = "Hi! Thanks for calling. I'm here to help answer your questions and assist you today. How can I help you?";

console.log('Generating preview for voice:', voiceId);
console.log('Preview text:', previewText);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Step 3: Create a web call (requires manual interaction)
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
  console.log('\nWeb Call URL:', call.access_token);
  console.log('\n📞 Please connect to the web call using the Retell SDK or web interface');
  console.log('   The call will say the preview text, then you can hang up');
  console.log('\nWaiting for call to complete...');

  // Step 4: Poll for call completion
  let attempts = 0;
  let callData = null;

  while (attempts < 60) { // Wait up to 60 seconds
    await new Promise(resolve => setTimeout(resolve, 1000));

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
  Deno.exit(1);
}
