#!/usr/bin/env node
/**
 * Update SignalWire SIP endpoint caller ID name
 */

import dotenv from 'dotenv';

dotenv.config();

// Extract space name from SIGNALWIRE_SPACE_URL (e.g., "erik.signalwire.com" -> "erik")
const SIGNALWIRE_SPACE = process.env.SIGNALWIRE_SPACE_URL?.split('.')[0] || process.env.SIGNALWIRE_SPACE_NAME || 'erik';
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;

// Get arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node update-signalwire-endpoint-name.js <username> <caller_id_name>');
  console.log('');
  console.log('Example:');
  console.log('  node update-signalwire-endpoint-name.js test_sip_endpoint "Erik L"');
  process.exit(1);
}

const [username, callerIdName] = args;

async function updateEndpoint() {
  console.log(`🔧 Updating SIP endpoint caller ID...`);
  console.log(`   Username: ${username}`);
  console.log(`   New Caller ID: ${callerIdName}`);
  console.log('');

  // First, get the endpoint ID
  const listUrl = `https://${SIGNALWIRE_SPACE}.signalwire.com/api/relay/rest/endpoints/sip`;
  const auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64');

  console.log('📡 Fetching existing endpoints...');
  const listResponse = await fetch(listUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!listResponse.ok) {
    const error = await listResponse.text();
    console.error('❌ Failed to list endpoints:', error);
    process.exit(1);
  }

  const endpoints = await listResponse.json();
  const endpoint = endpoints.data?.find(ep => ep.username === username);

  if (!endpoint) {
    console.error(`❌ Endpoint not found: ${username}`);
    console.log('\nAvailable endpoints:');
    endpoints.data?.forEach(ep => {
      console.log(`  - ${ep.username} (ID: ${ep.id})`);
    });
    process.exit(1);
  }

  console.log(`✅ Found endpoint: ${endpoint.username} (ID: ${endpoint.id})`);
  console.log(`   Current Caller ID: ${endpoint.caller_id || '(not set)'}`);
  console.log('');

  // Update the endpoint
  const updateUrl = `https://${SIGNALWIRE_SPACE}.signalwire.com/api/relay/rest/endpoints/sip/${endpoint.id}`;
  console.log(`📝 Updating caller ID to: ${callerIdName}`);

  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      caller_id: callerIdName
    })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    console.error('❌ Failed to update endpoint:', error);
    process.exit(1);
  }

  const updated = await updateResponse.json();
  console.log('✅ Successfully updated endpoint!');
  console.log('');
  console.log('Updated endpoint:');
  console.log(`  Username: ${updated.username}`);
  console.log(`  Caller ID: ${updated.caller_id}`);
  console.log('');
  console.log('🎉 Caller ID will now show as "' + callerIdName + '" on outbound calls!');
}

updateEndpoint()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
