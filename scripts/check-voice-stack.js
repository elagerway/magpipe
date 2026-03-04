import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'erikm@snapsonic.io')
    .single();

  if (users) {
    const { data: config } = await supabase
      .from('agent_configs')
      .select('active_voice_stack, retell_agent_id')
      .eq('user_id', users.id)
      .single();

    console.log('User:', users.email);
    console.log('Voice Stack:', config?.active_voice_stack || 'retell (default)');
    console.log('Has Retell Agent:', config?.retell_agent_id ? 'Yes' : 'No');
  }
})();
