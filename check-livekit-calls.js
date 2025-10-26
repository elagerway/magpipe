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
    // List recent rooms
    console.log('Recent Rooms:');
    const rooms = await roomClient.listRooms();
    
    if (rooms.length === 0) {
      console.log('  No active rooms found\n');
    } else {
      rooms.forEach((room, i) => {
        console.log(`\n  Room ${i + 1}:`);
        console.log(`    Name: ${room.name}`);
        console.log(`    Created: ${new Date(Number(room.creationTime) * 1000).toISOString()}`);
        console.log(`    Participants: ${room.numParticipants}`);
        console.log(`    SID: ${room.sid}`);
      });
    }

    // Check SIP trunk status
    console.log('\n\nSIP Trunk Status:');
    const trunks = await sipClient.listSipTrunk();
    
    if (trunks.length === 0) {
      console.log('  No SIP trunks found\n');
    } else {
      trunks.forEach((trunk, i) => {
        console.log(`\n  Trunk ${i + 1}:`);
        console.log(`    ID: ${trunk.sipTrunkId}`);
        console.log(`    Name: ${trunk.name}`);
        console.log(`    Kind: ${trunk.kind}`);
        console.log(`    Address: ${trunk.outboundAddress || trunk.inboundAddresses?.[0] || 'N/A'}`);
        console.log(`    Numbers: ${trunk.numbers?.join(', ') || 'None'}`);
      });
    }

    // List SIP participants (recent calls)
    console.log('\n\nRecent SIP Calls:');
    const sipCalls = await sipClient.listSipParticipant();
    
    if (sipCalls.length === 0) {
      console.log('  No active SIP calls found\n');
    } else {
      sipCalls.forEach((call, i) => {
        console.log(`\n  Call ${i + 1}:`);
        console.log(`    Participant ID: ${call.participantId}`);
        console.log(`    Participant Identity: ${call.participantIdentity}`);
        console.log(`    Room Name: ${call.roomName}`);
        console.log(`    Call ID: ${call.callId || 'N/A'}`);
      });
    }

  } catch (error) {
    console.error('Error checking LiveKit:', error);
  }

  console.log('\n=== CHECK COMPLETE ===');
}

checkRecentCalls();
