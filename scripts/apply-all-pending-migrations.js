#!/usr/bin/env node
/**
 * Apply all pending migrations directly to Supabase
 * Migrations: 060, 061, 062, 20251031120000
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeSql(sql, description) {
  console.log(`\n📝 ${description}...`);

  try {
    const { data, error } = await supabase.rpc('exec', { sql });

    if (error) {
      console.error(`❌ Failed: ${error.message}`);
      throw error;
    }

    console.log(`✅ Success!`);
    return true;
  } catch (err) {
    console.error(`❌ Error executing SQL:`, err);
    return false;
  }
}

async function applyAllMigrations() {
  console.log('🚀 Applying all pending migrations to Supabase...\n');
  console.log('This will apply migrations: 060, 061, 062, 20251031120000\n');

  // Migration 060: pending_deletion_approvals table
  const migration060 = readFileSync('supabase/migrations/060_pending_deletion_approvals.sql', 'utf8');

  // Migration 061: unique constraint
  const migration061 = readFileSync('supabase/migrations/061_unique_phone_in_deletion_queue.sql', 'utf8');

  // Migration 062: purchased_at column
  const migration062 = readFileSync('supabase/migrations/062_add_purchased_at_to_deletion_queue.sql', 'utf8');

  // Migration 20251031120000: SIP credentials
  const migrationSip = readFileSync('supabase/migrations/20251031120000_add_sip_credentials.sql', 'utf8');

  // Execute migrations in order
  const migrations = [
    { sql: migration060, name: 'Migration 060: pending_deletion_approvals table' },
    { sql: migration061, name: 'Migration 061: unique constraint on numbers_to_delete' },
    { sql: migration062, name: 'Migration 062: add purchased_at to numbers_to_delete' },
    { sql: migrationSip, name: 'Migration 20251031120000: SIP credentials' }
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const migration of migrations) {
    const success = await executeSql(migration.sql, migration.name);
    if (success) {
      successCount++;
    } else {
      failureCount++;
      console.log('\n⚠️  Migration failed. Stopping here.');
      break;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log('═'.repeat(60));

  if (failureCount === 0) {
    console.log('\n🎉 All migrations applied successfully!\n');

    // Verify SIP columns exist
    console.log('🔍 Verifying SIP credentials columns...');
    const { data, error } = await supabase
      .from('service_numbers')
      .select('phone_number, sip_username, sip_domain')
      .limit(1);

    if (error) {
      console.error('❌ Verification failed:', error.message);
    } else {
      console.log('✅ SIP credentials columns verified!\n');
    }
  }
}

applyAllMigrations()
  .then(() => {
    console.log('✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
