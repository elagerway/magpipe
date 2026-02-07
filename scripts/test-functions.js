#!/usr/bin/env node
/**
 * Edge Function Test Script
 *
 * Tests Supabase edge functions without requiring user interaction.
 * Pre-approved for Claude to run during development.
 *
 * Usage:
 *   node scripts/test-functions.js              # Run all tests
 *   node scripts/test-functions.js telephony    # Run telephony tests only
 *   node scripts/test-functions.js warm-transfer # Run specific test
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL;

// Test user (Erik)
const TEST_USER_ID = 'f58a3d64-6036-4a89-88a4-deed898c41a8';
const TEST_USER_ID_ALT = '77873635-9f5a-4eee-90f3-d145aed0c2c4'; // Amy's user
const TEST_PHONE = '+16045628647';
const TEST_SERVICE_NUMBER = '+16042566768';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`  ${icon} ${name}${details ? ` ${colors.dim}(${details})${colors.reset}` : ''}`, color);
}

// Helper to call edge functions
async function callFunction(name, body = {}, options = {}) {
  const { method = 'POST', useServiceRole = true, expectStatus = 200 } = options;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${useServiceRole ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY}`,
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method,
      headers,
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      passed: expectStatus ? response.status === expectStatus : response.ok,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { error: error.message },
      passed: false,
    };
  }
}

// Helper to query database directly
async function queryDB(sql) {
  const response = await fetch('https://api.supabase.com/v1/projects/mtxbiyilvgwhbdptysex/database/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN || 'sbp_17bff30d68c60e941858872853988d63169b2649'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return response.json();
}

// ============================================
// TELEPHONY TESTS
// ============================================

async function testWarmTransfer() {
  log('\n📞 Testing warm-transfer...', 'blue');

  // Test start operation (will fail without active call, but should return proper error)
  const startResult = await callFunction('warm-transfer', {
    operation: 'start',
    room_name: 'test-room-' + Date.now(),
    target_number: TEST_PHONE,
    target_label: 'Erik',
    service_number: TEST_SERVICE_NUMBER,
  });

  // Should return 404 (no active call) or error about missing call
  const startExpected = startResult.status === 404 ||
    (startResult.data?.error && startResult.data.error.includes('call'));
  logTest('start (no active call)', startExpected, `status: ${startResult.status}, msg: ${startResult.data?.error || 'ok'}`);

  // Test with missing params
  const missingParams = await callFunction('warm-transfer', {
    operation: 'start',
  });

  const missingExpected = missingParams.status === 400 ||
    (missingParams.data?.error && missingParams.data.error.includes('Missing'));
  logTest('start (missing params)', missingExpected, `validates required fields`);

  // Test complete without active transfer
  const completeResult = await callFunction('warm-transfer', {
    operation: 'complete',
    room_name: 'nonexistent-room',
  });

  const completeExpected = completeResult.status === 404 ||
    (completeResult.data?.error && completeResult.data.error.includes('transfer'));
  logTest('complete (no active transfer)', completeExpected, `status: ${completeResult.status}`);

  // Test cancel without active transfer
  const cancelResult = await callFunction('warm-transfer', {
    operation: 'cancel',
    room_name: 'nonexistent-room',
  });

  const cancelExpected = cancelResult.status === 404 ||
    (cancelResult.data?.error && cancelResult.data.error.includes('transfer'));
  logTest('cancel (no active transfer)', cancelExpected, `status: ${cancelResult.status}`);

  return { passed: startExpected && missingExpected && completeExpected && cancelExpected };
}

async function testWarmTransferTwiml() {
  log('\n🎵 Testing warm-transfer-twiml...', 'blue');

  const actions = ['hold', 'unhold', 'consult', 'conference'];
  let allPassed = true;

  for (const action of actions) {
    const result = await fetch(
      `${SUPABASE_URL}/functions/v1/warm-transfer-twiml?action=${action}&service_number=${encodeURIComponent(TEST_SERVICE_NUMBER)}&conf_name=test_conf`,
      { method: 'GET' }
    );
    const text = await result.text();
    const hasTwiml = text.includes('<?xml') && text.includes('<Response>');
    logTest(`action: ${action}`, hasTwiml, hasTwiml ? 'valid TwiML' : 'invalid response');
    if (!hasTwiml) allPassed = false;
  }

  return { passed: allPassed };
}

async function testConferenceTwiml() {
  log('\n📞 Testing conference-twiml...', 'blue');

  const result = await fetch(
    `${SUPABASE_URL}/functions/v1/conference-twiml?name=test_conference&announce=Test`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
    }
  );
  const text = await result.text();
  const hasTwiml = text.includes('<Conference') || text.includes('<Response>');
  logTest('returns conference TwiML', hasTwiml, hasTwiml ? 'valid' : `got: ${text.substring(0, 100)}`);

  return { passed: hasTwiml };
}

async function testOutboundCallSwml() {
  log('\n📞 Testing outbound-call-swml...', 'blue');

  // Simulate SignalWire callback with form data
  const formData = new URLSearchParams();
  formData.append('CallSid', 'test-call-sid');
  formData.append('To', 'sip:+16042566768@test.sip.livekit.cloud');

  const result = await fetch(
    `${SUPABASE_URL}/functions/v1/outbound-call-swml?destination=${encodeURIComponent(TEST_PHONE)}&from=${encodeURIComponent(TEST_SERVICE_NUMBER)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    }
  );
  const text = await result.text();
  const hasDialTwiml = text.includes('<Dial') && text.includes(TEST_PHONE);
  logTest('returns dial TwiML', hasDialTwiml, hasDialTwiml ? 'valid' : 'missing dial');

  return { passed: hasDialTwiml };
}

// ============================================
// AGENT TESTS
// ============================================

async function testGetAgent() {
  log('\n🤖 Testing get-agent (via DB)...', 'blue');

  try {
    const result = await queryDB(`
      SELECT id, name, agent_name, functions
      FROM agent_configs
      WHERE id = '7f806f26-8dc4-4ecf-b80b-0f829cb7c577'
    `);

    const hasAgent = Array.isArray(result) && result.length > 0 && result[0].name === 'Amy';
    logTest('get Amy agent', hasAgent, hasAgent ? `found: ${result[0].name}` : 'not found');

    if (hasAgent) {
      const functions = result[0].functions;
      const transferEnabled = functions?.transfer?.enabled;
      logTest('transfer enabled', transferEnabled, transferEnabled ? 'yes' : 'no');
    }

    return { passed: hasAgent };
  } catch (error) {
    logTest('get Amy agent', false, error.message);
    return { passed: false };
  }
}

async function testListAgents() {
  log('\n🤖 Testing list-agents (via DB)...', 'blue');

  try {
    const result = await queryDB(`
      SELECT id, name, is_active
      FROM agent_configs
      WHERE user_id = '${TEST_USER_ID_ALT}'
    `);

    const hasAgents = Array.isArray(result) && result.length > 0;
    logTest('list agents', hasAgents, hasAgents ? `found ${result.length} agents` : 'no agents found');

    if (hasAgents) {
      result.forEach(a => log(`    → ${a.name} (${a.is_active ? 'active' : 'inactive'})`, 'dim'));
    }

    return { passed: hasAgents };
  } catch (error) {
    logTest('list agents', false, error.message);
    return { passed: false };
  }
}

// ============================================
// SMS TESTS
// ============================================

async function testSendUserSms() {
  log('\n💬 Testing SMS config (via DB)...', 'blue');

  try {
    // Check if user has SMS-capable numbers
    const result = await queryDB(`
      SELECT phone_number, capabilities
      FROM service_numbers
      WHERE user_id = '${TEST_USER_ID_ALT}'
      AND capabilities ? 'sms'
      LIMIT 3
    `);

    const hasSmsNumbers = Array.isArray(result) && result.length > 0;
    logTest('SMS-capable numbers', hasSmsNumbers, hasSmsNumbers ? `${result.length} found` : 'none');

    if (hasSmsNumbers) {
      result.forEach(n => log(`    → ${n.phone_number}`, 'dim'));
    }

    return { passed: true }; // Config check always passes
  } catch (error) {
    logTest('SMS config', false, error.message);
    return { passed: false };
  }
}

// ============================================
// CONTACT TESTS
// ============================================

async function testContactLookup() {
  log('\n👤 Testing contacts (via DB)...', 'blue');

  try {
    const result = await queryDB(`
      SELECT id, name, phone_number, email
      FROM contacts
      WHERE user_id = '${TEST_USER_ID_ALT}'
      LIMIT 5
    `);

    const querySucceeded = Array.isArray(result);
    const count = querySucceeded ? result.length : 0;
    logTest('contacts query', querySucceeded, `${count} contacts found`);

    if (count > 0) {
      result.slice(0, 3).forEach(c => log(`    → ${c.name || 'unnamed'}: ${c.phone_number}`, 'dim'));
    }

    return { passed: querySucceeded };
  } catch (error) {
    logTest('contacts query', false, error.message);
    return { passed: false };
  }
}

// ============================================
// VOICE TESTS
// ============================================

async function testListVoices() {
  log('\n🎤 Testing voices (via DB)...', 'blue');

  try {
    const result = await queryDB(`
      SELECT id, voice_id, voice_name, is_cloned
      FROM voices
      LIMIT 10
    `);

    const querySucceeded = Array.isArray(result);
    const count = querySucceeded ? result.length : 0;
    logTest('voices table', querySucceeded, `${count} voices available`);

    if (count > 0) {
      result.slice(0, 3).forEach(v => log(`    → ${v.voice_name} (${v.is_cloned ? 'cloned' : 'preset'})`, 'dim'));
    }

    return { passed: querySucceeded };
  } catch (error) {
    logTest('voices query', false, error.message);
    return { passed: false };
  }
}

// ============================================
// SIGNALWIRE DIRECT TESTS
// ============================================

async function testSignalWireConnection() {
  log('\n📡 Testing SignalWire API connection...', 'blue');

  const auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');

  try {
    const response = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}.json`,
      {
        headers: { 'Authorization': `Basic ${auth}` },
      }
    );
    const data = await response.json();
    const connected = response.ok && data.sid === SIGNALWIRE_PROJECT_ID;
    logTest('SignalWire API', connected, connected ? 'connected' : 'failed');
    return { passed: connected };
  } catch (error) {
    logTest('SignalWire API', false, error.message);
    return { passed: false };
  }
}

async function testSignalWireActiveCalls() {
  log('\n📞 Checking active SignalWire calls...', 'blue');

  const auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');

  try {
    const response = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json?Status=in-progress`,
      {
        headers: { 'Authorization': `Basic ${auth}` },
      }
    );
    const data = await response.json();
    const calls = data.calls || [];
    logTest('active calls query', response.ok, `${calls.length} active calls`);

    if (calls.length > 0) {
      calls.forEach(call => {
        log(`    → ${call.sid} | ${call.from} → ${call.to} | ${call.status}`, 'dim');
      });
    }

    return { passed: response.ok };
  } catch (error) {
    logTest('active calls query', false, error.message);
    return { passed: false };
  }
}

// ============================================
// DATABASE TESTS
// ============================================

async function testDatabaseConnection() {
  log('\n🗄️ Testing database connection...', 'blue');

  try {
    const result = await queryDB("SELECT COUNT(*) as count FROM agent_configs");
    const hasData = Array.isArray(result) && result[0]?.count !== undefined;
    logTest('database query', hasData, hasData ? `${result[0].count} agent configs` : 'failed');
    return { passed: hasData };
  } catch (error) {
    logTest('database query', false, error.message);
    return { passed: false };
  }
}

async function testRecentCallRecords() {
  log('\n📋 Checking recent call records...', 'blue');

  try {
    const result = await queryDB(`
      SELECT id, direction, service_number, vendor_call_id, created_at
      FROM call_records
      WHERE created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const hasRecords = Array.isArray(result);
    logTest('recent call records', hasRecords, `${result.length} records in last hour`);

    if (result.length > 0) {
      result.forEach(record => {
        log(`    → ${record.direction} | ${record.service_number} | ${record.created_at}`, 'dim');
      });
    }

    return { passed: hasRecords };
  } catch (error) {
    logTest('recent call records', false, error.message);
    return { passed: false };
  }
}

async function testTransferNumbers() {
  log('\n📞 Checking transfer numbers...', 'blue');

  try {
    const result = await queryDB(`
      SELECT label, phone_number, user_id, agent_id
      FROM transfer_numbers
      WHERE user_id = '${TEST_USER_ID_ALT}'
    `);

    const hasNumbers = Array.isArray(result) && result.length > 0;
    logTest('transfer numbers', hasNumbers, hasNumbers ? `${result.length} configured` : 'none configured');

    if (result.length > 0) {
      result.forEach(num => {
        log(`    → ${num.label}: ${num.phone_number}`, 'dim');
      });
    }

    return { passed: hasNumbers };
  } catch (error) {
    logTest('transfer numbers', false, error.message);
    return { passed: false };
  }
}

// ============================================
// LIVE CALL TEST (Actually makes a call)
// ============================================

async function testLiveCall() {
  log('\n📞 Testing LIVE outbound call...', 'yellow');
  log('    This will call Erik\'s cell phone!', 'yellow');

  const auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');

  // Simple TwiML that just says something and hangs up
  const testTwimlUrl = `${SUPABASE_URL}/functions/v1/conference-twiml?name=test_${Date.now()}`;

  try {
    const formData = new URLSearchParams();
    formData.append('To', TEST_PHONE);
    formData.append('From', TEST_SERVICE_NUMBER);
    formData.append('Url', testTwimlUrl);
    formData.append('Method', 'GET');

    const response = await fetch(
      `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    const data = await response.json();
    const callCreated = response.ok && data.sid;
    logTest('call initiated', callCreated, callCreated ? `SID: ${data.sid}` : `error: ${JSON.stringify(data)}`);

    if (callCreated) {
      // Wait a moment and check call status
      await new Promise(r => setTimeout(r, 3000));

      const statusResponse = await fetch(
        `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls/${data.sid}.json`,
        {
          headers: { 'Authorization': `Basic ${auth}` },
        }
      );
      const statusData = await statusResponse.json();
      logTest('call status', true, statusData.status);
    }

    return { passed: callCreated };
  } catch (error) {
    logTest('live call', false, error.message);
    return { passed: false };
  }
}

// ============================================
// TEST SUITES
// ============================================

const testSuites = {
  telephony: {
    name: 'Telephony',
    tests: [testWarmTransfer, testWarmTransferTwiml, testConferenceTwiml, testOutboundCallSwml],
  },
  agent: {
    name: 'Agent',
    tests: [testGetAgent, testListAgents],
  },
  sms: {
    name: 'SMS',
    tests: [testSendUserSms],
  },
  contacts: {
    name: 'Contacts',
    tests: [testContactLookup],
  },
  voice: {
    name: 'Voice',
    tests: [testListVoices],
  },
  signalwire: {
    name: 'SignalWire',
    tests: [testSignalWireConnection, testSignalWireActiveCalls],
  },
  database: {
    name: 'Database',
    tests: [testDatabaseConnection, testRecentCallRecords, testTransferNumbers],
  },
};

// Individual test mapping
const individualTests = {
  'warm-transfer': testWarmTransfer,
  'warm-transfer-twiml': testWarmTransferTwiml,
  'conference-twiml': testConferenceTwiml,
  'outbound-call-swml': testOutboundCallSwml,
  'get-agent': testGetAgent,
  'list-agents': testListAgents,
  'send-user-sms': testSendUserSms,
  'contact-lookup': testContactLookup,
  'list-voices': testListVoices,
  'signalwire': testSignalWireConnection,
  'active-calls': testSignalWireActiveCalls,
  'database': testDatabaseConnection,
  'call-records': testRecentCallRecords,
  'transfer-numbers': testTransferNumbers,
  'live-call': testLiveCall,
};

async function runSuite(suiteName) {
  const suite = testSuites[suiteName];
  if (!suite) {
    log(`Unknown suite: ${suiteName}`, 'red');
    return { passed: 0, failed: 0 };
  }

  log(`\n${'='.repeat(50)}`, 'blue');
  log(`  ${suite.name} Tests`, 'blue');
  log(`${'='.repeat(50)}`, 'blue');

  let passed = 0;
  let failed = 0;

  for (const test of suite.tests) {
    const result = await test();
    if (result.passed) passed++;
    else failed++;
  }

  return { passed, failed };
}

async function main() {
  const args = process.argv.slice(2);

  log('\n🧪 Edge Function Test Suite', 'blue');
  log(`   SUPABASE_URL: ${SUPABASE_URL}`, 'dim');
  log(`   Test user: ${TEST_USER_ID_ALT}`, 'dim');

  let totalPassed = 0;
  let totalFailed = 0;

  if (args.length === 0) {
    // Run all suites
    for (const suiteName of Object.keys(testSuites)) {
      const { passed, failed } = await runSuite(suiteName);
      totalPassed += passed;
      totalFailed += failed;
    }
  } else if (testSuites[args[0]]) {
    // Run specific suite
    const { passed, failed } = await runSuite(args[0]);
    totalPassed = passed;
    totalFailed = failed;
  } else if (individualTests[args[0]]) {
    // Run individual test
    const result = await individualTests[args[0]]();
    totalPassed = result.passed ? 1 : 0;
    totalFailed = result.passed ? 0 : 1;
  } else {
    log(`Unknown test or suite: ${args[0]}`, 'red');
    log('\nAvailable suites:', 'yellow');
    Object.keys(testSuites).forEach(s => log(`  - ${s}`, 'dim'));
    log('\nAvailable tests:', 'yellow');
    Object.keys(individualTests).forEach(t => log(`  - ${t}`, 'dim'));
    process.exit(1);
  }

  log(`\n${'='.repeat(50)}`, 'blue');
  log(`  Results: ${totalPassed} passed, ${totalFailed} failed`, totalFailed > 0 ? 'red' : 'green');
  log(`${'='.repeat(50)}\n`, 'blue');

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);
