import { RoomServiceClient, SipClient } from 'livekit-server-sdk';
import 'dotenv/config';

const roomClient = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

const sipClient = new SipClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);

async function checkRecentCalls() {
  console.log('=== CHECKING RECENT LIVEKIT ACTIVITY ===\n');

  try {
    const rooms = await roomClient.listRooms();
    console.log('Recent Rooms:', rooms.length);
    
    const trunks = await sipClient.listSipTrunk();
    console.log('\nSIP Trunks:', trunks.length);
    trunks.forEach(trunk => {
      console.log('  Trunk:', trunk.sipTrunkId, trunk.name, trunk.kind);
    });

    const sipCalls = await sipClient.listSipParticipant();
    console.log('\nActive SIP Calls:', sipCalls.length);
    sipCalls.forEach(call => {
      console.log('  Call:', call.participantId, call.roomName);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkRecentCalls();
