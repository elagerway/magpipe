import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkRecentCalls() {
  const { data: calls, error } = await supabase
    .from('call_records')
    .select('id, direction, status, started_at, livekit_room_id, livekit_call_id, contact_phone')
    .order('started_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nRecent Call Records:');
  calls?.forEach(call => {
    console.log('\n  Call:', call.id);
    console.log('    Direction:', call.direction);
    console.log('    Status:', call.status);
    console.log('    Phone:', call.contact_phone);
    console.log('    Room:', call.livekit_room_id);
    console.log('    Participant:', call.livekit_call_id);
    console.log('    Time:', call.started_at);
  });
}

checkRecentCalls();
