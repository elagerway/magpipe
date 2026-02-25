import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { showOutboundTemplateModal } from '../../components/OutboundTemplateModal.js';
import { User } from '../../models/index.js';

// Lazy load SIP client
export let sipClient = null;
export async function loadSipClient() {
  if (!sipClient) {
    const module = await import('../../lib/sipClient.js');
    sipClient = module.sipClient;
  }
  return sipClient;
}

// Lazy load Twilio client for external SIP trunk calls
let twilioClient = null;
export async function loadTwilioClient() {
  if (!twilioClient) {
    const module = await import('../../lib/twilioClient.js');
    twilioClient = module.twilioClient;
  }
  return twilioClient;
}

export const callHandlerMethods = {
  async requestMicrophoneAndInitializeSIP() {
    try {
      // Check current permission state
      let permissionState = 'prompt'; // default to prompt if we can't check
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        permissionState = permissionStatus.state;
        console.log('🎤 Microphone permission state:', permissionState);
      } catch (e) {
        console.log('Could not check permission status:', e);
      }

      // If already granted, skip the modal and go straight to SIP init
      if (permissionState === 'granted') {
        console.log('✅ Microphone already granted, initializing SIP...');
        await this.initializeSIPClient();
        return;
      }

      // If blocked/denied, show instructions
      if (permissionState === 'denied') {
        showToast('Microphone is BLOCKED. Click the lock icon in the address bar, change Microphone to "Allow", then refresh this page.', 'error');
        this.updateSIPStatus('error', 'Mic blocked');
        return;
      }

      // Permission state is 'prompt' - show our custom modal first
      const promptModal = document.createElement('div');
      promptModal.id = 'mic-permission-modal';
      promptModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      promptModal.innerHTML = `
        <div style="
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 2rem;
          max-width: 400px;
          margin: 1rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        ">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🎤</div>
            <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; color: var(--text-primary);">Microphone Access Required</h2>
            <p style="margin: 0; color: var(--text-secondary); line-height: 1.5;">
              We need access to your microphone to make calls.
              Your browser will ask for permission.
            </p>
          </div>
          <div style="display: flex; gap: 1rem;">
            <button id="allow-mic-btn" style="
              flex: 1;
              background: linear-gradient(135deg, #6366f1, #8b5cf6);
              color: white;
              border: none;
              border-radius: 8px;
              padding: 0.75rem 1.5rem;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
            ">Allow Microphone</button>
            <button id="cancel-mic-btn" style="
              background: var(--bg-secondary);
              color: var(--text-secondary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              padding: 0.75rem 1rem;
              font-size: 1rem;
              cursor: pointer;
            ">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(promptModal);

      // Wait for user to click Allow or Cancel
      const userChoice = await new Promise((resolve) => {
        document.getElementById('allow-mic-btn').addEventListener('click', () => resolve('allow'));
        document.getElementById('cancel-mic-btn').addEventListener('click', () => resolve('cancel'));
      });

      promptModal.remove();

      if (userChoice === 'cancel') {
        this.updateSIPStatus('error', 'Cancelled');
        return;
      }

      // Request microphone permission
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('✅ Microphone access granted');

      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop());

      // Now initialize SIP client
      await this.initializeSIPClient();
    } catch (error) {
      console.error('❌ Microphone access error:', error);
      this.updateSIPStatus('error', 'Mic denied');

      if (error.name === 'NotAllowedError') {
        showToast('Microphone was denied. Click the lock icon in the address bar, reset permissions, and refresh.', 'error');
      } else {
        showToast(`Microphone error: ${error.name} - ${error.message}`, 'error');
      }
    }
  },

  async initializeSIPClient() {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');

    if (!sipLed || !sipStatusText) return;

    // Set to connecting state
    this.updateSIPStatus('connecting');

    try {
      // Get SIP credentials from user record
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('sip_username, sip_password, sip_realm, sip_ws_server')
        .eq('id', this.userId)
        .single();

      if (userError || !userRecord) {
        this.updateSIPStatus('error', 'No SIP endpoint');
        return;
      }

      if (!userRecord.sip_username || !userRecord.sip_password) {
        this.updateSIPStatus('error', 'Not configured');
        return;
      }

      // Build SIP URI from user record
      const sipUri = `sip:${userRecord.sip_username}@${userRecord.sip_realm}`;

      // Lazy load and initialize SIP client
      await loadSipClient();
      await sipClient.initialize({
        sipUri,
        sipPassword: userRecord.sip_password,
        wsServer: userRecord.sip_ws_server,
        displayName: 'AI Assistant',
      });

      this.updateSIPStatus('registered');
      this.sipInitialized = true;
    } catch (error) {
      console.error('SIP initialization failed:', error);
      this.updateSIPStatus('error', error.message);
    }
  },

  // Update SIP status from existing client state (used on re-render)
  async updateSIPStatusFromClient() {
    if (sipClient && sipClient.isRegistered && sipClient.isRegistered()) {
      this.updateSIPStatus('registered');
    } else if (sipClient && sipClient.isConnected && sipClient.isConnected()) {
      this.updateSIPStatus('connecting');
    } else {
      // Re-initialize if needed
      this.sipInitialized = false;
      this.requestMicrophoneAndInitializeSIP();
    }
  },

  async showRecentNumbers(suggestionsEl, searchInput, onSelectCallback) {
    try {
      // Get user's service numbers to exclude from recent list
      const { data: serviceNumbers } = await supabase
        .from('service_numbers')
        .select('phone_number')
        .eq('user_id', this.userId);

      const userNumbers = new Set(
        (serviceNumbers || []).map(sn => sn.phone_number)
      );

      // Fetch recent call records (both inbound and outbound)
      const { data, error } = await supabase
        .from('call_records')
        .select('caller_number, contact_phone, direction, started_at')
        .eq('user_id', this.userId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching recent numbers:', error);
        return;
      }

      if (!data || data.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Extract unique phone numbers (excluding user's service numbers)
      const seenNumbers = new Set();
      const recentNumbers = [];

      for (const record of data) {
        // For outbound calls, use contact_phone (the number we called)
        // For inbound calls, use caller_number (the number that called us)
        const phoneNumber = record.direction === 'outbound'
          ? record.contact_phone
          : record.caller_number;

        // Skip if it's a user's service number or already seen
        if (phoneNumber && !userNumbers.has(phoneNumber) && !seenNumbers.has(phoneNumber)) {
          seenNumbers.add(phoneNumber);
          recentNumbers.push({
            phone: phoneNumber,
            direction: record.direction,
            date: new Date(record.started_at)
          });

          if (recentNumbers.length >= 10) break; // Limit to 10 recent numbers
        }
      }

      if (recentNumbers.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Display recent numbers
      suggestionsEl.innerHTML = `
        <div style="padding: 0.5rem 0.75rem; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
          Recent Numbers
        </div>
        ${recentNumbers.map(item => `
          <div class="contact-suggestion" data-phone="${item.phone}" style="
            padding: 0.75rem;
            cursor: pointer;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.15s;
          " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">
                  ${this.formatPhoneNumber(item.phone)}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                  ${item.direction === 'outbound' ? '↗ Outbound' : '↙ Inbound'} • ${this.formatRelativeTime(item.date)}
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      `;
      suggestionsEl.style.display = 'block';

      // Add click handlers
      suggestionsEl.querySelectorAll('.contact-suggestion').forEach(suggestion => {
        suggestion.addEventListener('click', () => {
          const phone = suggestion.dataset.phone;
          searchInput.value = phone;
          suggestionsEl.style.display = 'none';
          onSelectCallback();
        });
      });
    } catch (error) {
      console.error('Failed to show recent numbers:', error);
    }
  },

  formatPhoneNumber(phone) {
    // Format US phone numbers as (XXX) XXX-XXXX
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned[0] === '1') {
      const number = cleaned.substring(1);
      return `(${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`;
    }
    if (cleaned.length === 10) {
      return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6)}`;
    }
    return phone;
  },

  normalizePhoneForComparison(phone) {
    // Strip to just digits for comparison
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    // Remove leading 1 for US numbers to normalize
    if (digits.length === 11 && digits[0] === '1') {
      return digits.substring(1);
    }
    return digits;
  },

  showOwnNumberModal() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'own-number-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 320px;
        margin: 1rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      ">
        <h3 style="margin: 0 0 0.75rem 0; color: var(--text-primary); font-size: 1.125rem;">
          You are dialing your own number.
        </h3>
        <p style="margin: 0 0 1.25rem 0; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5;">
          You cannot call your own phone number using the callback feature. Please dial a different number.
        </p>
        <button id="own-number-modal-ok" style="
          width: 100%;
          padding: 0.75rem;
          background: var(--primary-color, #6366f1);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
        ">
          OK
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on button click
    document.getElementById('own-number-modal-ok').addEventListener('click', () => {
      modal.remove();
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },

  showInsufficientCreditsModal() {
    const modal = document.createElement('div');
    modal.id = 'insufficient-credits-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 320px;
        margin: 1rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      ">
        <h3 style="margin: 0 0 0.75rem 0; color: var(--text-primary); font-size: 1.125rem;">
          Insufficient Credits
        </h3>
        <p style="margin: 0 0 1.25rem 0; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5;">
          Your credit balance is $0. Please add credits to make calls.
        </p>
        <div style="display: flex; gap: 0.5rem;">
          <button id="credits-modal-cancel" style="
            flex: 1;
            padding: 0.75rem;
            background: var(--bg-secondary);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 0.875rem;
            cursor: pointer;
          ">
            Cancel
          </button>
          <button id="credits-modal-add" style="
            flex: 1;
            padding: 0.75rem;
            background: var(--primary-color, #6366f1);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
          ">
            Add Credits
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('credits-modal-cancel').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('credits-modal-add').addEventListener('click', () => {
      modal.remove();
      window.location.hash = '';
      window.history.pushState({}, '', '/settings?tab=billing');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },

  showLowBalanceWarning(balance) {
    // Don't show if already visible
    if (document.getElementById('low-balance-warning-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'low-balance-warning-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 320px;
        margin: 1rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      ">
        <h3 style="margin: 0 0 0.75rem 0; color: var(--text-primary); font-size: 1.125rem;">
          Low Balance
        </h3>
        <p style="margin: 0 0 1.25rem 0; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5;">
          Your balance is $${balance.toFixed(2)}. Please add credits to continue using the service.
        </p>
        <button id="low-balance-dismiss" style="
          width: 100%;
          padding: 0.75rem;
          background: var(--primary-color, #6366f1);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
        ">
          OK
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const dismissBtn = modal.querySelector('#low-balance-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modal.remove();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },

  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  },

  updateSIPStatus(status, message = '') {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');
    const callState = document.getElementById('call-state');

    if (!sipLed || !sipStatusText) return;

    switch (status) {
      case 'connecting':
        sipLed.style.background = '#6b7280';
        sipLed.style.boxShadow = '0 0 4px rgba(107, 116, 128, 0.5)';
        sipStatusText.textContent = 'Connecting...';
        sipStatusText.style.color = 'var(--text-secondary)';
        if (callState) callState.style.display = 'none';
        break;
      case 'registered':
        sipLed.style.background = '#10b981';
        sipLed.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.8)';
        sipStatusText.textContent = 'Ready';
        sipStatusText.style.color = '#10b981';
        if (callState) {
          callState.style.display = 'block';
          callState.textContent = 'Make Call';
        }
        break;
      case 'error':
        sipLed.style.background = '#ef4444';
        sipLed.style.boxShadow = '0 0 4px rgba(239, 68, 68, 0.5)';
        sipStatusText.textContent = message || 'Error';
        sipStatusText.style.color = '#ef4444';
        if (callState) callState.style.display = 'none';
        break;
      default:
        sipLed.style.background = '#6b7280';
        sipStatusText.textContent = 'Disconnected';
        sipStatusText.style.color = 'var(--text-secondary)';
        if (callState) callState.style.display = 'none';
    }
  },

  async initiateCall(phoneNumber, callerIdNumber = null) {
    console.log('Initiating SIP call to:', phoneNumber);

    // Check balance and show warning if negative
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('credits_balance')
        .eq('id', this.userId)
        .single();

      if (userData && userData.credits_balance < 0) {
        this.showLowBalanceWarning(userData.credits_balance);
      }
    } catch (e) {
      console.warn('Balance check failed:', e);
    }

    // Track if user clicks hangup button
    this.userHungUp = false;

    try {
      // Get caller ID number and SIP credentials
      let fromNumber = callerIdNumber;
      let sipCredentials = null;

      if (!fromNumber) {
        const { data: serviceNumbers } = await supabase
          .from('service_numbers')
          .select('phone_number, sip_username, sip_password, sip_domain, sip_ws_server')
          .eq('user_id', this.userId)
          .eq('is_active', true)
          .order('purchased_at', { ascending: false })
          .limit(1);

        if (serviceNumbers && serviceNumbers.length > 0) {
          fromNumber = serviceNumbers[0].phone_number;
          sipCredentials = serviceNumbers[0];
        } else {
          showToast('No active service numbers found', 'error');
          return;
        }
      } else {
        // Verify the selected caller ID is valid and active
        // First check service_numbers
        const { data: serviceNumber } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('phone_number', fromNumber)
          .eq('user_id', this.userId)
          .eq('is_active', true)
          .single();

        if (!serviceNumber) {
          // Check external_sip_numbers
          const { data: externalNumber } = await supabase
            .from('external_sip_numbers')
            .select('phone_number, external_sip_trunks!inner(id, is_active, outbound_address)')
            .eq('phone_number', fromNumber)
            .eq('user_id', this.userId)
            .eq('is_active', true)
            .eq('external_sip_trunks.is_active', true)
            .single();

          if (!externalNumber) {
            showToast('Selected number not found or inactive', 'error');
            return;
          }

          // Mark this as an external trunk call
          this.isExternalTrunkCall = true;
          this.externalTrunkId = externalNumber.external_sip_trunks.id;
        } else {
          this.isExternalTrunkCall = false;
          this.externalTrunkId = null;
        }
      }

      // Get user's name and SIP credentials from users table
      const { data: userData } = await supabase
        .from('users')
        .select('name, sip_username, sip_password, sip_realm, sip_ws_server')
        .eq('id', this.userId)
        .single();

      if (!userData || !userData.sip_username || !userData.sip_password) {
        showToast('SIP credentials not configured', 'error');
        return;
      }

      sipCredentials = {
        sip_username: userData.sip_username,
        sip_password: userData.sip_password,
        sip_domain: userData.sip_realm,
        sip_ws_server: userData.sip_ws_server
      };

      // Format name as "FirstName L" (first name + last initial)
      let displayName = fromNumber; // fallback to phone number
      if (userData && userData.name) {
        const nameParts = userData.name.trim().split(/\s+/);
        if (nameParts.length > 1) {
          // Has first and last name
          const firstName = nameParts[0];
          const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
          displayName = `${firstName} ${lastInitial}`;
        } else {
          // Only first name
          displayName = nameParts[0];
        }
      }

      // Check if agent mode is enabled
      const agentToggle = document.getElementById('agent-toggle');
      const agentEnabled = agentToggle ? agentToggle.checked : false;
      console.log('🤖 Agent toggle state:', agentEnabled);

      // If agent is enabled, use bridged call approach (includes recording)
      if (agentEnabled) {
        console.log('🤖 Agent enabled - using bridged call approach');

        // Check if there's a pending call from agent chat with purpose/goal
        let templateData = null;
        const pendingCallStr = sessionStorage.getItem('pending_call');
        if (pendingCallStr) {
          try {
            const pendingCall = JSON.parse(pendingCallStr);
            // Only use if timestamp is recent (within 5 minutes) and has purpose/goal
            if (Date.now() - pendingCall.timestamp < 5 * 60 * 1000) {
              if (pendingCall.purpose || pendingCall.goal) {
                console.log('📋 Using pending call context from agent chat:', pendingCall);
                templateData = {
                  purpose: pendingCall.purpose,
                  goal: pendingCall.goal,
                  templateId: null
                };
              }
            }
            // Clear the pending call regardless
            sessionStorage.removeItem('pending_call');
          } catch (e) {
            console.warn('Failed to parse pending_call:', e);
          }
        }

        // If no template data from agent chat, show modal to get purpose/goal
        if (!templateData) {
          templateData = await showOutboundTemplateModal(phoneNumber);
          if (!templateData) {
            console.log('🚫 User cancelled template selection');
            this.updateCallState('idle');
            this.transformToCallButton();
            return;
          }
        }

        console.log('📋 Template data:', templateData);
        await this.initiateBridgedCall(phoneNumber, fromNumber, templateData);
        return;
      }

      // Direct mode - check if WebRTC SIP or Callback
      const sipToggle = document.getElementById('sip-toggle');
      const useSip = sipToggle ? sipToggle.checked : false;

      if (useSip) {
        // WebRTC mode
        if (this.isExternalTrunkCall) {
          // External trunk (Twilio) - use Twilio Client SDK
          console.log('📞 Using Twilio Client SDK for external trunk call');
          await this.initiateTwilioCall(phoneNumber, fromNumber);
          console.log('📞 Twilio call initiated');
        } else {
          // Regular number - use SignalWire SIP
          console.log('📞 Using WebRTC SIP for direct call');
          await this.initiateSipCall(phoneNumber, fromNumber, displayName, sipCredentials);
          console.log('📞 SIP call initiated');
        }
      } else {
        // Callback mode - calls user's cell phone first, then bridges to destination
        console.log('📞 Using callback approach for direct call');
        await this.initiateCallbackCall(phoneNumber, fromNumber);
        console.log('📞 Callback call initiated');
      }

    } catch (error) {
      console.error('Failed to initiate call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  async initiateLivekitCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating LiveKit outbound call with recording');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

    try {
      // Show connecting state
      this.updateCallState('connecting', 'Initiating call...');

      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Call the LiveKit outbound call Edge Function
      const { data, error } = await supabase.functions.invoke('livekit-outbound-call', {
        body: {
          phoneNumber: normalizedPhoneNumber,
          callerIdNumber: callerIdNumber,
          userId: this.userId,
          recordCall: true
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to initiate LiveKit call');
      }

      console.log('✅ LiveKit call initiated:', data);
      console.log('   Call ID:', data.callId);
      console.log('   Room:', data.roomName);

      // Update UI to show call is in progress
      this.updateCallState('ringing', 'Calling...');
      this.transformToHangupButton();

      // Store call info for hangup
      this.currentCallRecordId = data.callId;
      this.currentRoomName = data.roomName;

    } catch (error) {
      console.error('Failed to initiate LiveKit call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  async initiateBridgedCall(phoneNumber, callerIdNumber, templateData = null) {
    console.log('📞 Initiating bridged call with agent + recording');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);
    if (templateData) {
      console.log('   Purpose:', templateData.purpose);
      console.log('   Goal:', templateData.goal);
    }

    try {
      // Update UI
      this.updateCallState('connecting', 'Initiating call...');

      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Call the Edge Function to initiate bridged call
      // This will:
      // 1. SignalWire calls LiveKit SIP URI (agent auto-joins)
      // 2. LiveKit answers, CXML bridges to destination PSTN number
      // 3. All parties connected with recording
      const { data, error } = await supabase.functions.invoke('initiate-bridged-call', {
        body: {
          phone_number: normalizedPhoneNumber,
          caller_id: callerIdNumber,
          purpose: templateData?.purpose || null,
          goal: templateData?.goal || null,
          template_id: templateData?.templateId || null
        }
      });

      if (error) {
        // Check for insufficient credits (402)
        if (data?.error?.code === 'insufficient_credits') {
          this.showInsufficientCreditsModal();
          this.updateCallState('idle');
          this.transformToCallButton();
          return;
        }
        throw new Error(error.message || 'Failed to initiate bridged call');
      }

      console.log('✅ Bridged call initiated:', data);
      console.log('   Call SID:', data.call_sid);
      console.log('   Call Record ID:', data.call_record_id);

      // Update UI to show call is in progress
      this.updateCallState('connecting', 'Calling...');
      this.transformToHangupButton();

      // Store call info for hangup
      this.currentBridgedCallSid = data.call_sid;
      this.currentCallRecordId = data.call_record_id;

      // Subscribe to call record status updates to detect when call ends
      if (data.call_record_id) {
        this.subscribeToCallStatus(data.call_record_id);
      }

    } catch (error) {
      console.error('Failed to initiate bridged call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  /**
   * Initiate a callback-style direct call
   * 1. SignalWire calls the user's cell phone first
   * 2. When user answers, plays whisper "Outbound call from MAGPIPE"
   * 3. Then bridges to destination with recording
   */
  async initiateCallbackCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating callback call');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

    try {
      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Check if user is trying to call their own phone number
      if (this.userPhoneNumber && this.normalizePhoneForComparison(normalizedPhoneNumber) === this.normalizePhoneForComparison(this.userPhoneNumber)) {
        this.showOwnNumberModal();
        return;
      }

      // Update UI
      this.updateCallState('connecting', 'Calling your phone...');

      // Call the Edge Function to initiate callback call
      // This will:
      // 1. SignalWire calls user's cell phone
      // 2. When answered, whisper plays, then bridges to destination
      const { data, error } = await supabase.functions.invoke('initiate-callback-call', {
        body: {
          destination_number: normalizedPhoneNumber,
          caller_id: callerIdNumber
        }
      });

      if (error) {
        // Check for insufficient credits (402)
        if (data?.error?.code === 'insufficient_credits') {
          this.showInsufficientCreditsModal();
          this.updateCallState('idle');
          this.transformToCallButton();
          return;
        }
        console.error('📞 Callback call error:', error);
        throw new Error(error.message || 'Failed to initiate callback call');
      }

      console.log('✅ Callback call initiated:', data);
      console.log('   Call SID:', data.call_sid);
      console.log('   Call Record ID:', data.call_record_id);

      // Update UI to show call is in progress
      this.updateCallState('connecting', 'Answer your phone...');
      this.transformToHangupButton();

      // Store call info for hangup
      this.currentBridgedCallSid = data.call_sid;
      this.currentCallRecordId = data.call_record_id;

      // Subscribe to call record status updates to detect when call ends
      if (data.call_record_id) {
        this.subscribeToCallStatus(data.call_record_id);
      }

    } catch (error) {
      console.error('Failed to initiate callback call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  /**
   * Initiate a direct call via WebRTC SIP to SignalWire
   * Uses browser audio for the call
   */
  async initiateSipCall(phoneNumber, callerIdNumber, displayName, sipCredentials) {
    console.log('📞 Initiating WebRTC SIP call');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);
    console.log('   Display Name:', displayName);

    try {
      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Check if user is trying to call their own phone number
      if (this.userPhoneNumber && this.normalizePhoneForComparison(normalizedPhoneNumber) === this.normalizePhoneForComparison(this.userPhoneNumber)) {
        this.showOwnNumberModal();
        return;
      }

      // Update UI
      this.updateCallState('connecting', 'Initializing SIP...');

      // Load and initialize SIP client
      const client = await loadSipClient();

      if (!client.isRegistered) {
        this.updateCallState('connecting', 'Registering SIP...');
        await client.initialize({
          sipUri: `sip:${sipCredentials.sip_username}@${sipCredentials.sip_domain}`,
          sipPassword: sipCredentials.sip_password,
          wsServer: sipCredentials.sip_ws_server,
          displayName: displayName
        });
      }

      this.updateCallState('connecting', 'Calling...');
      this.transformToHangupButton();

      const session = await client.makeCall(normalizedPhoneNumber, callerIdNumber, displayName, {
        onProgress: () => {
          console.log('📞 Call ringing...');
          this.updateCallState('ringing', 'Ringing...');
        },
        onAccepted: () => {
          console.log('✅ Call answered');
          this.updateCallState('connected', 'Connected');
        },
        onEnded: () => {
          console.log('📞 Call ended');
          this.updateCallState('idle');
          this.transformToCallButton();
          this.currentSipSession = null;
        },
        onFailed: (cause) => {
          console.error('❌ Call failed:', cause);
          this.updateCallState('idle');
          this.transformToCallButton();
          this.currentSipSession = null;
        }
      });

      this.currentSipSession = session;

    } catch (error) {
      console.error('Failed to initiate SIP call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  async initiateTwilioCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating Twilio Client SDK call');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

    try {
      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Check if user is trying to call their own phone number
      if (this.userPhoneNumber && this.normalizePhoneForComparison(normalizedPhoneNumber) === this.normalizePhoneForComparison(this.userPhoneNumber)) {
        this.showOwnNumberModal();
        return;
      }

      // Update UI
      this.updateCallState('connecting', 'Initializing Twilio...');

      // Load and initialize Twilio client
      const client = await loadTwilioClient();
      await client.initialize();

      this.updateCallState('connecting', 'Calling...');
      this.transformToHangupButton();

      this.currentTwilioCall = await client.makeCall(normalizedPhoneNumber, callerIdNumber, {
        onProgress: () => {
          console.log('📞 Twilio call ringing...');
          this.updateCallState('ringing', 'Ringing...');
        },
        onAccepted: () => {
          console.log('✅ Twilio call answered');
          this.updateCallState('connected', 'Connected');
        },
        onEnded: () => {
          console.log('📞 Twilio call ended');
          this.updateCallState('idle');
          this.transformToCallButton();
          this.currentTwilioCall = null;
        },
        onFailed: (cause) => {
          console.error('❌ Twilio call failed:', cause);
          this.updateCallState('idle');
          this.transformToCallButton();
          this.currentTwilioCall = null;
        }
      });

    } catch (error) {
      console.error('Failed to initiate Twilio call:', error);
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  subscribeToCallStatus(callRecordId) {
    // Unsubscribe from any previous subscription
    if (this.callStatusSubscription) {
      this.callStatusSubscription.unsubscribe();
    }
    if (this.callStatusPolling) {
      clearInterval(this.callStatusPolling);
    }

    console.log('📡 Subscribing to call status updates for:', callRecordId);

    // Subscribe to realtime updates on the call record
    this.callStatusSubscription = supabase
      .channel(`call-status-${callRecordId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_records',
          filter: `id=eq.${callRecordId}`,
        },
        (payload) => {
          console.log('📡 Call status update:', payload.new.status);
          this.handleCallEnded(payload.new.status, 'realtime');
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    // Polling fallback - check every 2 seconds in case realtime fails
    this.callStatusPolling = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('call_records')
          .select('status')
          .eq('id', callRecordId)
          .single();

        if (data) {
          this.handleCallEnded(data.status, 'polling');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);
  },

  handleCallEnded(status, source) {
    // Check if call ended
    const terminalStates = ['completed', 'failed', 'no_answer', 'no-answer', 'busy', 'canceled'];
    if (terminalStates.includes(status)) {
      console.log(`📞 Call ended (detected via ${source}):`, status);

      // Clean up subscriptions and polling
      if (this.callStatusSubscription) {
        this.callStatusSubscription.unsubscribe();
        this.callStatusSubscription = null;
      }
      if (this.callStatusPolling) {
        clearInterval(this.callStatusPolling);
        this.callStatusPolling = null;
      }

      this.currentBridgedCallSid = null;
      this.currentCallRecordId = null;

      // Reset UI
      this.transformToCallButton();
      this.updateCallState('idle');
    }
  },

  transformToHangupButton() {
    const callBtn = document.getElementById('call-btn');
    const muteBtn = document.getElementById('mute-btn');
    const transferBtn = document.getElementById('transfer-btn');
    if (!callBtn) return;

    // Change to red hangup button
    callBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    callBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    callBtn.dataset.action = 'hangup';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

    // Show mute button
    if (muteBtn) {
      muteBtn.style.display = 'flex';
    }

    // Show and enable transfer button
    if (transferBtn) {
      transferBtn.style.display = 'flex';
      transferBtn.disabled = false;
      transferBtn.style.opacity = '1';
      transferBtn.style.cursor = 'pointer';
      transferBtn.style.color = 'var(--text-primary)';
    }

    // Update hover effects
    callBtn.onmouseover = () => {
      callBtn.style.transform = 'scale(1.05)';
      callBtn.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
    };
    callBtn.onmouseout = () => {
      callBtn.style.transform = 'scale(1)';
      callBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    };

    // Change icon to hangup icon (phone with X)
    callBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    `;

    console.log('🔴 Button transformed to HANGUP');
  },

  transformToCallButton() {
    const callBtn = document.getElementById('call-btn');
    const muteBtn = document.getElementById('mute-btn');
    const transferBtn = document.getElementById('transfer-btn');
    if (!callBtn) return;

    // Change back to green call button
    callBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    callBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    callBtn.dataset.action = 'call';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

    // Hide mute button and reset mute state
    if (muteBtn) {
      muteBtn.style.display = 'none';
      this.isMuted = false;
      this.updateMuteButtonUI();
    }

    // Hide transfer button
    if (transferBtn) {
      transferBtn.style.display = 'none';
      transferBtn.disabled = true;
      transferBtn.style.opacity = '0.5';
      transferBtn.style.cursor = 'not-allowed';
    }

    // Restore hover effects
    callBtn.onmouseover = () => {
      callBtn.style.transform = 'scale(1.05)';
      callBtn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
    };
    callBtn.onmouseout = () => {
      callBtn.style.transform = 'scale(1)';
      callBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    };

    // Restore phone icon
    callBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    `;

    console.log('🟢 Button transformed to CALL');
  },

  updateCallState(state, message = null) {
    const sipStatusText = document.getElementById('sip-status-text');
    const callBtn = document.getElementById('call-btn');
    const recordLed = document.getElementById('record-led');
    const recordToggleBtn = document.getElementById('record-toggle-btn');

    console.log('📞 Updating call state to:', state, 'Message:', message);

    if (!sipStatusText) {
      console.warn('⚠️ SIP status text not found');
      return;
    }

    // Helper to start/stop LED pulse based on recording state
    const updateRecordLed = (isCallActive) => {
      if (!recordLed || !recordToggleBtn) return;
      const isRecording = recordToggleBtn.dataset.recording === 'on';

      if (isCallActive && isRecording) {
        // Call active and recording on - pulse the LED
        recordLed.style.background = '#ef4444';
        recordLed.style.animation = 'pulse-led 1.5s ease-in-out infinite';
        recordLed.style.boxShadow = '0 0 4px #ef4444';
      } else if (isRecording) {
        // Recording on but no call - solid red, no pulse
        recordLed.style.background = '#ef4444';
        recordLed.style.animation = 'none';
        recordLed.style.boxShadow = 'none';
      } else {
        // Recording off - gray
        recordLed.style.background = '#6b7280';
        recordLed.style.animation = 'none';
        recordLed.style.boxShadow = 'none';
      }
    };

    switch (state) {
      case 'connecting':
        sipStatusText.textContent = message || 'Connecting...';
        sipStatusText.style.color = 'var(--text-secondary)';
        // Transform to hangup button as soon as call starts
        this.transformToHangupButton();
        break;

      case 'progress':
      case 'ringing':
        sipStatusText.textContent = 'Ringing...';
        sipStatusText.style.color = '#f59e0b'; // Orange color
        // Keep hangup button active during ringing
        this.transformToHangupButton();
        break;

      case 'connected':
      case 'established':
        sipStatusText.textContent = 'Connected';
        sipStatusText.style.color = '#10b981'; // Green color
        // Keep hangup button active when call is established
        this.transformToHangupButton();
        // Start LED pulse if recording is on
        updateRecordLed(true);
        break;

      case 'hungup':
        sipStatusText.textContent = 'Hung Up';
        sipStatusText.style.color = '#ef4444'; // Red color
        // Transform back to call button when hung up
        this.transformToCallButton();
        // Stop LED pulse
        updateRecordLed(false);
        break;

      case 'idle':
      default:
        sipStatusText.textContent = 'Ready';
        sipStatusText.style.color = '#10b981';
        // Transform back to call button
        this.transformToCallButton();
        // Stop LED pulse
        updateRecordLed(false);
        break;
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    console.log('🔇 Mute toggled:', this.isMuted);

    // Mute/unmute the actual audio via SIP client
    try {
      if (sipClient) sipClient.setMute(this.isMuted);
    } catch (e) {
      console.error('Failed to toggle mute:', e);
    }

    this.updateMuteButtonUI();
  },

  updateMuteButtonUI() {
    const muteBtn = document.getElementById('mute-btn');
    if (!muteBtn) return;

    if (this.isMuted) {
      // Muted state - red background, muted icon
      muteBtn.style.background = '#ef4444';
      muteBtn.style.color = 'white';
      muteBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      `;
    } else {
      // Unmuted state - default background, microphone icon
      muteBtn.style.background = 'var(--bg-secondary)';
      muteBtn.style.color = 'var(--text-primary)';
      muteBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      `;
    }
  },

  async showTransferModal() {
    console.log('📞 Opening transfer modal...');

    // Load transfer numbers from database
    const { data: transferNumbers, error } = await supabase
      .from('transfer_numbers')
      .select('id, label, phone_number')
      .eq('user_id', this.userId)
      .order('is_default', { ascending: false });

    if (error) {
      console.error('Failed to load transfer numbers:', error);
    }

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'transfer-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const hasTransferNumbers = transferNumbers && transferNumbers.length > 0;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: 16px;
        padding: 1.5rem;
        max-width: 350px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-primary);">Transfer Call</h3>
          <button id="close-transfer-modal" style="
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0;
            line-height: 1;
          ">&times;</button>
        </div>

        ${hasTransferNumbers ? `
          <div style="margin-bottom: 1rem;">
            <p style="margin: 0 0 0.75rem 0; font-size: 0.875rem; color: var(--text-secondary);">Select a destination:</p>
            <div id="transfer-options" style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${transferNumbers.map(tn => `
                <button class="transfer-option" data-phone="${tn.phone_number}" style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0.75rem 1rem;
                  background: var(--bg-secondary);
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  cursor: pointer;
                  transition: all 0.15s ease;
                ">
                  <span style="font-weight: 500; color: var(--text-primary);">${tn.label}</span>
                  <span style="font-size: 0.875rem; color: var(--text-secondary);">${this.formatPhoneNumber(tn.phone_number)}</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
            <p style="margin: 0 0 0.5rem 0; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Or enter a number:</p>
        ` : `
          <div style="margin-bottom: 1rem;">
            <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--text-secondary);">Enter a number to transfer to:</p>
        `}
            <div style="display: flex; gap: 0.5rem;">
              <input
                type="tel"
                id="custom-transfer-number"
                placeholder="(555) 123-4567"
                style="
                  flex: 1;
                  padding: 0.75rem;
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  font-size: 1rem;
                  background: var(--bg-secondary);
                  color: var(--text-primary);
                "
              />
              <button id="transfer-custom-btn" style="
                padding: 0.75rem 1rem;
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
              ">Transfer</button>
            </div>
          </div>
        ${!hasTransferNumbers ? `
          <p style="margin: 1rem 0 0 0; font-size: 0.75rem; color: var(--text-secondary); text-align: center;">
            Tip: Add transfer numbers in Agent Config for quick access
          </p>
        ` : ''}
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('close-transfer-modal').addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Transfer option buttons
    modal.querySelectorAll('.transfer-option').forEach(btn => {
      btn.addEventListener('mouseover', () => {
        btn.style.background = 'var(--bg-primary)';
        btn.style.borderColor = '#6366f1';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background = 'var(--bg-secondary)';
        btn.style.borderColor = 'var(--border-color)';
      });
      btn.addEventListener('click', async () => {
        const phoneNumber = btn.dataset.phone;
        modal.remove();
        await this.executeTransfer(phoneNumber);
      });
    });

    // Custom number transfer
    document.getElementById('transfer-custom-btn').addEventListener('click', async () => {
      const input = document.getElementById('custom-transfer-number');
      let phoneNumber = input.value.trim();
      if (!phoneNumber) {
        input.style.borderColor = '#ef4444';
        return;
      }
      // Normalize to E.164
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length === 10) {
        phoneNumber = '+1' + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        phoneNumber = '+' + digitsOnly;
      } else {
        phoneNumber = '+' + digitsOnly;
      }
      modal.remove();
      await this.executeTransfer(phoneNumber);
    });

    // Enter key on custom input
    document.getElementById('custom-transfer-number').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('transfer-custom-btn').click();
      }
    });
  },

  async executeTransfer(targetNumber) {
    console.log('📞 Executing transfer to:', targetNumber);

    try {
      // Update UI to show transfer in progress
      const sipStatusText = document.getElementById('sip-status-text');
      if (sipStatusText) {
        sipStatusText.textContent = 'Transferring...';
        sipStatusText.style.color = '#6366f1';
      }

      // Get user's SIP username for matching the call
      const { data: userData } = await supabase
        .from('users')
        .select('sip_username')
        .eq('id', this.userId)
        .single();

      // Get the current destination number from the input
      const searchInput = document.getElementById('call-search-input');
      const currentToNumber = searchInput?.value?.trim() || '';

      if (this.currentBridgedCallSid) {
        // For bridged calls, call Edge Function to handle transfer
        console.log('📞 Using Edge Function for bridged call transfer');
        const { data, error } = await supabase.functions.invoke('transfer-call', {
          body: {
            call_sid: this.currentBridgedCallSid,
            target_number: targetNumber
          }
        });

        if (error) throw error;

        console.log('✅ Bridged call transfer initiated:', data);
        if (sipStatusText) {
          sipStatusText.textContent = 'Transferred';
          sipStatusText.style.color = '#10b981';
        }

        // Clean up
        this.currentBridgedCallSid = null;
        this.currentCallRecordId = null;
        setTimeout(() => {
          this.transformToCallButton();
          this.updateCallState('idle');
        }, 1500);
      } else if (sipClient && sipClient.isCallActive()) {
        // For direct SIP calls, use SignalWire REST API via Edge Function
        console.log('📞 Using SignalWire API for direct SIP transfer');
        const { data, error } = await supabase.functions.invoke('sip-transfer-call', {
          body: {
            sip_username: userData?.sip_username,
            target_number: targetNumber,
            current_to_number: currentToNumber
          }
        });

        if (error) throw error;

        if (data.error) {
          throw new Error(data.error);
        }

        console.log('✅ SIP call transfer initiated:', data);
        if (sipStatusText) {
          sipStatusText.textContent = 'Transferred';
          sipStatusText.style.color = '#10b981';
        }

        // Hang up our SIP leg since the call is now transferred
        if (sipClient) sipClient.hangup();

        setTimeout(() => {
          this.transformToCallButton();
          this.updateCallState('idle');
        }, 1500);
      } else {
        throw new Error('No active call to transfer');
      }
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      const sipStatusText = document.getElementById('sip-status-text');
      if (sipStatusText) {
        sipStatusText.textContent = 'Transfer failed';
        sipStatusText.style.color = '#ef4444';
      }
      showToast(`Transfer failed: ${error.message}`, 'error');

      // Restore previous state
      setTimeout(() => {
        if (sipStatusText) {
          sipStatusText.textContent = 'Connected';
          sipStatusText.style.color = '#10b981';
        }
      }, 2000);
    }
  },
};
