#!/usr/bin/env node
/**
 * Apply SIP migration directly via Supabase REST API
 */

import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function applyMigration() {
  console.log('🔧 Applying SIP credentials migration via REST API...\n');

  const sql = `
    ALTER TABLE service_numbers
    ADD COLUMN IF NOT EXISTS sip_username VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255),
    ADD COLUMN IF NOT EXISTS sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
    ADD COLUMN IF NOT EXISTS sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';
  `;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Failed to apply migration via REST API');
      console.error('Response:', data);
      console.log('\n💡 This is expected - Supabase REST API does not support direct SQL execution.');
      console.log('💡 You need to apply the migration manually via Supabase SQL Editor.\n');
      console.log('📋 Instructions in SIP-SETUP-INSTRUCTIONS.md Step 1\n');
      console.log('Quick link: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/sql/new\n');
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!');
    console.log('Response:', data);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 REST API approach failed. Use Supabase SQL Editor instead.');
    console.log('📋 See SIP-SETUP-INSTRUCTIONS.md Step 1\n');
    process.exit(1);
  }
}

applyMigration();
