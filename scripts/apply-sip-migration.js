#!/usr/bin/env node
/**
 * Apply SIP credentials migration directly via Supabase client
 *
 * This script applies the ALTER TABLE statements to add SIP credential columns
 * to the service_numbers table.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔧 Applying SIP credentials migration...\n');

  // Read the migration file
  const migrationSql = readFileSync('supabase/migrations/20251031120000_add_sip_credentials.sql', 'utf8');

  console.log('📄 Migration SQL:');
  console.log(migrationSql);
  console.log('');

  // Execute the migration using rpc
  try {
    // Split into individual statements and execute each
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.startsWith('COMMENT ON')) {
        console.log('ℹ️  Skipping comment statement (requires direct SQL access)');
        continue;
      }

      console.log('⚙️  Executing statement...');
      const { data, error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        console.error('❌ Error executing statement:', error);
        throw error;
      }

      console.log('✅ Statement executed successfully');
    }

    console.log('\n✅ Migration applied successfully!');

    // Verify the columns exist
    console.log('\n🔍 Verifying columns...');
    const { data: serviceNumbers, error: selectError } = await supabase
      .from('service_numbers')
      .select('phone_number, sip_username, sip_password, sip_domain, sip_ws_server')
      .limit(1);

    if (selectError) {
      console.error('❌ Verification failed:', selectError);
      throw selectError;
    }

    console.log('✅ Columns verified successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n💡 Alternative: Apply migration using Supabase CLI when connection is available:');
    console.log('   export SUPABASE_ACCESS_TOKEN=... && npx supabase db push');
    process.exit(1);
  }
}

applyMigration()
  .then(() => {
    console.log('\n✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
