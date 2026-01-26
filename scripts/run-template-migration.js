import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  'https://mtxbiyilvgwhbdptysex.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTable() {
  const { data, error } = await supabase
    .from('outbound_call_templates')
    .select('id')
    .limit(1);
  
  if (error && error.code === '42P01') {
    console.log('Table does not exist - needs to be created via SQL Editor');
    console.log('Copy the SQL from: supabase/migrations/20260123000000_outbound_call_templates.sql');
  } else if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Table exists!');
  }
}

checkTable();
