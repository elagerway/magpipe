#!/usr/bin/env node

// Test script for bridged outbound call
// This simulates what the UI does when user clicks "Call"

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ VITE_SUPABASE_ANON_KEY not found in environment');
  process.exit(1);
}

async function testBridgedCall() {
  try {
    console.log('🔐 Authenticating as erik@snapsonic.com...');

    // Get user session token (this would normally come from browser login)
    // For testing, we'll use the service role key to get a token
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found');
      console.log('💡 This test needs to be run from the browser where you\'re logged in');
      console.log('   Or manually provide a JWT token');
      process.exit(1);
    }

    // Create a session token for erik@snapsonic.com
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'erik@snapsonic.com',
        password: process.env.TEST_USER_PASSWORD || 'test-password-here',
      }),
    });

    if (!authResponse.ok) {
      console.error('❌ Authentication failed');
      console.log('💡 This test needs to be run from the browser with active session');
      console.log('   Set TEST_USER_PASSWORD env var with erik@snapsonic.com password');
      process.exit(1);
    }

    const authData = await authResponse.json();
    const userToken = authData.access_token;

    console.log('✅ Authenticated successfully');
    console.log('');

    // Now test the bridged call
    console.log('📞 Initiating bridged call...');
    console.log('   From: +16042431596 (erik\'s number)');
    console.log('   To: +16042101966 (destination)');
    console.log('');

    const callResponse = await fetch(`${SUPABASE_URL}/functions/v1/initiate-bridged-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: '+16042101966',
        caller_id: '+16042431596',
      }),
    });

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      console.error('❌ Call initiation failed:', callResponse.status);
      console.error('Response:', errorText);
      process.exit(1);
    }

    const callData = await callResponse.json();
    console.log('✅ Call initiated successfully!');
    console.log('');
    console.log('📊 Call Details:');
    console.log('   Call SID:', callData.call_sid);
    console.log('   Call Record ID:', callData.call_record_id);
    console.log('   Status:', callData.status);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   1. Your browser should receive an inbound SIP call');
    console.log('   2. Answer the call in your browser');
    console.log('   3. You\'ll be connected to +16042101966');
    console.log('   4. Call will be recorded automatically');
    console.log('');
    console.log('💡 Check call status at:');
    console.log(`   https://erik.signalwire.com/calls/${callData.call_sid}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testBridgedCall();
