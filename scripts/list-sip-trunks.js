#!/usr/bin/env node
/**
 * List LiveKit SIP trunks
 */

import { config } from 'dotenv';
import { SipClient } from 'livekit-server-sdk';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

async function main() {
  console.log('LiveKit URL:', LIVEKIT_URL);
  console.log('API Key:', LIVEKIT_API_KEY);

  const sipClient = new SipClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  console.log('\n=== Inbound Trunks ===');
  try {
    const inboundTrunks = await sipClient.listSipInboundTrunk();
    console.log(JSON.stringify(inboundTrunks, null, 2));
  } catch (e) {
    console.log('Error listing inbound:', e.message);
  }

  console.log('\n=== Outbound Trunks ===');
  try {
    const outboundTrunks = await sipClient.listSipOutboundTrunk();
    console.log(JSON.stringify(outboundTrunks, null, 2));
  } catch (e) {
    console.log('Error listing outbound:', e.message);
  }
}

main().catch(console.error);
