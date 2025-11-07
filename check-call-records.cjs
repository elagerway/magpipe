const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check which SIP endpoint the user is using
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, sip_username, sip_endpoint_id')
    .eq('email', 'erik@snapsonic.com')
    .single();

  if (userError) {
    console.error('User error:', userError);
  } else {
    console.log('User SIP Configuration:');
    console.log(JSON.stringify(user, null, 2));
  }
})();
