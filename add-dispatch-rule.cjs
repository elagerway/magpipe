const https = require('https');
const jwt = require('jsonwebtoken');

const LIVEKIT_URL = process.env.LIVEKIT_URL.replace('wss://', '').replace('https://', '');
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

// Create JWT token for LiveKit API
const token = jwt.sign(
  {
    video: { roomCreate: true, roomAdmin: true },
    iss: LIVEKIT_API_KEY,
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  LIVEKIT_API_SECRET
);

const data = JSON.stringify({
  "rule": {
    "roomName": "call-*",
    "agentName": "SW Telephony Agent"
  }
});

const options = {
  hostname: LIVEKIT_URL,
  path: '/agent/dispatch/rules',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Adding dispatch rule to LiveKit...');
console.log('URL:', LIVEKIT_URL);
console.log('Rule:', JSON.parse(data));

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', chunk => responseData += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', responseData);
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('✅ Dispatch rule added successfully!');
    } else {
      console.log('❌ Failed to add dispatch rule');
    }
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(data);
req.end();
