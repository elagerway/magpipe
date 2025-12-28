/**
 * Phone Page - Dialpad View
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, setPhoneNavActive } from '../components/BottomNav.js';
import { sipClient } from '../lib/sipClient.js';

export default class PhonePage {
  constructor() {
    this.userId = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    const appElement = document.getElementById('app');
    const isMobile = window.innerWidth <= 768;

    appElement.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: var(--bg-primary);
        padding: 1rem 0.5rem ${isMobile ? '100px' : '0'};
        overflow: auto;
        position: relative;
      ">
        ${this.renderDialpadContent()}
      </div>
      ${renderBottomNav('/phone')}
    `;

    // Set phone nav as active
    setPhoneNavActive(true);

    this.attachEventListeners();
    this.requestMicrophoneAndInitializeSIP();

    // Check for dial parameter in URL (e.g., /phone?dial=+16045551234)
    const urlParams = new URLSearchParams(window.location.search);
    const dialNumber = urlParams.get('dial');
    if (dialNumber) {
      const dialInput = document.getElementById('call-search-input');
      if (dialInput) {
        dialInput.value = dialNumber;
      }
      // Clear the URL parameter without reloading
      window.history.replaceState({}, '', '/phone');
    }
  }

  renderDialpadContent() {
    const isMobile = window.innerWidth <= 768;

    return `
      <!-- Status indicators aligned with caller ID -->
      <div style="
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 0 0.5rem;
        margin-bottom: 0.5rem;
        max-width: 300px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      ">
        <!-- SIP Status Indicator (always visible) -->
        <div id="sip-status" style="
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        ">
          <div id="sip-led" style="
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ef4444;
            flex-shrink: 0;
          "></div>
          <span id="sip-status-text">Disconnected</span>
        </div>
      </div>

      <!-- Caller ID selector -->
      <div style="
        padding: 0 0.5rem;
        max-width: 300px;
        margin: 0 auto 0.5rem auto;
        width: 100%;
        flex-shrink: 0;
      ">
        <select
          id="caller-id-select"
          style="
            width: 100%;
            padding: 0.5rem;
            border: 1px solid rgba(128, 128, 128, 0.2);
            border-radius: 8px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1.2rem;
            font-weight: 300;
            text-align: center;
            cursor: pointer;
            outline: none;
          "
        >
          <option value="">Loading numbers...</option>
        </select>
      </div>

      <!-- Phone number input with search -->
      <div style="
        padding: 0 0.5rem;
        max-width: 300px;
        margin: 0 auto 0.5rem auto;
        width: 100%;
        flex-shrink: 0;
        position: relative;
      ">
        <input
          type="tel"
          id="call-search-input"
          placeholder="Enter name or number"
          autocomplete="off"
          style="
            width: 100%;
            padding: 0.5rem 2.5rem 0.5rem 0.5rem;
            border: 1px solid rgba(128, 128, 128, 0.2);
            border-radius: 8px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1.2rem;
            font-weight: 300;
            text-align: center;
            outline: none;
          "
        />

        <button
          id="delete-btn"
          style="
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: var(--bg-secondary);
            color: var(--text-secondary);
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            flex-shrink: 0;
          "
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
          </svg>
        </button>

        <!-- Contact suggestions dropdown -->
        <div id="contact-suggestions" style="
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          max-height: 200px;
          overflow-y: auto;
          display: none;
          z-index: 100;
          margin-top: 0.25rem;
        "></div>
      </div>

      <!-- Agent toggle and Bulk Calling link -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0.5rem;
        max-width: 300px;
        margin: 0 auto 0.5rem auto;
        width: 100%;
      ">
        <!-- Agent toggle -->
        <label style="
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          user-select: none;
        ">
          <div style="position: relative; width: 44px; height: 24px;">
            <input
              type="checkbox"
              id="agent-toggle"
              checked
              style="
                opacity: 0;
                width: 0;
                height: 0;
                position: absolute;
              "
            >
            <div id="agent-toggle-track" style="
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: #10b981;
              border-radius: 12px;
              transition: background 0.2s ease;
            "></div>
            <div id="agent-toggle-thumb" style="
              position: absolute;
              top: 2px;
              left: 22px;
              width: 20px;
              height: 20px;
              background: white;
              border-radius: 50%;
              transition: left 0.2s ease;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            "></div>
          </div>
          <span style="font-size: 14px; color: var(--text-primary);">Agent</span>
        </label>

        <!-- Bulk Calling link -->
        <a href="#" id="bulk-calling-link" style="
          font-size: 13px;
          color: #6366f1;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Bulk Calling
        </a>
      </div>

      <!-- DTMF Keypad -->
      <div style="
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        max-width: ${isMobile ? '216px' : '264px'};
        margin: ${isMobile ? '8px auto 0 auto' : '0 auto'};
        width: 100%;
        flex-shrink: 0;
      ">
        ${this.renderDTMFButton('1', '')}
        ${this.renderDTMFButton('2', 'ABC')}
        ${this.renderDTMFButton('3', 'DEF')}
        ${this.renderDTMFButton('4', 'GHI')}
        ${this.renderDTMFButton('5', 'JKL')}
        ${this.renderDTMFButton('6', 'MNO')}
        ${this.renderDTMFButton('7', 'PQRS')}
        ${this.renderDTMFButton('8', 'TUV')}
        ${this.renderDTMFButton('9', 'WXYZ')}
        ${this.renderDTMFButton('*', '')}
        ${this.renderDTMFButton('0', '')}
        ${this.renderDTMFButton('#', '')}
      </div>

      <!-- Spacer -->
      <div style="${isMobile ? 'height: 15px;' : 'height: 2rem;'}"></div>

      <!-- Call action buttons -->
      <div style="
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
        flex-shrink: 0;
        margin-top: ${isMobile ? '10px' : '0'};
      ">
        <!-- Transfer button (hidden until call is active) -->
        <button
          id="transfer-btn"
          style="
            position: absolute;
            right: calc(50% + 44px);
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: var(--bg-secondary);
            color: var(--text-secondary);
            cursor: not-allowed;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            opacity: 0.5;
          "
          disabled
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 14 20 9 15 4"></polyline>
            <path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>
          </svg>
        </button>

        <button
          id="call-btn"
          style="
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          "
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
        </button>

        <!-- Mute button (hidden until call is active) -->
        <button
          id="mute-btn"
          style="
            position: absolute;
            left: calc(50% + 44px);
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: var(--bg-secondary);
            color: var(--text-primary);
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
          "
        >
          <svg id="mute-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
      </div>
    `;
  }

  renderDTMFButton(digit, letters) {
    const digitStyle = digit === '*' ? 'font-size: 2.6rem; font-weight: 300; line-height: 1; position: relative; top: 10px; left: 1px;' :
                       digit === '#' ? 'font-size: 1.7rem; font-weight: 400;' : '';
    return `
      <button
        class="dtmf-btn"
        data-digit="${digit}"
        style="
          aspect-ratio: 1;
          border: none;
          border-radius: 50%;
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 1.45rem;
          font-weight: 300;
          transition: all 0.15s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          padding: 0.4rem;
        "
        onmousedown="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        onmouseup="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        onmouseleave="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        ontouchstart="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        ontouchend="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
      >
        <span style="line-height: 1; ${digitStyle}">${digit}</span>
        ${letters ? `<span style="font-size: 0.6rem; font-weight: 600; letter-spacing: 0.05em; margin-top: 0.05rem; color: var(--text-secondary);">${letters}</span>` : ''}
      </button>
    `;
  }

  attachEventListeners() {
    const searchInput = document.getElementById('call-search-input');
    const deleteBtn = document.getElementById('delete-btn');
    const callerIdSelect = document.getElementById('caller-id-select');
    const callBtn = document.getElementById('call-btn');
    const suggestionsEl = document.getElementById('contact-suggestions');

    // Load service numbers for caller ID
    this.loadServiceNumbers();

    // Agent toggle animation
    const agentToggle = document.getElementById('agent-toggle');
    const agentToggleTrack = document.getElementById('agent-toggle-track');
    const agentToggleThumb = document.getElementById('agent-toggle-thumb');

    if (agentToggle && agentToggleTrack && agentToggleThumb) {
      agentToggle.addEventListener('change', () => {
        if (agentToggle.checked) {
          agentToggleTrack.style.background = '#10b981';
          agentToggleThumb.style.left = '22px';
        } else {
          agentToggleTrack.style.background = '#6b7280';
          agentToggleThumb.style.left = '2px';
        }
      });
    }

    // Bulk Calling link
    const bulkCallingLink = document.getElementById('bulk-calling-link');
    if (bulkCallingLink) {
      bulkCallingLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.navigateTo('/bulk-calling');
      });
    }

    // Mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      this.isMuted = false;
      muteBtn.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // Transfer button
    const transferBtn = document.getElementById('transfer-btn');
    if (transferBtn) {
      transferBtn.addEventListener('click', () => {
        this.showTransferModal();
      });
    }

    // Call button - handles both call and hangup actions
    if (callBtn) {
      callBtn.addEventListener('click', async () => {
        console.log('🔘 Call button clicked!', callBtn.dataset.action);

        // Check if this is a hangup action (button is red)
        if (callBtn.dataset.action === 'hangup') {
          console.log('Hanging up call...');
          this.userHungUp = true;

          // Check if this is a bridged call
          if (this.currentBridgedCallSid) {
            console.log('🔴 Terminating bridged call:', this.currentBridgedCallSid);
            try {
              // Call Edge Function to terminate the SignalWire call
              await supabase.functions.invoke('terminate-call', {
                body: { call_sid: this.currentBridgedCallSid }
              });
              console.log('✅ Bridged call terminated');
            } catch (error) {
              console.error('Failed to terminate bridged call:', error);
            }
            this.currentBridgedCallSid = null;
            this.currentCallRecordId = null;
          } else {
            // Hangup SIP call
            sipClient.hangup();
          }

          // Reset UI
          this.transformToCallButton();
          this.updateCallState('idle');
          return;
        }

        // This is a call action
        const phoneNumber = searchInput.value.trim();
        const selectedCallerId = callerIdSelect.value;

        if (!phoneNumber) {
          alert('Please enter a phone number');
          return;
        }

        if (!selectedCallerId) {
          alert('No active phone number selected');
          return;
        }

        await this.initiateCall(phoneNumber, selectedCallerId);
      });
    }

    // Delete button
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        searchInput.value = '';
        deleteBtn.style.display = 'none';
        searchInput.focus();
      };
    }

    // Input changes
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        deleteBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      });

      // Show recent numbers on focus (if input is empty)
      searchInput.addEventListener('focus', async () => {
        if (searchInput.value.trim().length === 0) {
          await this.showRecentNumbers(suggestionsEl, searchInput, () => {
            deleteBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
          });
        }
      });

      // Hide suggestions on blur (with delay for clicks)
      searchInput.addEventListener('blur', () => {
        setTimeout(() => {
          suggestionsEl.style.display = 'none';
        }, 200);
      });
    }

    // DTMF buttons
    document.querySelectorAll('.dtmf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;
        searchInput.value += digit;
        deleteBtn.style.display = 'flex';
      });
    });
  }

  async loadServiceNumbers() {
    const select = document.getElementById('caller-id-select');
    if (!select) return;

    const { data: numbers, error } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading service numbers:', error);
      select.innerHTML = '<option value="">No numbers available</option>';
      return;
    }

    if (numbers && numbers.length > 0) {
      select.innerHTML = numbers
        .map(num => `<option value="${num.phone_number}">${num.phone_number}</option>`)
        .join('');
    } else {
      select.innerHTML = '<option value="">No numbers available</option>';
    }
  }

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
        alert('⚠️ Microphone is BLOCKED\n\nTo enable calling:\n\n1. Look at your browser address bar (where it shows localhost:3000)\n2. Click the camera/lock icon on the LEFT side\n3. Find "Microphone" and change it to "Allow"\n4. Refresh this page\n5. Try again');
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
              Pat needs access to your microphone to make calls.
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
        alert('⚠️ Microphone was denied\n\nThe browser denied microphone access.\n\nTry:\n1. Click the lock/camera icon in the address bar\n2. Reset permissions for this site\n3. Refresh and try again');
      } else {
        alert(`⚠️ Microphone error: ${error.name}\n\n${error.message}`);
      }
    }
  }

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

      // Initialize SIP client
      await sipClient.initialize({
        sipUri,
        sipPassword: userRecord.sip_password,
        wsServer: userRecord.sip_ws_server,
        displayName: 'Pat AI',
      });

      this.updateSIPStatus('registered');
    } catch (error) {
      console.error('SIP initialization failed:', error);
      this.updateSIPStatus('error', error.message);
    }
  }

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
  }

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
  }

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
  }

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
  }

  async initiateCall(phoneNumber, callerIdNumber = null) {
    console.log('Initiating SIP call to:', phoneNumber);

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
          alert('No active service numbers found');
          return;
        }
      } else {
        // Verify the selected caller ID is valid and active
        const { data: serviceNumber } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('phone_number', fromNumber)
          .eq('user_id', this.userId)
          .eq('is_active', true)
          .single();

        if (!serviceNumber) {
          alert('Selected number not found or inactive');
          return;
        }
      }

      // Get user's name and SIP credentials from users table
      const { data: userData } = await supabase
        .from('users')
        .select('name, sip_username, sip_password, sip_realm, sip_ws_server')
        .eq('id', this.userId)
        .single();

      if (!userData || !userData.sip_username || !userData.sip_password) {
        alert('SIP credentials not configured');
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
        await this.initiateBridgedCall(phoneNumber, fromNumber);
        return;
      }

      // Show connecting state
      this.updateCallState('connecting', 'Registering...');

      console.log('🔧 Initializing SIP client...');
      console.log('📞 Using display name (CNAM):', displayName);

      // Initialize SIP client with credentials
      await sipClient.initialize({
        sipUri: `sip:${sipCredentials.sip_username}@${sipCredentials.sip_domain}`,
        sipPassword: sipCredentials.sip_password,
        wsServer: sipCredentials.sip_ws_server,
        displayName: displayName
      });

      console.log('✅ SIP client registered');
      this.updateCallState('connecting', 'Calling...');

      // Create call record
      const callStartTime = new Date().toISOString();

      // Normalize phone number to E.164 format (+1234567890)
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        // Strip all non-digit characters first
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        // If number starts with 1 and is 11 digits, just add +
        // Otherwise assume North America and add +1
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      const { data: callRecord, error: callRecordError } = await supabase
        .from('call_records')
        .insert({
          user_id: this.userId,
          caller_number: normalizedPhoneNumber,
          contact_phone: normalizedPhoneNumber,
          service_number: fromNumber,
          direction: 'outbound',
          disposition: 'outbound_failed', // Will update on success
          status: 'failed', // Will update on success
          started_at: callStartTime
        })
        .select()
        .single();

      if (callRecordError) {
        console.error('Failed to create call record:', callRecordError);
      } else {
        console.log('✅ Call record created:', callRecord.id);
      }

      const callRecordId = callRecord?.id;
      let callConnectedTime = null;

      // Make call via SIP
      await sipClient.makeCall(phoneNumber, fromNumber, displayName, {
        onProgress: () => {
          console.log('📞 Call ringing...');
          this.updateCallState('ringing', 'Ringing...');
        },
        onConfirmed: () => {
          console.log('✅ Call connected');
          callConnectedTime = new Date();
          this.updateCallState('established', 'Connected');
          this.transformToHangupButton();
        },
        onFailed: async (cause) => {
          console.error('❌ Call failed:', cause);
          this.updateCallState('failed', `Call failed: ${cause}`);

          // Update call record with failure
          if (callRecordId) {
            const disposition = cause.toLowerCase().includes('busy') ? 'outbound_busy' : 'outbound_failed';
            const status = cause.toLowerCase().includes('busy') ? 'busy' : 'failed';
            await supabase
              .from('call_records')
              .update({
                disposition,
                status,
                ended_at: new Date().toISOString(),
                duration: 0,
                duration_seconds: 0
              })
              .eq('id', callRecordId);
          }

          alert(`Call failed: ${cause}`);
          this.transformToCallButton();
        },
        onEnded: async () => {
          console.log('📞 Call ended');

          // Update call record with final disposition and duration
          if (callRecordId) {
            const endTime = new Date();
            const duration = callConnectedTime
              ? Math.round((endTime - callConnectedTime) / 1000)
              : 0;

            const disposition = callConnectedTime
              ? 'outbound_completed'
              : 'outbound_no_answer';

            const status = callConnectedTime
              ? 'completed'
              : 'no-answer';

            await supabase
              .from('call_records')
              .update({
                disposition,
                status,
                ended_at: endTime.toISOString(),
                duration,
                duration_seconds: duration,
                contact_phone: normalizedPhoneNumber,
                service_number: fromNumber
              })
              .eq('id', callRecordId);

            console.log(`✅ Call record updated: ${disposition}, duration: ${duration}s`);
          }

          this.updateCallState('idle');
          this.transformToCallButton();
        }
      });

      console.log('📞 SIP call initiated');

    } catch (error) {
      console.error('Failed to initiate call:', error);
      alert(`Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

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
      alert(`Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

  async initiateBridgedCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating bridged call with agent + recording');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

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
          caller_id: callerIdNumber
        }
      });

      if (error) {
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
      alert(`Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

  subscribeToCallStatus(callRecordId) {
    // Unsubscribe from any previous subscription
    if (this.callStatusSubscription) {
      this.callStatusSubscription.unsubscribe();
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

          // Check if call ended
          if (payload.new.status === 'completed' || payload.new.status === 'failed' || payload.new.status === 'no-answer') {
            console.log('📞 Call ended (detected via realtime):', payload.new.status);

            // Clean up
            this.callStatusSubscription?.unsubscribe();
            this.callStatusSubscription = null;
            this.currentBridgedCallSid = null;
            this.currentCallRecordId = null;

            // Reset UI
            this.transformToCallButton();
            this.updateCallState('idle');
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });
  }

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
  }

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
  }

  updateCallState(state, message = null) {
    const sipStatusText = document.getElementById('sip-status-text');
    const callBtn = document.getElementById('call-btn');

    console.log('📞 Updating call state to:', state, 'Message:', message);

    if (!sipStatusText) {
      console.warn('⚠️ SIP status text not found');
      return;
    }

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

      case 'established':
        sipStatusText.textContent = 'Connected';
        sipStatusText.style.color = '#10b981'; // Green color
        // Keep hangup button active when call is established
        this.transformToHangupButton();
        break;

      case 'hungup':
        sipStatusText.textContent = 'Hung Up';
        sipStatusText.style.color = '#ef4444'; // Red color
        // Transform back to call button when hung up
        this.transformToCallButton();
        break;

      case 'idle':
      default:
        sipStatusText.textContent = 'Ready';
        sipStatusText.style.color = '#10b981';
        // Transform back to call button
        this.transformToCallButton();
        break;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    console.log('🔇 Mute toggled:', this.isMuted);

    // Mute/unmute the actual audio via SIP client
    try {
      sipClient.setMute(this.isMuted);
    } catch (e) {
      console.error('Failed to toggle mute:', e);
    }

    this.updateMuteButtonUI();
  }

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
  }

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
  }

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
        sipClient.hangup();

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
      alert(`Transfer failed: ${error.message}`);

      // Restore previous state
      setTimeout(() => {
        if (sipStatusText) {
          sipStatusText.textContent = 'Connected';
          sipStatusText.style.color = '#10b981';
        }
      }, 2000);
    }
  }
}
