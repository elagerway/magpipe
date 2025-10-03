import { createClient } from '@supabase/supabase-js';

// Get from command line args or env
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RETELL_API_KEY = process.env.RETELL_API_KEY;

if (!SUPABASE_KEY || !RETELL_API_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateRetellVoice() {
  try {
    // Get all agent configs with cloned voices
    const { data: configs, error: configError } = await supabase
      .from('agent_configs')
      .select('user_id, retell_agent_id, voice_id, cloned_voice_id, cloned_voice_name');

    if (configError) throw configError;

    console.log('Found configs:', configs);

    for (const config of configs) {
      if (!config.retell_agent_id) {
        console.log(`No Retell agent ID for user ${config.user_id}, skipping...`);
        continue;
      }

      console.log(`\nUpdating Retell agent ${config.retell_agent_id}...`);
      console.log(`Current voice_id: ${config.voice_id}`);

      // Update Retell agent
      const response = await fetch(
        `https://api.retellai.com/update-agent/${config.retell_agent_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${RETELL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            voice_id: config.voice_id,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to update agent ${config.retell_agent_id}:`, errorText);
      } else {
        const result = await response.json();
        console.log(`✓ Successfully updated agent to use voice: ${config.voice_id}`);
        console.log(`  Voice name: ${config.cloned_voice_name || 'Preset voice'}`);
      }
    }

    console.log('\n✓ Done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

updateRetellVoice();
