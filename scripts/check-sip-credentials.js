#!/usr/bin/env node
/**
 * Check and provision SIP credentials for service numbers
 *
 * This script:
 * 1. Checks which service numbers have SIP credentials
 * 2. Lists numbers that need credentials provisioned
 * 3. Provides instructions for manual provisioning in SignalWire
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSipCredentials() {
  console.log('🔍 Checking SIP credentials for service numbers...\n');

  // Get all active service numbers
  const { data: serviceNumbers, error } = await supabase
    .from('service_numbers')
    .select('id, phone_number, phone_sid, is_active, sip_username, sip_password, sip_domain, sip_ws_server')
    .order('is_active', { ascending: false })
    .order('phone_number');

  if (error) {
    console.error('❌ Error fetching service numbers:', error);
    return;
  }

  if (!serviceNumbers || serviceNumbers.length === 0) {
    console.log('ℹ️  No service numbers found in database');
    return;
  }

  console.log(`Found ${serviceNumbers.length} service number(s):\n`);

  const withCredentials = [];
  const withoutCredentials = [];

  for (const num of serviceNumbers) {
    const hasCredentials = num.sip_username && num.sip_password;
    const status = num.is_active ? '🟢 Active' : '🔴 Inactive';

    if (hasCredentials) {
      withCredentials.push(num);
      console.log(`✅ ${status} ${num.phone_number}`);
      console.log(`   SIP Username: ${num.sip_username}`);
      console.log(`   SIP Domain: ${num.sip_domain || 'erik.signalwire.com'}`);
      console.log(`   WS Server: ${num.sip_ws_server || 'wss://erik.signalwire.com:7443'}`);
    } else {
      withoutCredentials.push(num);
      console.log(`⚠️  ${status} ${num.phone_number}`);
      console.log(`   ❌ Missing SIP credentials`);
    }
    console.log('');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log(`✅ Numbers with SIP credentials: ${withCredentials.length}`);
  console.log(`❌ Numbers needing credentials: ${withoutCredentials.length}`);
  console.log('═'.repeat(60));

  if (withoutCredentials.length > 0) {
    console.log('\n📋 Next Steps:\n');
    console.log('To provision SIP credentials for numbers without them:\n');
    console.log('1. Log in to SignalWire dashboard: https://erik.signalwire.com');
    console.log('2. Navigate to Phone Numbers → SIP');
    console.log('3. Create SIP endpoints for each number:');

    for (const num of withoutCredentials) {
      console.log(`\n   Number: ${num.phone_number}`);
      console.log(`   Phone SID: ${num.phone_sid}`);
      console.log(`   Suggested username: ${num.phone_number.replace(/\+/g, '')}`);
    }

    console.log('\n4. Once created, update the database with this SQL:\n');
    for (const num of withoutCredentials) {
      const suggestedUsername = num.phone_number.replace(/\+/g, '');
      console.log(`UPDATE service_numbers SET`);
      console.log(`  sip_username = '${suggestedUsername}',`);
      console.log(`  sip_password = 'YOUR_PASSWORD_FROM_SIGNALWIRE',`);
      console.log(`  sip_domain = 'erik.signalwire.com',`);
      console.log(`  sip_ws_server = 'wss://erik.signalwire.com:7443'`);
      console.log(`WHERE phone_number = '${num.phone_number}';\n`);
    }
  }
}

checkSipCredentials()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
