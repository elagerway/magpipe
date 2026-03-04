const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get recent outbound calls
  const { data: calls, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('📞 Recent outbound calls:');
  console.log('========================');
  if (!calls || calls.length === 0) {
    console.log('❌ No outbound calls found');
  } else {
    calls.forEach((call, i) => {
      console.log(`${i + 1}. Call SID: ${call.call_sid || 'N/A'}`);
      console.log(`   To: ${call.to_number}`);
      console.log(`   From: ${call.from_number}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Recording URL: ${call.recording_url || 'N/A'}`);
      console.log(`   Created: ${call.created_at}`);
      console.log('');
    });
  }
})();
