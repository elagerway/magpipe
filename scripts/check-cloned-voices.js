import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  'https://api.magpipe.ai',
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkClonedVoices() {
  const { data, error } = await supabase
    .from('agent_configs')
    .select('user_id, voice_id, cloned_voice_id, cloned_voice_name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Agent configs:');
  console.table(data);
}

checkClonedVoices();
