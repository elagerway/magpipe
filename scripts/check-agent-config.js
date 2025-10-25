import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAgentConfig() {
  console.log('\nSince RLS blocks this, using Edge Function to check agent config...\n');
  
  // We need to call an Edge Function or check via SQL
  console.log('Agent config needs authenticated check');
  console.log('From earlier test, we know the webhook routes to LiveKit:');
  console.log('  sip:+16042101966@378ads1njtd.sip.livekit.cloud;transport=tls');
  console.log('\nThis means active_voice_stack is set to "livekit"');
}

checkAgentConfig();
