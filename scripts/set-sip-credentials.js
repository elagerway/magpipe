#!/usr/bin/env node
/**
 * Set SIP credentials for all service numbers for a user
 * All numbers share the same SIP endpoint - caller ID is set via P-Asserted-Identity header
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get credentials from command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node set-sip-credentials.js <username> <password> [user_email]');
  console.log('');
  console.log('Example:');
  console.log('  node set-sip-credentials.js erik my_secure_password erik@snapsonic.com');
  console.log('');
  console.log('This will update ALL service numbers for the user with the same SIP credentials.');
  console.log('The caller ID will be set dynamically per call using P-Asserted-Identity header.');
  process.exit(1);
}

const [username, password, userEmail] = args;

async function setSipCredentials() {
  console.log('🔧 Setting SIP credentials for user...\n');

  // If user email provided, get user ID
  let userId = null;
  if (userEmail) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', userEmail)
      .limit(1);

    if (!users || users.length === 0) {
      console.error(`❌ User not found: ${userEmail}`);
      process.exit(1);
    }

    userId = users[0].id;
    console.log(`✅ Found user: ${userEmail} (${userId})\n`);
  }

  // Get all service numbers for the user
  const query = supabase
    .from('service_numbers')
    .select('id, phone_number, is_active');

  if (userId) {
    query.eq('user_id', userId);
  }

  const { data: serviceNumbers, error } = await query;

  if (error) {
    console.error('❌ Error fetching service numbers:', error);
    process.exit(1);
  }

  if (!serviceNumbers || serviceNumbers.length === 0) {
    console.log('ℹ️  No service numbers found');
    process.exit(0);
  }

  console.log(`Found ${serviceNumbers.length} service number(s):\n`);
  serviceNumbers.forEach(num => {
    const status = num.is_active ? '🟢 Active' : '🔴 Inactive';
    console.log(`  ${status} ${num.phone_number}`);
  });

  console.log('\n📝 Updating SIP credentials...\n');

  // Update all service numbers with the same SIP credentials
  const updateQuery = supabase
    .from('service_numbers')
    .update({
      sip_username: username,
      sip_password: password,
      sip_domain: 'erik.signalwire.com',
      sip_ws_server: 'wss://erik.signalwire.com:7443'
    });

  if (userId) {
    updateQuery.eq('user_id', userId);
  }

  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error('❌ Error updating credentials:', updateError);
    process.exit(1);
  }

  console.log('✅ Successfully updated SIP credentials for all numbers!\n');
  console.log('Credentials:');
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${'*'.repeat(password.length)}`);
  console.log(`  Domain: erik.signalwire.com`);
  console.log(`  WS Server: wss://erik.signalwire.com:7443`);
  console.log('');
  console.log('💡 All numbers share the same SIP endpoint.');
  console.log('   Caller ID is set dynamically per call using P-Asserted-Identity header.');
  console.log('');

  // Verify
  console.log('🔍 Verifying...\n');
  const { data: verified } = await supabase
    .from('service_numbers')
    .select('phone_number, sip_username, is_active')
    .not('sip_username', 'is', null);

  if (verified && verified.length > 0) {
    verified.forEach(num => {
      const status = num.is_active ? '🟢' : '🔴';
      console.log(`  ${status} ${num.phone_number} → ${num.sip_username}`);
    });
    console.log(`\n✅ ${verified.length} number(s) ready for SIP calling!`);
  }
}

setSipCredentials()
  .then(() => {
    console.log('\n✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
