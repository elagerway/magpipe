import { supabase } from '../../lib/supabase.js';
import { showAlertModal } from '../../components/ConfirmModal.js';
import { User } from '../../models/index.js';
import { setPhoneNavActive } from '../../components/BottomNav.js';

// Lazy load SIP client
let sipClient = null;
async function loadSipClient() {
  if (!sipClient) {
    const module = await import('../../lib/sipClient.js');
    sipClient = module.sipClient;
  }
  return sipClient;
}

export const callInterfaceMethods = {
  showCallInterface() {
    const isMobile = window.innerWidth <= 768;
    const threadElement = document.getElementById('message-thread');

    // Use thread element for both mobile and desktop
    threadElement.innerHTML = this.renderCallInterfaceContent();
    threadElement.style.display = 'flex';
    threadElement.style.flexDirection = 'column';
    threadElement.style.overflow = 'auto';
    threadElement.style.background = 'var(--bg-primary)';

    // On mobile, add padding at bottom for navigation bar and ensure scrolling
    if (isMobile) {
      threadElement.style.paddingBottom = '100px';
      threadElement.style.height = '100%';
      threadElement.style.maxHeight = '100%';
    } else {
      threadElement.style.paddingBottom = '0';
    }

    // Set phone nav button as active
    setPhoneNavActive(true);

    this.attachCallEventListeners();
  },

  renderCallInterfaceContent() {
    const isMobile = window.innerWidth <= 768;

    return `
      <div style="
        display: flex;
        flex-direction: column;
        min-height: 100%;
        background: var(--bg-primary);
        padding: 1rem 0.5rem;
        overflow: visible;
        position: relative;
      ">
        <!-- Call header -->
        <div style="text-align: center; margin-bottom: 0.5rem; flex-shrink: 0; position: relative;">

          <!-- SIP Status Indicator -->
          <div id="sip-status" style="
            position: absolute;
            top: 50%;
            right: 1rem;
            transform: translateY(-50%);
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
              background: #6b7280;
              box-shadow: 0 0 4px rgba(107, 116, 128, 0.5);
            "></div>
            <span id="sip-status-text">Connecting...</span>
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
          <label id="call-state-label" style="
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-bottom: 0.2rem;
            text-align: center;
          ">Call from</label>
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
          <!-- Recording toggle -->
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 12px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
          ">
            <input
              type="checkbox"
              id="record-call-toggle"
              checked
              style="
                width: 18px;
                height: 18px;
                cursor: pointer;
              "
            >
            <label
              for="record-call-toggle"
              style="
                font-size: 14px;
                color: rgba(255, 255, 255, 0.9);
                cursor: pointer;
                user-select: none;
              "
            >
              🎙️ Record call
            </label>
          </div>
        </div>

        <!-- Phone number display with search -->
        <div style="
          padding: 0.5rem 0.5rem;
          margin: 0 auto 0.4rem auto;
          min-height: 2.5rem;
          max-width: 300px;
          width: 100%;
          position: relative;
          flex-shrink: 0;
        ">
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          ">
            <input
              type="text"
              id="call-search-input"
              placeholder="Enter name or number"
              style="
                width: 100%;
                font-size: 1.2rem;
                font-weight: 300;
                color: var(--text-primary);
                letter-spacing: 0.05em;
                min-height: 1.5rem;
                text-align: center;
                border: 1px solid rgba(128, 128, 128, 0.2);
                border-radius: 8px;
                padding: 0.5rem;
                background: transparent;
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
              onmousedown="this.style.background='var(--border-color)'; this.style.transform='translateY(-50%) scale(0.95)'"
              onmouseup="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
              onmouseleave="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
              ontouchstart="this.style.background='var(--border-color)'; this.style.transform='translateY(-50%) scale(0.95)'"
              ontouchend="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
              </svg>
            </button>
          </div>

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

        <!-- DTMF Keypad -->
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          max-width: ${isMobile ? '225px' : '300px'};
          margin: ${isMobile ? '10px auto 0 auto' : '0 auto'};
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

        <!-- Call action button -->
        <div style="
          display: flex;
          justify-content: center;
          padding: 0;
          flex-shrink: 0;
          margin-top: ${isMobile ? '20px' : '0'};
        ">
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
            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)'"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  },

  renderDTMFButton(digit, letters) {
    const digitStyle = digit === '*' ? 'font-size: 3.15rem; font-weight: 300; line-height: 1; position: relative; top: 11px; left: 2px;' :
                       digit === '#' ? 'font-size: 2rem; font-weight: 400;' : '';
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
          font-size: 1.5rem;
          font-weight: 300;
          transition: all 0.15s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          padding: 0.5rem;
        "
        onmousedown="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        onmouseup="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        onmouseleave="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        ontouchstart="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        ontouchend="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
      >
        <span style="line-height: 1; ${digitStyle}">${digit}</span>
        ${letters ? `<span style="font-size: 0.6rem; font-weight: 600; letter-spacing: 0.05em; margin-top: 0.1rem; color: var(--text-secondary);">${letters}</span>` : ''}
      </button>
    `;
  },

  attachCallEventListeners() {
    const searchInput = document.getElementById('call-search-input');
    const deleteBtn = document.getElementById('delete-btn');
    const suggestionsEl = document.getElementById('contact-suggestions');
    const callerIdSelect = document.getElementById('caller-id-select');
    const recordCallToggle = document.getElementById('record-call-toggle');

    let selectedContact = null;

    const updateDeleteButton = () => {
      if (deleteBtn && searchInput) {
        deleteBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      }
    };

    // Load recording preference from localStorage (default: true)
    const recordingPref = localStorage.getItem('record_calls_preference');
    if (recordCallToggle) {
      recordCallToggle.checked = recordingPref !== 'false'; // Default to true
    }

    // Save recording preference when toggled
    if (recordCallToggle) {
      recordCallToggle.addEventListener('change', (e) => {
        const shouldRecord = e.target.checked;
        localStorage.setItem('record_calls_preference', shouldRecord.toString());
        console.log('📹 Call recording preference:', shouldRecord ? 'ON' : 'OFF');
      });
    }

    // Load service numbers for caller ID selector
    this.loadServiceNumbers();

    // Prompt for microphone access and initialize SIP client
    this.requestMicrophoneAndInitializeSIP();

    // Search input for contact autocomplete
    if (searchInput) {
      // Show recent numbers on focus when input is empty
      searchInput.addEventListener('focus', async () => {
        if (searchInput.value.trim().length === 0) {
          await this.showRecentNumbers(suggestionsEl, searchInput, () => {
            selectedContact = null;
            updateDeleteButton();
          });
        }
      });

      searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        updateDeleteButton();

        if (query.length === 0) {
          // Show recent numbers when input is cleared
          await this.showRecentNumbers(suggestionsEl, searchInput, () => {
            selectedContact = null;
            updateDeleteButton();
          });
          return;
        }

        // Search contacts
        const contacts = await this.searchContacts(query);

        if (contacts.length > 0) {
          suggestionsEl.innerHTML = contacts.map(contact => `
            <div class="contact-suggestion" data-phone="${contact.phone_number}" style="
              padding: 0.75rem;
              cursor: pointer;
              border-bottom: 1px solid var(--border-color);
              transition: background 0.15s;
            " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
              <div style="font-weight: 600; color: var(--text-primary);">
                ${contact.first_name || ''} ${contact.last_name || ''}
              </div>
              <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${this.formatPhoneNumber(contact.phone_number)}
              </div>
            </div>
          `).join('');
          suggestionsEl.style.display = 'block';

          // Add click handlers to suggestions
          suggestionsEl.querySelectorAll('.contact-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
              const phone = suggestion.dataset.phone;
              searchInput.value = phone;
              selectedContact = contacts.find(c => c.phone_number === phone);
              suggestionsEl.style.display = 'none';
              updateDeleteButton();
            });
          });
        } else {
          suggestionsEl.style.display = 'none';
        }
      });

      // Focus input on load
      searchInput.focus();

      // Close suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!suggestionsEl.contains(e.target) && e.target !== searchInput) {
          suggestionsEl.style.display = 'none';
        }
      });
    }

    // DTMF buttons - append to input OR send DTMF if call is active
    document.querySelectorAll('.dtmf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;

        // If call is active, send DTMF tone
        if (sipClient.isInCall()) {
          console.log('Sending DTMF:', digit);
          sipClient.sendDTMF(digit);
          // Visual feedback
          btn.style.transform = 'scale(0.95)';
          setTimeout(() => {
            btn.style.transform = 'scale(1)';
          }, 100);
        } else {
          // Otherwise, append to input
          if (searchInput) {
            searchInput.value += digit;
            updateDeleteButton();
            suggestionsEl.style.display = 'none';
          }
        }
      });
    });

    // Delete button - remove last character
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = searchInput.value.slice(0, -1);
          updateDeleteButton();
        }
      });
    }

    // Call button - handles both call and hangup actions
    document.getElementById('call-btn').addEventListener('click', async () => {
      const callBtn = document.getElementById('call-btn');

      // Check if this is a hangup action (button is red)
      if (callBtn.dataset.action === 'hangup') {
        console.log('Hanging up call...');
        this.userHungUp = true;

        // Hangup SIP call
        sipClient.hangup();

        // Reset UI
        this.updateCallState('idle');
        this.transformToCallButton();
        return;
      }

      // Otherwise, initiate a new call
      const phoneNumber = searchInput ? searchInput.value.trim() : '';

      if (!phoneNumber) {
        await showAlertModal('Missing Phone Number', 'Please enter a phone number');
        return;
      }

      // Get selected caller ID
      const selectedCallerId = callerIdSelect ? callerIdSelect.value : null;

      if (!selectedCallerId) {
        await showAlertModal('No Caller ID', 'No active phone number selected');
        return;
      }

      // Close modal if on mobile
      const modal = document.getElementById('call-modal');
      if (modal) {
        modal.remove();
      }

      await this.initiateCall(phoneNumber, selectedCallerId);
    });

    // Close modal on backdrop click (mobile only)
    const backdrop = document.querySelector('#call-modal .modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        document.getElementById('call-modal').remove();
      });
    }
  },

  async initiateCall(phoneNumber, callerIdNumber = null) {
    console.log('Initiating SIP call to:', phoneNumber);

    // Load SIP client on demand
    sipClient = await loadSipClient();

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
          await showAlertModal('No Service Numbers', 'No active service numbers found');
          return;
        }
      } else {
        // Get SIP credentials for the selected caller ID
        const { data: serviceNumber } = await supabase
          .from('service_numbers')
          .select('sip_username, sip_password, sip_domain, sip_ws_server')
          .eq('phone_number', fromNumber)
          .eq('is_active', true)
          .single();

        if (!serviceNumber) {
          await showAlertModal('Number Not Found', 'Selected number not found or inactive');
          return;
        }
        sipCredentials = serviceNumber;
      }

      // Get user's name for CNAM (Caller Name)
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', this.userId)
        .single();

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

      // Check if recording is enabled
      const recordCallToggle = document.getElementById('record-call-toggle');
      const recordCall = recordCallToggle ? recordCallToggle.checked : false;

      // If recording is enabled, use bridged call approach
      // Otherwise use direct SIP calling
      if (recordCall) {
        console.log('🎙️ Recording enabled - using bridged call approach');
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

          showAlertModal('Call Failed', `Call failed: ${cause}`);
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
      showAlertModal('Call Error', `Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  async initiateBridgedCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating bridged call with recording');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

    // Load SIP client on demand
    sipClient = await loadSipClient();

    try {
      // Show connecting state
      this.updateCallState('connecting', 'Registering SIP...');

      // Get SIP credentials for the selected caller ID
      const { data: serviceNumber } = await supabase
        .from('service_numbers')
        .select('sip_username, sip_password, sip_domain, sip_ws_server')
        .eq('phone_number', callerIdNumber)
        .eq('is_active', true)
        .single();

      if (!serviceNumber) {
        throw new Error('Selected number not found or inactive');
      }

      // Initialize SIP client so it can receive the incoming call
      console.log('🔧 Initializing SIP client for incoming call...');
      await sipClient.initialize({
        sipUri: `sip:${serviceNumber.sip_username}@${serviceNumber.sip_domain}`,
        sipPassword: serviceNumber.sip_password,
        wsServer: serviceNumber.sip_ws_server,
        displayName: callerIdNumber
      });

      console.log('✅ SIP client registered and ready');
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
      this.updateCallState('ringing', 'Your phone will ring shortly...');
      this.transformToHangupButton();

      // Store call info for hangup
      this.currentBridgedCallSid = data.call_sid;
      this.currentCallRecordId = data.call_record_id;

    } catch (error) {
      console.error('Failed to initiate bridged call:', error);
      showAlertModal('Call Error', `Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  },

  showCallStatus(status) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  },

  transformToHangupButton() {
    const callBtn = document.getElementById('call-btn');
    if (!callBtn) return;

    // Change to red hangup button
    callBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    callBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    callBtn.dataset.action = 'hangup';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

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
    if (!callBtn) return;

    // Change back to green call button
    callBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    callBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    callBtn.dataset.action = 'call';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

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
    const stateLabel = document.getElementById('call-state-label');
    const callBtn = document.getElementById('call-btn');

    console.log('📞 Updating call state to:', state, 'Message:', message, 'Label found:', !!stateLabel);

    if (!stateLabel) {
      console.warn('⚠️ Call state label not found');
      return;
    }

    switch (state) {
      case 'connecting':
        stateLabel.textContent = 'Connecting...';
        stateLabel.style.color = 'var(--text-secondary)';
        // Transform to hangup button as soon as call starts
        this.transformToHangupButton();
        break;

      case 'progress':
      case 'ringing':
        stateLabel.textContent = 'Ringing...';
        stateLabel.style.color = '#f59e0b'; // Orange color
        // Keep hangup button active during ringing
        this.transformToHangupButton();
        break;

      case 'established':
        stateLabel.textContent = 'Call Established';
        stateLabel.style.color = '#10b981'; // Green color
        // Keep hangup button active when call is established
        this.transformToHangupButton();
        // Show recording indicator if recording is enabled
        this.showRecordingIndicator();
        break;

      case 'hungup':
        stateLabel.textContent = 'Hung Up';
        stateLabel.style.color = '#ef4444'; // Red color
        // Transform back to call button when hung up
        this.transformToCallButton();
        // Hide recording indicator
        this.hideRecordingIndicator();
        break;

      case 'idle':
      default:
        stateLabel.textContent = message || 'Call from';
        stateLabel.style.color = 'var(--text-secondary)';
        // Transform back to call button when idle
        this.transformToCallButton();
        // Hide recording indicator
        this.hideRecordingIndicator();
        break;
    }
  },

  showRecordingIndicator() {
    const recordToggle = document.getElementById('record-call-toggle');
    const recordIcon = document.getElementById('record-icon');

    // Only show indicator if recording is enabled
    if (!recordToggle || !recordToggle.checked || !recordIcon) return;

    // Add pulsing red dot to the center of the icon
    const existingDot = document.getElementById('recording-dot');
    if (existingDot) return; // Already showing

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('id', 'recording-dot');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '12');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', '#ef4444');

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes recording-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      #recording-dot {
        animation: recording-pulse 1.5s ease-in-out infinite;
      }
    `;
    if (!document.getElementById('recording-pulse-style')) {
      style.id = 'recording-pulse-style';
      document.head.appendChild(style);
    }

    recordIcon.appendChild(dot);
    console.log('🔴 Recording indicator shown');
  },

  hideRecordingIndicator() {
    const dot = document.getElementById('recording-dot');
    if (dot) {
      dot.remove();
      console.log('⚫ Recording indicator hidden');
    }
  },

  async searchContacts(query) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone_number')
        .eq('user_id', this.userId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone_number.ilike.%${query}%`)
        .limit(5);

      if (error) {
        console.error('Error searching contacts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to search contacts:', error);
      return [];
    }
  },

  async showRecentNumbers(suggestionsEl, searchInput, onSelectCallback) {
    try {
      // Fetch user's service numbers to exclude them
      const { data: serviceNumbers, error: serviceError } = await supabase
        .from('service_numbers')
        .select('phone_number')
        .eq('user_id', this.userId);

      if (serviceError) {
        console.error('Error fetching service numbers:', serviceError);
      }

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

  formatRelativeTime(date) {
    try {
      if (!date) return '';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';

      const now = new Date();
      const diffMs = now - dateObj;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      if (typeof dateObj.toLocaleDateString !== 'function') return '';
      return dateObj.toLocaleDateString();
    } catch (err) {
      console.error('formatRelativeTime error:', err);
      return '';
    }
  },

  async requestMicrophoneAndInitializeSIP() {
    try {
      // First check if permission is already blocked
      let isBlocked = false;
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        isBlocked = permissionStatus.state === 'denied';
        console.log('🎤 Microphone permission state:', permissionStatus.state);
      } catch (e) {
        console.log('Could not check permission status:', e);
      }

      if (isBlocked) {
        // Show instructions to unblock
        await showAlertModal('Microphone Blocked', 'To enable calling:\n\n1. Look at your browser address bar\n2. Click the camera/lock icon on the left side\n3. Find "Microphone" and change it to "Allow"\n4. Refresh this page\n5. Try again');
        this.updateSIPStatus('error', 'Mic blocked');
        return;
      }

      // Show a custom prompt asking user to grant microphone access
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
        showAlertModal('Microphone Denied', 'The browser denied microphone access.\n\nTry:\n1. Click the lock/camera icon in the address bar\n2. Reset permissions for this site\n3. Refresh and try again');
      } else {
        showAlertModal('Microphone Error', `${error.name}: ${error.message}`);
      }
    }
  },

  async initializeSIPClient() {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');

    if (!sipLed || !sipStatusText) return;

    // Load SIP client on demand
    sipClient = await loadSipClient();

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
        displayName: 'AI Assistant',
      });

      this.updateSIPStatus('registered');
    } catch (error) {
      console.error('SIP initialization failed:', error);
      this.updateSIPStatus('error', error.message);
    }
  },

  updateSIPStatus(status, message = '') {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');

    if (!sipLed || !sipStatusText) return;

    switch (status) {
      case 'connecting':
        sipLed.style.background = '#6b7280';
        sipLed.style.boxShadow = '0 0 4px rgba(107, 116, 128, 0.5)';
        sipStatusText.textContent = 'Connecting...';
        sipStatusText.style.color = 'var(--text-secondary)';
        break;
      case 'registered':
        sipLed.style.background = '#10b981';
        sipLed.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.8)';
        sipStatusText.textContent = 'Ready';
        sipStatusText.style.color = '#10b981';
        break;
      case 'error':
        sipLed.style.background = '#ef4444';
        sipLed.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
        sipStatusText.textContent = message || 'Error';
        sipStatusText.style.color = '#ef4444';
        break;
    }
  },

  async loadServiceNumbers() {
    const callerIdSelect = document.getElementById('caller-id-select');
    if (!callerIdSelect) return;

    try {
      const { data: serviceNumbers, error } = await supabase
        .from('service_numbers')
        .select('id, phone_number, friendly_name, is_active')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('purchased_at', { ascending: false });

      if (error) {
        console.error('Error loading service numbers:', error);
        callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (No active numbers)</option>';
        return;
      }

      if (!serviceNumbers || serviceNumbers.length === 0) {
        callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (No active numbers)</option>';
        return;
      }

      // Populate dropdown with service numbers
      callerIdSelect.innerHTML = serviceNumbers.map((number, index) => {
        const flag = this.getCountryFlag(number.phone_number);
        const formattedNumber = this.formatPhoneNumber(number.phone_number);
        return `<option value="${number.phone_number}" ${index === 0 ? 'selected' : ''}>
          ${flag} ${formattedNumber}
        </option>`;
      }).join('');
    } catch (error) {
      console.error('Failed to load service numbers:', error);
      callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (Error loading)</option>';
    }
  },

  getCountryFlag(phoneNumber) {
    // Normalize phone number
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Check area code for US vs Canada
    if (cleaned.startsWith('1')) {
      const areaCode = cleaned.substring(1, 4);
      // Canadian area codes
      const canadianAreaCodes = ['204', '226', '236', '249', '250', '289', '306', '343', '365', '403', '416', '418', '431', '437', '438', '450', '506', '514', '519', '579', '581', '587', '604', '613', '639', '647', '672', '705', '709', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905'];

      if (canadianAreaCodes.includes(areaCode)) {
        return '🇨🇦'; // Canada flag
      }
      return '🇺🇸'; // US flag
    }

    // Default to globe for unknown
    return '🌍';
  },

};
