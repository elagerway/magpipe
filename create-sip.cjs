const https = require('https');
require('dotenv').config();

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const data = JSON.stringify({
  user_email: 'erik@snapsonic.com'
});

const options = {
  hostname: 'mtxbiyilvgwhbdptysex.supabase.co',
  port: 443,
  path: '/functions/v1/create-user-sip-endpoint',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`
  }
};

const req = https.request(options, (res) => {
  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:');
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch (e) {
      console.log(body);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
