/**
 * SIP Client for WebRTC voice calls
 * Uses JsSIP library for SIP communication
 */

import JsSIP from 'jssip';

class SIPClient {
  constructor() {
    this.userAgent = null;
    this.currentSession = null;
    this.isRegistered = false;
    this.remoteAudio = null;
    this.sipDomain = null;  // Store SIP domain for P-Asserted-Identity header
  }

  /**
   * Initialize and register SIP client
   * @param {Object} config - SIP configuration
   * @param {string} config.sipUri - SIP URI (e.g., sip:user@domain.com)
   * @param {string} config.sipPassword - SIP password
   * @param {string} config.wsServer - WebSocket server URL (e.g., wss://sip.example.com:7443)
   * @param {string} config.displayName - Display name for calls
   */
  async initialize(config) {
    try {
      console.log('🔧 Initializing SIP client with config:', {
        sipUri: config.sipUri,
        wsServer: config.wsServer,
        displayName: config.displayName,
        passwordLength: config.sipPassword?.length
      });

      // Extract and store domain from sipUri (e.g., sip:user@domain.com -> domain.com)
      const domainMatch = config.sipUri.match(/@(.+)$/);
      this.sipDomain = domainMatch ? domainMatch[1] : 'erik.signalwire.com';
      console.log('📡 SIP Domain for caller ID:', this.sipDomain);

      // Enable JsSIP debug logging
      JsSIP.debug.enable('JsSIP:*');

      const socket = new JsSIP.WebSocketInterface(config.wsServer);

      console.log('🔄 Creating WebSocket to:', config.wsServer);

      const configuration = {
        sockets: [socket],
        uri: config.sipUri,
        password: config.sipPassword,
        display_name: config.displayName || 'Web Caller',
        session_timers: false,
        register: true,
        register_expires: 3600,
      };

      console.log('🔧 JsSIP UA configuration:', {
        ...configuration,
        password: '***REDACTED***'
      });

      this.userAgent = new JsSIP.UA(configuration);

      // Set up event handlers
      this.setupEventHandlers();

      // Start the UA
      this.userAgent.start();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SIP registration timeout'));
        }, 10000);

        this.userAgent.on('registered', () => {
          clearTimeout(timeout);
          this.isRegistered = true;
          console.log('✅ SIP registered successfully');
          resolve();
        });

