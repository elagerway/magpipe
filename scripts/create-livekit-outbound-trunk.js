import { SipClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sipClient = new SipClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function createOutboundTrunk() {
  console.log('Creating LiveKit outbound SIP trunk for SignalWire...\n');

  // Get all service numbers to register with the trunk
  const { data: serviceNumbers, error } = await supabase
    .from('service_numbers')
    .select('phone_number')
    .eq('is_active', true);

  if (error || !serviceNumbers || serviceNumbers.length === 0) {
    console.error('❌ No active service numbers found. Please add service numbers first.');
    console.error('Error:', error);
    throw new Error('No service numbers available for trunk');
  }

  const phoneNumbers = serviceNumbers.map(sn => sn.phone_number);
  console.log(`Found ${phoneNumbers.length} service numbers:`, phoneNumbers);
  console.log();

  const trunkData = {
    name: 'SignalWire Outbound',
    kind: 'TRUNK_OUTBOUND', // Outbound trunk
    transport: 'SIP_TRANSPORT_TLS', // Use TLS for security

    // SignalWire outbound configuration
    outboundAddress: `${process.env.SIGNALWIRE_SPACE_URL}:5061` || 'erik.signalwire.com:5061',
    // outboundNumber: removed due to SDK encoding issues - will be set per call
    numbers: phoneNumbers, // All numbers that can be used
    outboundUsername: process.env.SIGNALWIRE_PROJECT_ID || '',
    outboundPassword: process.env.SIGNALWIRE_API_TOKEN || '',

    // Optional settings
    metadata: JSON.stringify({
      provider: 'signalwire',
      purpose: 'outbound_calls',
      created_at: new Date().toISOString()
    })
  };

  console.log('Configuration:');
  console.log(JSON.stringify(trunkData, null, 2));
  console.log();

  try {
    const trunk = await sipClient.createSipTrunk(trunkData);
    console.log('✅ Outbound trunk created successfully!');
    console.log('Trunk ID:', trunk.sipTrunkId);
    console.log('Name:', trunk.name);
    console.log('\n📋 Save this trunk ID for use in outbound calling');

    return trunk;
  } catch (error) {
    console.error('❌ Error creating outbound trunk:', error);
    throw error;
  }
}

createOutboundTrunk()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
