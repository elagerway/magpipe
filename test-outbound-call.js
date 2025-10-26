import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function testOutboundCall() {
  console.log('Testing livekit-outbound-call Edge Function...\n');

  try {
    const { data, error } = await supabase.functions.invoke('livekit-outbound-call', {
      body: {
        phoneNumber: '+15555555555', // Test number
        callerIdNumber: '+14152518686',
        userId: 'test-user-id',
        recordCall: true
      }
    });

    if (error) {
      console.error('❌ Error calling Edge Function:');
      console.error('Error object:', error);
      console.error('Error message:', error.message);

      // Try to read the response body
      if (error.context && error.context.body) {
        const reader = error.context.body.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        console.error('Response body:', text);
      }
      return;
    }

    console.log('✅ Edge Function response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

testOutboundCall();
