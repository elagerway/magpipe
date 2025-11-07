/**
 * Test script for admin-agent-chat Edge Function
 * Tests the full authentication and chat flow
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testAdminChat() {
  console.log('=== Admin Chat API Test ===\n');

  // Step 1: Sign in as erik@snapsonic.com
  console.log('1. Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'erik@snapsonic.com',
    password: 'thisisatest123'  // Update if different
  });

  if (authError) {
    console.error('❌ Auth failed:', authError.message);
    console.log('\nPlease update the password in test-admin-chat-api.js or create a user with:');
    console.log('email: erik@snapsonic.com, password: thisisatest123');
    return;
  }

  console.log('✅ Signed in as:', authData.user.email);
  console.log('   User ID:', authData.user.id);
  console.log('   Access token (first 50 chars):', authData.session.access_token.substring(0, 50) + '...\n');

  // Step 2: Call admin-agent-chat function
  console.log('2. Calling admin-agent-chat function...');
  const { data, error } = await supabase.functions.invoke('admin-agent-chat', {
    body: {
      message: 'Hello! Can you help me update my system prompt to be more friendly?'
    }
  });

  if (error) {
    console.error('❌ Function call failed:', error);
    return;
  }

  console.log('✅ Function call succeeded!\n');
  console.log('Response:');
  console.log('  Conversation ID:', data.conversation_id);
  console.log('  Response:', data.response);
  console.log('  Requires confirmation:', data.requires_confirmation);

  if (data.pending_action) {
    console.log('\n  Pending Action:');
    console.log('    Type:', data.pending_action.type);
    console.log('    Preview:', data.pending_action.preview);
  }

  console.log('\n=== Test Complete ===');

  // Clean up
  await supabase.auth.signOut();
}

testAdminChat().catch(console.error);
