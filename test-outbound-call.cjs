/**
 * Test script to place an outbound SIP call
 */

const JsSIP = require('jssip');
const wrtc = require('wrtc');
const dotenv = require('dotenv');

dotenv.config();

// Set up WebRTC for Node.js
JsSIP.RTCSession.prototype.getConfiguration = function() {
  return {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    peerConnectionFactory: wrtc
  };
};

const socket = new JsSIP.WebSocketInterface(`wss://${process.env.SIGNALWIRE_SPACE}.sip.signalwire.com`);
const configuration = {
  sockets: [socket],
  uri: `sip:test_sip_endpoint@${process.env.SIGNALWIRE_SPACE}.sip.signalwire.com`,
  password: process.env.SIP_PASSWORD || 'test_password',
  display_name: 'Test Call',
  session_timers: false,
};

const ua = new JsSIP.UA(configuration);

ua.on('connected', () => {
  console.log('✅ Connected to SignalWire');

  // Place the call
  const target = 'sip:16045628647@' + process.env.SIGNALWIRE_SPACE + '.sip.signalwire.com';
  console.log(`📞 Placing call to ${target}`);

  const options = {
    mediaConstraints: { audio: true, video: false },
    pcConfig: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    }
  };

  const session = ua.call(target, options);

  session.on('connecting', () => {
    console.log('🔄 Call connecting...');
  });

  session.on('accepted', () => {
    console.log('✅ Call accepted!');

    // Hang up after 5 seconds
    setTimeout(() => {
      console.log('👋 Hanging up...');
      session.terminate();
    }, 5000);
  });

  session.on('ended', () => {
    console.log('📴 Call ended');
    ua.stop();
    process.exit(0);
  });

  session.on('failed', (e) => {
    console.error('❌ Call failed:', e.cause);
    ua.stop();
    process.exit(1);
  });
});

ua.on('disconnected', () => {
  console.log('❌ Disconnected from SignalWire');
});

ua.on('registrationFailed', (e) => {
  console.error('❌ Registration failed:', e.cause);
  process.exit(1);
});

console.log('🚀 Starting SIP client...');
ua.start();
