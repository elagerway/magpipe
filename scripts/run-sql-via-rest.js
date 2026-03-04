#!/usr/bin/env node
/**
 * Execute SQL via Supabase REST API
 * Uses the service role key to execute raw SQL
 */

import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function executeSql() {
  console.log('🚀 Executing migrations via Supabase REST API...\n');

  const sql = readFileSync('APPLY-MIGRATIONS.sql', 'utf8');

  try {
    // Try using the SQL endpoint if available
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });

    const data = await response.text();

    console.log('Response status:', response.status);
    console.log('Response:', data);

    if (response.ok) {
      console.log('\n✅ Migration executed successfully!');
    } else {
      console.log('\n❌ Migration failed');
      console.log('This is expected - Supabase REST API cannot execute raw SQL directly.');
      console.log('\nPlease apply the migration manually via Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/sql/new');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

executeSql();
