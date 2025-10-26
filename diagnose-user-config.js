import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log('=== DIAGNOSING USER CONFIGURATION ===\n');

  // Try to get current user (will fail without auth, but let's check the table)
  console.log('Checking agent_configs table...');
  
  const { data: configs, error: configsError } = await supabase
    .from('agent_configs')
    .select('user_id, active_voice_stack')
    .limit(5);

  if (configsError) {
    console.error('❌ Error querying agent_configs:', configsError.message);
    console.log('   Code:', configsError.code);
    console.log('\n   This is likely due to RLS blocking unauthenticated access.');
    console.log('   The table exists and RLS is protecting it (this is expected).\n');
  } else {
    console.log(`✅ Found ${configs?.length || 0} agent_configs`);
    if (configs && configs.length > 0) {
      configs.forEach((config, i) => {
        console.log(`\n  Config ${i + 1}:`);
        console.log(`    User ID: ${config.user_id}`);
        console.log(`    Active Stack: ${config.active_voice_stack || '(not set)'}`);
      });
    }
  }

  // Check service_numbers
  console.log('\nChecking service_numbers table...');
  const { data: numbers, error: numbersError } = await supabase
    .from('service_numbers')
    .select('phone_number, user_id, is_active')
    .eq('is_active', true)
    .limit(5);

  if (numbersError) {
    console.error('❌ Error querying service_numbers:', numbersError);
  } else {
    console.log(`✅ Found ${numbers?.length || 0} active service_numbers`);
    const userIds = new Set(numbers?.map(n => n.user_id) || []);
    console.log(`   Unique users: ${userIds.size}`);
    if (numbers && numbers.length > 0) {
      const firstUserId = numbers[0].user_id;
      console.log(`\n   User ID from service_numbers: ${firstUserId}`);
      numbers.forEach((num, i) => {
        console.log(`   ${i + 1}. ${num.phone_number}`);
      });
    }
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
  console.log('\nNext step: Test Edge Function with the actual user ID from browser');
}

diagnose();
