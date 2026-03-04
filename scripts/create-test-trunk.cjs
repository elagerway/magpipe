require('dotenv').config();
const { SipClient, AccessToken } = require('livekit-server-sdk');

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!livekitUrl || !apiKey || !apiSecret) {
  console.error('Missing LiveKit credentials');
  process.exit(1);
}

async function main() {
  const httpUrl = livekitUrl.replace('wss://', 'https://');
  const client = new SipClient(httpUrl, apiKey, apiSecret);

  // List existing trunks
  console.log('Listing existing trunks...');
  const trunks = await client.listSipInboundTrunk();
  console.log('\nExisting trunks:');
  for (const t of trunks) {
    console.log(`  - ${t.sipTrunkId}: ${t.name}`);
    console.log(`    Numbers: ${JSON.stringify(t.numbers)}`);
  }

  // Find and delete the test number from existing trunk
  const existingTrunk = trunks.find(t => t.sipTrunkId === 'ST_zHW9LbppnrBR');
  if (existingTrunk && existingTrunk.numbers.includes('+16042101966')) {
    console.log('\n📝 Test number found in existing trunk. Need to remove it first.');
    console.log('   Please remove +16042101966 from trunk ST_zHW9LbppnrBR via LiveKit Dashboard');
    console.log('   Dashboard URL: https://cloud.livekit.io');
    console.log('\n   Or delete the trunk and recreate without the test number.');
    return;
  }

  // Create new trunk for local testing
  console.log('\nCreating local test trunk...');
  try {
    const newTrunk = await client.createSipInboundTrunk({
      name: 'SignalWire Local Test',
      numbers: ['+16042101966']
    });
    console.log('\n✅ Created trunk:', newTrunk.sipTrunkId);
    console.log('   Name:', newTrunk.name);
    console.log('   Numbers:', newTrunk.numbers);
  } catch (e) {
    console.error('Error creating trunk:', e.message);
  }
}

main().catch(e => console.error('Error:', e));
