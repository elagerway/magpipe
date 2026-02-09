/**
 * Local Agent Test Script
 *
 * Tests the LiveKit agent running locally via the dedicated test number.
 * Uses +16042101966 which routes to "SW Telephony Agent Local" dispatch rule.
 *
 * Usage: node scripts/test-local-agent.cjs
 */

require('dotenv').config();

const LOCAL_TEST_NUMBER = '+16042101966';
const TEST_PHONE = '+16045628647';  // Erik's cell
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function queryDB(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/mtxbiyilvgwhbdptysex/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  return response.json();
}

async function createCallRecord(serviceNumber, callerNumber, userId, agentId) {
  // Create a call record so the agent can find it and billing works
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from('call_records')
    .insert({
      user_id: userId,
      agent_id: agentId,
      service_number: serviceNumber,
      caller_number: callerNumber,
      direction: 'inbound',
      status: 'in-progress',
      disposition: 'answered_by_pat',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.log('   ⚠️ Could not create call record:', error.message);
    return null;
  }
  return data.id;
}

async function testLocalAgent() {
  console.log('\n🧪 Local Agent Test');
  console.log('='.repeat(50));
  console.log(`Test Number: ${LOCAL_TEST_NUMBER}`);
  console.log(`Will bridge to: ${TEST_PHONE}`);
  console.log('='.repeat(50));

  const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
  const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;
  const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL || 'erik.signalwire.com';
  const LIVEKIT_SIP_DOMAIN = process.env.LIVEKIT_SIP_DOMAIN || '378ads1njtd.sip.livekit.cloud';

  const signalwireAuth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');

  // Create call record for billing test (uses Erik's user_id and agent_id)
  const TEST_USER_ID = '77873635-9f5a-4eee-90f3-d145aed0c2c4';
  const TEST_AGENT_ID = '7f806f26-8dc4-4ecf-b80b-0f829cb7c577';

  console.log('\n📝 Creating call record for billing...');
  const callRecordId = await createCallRecord(LOCAL_TEST_NUMBER, TEST_PHONE, TEST_USER_ID, TEST_AGENT_ID);
  if (callRecordId) {
    console.log(`   ✅ Created call_record: ${callRecordId}`);
  }

  // Call LiveKit SIP using the test number (routes to local agent)
  const livekitSipUri = `sip:${LOCAL_TEST_NUMBER}@${LIVEKIT_SIP_DOMAIN};transport=tls`;
  const cxmlUrl = `${SUPABASE_URL}/functions/v1/outbound-call-swml?destination=${encodeURIComponent(TEST_PHONE)}&from=${encodeURIComponent(LOCAL_TEST_NUMBER)}&direction=outbound`;

  console.log('\n📞 Initiating call...');
  console.log(`   SIP URI: ${livekitSipUri}`);

  const formBody = [
    `To=${encodeURIComponent(livekitSipUri)}`,
    `From=${encodeURIComponent(LOCAL_TEST_NUMBER)}`,
    `Url=${encodeURIComponent(cxmlUrl)}`,
    `Method=POST`,
  ].join('&');

  const response = await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${signalwireAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    }
  );

  const data = await response.json();

  if (!response.ok || !data.sid) {
    console.log('\n❌ Failed to initiate call:', data);
    return;
  }

  console.log(`\n✅ Call initiated: ${data.sid}`);
  console.log(`   Status: ${data.status}`);

  // Wait for agent to connect
  console.log('\n⏳ Waiting for agent to connect (10s)...');
  await new Promise(r => setTimeout(r, 10000));

  // Check call state logs
  console.log('\n📋 Call State Logs:');
  const logs = await queryDB(`
    SELECT state, component, details, created_at
    FROM call_state_logs
    WHERE created_at > NOW() - INTERVAL '1 minute'
    ORDER BY created_at DESC
    LIMIT 15
  `);

  if (Array.isArray(logs) && logs.length > 0) {
    for (const log of logs.slice(0, 10)) {
      const time = log.created_at.substring(11, 19);
      console.log(`   ${time} | ${log.state}`);

      // Show agent details if loaded
      if (log.state === 'user_config_loaded' && log.details) {
        const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        console.log(`            → Agent: ${d.agent_name} (${d.agent_id?.substring(0, 8)})`);
      }
    }
  } else {
    console.log('   No recent logs found');
  }

  // Check SignalWire call status
  console.log('\n📞 SignalWire Call Status:');
  const callStatus = await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${data.sid}.json`,
    {
      headers: { 'Authorization': `Basic ${signalwireAuth}` }
    }
  );
  const callData = await callStatus.json();
  console.log(`   Status: ${callData.status}`);
  console.log(`   Duration: ${callData.duration}s`);

  console.log('\n' + '='.repeat(50));
  console.log('Test complete. Check your phone if it rang!');
}

testLocalAgent().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
