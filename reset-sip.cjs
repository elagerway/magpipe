const https = require('https');

// Step 1: Clear SIP credentials
const clearData = JSON.stringify({
  sip_endpoint_id: null,
  sip_username: null,
  sip_password: null,
  sip_realm: null,
  sip_ws_server: null
});

const clearOptions = {
  hostname: 'mtxbiyilvgwhbdptysex.supabase.co',
  port: 443,
  path: '/rest/v1/users?email=eq.erik@snapsonic.com',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': clearData.length,
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzYzNzc3NSwiZXhwIjoyMDQzMjEzNzc1fQ.tPOS1csw8FbnABEVq81r6ujaf8YbLWYkZ7g-Y-fFmkk',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzYzNzc3NSwiZXhwIjoyMDQzMjEzNzc1fQ.tPOS1csw8FbnABEVq81r6ujaf8YbLWYkZ7g-Y-fFmkk',
    'Prefer': 'return=minimal'
  }
};

console.log('Step 1: Clearing old SIP credentials...');

const clearReq = https.request(clearOptions, (res) => {
  console.log('Clear status:', res.statusCode);

  res.on('end', () => {
    console.log('Step 2: Creating new SIP endpoint...');

    // Step 2: Create new SIP endpoint
    const createData = JSON.stringify({ user_email: 'erik@snapsonic.com' });

    const createOptions = {
      hostname: 'mtxbiyilvgwhbdptysex.supabase.co',
      port: 443,
      path: '/functions/v1/create-user-sip-endpoint',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': createData.length,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc2Mzc3NzUsImV4cCI6MjA0MzIxMzc3NX0.tu95MkMMlogNI5kv7lQAZijD2IaViGpLtL1NppOoE9c',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc2Mzc3NzUsImV4cCI6MjA0MzIxMzc3NX0.tu95MkMMlogNI5kv7lQAZijD2IaViGpLtL1NppOoE9c'
      }
    };

    const createReq = https.request(createOptions, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        console.log('Create status:', res.statusCode);
        console.log('Response:');
        try {
          console.log(JSON.stringify(JSON.parse(body), null, 2));
        } catch (e) {
          console.log(body);
        }
      });
    });

    createReq.on('error', (error) => {
      console.error('Create error:', error);
    });

    createReq.write(createData);
    createReq.end();
  });
});

clearReq.on('error', (error) => {
  console.error('Clear error:', error);
});

clearReq.write(clearData);
clearReq.end();
