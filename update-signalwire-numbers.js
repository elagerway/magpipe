// Script to update existing SignalWire numbers with webhooks and add to database
import { createClient } from '@supabase/supabase-js';

const SIGNALWIRE_PROJECT_ID = '1049f605-5865-4e01-af71-1a3fd7f20179';
const SIGNALWIRE_TOKEN = 'PT1dd170ef3b8ed364ecabb6980e65bb421470d6062d8bf061';
const SIGNALWIRE_SPACE_URL = 'erik.signalwire.com';

const SUPABASE_URL = 'https://api.magpipe.ai';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const USER_EMAIL = 'elagerway@gmail.com';

const webhookBaseUrl = `${SUPABASE_URL}/functions/v1`;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get user by email
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', USER_EMAIL)
    .single();

  if (userError || !users) {
    console.error('User not found:', userError);
    return;
  }

  const userId = users.id;
  console.log('Found user:', userId);

  // Fetch all purchased numbers from SignalWire
  const listUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers.json?PageSize=50`;

  const listResponse = await fetch(listUrl, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_TOKEN}`).toString('base64'),
    },
  });

  const result = await listResponse.json();
  const numbers = result.incoming_phone_numbers || [];

  console.log(`Found ${numbers.length} numbers on SignalWire`);

  for (const num of numbers) {
    console.log(`\nProcessing: ${num.phone_number} (${num.sid})`);

    // Update webhooks for this number
    const updateUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers/${num.sid}.json`;

    const updateBody = new URLSearchParams({
      VoiceUrl: `${webhookBaseUrl}/webhook-inbound-call`,
      VoiceMethod: 'POST',
      StatusCallback: `${webhookBaseUrl}/webhook-call-status`,
      StatusCallbackMethod: 'POST',
      SmsUrl: `${webhookBaseUrl}/webhook-inbound-sms`,
      SmsMethod: 'POST',
      FriendlyName: `Pat AI - ${USER_EMAIL}`,
    });

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_TOKEN}`).toString('base64'),
      },
      body: updateBody.toString(),
    });

    if (updateResponse.ok) {
      console.log('  ✓ Webhooks updated');
    } else {
      console.log('  ✗ Failed to update webhooks:', await updateResponse.text());
    }

    // Add to database
    const { error: insertError } = await supabase
      .from('service_numbers')
      .upsert({
        user_id: userId,
        phone_number: num.phone_number,
        phone_sid: num.sid,
        friendly_name: num.friendly_name || `Pat AI - ${USER_EMAIL}`,
        is_active: true,
        capabilities: num.capabilities || { voice: true, sms: true, mms: true },
      }, {
        onConflict: 'phone_number'
      });

    if (insertError) {
      console.log('  ✗ Failed to add to database:', insertError);
    } else {
      console.log('  ✓ Added to database');
    }
  }

  console.log('\n✅ All numbers processed!');
}

main().catch(console.error);