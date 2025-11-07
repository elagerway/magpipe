#!/usr/bin/env node
/**
 * Copy SIP credentials from users table to all service_numbers
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function copySipCredentials() {
  console.log('🔍 Checking SIP credentials in users table...\n');

  // Get user's SIP credentials
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, sip_username, sip_password, sip_realm, sip_ws_server')
    .eq('email', 'erik@snapsonic.com')
    .single();

  if (userError) {
    console.error('❌ Error fetching user:', userError);
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email}`);
  console.log(`\nSIP Credentials:`);
  console.log(`  Username: ${user.sip_username || '(not set)'}`);
  console.log(`  Password: ${user.sip_password ? '*'.repeat(user.sip_password.length) : '(not set)'}`);
  console.log(`  Realm: ${user.sip_realm || '(not set)'}`);
  console.log(`  WS Server: ${user.sip_ws_server || '(not set)'}`);

  if (!user.sip_username || !user.sip_password) {
    console.log('\n⚠️  SIP credentials not set in users table');
    process.exit(1);
  }

  // Get all service numbers for this user
  const { data: serviceNumbers, error: numbersError } = await supabase
    .from('service_numbers')
    .select('id, phone_number, is_active')
    .eq('user_id', user.id);

  if (numbersError) {
    console.error('❌ Error fetching service numbers:', numbersError);
    process.exit(1);
  }

  console.log(`\n📞 Found ${serviceNumbers.length} service number(s):\n`);
  serviceNumbers.forEach(num => {
    const status = num.is_active ? '🟢 Active' : '🔴 Inactive';
    console.log(`  ${status} ${num.phone_number}`);
  });

  // Update all service numbers with the SIP credentials from users table
  console.log('\n📝 Copying SIP credentials to all service numbers...\n');

  const { error: updateError } = await supabase
    .from('service_numbers')
    .update({
      sip_username: user.sip_username,
      sip_password: user.sip_password,
      sip_domain: user.sip_realm,  // realm -> domain
      sip_ws_server: user.sip_ws_server
    })
    .eq('user_id', user.id);

  if (updateError) {
    console.error('❌ Error updating service numbers:', updateError);
    process.exit(1);
  }

  console.log('✅ Successfully copied SIP credentials to all service numbers!\n');

  // Verify
  const { data: verified } = await supabase
    .from('service_numbers')
    .select('phone_number, sip_username, sip_domain, is_active')
    .eq('user_id', user.id)
    .not('sip_username', 'is', null);

  if (verified && verified.length > 0) {
    console.log('🔍 Verification:\n');
    verified.forEach(num => {
      const status = num.is_active ? '🟢' : '🔴';
      console.log(`  ${status} ${num.phone_number}`);
      console.log(`     → ${num.sip_username}@${num.sip_domain}`);
    });
    console.log(`\n✅ ${verified.length} number(s) ready for SIP calling!`);
  }
}

copySipCredentials()
  .then(() => {
    console.log('\n✅ Complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
