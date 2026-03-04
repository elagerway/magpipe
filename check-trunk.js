import { SipClient } from 'livekit-server-sdk';
import 'dotenv/config';

const sipClient = new SipClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

async function checkTrunk() {
  const trunk = await sipClient.getSipTrunk('ST_gjX5nwd4CNYq');
  console.log('Outbound Trunk Details:');
  console.log('  Name:', trunk.name);
  console.log('  Kind:', trunk.kind);
  console.log('  Address:', trunk.outboundAddress);
  console.log('  Username:', trunk.outboundUsername);
  console.log('  Numbers:', trunk.numbers);
  console.log('  Transport:', trunk.transport);
}

checkTrunk();