        this.userAgent.on('registrationFailed', (data) => {
          clearTimeout(timeout);
          console.error('❌ SIP registration failed:', data);
          reject(new Error(`Registration failed: ${data.cause}`));
        });
      });
    } catch (error) {
      console.error('Failed to initialize SIP client:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.userAgent.on('connecting', (data) => {
      console.log('🔄 WebSocket connecting...', data);
    });

    this.userAgent.on('connected', () => {
      console.log('🔌 WebSocket connected successfully');
    });

    this.userAgent.on('disconnected', (data) => {
      console.log('🔌 WebSocket disconnected:', data);
      this.isRegistered = false;
    });

    this.userAgent.on('newRTCSession', (data) => {
      const session = data.session;

      if (session.direction === 'incoming') {
        console.log('📞 Incoming call from:', session.remote_identity.uri.user);
        this.handleIncomingCall(session);
      }
    });

    // Add more detailed error logging
    this.userAgent.on('registrationExpiring', () => {
      console.log('⏰ SIP registration expiring, will re-register');
    });

    this.userAgent.on('unregistered', (data) => {
      console.log('❌ SIP unregistered:', data);
      this.isRegistered = false;
    });

    // Add detailed SIP transaction logging
    this.userAgent.on('sipEvent', (data) => {
      console.log('📡 SIP Event:', data);
    });

    this.userAgent.on('newMessage', (data) => {
      console.log('💬 SIP Message:', data);
    });
  }

  /**
   * Make an outbound call
   * @param {string} phoneNumber - Phone number to call
   * @param {string} fromNumber - Caller ID number to use
   * @param {string} displayName - Display name for CNAM (caller name)
   * @param {Object} callbacks - Event callbacks
   */
  async makeCall(phoneNumber, fromNumber, displayName, callbacks = {}) {
    if (!this.isRegistered) {
      throw new Error('SIP client not registered');
    }

    if (this.currentSession) {
      throw new Error('Call already in progress');
    }

    try {
      // Clean phone number (remove non-digits except +)
      const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');

      const eventHandlers = {
        progress: (e) => {
          console.log('📞 Call in progress...');
          callbacks.onProgress?.();
        },
        failed: (e) => {
          console.log('❌ Call failed:', e.cause);
          this.currentSession = null;
          callbacks.onFailed?.(e.cause);
        },
        ended: (e) => {
          console.log('📞 Call ended');
          this.currentSession = null;
          callbacks.onEnded?.();
        },
        confirmed: (e) => {
          console.log('✅ Call confirmed');
          callbacks.onConfirmed?.();
        },
        peerconnection: (e) => {
          // Handle remote stream
          e.peerconnection.addEventListener('track', (event) => {
            if (event.streams && event.streams[0]) {
              this.playRemoteAudio(event.streams[0]);
            }
          });
        },
      };

      const options = {
        eventHandlers,
        mediaConstraints: {
          audio: true,
          video: false,
        },
        rtcOfferConstraints: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        },
        pcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        },
        extraHeaders: [
          `X-From-Number: ${fromNumber}`,
          `P-Asserted-Identity: <sip:${fromNumber}@${this.sipDomain}>`,
          `Remote-Party-ID: "${displayName}" <sip:${fromNumber}@${this.sipDomain}>;party=calling;privacy=off;screen=no`
        ],
      };

      // Add display name for CNAM (caller name)
      if (displayName) {
        options.fromDisplayName = displayName;
      }

      this.currentSession = this.userAgent.call(cleanNumber, options);

      return this.currentSession;
    } catch (error) {
      console.error('Failed to make call:', error);
      throw error;
    }
  }

  /**
   * Handle incoming calls
   */
  handleIncomingCall(session) {
    this.currentSession = session;

    session.on('confirmed', () => {
      console.log('✅ Incoming call answered');
    });

    session.on('ended', () => {
      console.log('📞 Incoming call ended');
      this.currentSession = null;
    });

    session.on('failed', () => {
      console.log('❌ Incoming call failed');
      this.currentSession = null;
    });

    session.on('peerconnection', (e) => {
      e.peerconnection.addEventListener('track', (event) => {
        if (event.streams && event.streams[0]) {
          this.playRemoteAudio(event.streams[0]);
        }
      });
    });

    // Auto-answer could be implemented here
    // session.answer(options);
  }

  /**
   * Play remote audio stream
   */
  playRemoteAudio(stream) {
    if (!this.remoteAudio) {
      this.remoteAudio = document.createElement('audio');
      this.remoteAudio.autoplay = true;
      document.body.appendChild(this.remoteAudio);
    }
    this.remoteAudio.srcObject = stream;
  }

  /**
   * Hang up current call
   */
  hangup() {
    if (this.currentSession) {
      this.currentSession.terminate();
      this.currentSession = null;
    }
  }

  /**
   * Send DTMF tones during a call
   */
  sendDTMF(tone) {
    if (this.currentSession && this.currentSession.isEstablished()) {
      this.currentSession.sendDTMF(tone);
      console.log('📱 Sent DTMF:', tone);
    }
  }

  /**
   * Mute/unmute microphone
   */
  setMute(muted) {
    if (this.currentSession) {
      if (muted) {
        this.currentSession.mute();
      } else {
        this.currentSession.unmute();
      }
    }
  }

  /**
   * Unregister and disconnect
   */
  disconnect() {
    if (this.currentSession) {
      this.hangup();
    }
    if (this.userAgent) {
      this.userAgent.stop();
      this.isRegistered = false;
    }
    if (this.remoteAudio) {
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
  }

  /**
   * Check if currently in a call
   */
  isInCall() {
    return this.currentSession !== null;
  }

  /**
   * Get current call status
   */
  getCallStatus() {
    if (!this.currentSession) return 'idle';
    if (this.currentSession.isInProgress()) return 'connecting';
    if (this.currentSession.isEstablished()) return 'active';
    return 'idle';
  }
}

// Export singleton instance
export const sipClient = new SIPClient();
