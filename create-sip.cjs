const https = require('https');

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
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc2Mzc3NzUsImV4cCI6MjA0MzIxMzc3NX0.tu95MkMMlogNI5kv7lQAZijD2IaViGpLtL1NppOoE9c',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc2Mzc3NzUsImV4cCI6MjA0MzIxMzc3NX0.tu95MkMMlogNI5kv7lQAZijD2IaViGpLtL1NppOoE9c'
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
