const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkCalls() {
  const { data: calls, error } = await supabase
    .from('call_records')
    .select('id, user_id, contact_phone, caller_number, direction, status, started_at, ended_at')
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${calls.length} call records:`);
  console.table(calls);
}

checkCalls().then(() => process.exit(0));
