import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { sipClient, loadTwilioClient } from './call-handler.js';

export const dialpadMethods = {
  renderDialpadContent() {
    const isMobile = window.innerWidth <= 768;

    return `
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
        flex-direction: column;
        align-items: center;
        padding: 0 0.5rem;
        max-width: 300px;
        margin: 0 auto 0.5rem auto;
        width: 100%;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        ">
          <!-- Agent toggle with Direct/Agent labels -->
          <label style="
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
          ">
            <span id="direct-label" style="font-size: 14px; color: var(--text-secondary); font-weight: 400;">Direct</span>
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
                background: var(--primary-color);
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
            <span id="agent-label" style="font-size: 14px; color: var(--text-primary); font-weight: 600;">Agent</span>
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

        <!-- Direct mode sub-toggle (Callback / WebRTC SIP) - hidden by default -->
        <div id="direct-mode-options" style="
          display: none;
          margin-top: 0.5rem;
          width: 100%;
          justify-content: space-between;
          align-items: center;
        ">
          <label style="
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
          ">
            <span id="callback-label" style="font-size: 13px; color: var(--text-primary); font-weight: 600;">Callback</span>
            <div style="position: relative; width: 40px; height: 22px;">
              <input
                type="checkbox"
                id="sip-toggle"
                style="
                  opacity: 0;
                  width: 0;
                  height: 0;
                  position: absolute;
                "
              >
              <div id="sip-toggle-track" style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--primary-color);
                border-radius: 11px;
                transition: background 0.2s ease;
              "></div>
              <div id="sip-toggle-thumb" style="
                position: absolute;
                top: 2px;
                left: 2px;
                width: 18px;
                height: 18px;
                background: white;
                border-radius: 50%;
                transition: left 0.2s ease;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              "></div>
            </div>
            <span id="sip-label" style="font-size: 13px; color: var(--text-secondary); font-weight: 400;">WebRTC SIP</span>
          </label>

          <!-- Record button with LED (pulses only during call) -->
          <button id="record-toggle-btn" style="
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-secondary);
            cursor: pointer;
            font-size: 12px;
            color: var(--text-secondary);
            transition: all 0.2s ease;
          ">
            <span id="record-led" style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #ef4444;
            "></span>
            <span id="record-label">Record</span>
          </button>
        </div>
        <style>
          @keyframes pulse-led {
            0%, 100% { opacity: 1; box-shadow: 0 0 4px #ef4444; }
            50% { opacity: 0.4; box-shadow: 0 0 2px #ef4444; }
          }
        </style>
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
  },

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
  },

  attachEventListeners() {
    const searchInput = document.getElementById('call-search-input');
    const deleteBtn = document.getElementById('delete-btn');
    const callerIdSelect = document.getElementById('caller-id-select');
    const callBtn = document.getElementById('call-btn');
    const suggestionsEl = document.getElementById('contact-suggestions');

    // Load service numbers for caller ID
    this.loadServiceNumbers();

    // When external SIP trunk number is selected, force Direct + SIP mode
    if (callerIdSelect) {
      callerIdSelect.addEventListener('change', () => {
        const selectedOption = callerIdSelect.selectedOptions[0];
        const source = selectedOption?.dataset?.source;

        if (source === 'external_sip') {
          // Force Direct mode (uncheck agent toggle)
          const agentToggle = document.getElementById('agent-toggle');
          if (agentToggle && agentToggle.checked) {
            agentToggle.checked = false;
            agentToggle.dispatchEvent(new Event('change'));
          }

          // Force SIP mode (check sip toggle)
          const sipToggle = document.getElementById('sip-toggle');
          if (sipToggle && !sipToggle.checked) {
            sipToggle.checked = true;
            sipToggle.dispatchEvent(new Event('change'));
          }
        }
      });
    }

    // Agent toggle animation and direct mode options
    const agentToggle = document.getElementById('agent-toggle');
    const agentToggleTrack = document.getElementById('agent-toggle-track');
    const agentToggleThumb = document.getElementById('agent-toggle-thumb');
    const directModeOptions = document.getElementById('direct-mode-options');
    const directLabel = document.getElementById('direct-label');
    const agentLabel = document.getElementById('agent-label');

    if (agentToggle && agentToggleTrack && agentToggleThumb) {
      agentToggle.addEventListener('change', () => {
        if (agentToggle.checked) {
          // Agent mode
          agentToggleTrack.style.background = 'var(--primary-color)';
          agentToggleThumb.style.left = '22px';
          if (directModeOptions) {
            directModeOptions.style.display = 'none';
          }
          // Bold Agent label, unbold Direct
          if (directLabel) {
            directLabel.style.fontWeight = '400';
            directLabel.style.color = 'var(--text-secondary)';
          }
          if (agentLabel) {
            agentLabel.style.fontWeight = '600';
            agentLabel.style.color = 'var(--text-primary)';
          }
        } else {
          // Direct mode - show sub-toggle
          agentToggleTrack.style.background = 'var(--primary-color)';
          agentToggleThumb.style.left = '2px';
          if (directModeOptions) {
            directModeOptions.style.display = 'flex';
          }
          // Bold Direct label, unbold Agent
          if (directLabel) {
            directLabel.style.fontWeight = '600';
            directLabel.style.color = 'var(--text-primary)';
          }
          if (agentLabel) {
            agentLabel.style.fontWeight = '400';
            agentLabel.style.color = 'var(--text-secondary)';
          }
        }
      });
    }

    // SIP toggle animation and label bolding
    const sipToggle = document.getElementById('sip-toggle');
    const sipToggleTrack = document.getElementById('sip-toggle-track');
    const sipToggleThumb = document.getElementById('sip-toggle-thumb');
    const callbackLabel = document.getElementById('callback-label');
    const sipLabel = document.getElementById('sip-label');

    if (sipToggle && sipToggleTrack && sipToggleThumb) {
      sipToggle.addEventListener('change', () => {
        if (sipToggle.checked) {
          // WebRTC SIP mode
          sipToggleTrack.style.background = 'var(--primary-color)';
          sipToggleThumb.style.left = '20px';
          // Bold SIP label, unbold Callback
          if (callbackLabel) {
            callbackLabel.style.fontWeight = '400';
            callbackLabel.style.color = 'var(--text-secondary)';
          }
          if (sipLabel) {
            sipLabel.style.fontWeight = '600';
            sipLabel.style.color = 'var(--text-primary)';
          }
        } else {
          // Callback mode
          sipToggleTrack.style.background = 'var(--primary-color)';
          sipToggleThumb.style.left = '2px';
          // Bold Callback label, unbold SIP
          if (callbackLabel) {
            callbackLabel.style.fontWeight = '600';
            callbackLabel.style.color = 'var(--text-primary)';
          }
          if (sipLabel) {
            sipLabel.style.fontWeight = '400';
            sipLabel.style.color = 'var(--text-secondary)';
          }
        }
      });
    }

    // Record toggle button
    const recordToggleBtn = document.getElementById('record-toggle-btn');
    if (recordToggleBtn) {
      // Default to recording on (solid red LED, no pulse until call starts)
      recordToggleBtn.dataset.recording = 'on';

      recordToggleBtn.addEventListener('click', () => {
        const isRecording = recordToggleBtn.dataset.recording === 'on';
        const recordLed = document.getElementById('record-led');

        if (isRecording) {
          // Turn off recording
          recordToggleBtn.dataset.recording = 'off';
          if (recordLed) {
            recordLed.style.background = '#6b7280';
            recordLed.style.animation = 'none';
            recordLed.style.boxShadow = 'none';
          }
        } else {
          // Turn on recording (solid red, pulse will start when call connects)
          recordToggleBtn.dataset.recording = 'on';
          if (recordLed) {
            recordLed.style.background = '#ef4444';
            recordLed.style.animation = 'none';
            recordLed.style.boxShadow = 'none';
          }
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
          } else if (this.currentSipSession) {
            // Hangup WebRTC SIP call
            console.log('🔴 Terminating WebRTC SIP call');
            try {
              this.currentSipSession.terminate();
            } catch (error) {
              console.error('Failed to terminate SIP session:', error);
            }
            this.currentSipSession = null;
          } else if (this.currentTwilioCall) {
            // Hangup Twilio Client SDK call
            console.log('🔴 Terminating Twilio call');
            try {
              const client = await loadTwilioClient();
              client.hangup();
            } catch (error) {
              console.error('Failed to terminate Twilio call:', error);
            }
            this.currentTwilioCall = null;
          } else if (sipClient) {
            // Hangup legacy SIP call
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
          showToast('Please enter a phone number', 'warning');
          return;
        }

        if (!selectedCallerId) {
          showToast('No active phone number selected', 'warning');
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
  },

};
