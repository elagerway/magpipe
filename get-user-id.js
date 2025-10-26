import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function getUserId() {
  // Get a user from agent_configs
  const { data, error } = await supabase
    .from('agent_configs')
    .select('user_id, active_voice_stack')
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('User ID:', data.user_id);
  console.log('Active Stack:', data.active_voice_stack);
}

getUserId();
