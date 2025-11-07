#!/usr/bin/env node
/**
 * Apply all pending migrations directly via Supabase Admin API
 */

import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

// Parse Supabase connection string from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD; // You'll need this

// Extract project ref from URL: https://PROJECT_REF.supabase.co
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// Construct Postgres connection string
const connectionString = `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`;

async function runMigration(client, sql, name) {
  console.log(`\n📝 ${name}...`);

  try {
    await client.query(sql);
    console.log(`✅ Success!`);
    return true;
  } catch (error) {
    console.error(`❌ Failed:`, error.message);
    return false;
  }
}

async function applyMigrations() {
  console.log('🚀 Connecting to Supabase database...\n');

  if (!DB_PASSWORD) {
    console.error('❌ SUPABASE_DB_PASSWORD not found in .env file');
    console.log('\n💡 You need to add your database password to .env:');
    console.log('   SUPABASE_DB_PASSWORD=your_password_here\n');
    console.log('Get it from: https://supabase.com/dashboard/project/' + projectRef + '/settings/database');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read migration files
    const migrations = [
      {
        file: 'supabase/migrations/060_pending_deletion_approvals.sql',
        name: 'Migration 060: pending_deletion_approvals table'
      },
      {
        file: 'supabase/migrations/061_unique_phone_in_deletion_queue.sql',
        name: 'Migration 061: unique constraint'
      },
      {
        file: 'supabase/migrations/062_add_purchased_at_to_deletion_queue.sql',
        name: 'Migration 062: purchased_at column'
      },
      {
        file: 'supabase/migrations/20251031120000_add_sip_credentials.sql',
        name: 'Migration 20251031120000: SIP credentials'
      }
    ];

    let successCount = 0;

    for (const migration of migrations) {
      const sql = readFileSync(migration.file, 'utf8');
      const success = await runMigration(client, sql, migration.name);

      if (success) {
        successCount++;
      } else {
        console.log('\n⚠️  Stopping due to error');
        break;
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ Applied ${successCount} of ${migrations.length} migrations`);
    console.log('═'.repeat(60));

    if (successCount === migrations.length) {
      console.log('\n🎉 All migrations applied successfully!\n');

      // Verify
      const result = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'service_numbers' AND column_name IN ('sip_username', 'sip_password', 'sip_domain', 'sip_ws_server')"
      );

      console.log('🔍 SIP columns found:', result.rows.length);
      result.rows.forEach(row => console.log(`   - ${row.column_name}`));
    }

  } catch (error) {
    console.error('❌ Connection error:', error.message);
    console.log('\n💡 Make sure SUPABASE_DB_PASSWORD is correct in .env');
  } finally {
    await client.end();
  }
}

applyMigrations()
  .then(() => {
    console.log('\n✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
