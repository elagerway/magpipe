/**
 * Phone Page - Dialpad View
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, setPhoneNavActive } from '../components/BottomNav.js';
import { showOutboundTemplateModal } from '../components/OutboundTemplateModal.js';
import { User, Organization } from '../models/index.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../components/ExternalTrunkSettings.js';
import { showToast } from '../lib/toast.js';

// System agent UUID for unassigned numbers
const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';

// Lazy load SIP client to reduce initial bundle size (281KB)
let sipClient = null;
async function loadSipClient() {
  if (!sipClient) {
    const module = await import('../lib/sipClient.js');
    sipClient = module.sipClient;
  }
  return sipClient;
}

// Lazy load Twilio client for external SIP trunk calls
let twilioClient = null;
async function loadTwilioClient() {
  if (!twilioClient) {
    const module = await import('../lib/twilioClient.js');
    twilioClient = module.twilioClient;
  }
  return twilioClient;
}

export default class PhonePage {
  constructor() {
    this.userId = null;
    this.sipInitialized = false;
    this.userPhoneNumber = null; // User's personal cell phone for callback calls
    this.serviceNumbers = [];
    this.numbersToDelete = [];
    this.currentSipSession = null; // For WebRTC SIP calls
    this.currentTwilioCall = null; // For Twilio Client SDK calls
    this.isExternalTrunkCall = false; // Whether current call uses external SIP trunk
  }

  async loadUserPhoneNumber() {
    try {
      const { data } = await supabase
        .from('users')
        .select('phone_number')
        .eq('id', this.userId)
        .single();

      if (data?.phone_number) {
        this.userPhoneNumber = data.phone_number;
      }
    } catch (error) {
      console.error('Failed to load user phone number:', error);
    }
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    // Fetch user profile for bottom nav
    const { profile } = await User.getProfile(user.id);

    // Fetch user's personal phone number for callback validation
    await this.loadUserPhoneNumber();

    // Add external trunk settings styles
    addExternalTrunkSettingsStyles();

    const appElement = document.getElementById('app');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // Mobile: Just the dialer
      appElement.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--bg-primary);
          padding: 1rem 0.5rem 100px;
          overflow: auto;
          position: relative;
        ">
          ${this.renderDialpadContent()}
        </div>
        ${renderBottomNav('/phone')}
      `;
    } else {
      // Desktop: Two-column layout (wrapped in container that accounts for sidebar)
      appElement.innerHTML = `
        <div class="container with-bottom-nav" style="max-width: 1200px; padding: 1.5rem;">
          <div class="phone-page-desktop" style="
            display: grid;
            grid-template-columns: 1fr 380px;
            gap: 2rem;
          ">
            <!-- Left Column: Numbers Management -->
            <div class="phone-left-column" style="overflow-y: auto; max-height: calc(100vh - 6rem);">
              <!-- Service Numbers Section -->
              <div class="card" style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                  <div>
                    <h2 style="margin: 0;">My Service Numbers</h2>
                    <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Manage your phone numbers</p>
                  </div>
                  <button class="btn btn-primary" id="add-number-btn">
                    + Add Number
                  </button>
                </div>
                <div id="numbers-list-container">
                  <div class="text-muted" style="text-align: center; padding: 2rem;">
                    Loading numbers...
                  </div>
                </div>
              </div>

              <!-- Branded Calling Section -->
              <div class="card" style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                  <div>
                    <h2 style="margin: 0;">Branded Calling</h2>
                    <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Display your business name on outbound calls</p>
                  </div>
                  <button class="btn btn-primary" id="configure-cnam-btn" style="
                    background: rgb(168, 85, 247);
                    border-color: rgb(168, 85, 247);
                  ">Configure</button>
                </div>
                <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0 0 0.75rem;">
                  CNAM registration is processed through telecom carriers and typically takes 3–7 business days to take effect.
                </p>
                <div id="branded-calling-summary">
                  <div class="text-muted" style="font-size: 0.875rem;">Loading...</div>
                </div>
              </div>

              <!-- External SIP Trunks Section -->
              <div id="external-trunk-settings-container"></div>
            </div>

            <!-- Right Column: Dialer -->
            <div class="phone-right-column" style="
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: var(--radius-lg);
              padding: 1.5rem;
              height: fit-content;
              position: sticky;
              top: 1.5rem;
            ">
              ${this.renderDialpadContent()}
            </div>
          </div>
        </div>
        ${renderBottomNav('/phone')}
      `;

      // Initialize External Trunk Settings component
      createExternalTrunkSettings('external-trunk-settings-container');

      // Load service numbers
      await this.loadServiceNumbersList();

      // Render branded calling summary and attach configure button
      this.renderBrandedCallingSummary();
      document.getElementById('configure-cnam-btn')?.addEventListener('click', () => {
        this.showBrandedCallingModal();
      });
    }

    // Set phone nav as active
    setPhoneNavActive(true);

    this.attachEventListeners();

    // NOTE: SIP/microphone initialization removed - not needed anymore
    // Agent calls: use SignalWire → LiveKit (no browser audio)
    // Callback calls: SignalWire calls user's cell phone (no browser audio)

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
  }

  async loadServiceNumbers() {
    const select = document.getElementById('caller-id-select');
    if (!select) return;

    // Load SignalWire service numbers
    const { data: serviceNumbers, error: serviceError } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (serviceError) {
      console.error('Error loading service numbers:', serviceError);
    }

    // Load external SIP trunk numbers
    const { data: externalNumbers, error: externalError } = await supabase
      .from('external_sip_numbers')
      .select('phone_number, friendly_name, external_sip_trunks!inner(name, is_active)')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .eq('external_sip_trunks.is_active', true);

    if (externalError) {
      console.error('Error loading external SIP numbers:', externalError);
    }

    const allNumbers = [];

    // Add service numbers
    if (serviceNumbers && serviceNumbers.length > 0) {
      serviceNumbers.forEach(num => {
        allNumbers.push({
          phone_number: num.phone_number,
          label: num.phone_number,
          source: 'signalwire'
        });
      });
    }

    // Add external SIP numbers
    if (externalNumbers && externalNumbers.length > 0) {
      externalNumbers.forEach(num => {
        const trunkName = num.external_sip_trunks?.name || 'External';
        allNumbers.push({
          phone_number: num.phone_number,
          label: `${num.phone_number} (${trunkName})`,
          source: 'external_sip'
        });
      });
    }

    if (allNumbers.length > 0) {
      select.innerHTML = allNumbers
        .map(num => `<option value="${num.phone_number}" data-source="${num.source}">${num.label}</option>`)
        .join('');
    } else {
      select.innerHTML = '<option value="">No numbers available</option>';
    }
  }

  async loadServiceNumbersList() {
    const container = document.getElementById('numbers-list-container');
    if (!container) return;

    try {
      // Load service numbers with assigned agent info
      const { data: numbers, error } = await supabase
        .from('service_numbers')
        .select(`
          *,
          agent:agent_configs!service_numbers_agent_id_fkey (
            id,
            name
          )
        `)
        .eq('user_id', this.userId)
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      this.serviceNumbers = (numbers || []).map(n => ({ ...n, source: 'signalwire' }));

      // Load external SIP numbers
      const { data: extNumbers } = await supabase
        .from('external_sip_numbers')
        .select('*, trunk:external_sip_trunks!inner(name), agent:agent_configs(id, name)')
        .eq('user_id', this.userId);

      if (extNumbers) {
        const mapped = extNumbers.map(n => ({
          id: n.id,
          phone_number: n.phone_number,
          is_active: !!n.agent,
          source: 'external_sip',
          trunk_name: n.trunk?.name,
          capabilities: n.capabilities || { voice: true, sms: false, mms: false },
          agent: n.agent || null,
        }));
        this.serviceNumbers = [...this.serviceNumbers, ...mapped];
      }

      // Sync capabilities from SignalWire and is_active based on agent assignment (non-blocking)
      this.syncNumbersState(this.serviceNumbers);

      // Load numbers scheduled for deletion
      const { data: toDelete, error: deleteError } = await supabase
        .from('numbers_to_delete')
        .select('*')
        .eq('user_id', this.userId)
        .eq('deletion_status', 'pending')
        .order('scheduled_deletion_date', { ascending: true });

      if (deleteError) console.error('Error loading deletion queue:', deleteError);
      this.numbersToDelete = toDelete || [];

      if (this.serviceNumbers.length === 0 && this.numbersToDelete.length === 0) {
        container.innerHTML = `
          <div class="text-muted" style="text-align: center; padding: 2rem;">
            <p style="margin-bottom: 1rem;">You don't have any service numbers yet</p>
            <button class="btn btn-primary" onclick="navigateTo('/select-number')">
              Get Your First Number
            </button>
          </div>
        `;
      } else {
        container.innerHTML = this.renderServiceNumbersList();
        this.attachNumbersEventListeners();
      }
    } catch (error) {
      console.error('Error loading numbers:', error);
      container.innerHTML = `
        <div class="text-muted" style="text-align: center; padding: 2rem; color: var(--error-color);">
          Failed to load numbers: ${error.message}
        </div>
      `;
    }
  }

  async syncNumbersState(numbers) {
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    try {
      // Sync is_active based on agent assignment
      for (const num of numbers) {
        const isAssigned = num.agent && num.agent.id !== SYSTEM_AGENT_ID;
        if (num.is_active !== !!isAssigned) {
          const table = num.source === 'external_sip' ? 'external_sip_numbers' : 'service_numbers';
          await supabase.from(table).update({ is_active: !!isAssigned }).eq('id', num.id);
        }
      }

      // Sync capabilities from providers
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const syncCalls = [];
        const hasSignalWire = numbers.some(n => n.source === 'signalwire');
        const hasExternal = numbers.some(n => n.source === 'external_sip');

        if (hasSignalWire) {
          syncCalls.push(fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-number-capabilities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          }));
        }
        if (hasExternal) {
          syncCalls.push(fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-external-capabilities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          }));
        }

        const results = await Promise.allSettled(syncCalls);
        let anyUpdated = false;
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.ok) {
            const json = await r.value.json();
            if (json.updated > 0) anyUpdated = true;
          }
        }

        if (anyUpdated) {
          // Reload capabilities from both tables
          const [swFresh, extFresh] = await Promise.all([
            supabase.from('service_numbers').select('id, capabilities').eq('user_id', this.userId),
            supabase.from('external_sip_numbers').select('id, capabilities').eq('user_id', this.userId),
          ]);
          for (const f of (swFresh.data || []).concat(extFresh.data || [])) {
            const num = this.serviceNumbers.find(n => n.id === f.id);
            if (num) num.capabilities = f.capabilities;
          }
          const container = document.getElementById('numbers-list-container');
          if (container) {
            container.innerHTML = this.renderServiceNumbersList();
            this.attachNumbersEventListeners();
          }
        }
      }
    } catch (err) {
      console.error('Error syncing numbers state:', err);
    }
  }

  renderServiceNumbersList() {
    // Filter out US Relay numbers
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    const isUSRelay = (n) => n.friendly_name?.includes('Auto US Relay');
    const isAssigned = (n) => n.agent && n.agent.id !== SYSTEM_AGENT_ID;
    const activeNumbers = this.serviceNumbers.filter(n => isAssigned(n) && !isUSRelay(n));
    const inactiveNumbers = this.serviceNumbers.filter(n => !isAssigned(n) && !isUSRelay(n));

    return `
      ${activeNumbers.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            Active (${activeNumbers.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${activeNumbers.map(num => this.renderNumberItem(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${inactiveNumbers.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%;"></span>
            Inactive (${inactiveNumbers.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${inactiveNumbers.map(num => this.renderNumberItem(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${this.numbersToDelete.length > 0 ? `
        <div>
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
            Scheduled for Deletion (${this.numbersToDelete.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${this.numbersToDelete.map(num => this.renderDeletionItem(num)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  renderNumberItem(number) {
    const capabilities = number.capabilities || {};
    const hasVoice = capabilities.voice !== false;
    const hasSms = capabilities.sms !== false;
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    const isAssigned = number.agent && number.agent.id !== SYSTEM_AGENT_ID;
    const agentName = isAssigned ? number.agent.name : null;

    return `
      <div class="number-item" style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        border: none;
      " data-number-id="${number.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(number.phone_number)}</div>
          ${number.source === 'external_sip' && number.trunk_name ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.125rem;">${number.trunk_name}</div>` : ''}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            ${hasVoice ? '<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(34, 197, 94, 0.1); color: rgb(34, 197, 94); border-radius: 0.25rem;">Voice</span>' : ''}
            ${hasSms ? '<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246); border-radius: 0.25rem;">SMS</span>' : ''}
            ${number.cnam_name ? `<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247); border-radius: 0.25rem;">CNAM: ${number.cnam_name}</span>` : ''}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.375rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="edit-number-btn" data-number-id="${number.id}" style="
              background: transparent;
              border: none;
              padding: 0.25rem;
              cursor: pointer;
              color: var(--text-secondary);
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 0.25rem;
            " title="Manage agent assignment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            <label class="toggle-switch" style="margin: 0;">
              <input type="checkbox" class="number-toggle" data-id="${number.id}" ${isAssigned ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          ${agentName ? `
            <span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(99, 102, 241, 0.1); color: rgb(99, 102, 241); border-radius: 0.25rem; display: inline-flex; align-items: center; gap: 0.25rem;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${agentName}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderDeletionItem(number) {
    const scheduledDate = new Date(number.scheduled_deletion_date);
    const now = new Date();
    const daysRemaining = Math.ceil((scheduledDate - now) / (1000 * 60 * 60 * 24));

    return `
      <div class="number-item" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: rgba(239, 68, 68, 0.05);
        border-radius: var(--radius-md);
        border: 1px solid rgba(239, 68, 68, 0.3);
      " data-deletion-id="${number.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9375rem; color: rgba(239, 68, 68, 0.8);">${this.formatPhoneNumber(number.phone_number)}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Deletes in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}
          </div>
        </div>
        <button class="btn btn-sm btn-secondary cancel-deletion-btn" data-phone="${number.phone_number}">
          Cancel
        </button>
      </div>
    `;
  }

  attachNumbersEventListeners() {
    // Add number button
    const addNumberBtn = document.getElementById('add-number-btn');
    addNumberBtn?.addEventListener('click', () => {
      navigateTo('/select-number');
    });

    // Toggle switches
    document.querySelectorAll('.number-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const numberId = e.target.dataset.id;
        const newStatus = e.target.checked;
        await this.toggleNumberStatus(numberId, newStatus);
      });
    });

    // Edit number buttons
    document.querySelectorAll('.edit-number-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const numberId = btn.dataset.numberId;
        const number = this.serviceNumbers.find(n => n.id === numberId);
        if (number) {
          await this.showAgentAssignmentModal(number);
        }
      });
    });

    // Cancel deletion buttons
    document.querySelectorAll('.cancel-deletion-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const phoneNumber = e.target.dataset.phone;
        await this.cancelDeletion(phoneNumber);
      });
    });
  }

  async toggleNumberStatus(numberId, newStatus) {
    try {
      const number = this.serviceNumbers.find(n => n.id === numberId);
      if (!number) return;

      // Update the number status in the correct table
      const table = number.source === 'external_sip' ? 'external_sip_numbers' : 'service_numbers';
      const { error } = await supabase
        .from(table)
        .update({ is_active: newStatus })
        .eq('id', numberId);

      if (error) throw error;

      // Reload the list
      await this.loadServiceNumbersList();

      // Also reload the caller ID dropdown
      await this.loadServiceNumbers();
    } catch (error) {
      console.error('Error toggling number:', error);
      showToast(`Failed to update number: ${error.message}`, 'error');
      // Reload to revert UI
      await this.loadServiceNumbersList();
    }
  }

  async cancelDeletion(phoneNumber) {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-number-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel deletion');
      }

      // Reload the list
      await this.loadServiceNumbersList();
    } catch (error) {
      console.error('Error cancelling deletion:', error);
      showToast(`Failed to cancel deletion: ${error.message}`, 'error');
    }
  }

  async renderBrandedCallingSummary() {
    const container = document.getElementById('branded-calling-summary');
    if (!container) return;

    // Get SignalWire numbers only (CNAM doesn't apply to external SIP)
    const swNumbers = this.serviceNumbers.filter(n => n.source === 'signalwire');
    if (swNumbers.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size: 0.875rem;">No service numbers configured yet.</div>';
      return;
    }

    // Fetch pending CNAM requests
    const numberIds = swNumbers.map(n => n.id);
    const { data: pendingRequests } = await supabase
      .from('cnam_requests')
      .select('service_number_id, requested_name, status')
      .in('service_number_id', numberIds)
      .in('status', ['pending', 'submitted', 'processing']);

    const pendingMap = {};
    (pendingRequests || []).forEach(r => {
      pendingMap[r.service_number_id] = r;
    });

    const activeNumbers = swNumbers.filter(n => n.cnam_name);
    const pendingNumbers = swNumbers.filter(n => !n.cnam_name && pendingMap[n.id]);

    if (activeNumbers.length === 0 && pendingNumbers.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size: 0.875rem;">No branded numbers configured yet.</div>';
      return;
    }

    const chips = [];
    activeNumbers.forEach(n => {
      chips.push(`<span style="
        display: inline-flex; align-items: center; gap: 0.375rem;
        font-size: 0.75rem; padding: 0.25rem 0.5rem;
        background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247);
        border-radius: 0.375rem; font-weight: 500;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${this.formatPhoneNumber(n.phone_number)} — ${n.cnam_name}
      </span>`);
    });
    pendingNumbers.forEach(n => {
      const req = pendingMap[n.id];
      chips.push(`<span style="
        display: inline-flex; align-items: center; gap: 0.375rem;
        font-size: 0.75rem; padding: 0.25rem 0.5rem;
        background: rgba(234, 179, 8, 0.1); color: rgb(180, 140, 10);
        border-radius: 0.375rem; font-weight: 500;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        ${this.formatPhoneNumber(n.phone_number)} — "${req.requested_name}" (Pending)
      </span>`);
    });

    container.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">${chips.join('')}</div>`;
  }

  async showBrandedCallingModal() {
    // Fetch org name for pre-population
    const { organization } = await Organization.getForUser(this.userId);
    const orgName = organization?.name ? organization.name.substring(0, 15) : '';

    // Get SignalWire numbers only
    const swNumbers = this.serviceNumbers.filter(n => n.source === 'signalwire');

    // Fetch latest CNAM requests for all numbers
    const numberIds = swNumbers.map(n => n.id);
    const { data: cnamRequests } = await supabase
      .from('cnam_requests')
      .select('service_number_id, requested_name, status')
      .in('service_number_id', numberIds)
      .order('created_at', { ascending: false });

    // Build a map of latest request per number
    const latestRequestMap = {};
    (cnamRequests || []).forEach(r => {
      if (!latestRequestMap[r.service_number_id]) {
        latestRequestMap[r.service_number_id] = r;
      }
    });

    // Identify unconfigured numbers (no active CNAM, no pending request)
    const unconfiguredNumbers = swNumbers.filter(num => {
      const req = latestRequestMap[num.id];
      const isPending = req && ['pending', 'submitted', 'processing'].includes(req.status);
      return !num.cnam_name && !isPending;
    });

    const modal = document.createElement('div');
    modal.id = 'branded-calling-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    `;

    const numberRows = swNumbers.map(num => {
      const req = latestRequestMap[num.id];
      const isPending = req && ['pending', 'submitted', 'processing'].includes(req.status);

      if (num.cnam_name) {
        // Active CNAM
        return `
          <div style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          ">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="display: flex; align-items: center; gap: 0.375rem; margin-top: 0.25rem; color: rgb(168, 85, 247); font-size: 0.8rem; font-weight: 500;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                ${num.cnam_name}
              </div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(168, 85, 247); padding: 0.125rem 0.5rem; background: rgba(168, 85, 247, 0.1); border-radius: 0.25rem; font-weight: 500;">Active</span>
          </div>
        `;
      } else if (isPending) {
        // Pending request
        return `
          <div style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          ">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">"${req.requested_name}"</div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(234, 179, 8); padding: 0.125rem 0.5rem; background: rgba(234, 179, 8, 0.1); border-radius: 0.25rem; font-weight: 500;">Pending</span>
          </div>
        `;
      } else {
        // Unconfigured - shows "Using global" by default, with override option
        return `
          <div style="
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          " data-cnam-row="${num.id}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="cnam-using-global" data-number-id="${num.id}" style="font-size: 0.7rem; color: var(--text-secondary); font-style: italic;">Using global name</span>
                <button class="btn btn-sm cnam-override-btn" data-number-id="${num.id}" style="
                  background: transparent;
                  color: var(--text-secondary);
                  border: 1px solid var(--border-color);
                  padding: 0.25rem 0.5rem;
                  font-size: 0.7rem;
                  cursor: pointer;
                ">Override</button>
              </div>
            </div>
            <div class="cnam-override-input" data-number-id="${num.id}" style="display: none; margin-top: 0.5rem;">
              <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                <div style="flex: 1;">
                  <input type="text" class="cnam-input" data-number-id="${num.id}" maxlength="15"
                    placeholder="Different name for this number" value=""
                    style="
                      width: 100%;
                      padding: 0.5rem 0.75rem;
                      border: 1px solid var(--border-color);
                      border-radius: var(--radius-md);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 0.875rem;
                      box-sizing: border-box;
                    "
                  />
                  <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem; text-align: right;">
                    <span class="cnam-char-count">0</span>/15 characters
                  </div>
                </div>
                <button class="btn btn-sm cnam-submit-single-btn" data-number-id="${num.id}" style="
                  background: rgb(168, 85, 247);
                  color: white;
                  border: none;
                  padding: 0.5rem 0.75rem;
                  white-space: nowrap;
                  margin-bottom: 1.25rem;
                ">Submit</button>
              </div>
              <button class="cnam-cancel-override-btn" data-number-id="${num.id}" style="
                background: none; border: none; color: var(--text-secondary);
                font-size: 0.75rem; cursor: pointer; padding: 0; margin-top: 0.25rem;
                text-decoration: underline;
              ">Cancel — use global name</button>
            </div>
          </div>
        `;
      }
    }).join('');

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        max-width: 480px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <div style="
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <h3 style="margin: 0; font-size: 1rem;">Branded Calling</h3>
          <button id="close-branded-modal" style="
            background: transparent;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            color: var(--text-secondary);
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style="padding: 1rem; overflow-y: auto;">
          <div style="
            padding: 0.75rem;
            background: rgba(234, 179, 8, 0.08);
            border: 1px solid rgba(234, 179, 8, 0.25);
            border-radius: var(--radius-md);
            margin-bottom: 1rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            line-height: 1.4;
          ">
            CNAM registration is submitted to telecom carriers and typically takes 3–7 business days to propagate across networks. Some carriers may take longer.
          </div>

          <!-- Global Brand Name -->
          <div style="
            padding: 1rem;
            background: rgba(168, 85, 247, 0.05);
            border: 1px solid rgba(168, 85, 247, 0.2);
            border-radius: var(--radius-md);
            margin-bottom: 1rem;
          ">
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
              Global Brand Name
            </label>
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0.25rem 0 0.5rem;">
              Applies to all numbers below. Per-number overrides take precedence.
            </p>
            <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
              <div style="flex: 1;">
                <input type="text" id="global-cnam-input" maxlength="15"
                  placeholder="Business name" value="${orgName}"
                  style="
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid rgba(168, 85, 247, 0.3);
                    border-radius: var(--radius-md);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 0.9375rem;
                    font-weight: 600;
                    box-sizing: border-box;
                  "
                />
                <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem; text-align: right;">
                  <span id="global-cnam-char-count">${orgName.length}</span>/15 characters
                </div>
              </div>
              ${unconfiguredNumbers.length > 0 ? `
                <button id="apply-global-cnam-btn" class="btn btn-sm" style="
                  background: rgb(168, 85, 247);
                  color: white;
                  border: none;
                  padding: 0.5rem 0.75rem;
                  white-space: nowrap;
                  margin-bottom: 1.25rem;
                  font-weight: 600;
                ">Apply to All (${unconfiguredNumbers.length})</button>
              ` : ''}
            </div>
          </div>

          <!-- Per-Number List -->
          ${swNumbers.length === 0 ? `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              No service numbers available. Add a number first.
            </div>
          ` : `
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: block;">
              Numbers
            </label>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${numberRows}
            </div>
          `}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Global character counter
    const globalInput = document.getElementById('global-cnam-input');
    const globalCharCount = document.getElementById('global-cnam-char-count');
    if (globalInput && globalCharCount) {
      globalInput.addEventListener('input', () => {
        globalCharCount.textContent = globalInput.value.length;
      });
    }

    // Override buttons — show per-number input, hide "Using global" label
    modal.querySelectorAll('.cnam-override-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const numberId = btn.dataset.numberId;
        const overrideDiv = modal.querySelector(`.cnam-override-input[data-number-id="${numberId}"]`);
        const usingGlobalLabel = modal.querySelector(`.cnam-using-global[data-number-id="${numberId}"]`);
        if (overrideDiv) overrideDiv.style.display = 'block';
        if (usingGlobalLabel) usingGlobalLabel.style.display = 'none';
        btn.style.display = 'none';
        // Focus the input
        const input = overrideDiv?.querySelector('.cnam-input');
        if (input) input.focus();
      });
    });

    // Cancel override buttons — hide input, show "Using global" label
    modal.querySelectorAll('.cnam-cancel-override-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const numberId = btn.dataset.numberId;
        const overrideDiv = modal.querySelector(`.cnam-override-input[data-number-id="${numberId}"]`);
        const usingGlobalLabel = modal.querySelector(`.cnam-using-global[data-number-id="${numberId}"]`);
        const overrideBtn = modal.querySelector(`.cnam-override-btn[data-number-id="${numberId}"]`);
        if (overrideDiv) overrideDiv.style.display = 'none';
        if (usingGlobalLabel) usingGlobalLabel.style.display = '';
        if (overrideBtn) overrideBtn.style.display = '';
        // Clear the input
        const input = overrideDiv?.querySelector('.cnam-input');
        if (input) input.value = '';
      });
    });

    // Character counters for per-number inputs
    modal.querySelectorAll('.cnam-input').forEach(input => {
      const row = input.closest('[data-cnam-row]');
      const counter = row?.querySelector('.cnam-char-count');
      if (counter) {
        input.addEventListener('input', () => {
          counter.textContent = input.value.length;
        });
      }
    });

    // Helper: submit CNAM for a single number, returns true on success
    const submitCnamForNumber = async (numberId, name, session) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-cnam-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          serviceNumberId: numberId,
          requestedName: name,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit CNAM request');
      }
      return true;
    };

    // Helper: replace a row with pending badge
    const replaceRowWithPending = (numberId, name) => {
      const row = modal.querySelector(`[data-cnam-row="${numberId}"]`);
      if (row) {
        const num = swNumbers.find(n => n.id === numberId);
        row.removeAttribute('data-cnam-row');
        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num?.phone_number || '')}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">"${name}"</div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(234, 179, 8); padding: 0.125rem 0.5rem; background: rgba(234, 179, 8, 0.1); border-radius: 0.25rem; font-weight: 500;">Pending</span>
          </div>
        `;
      }
    };

    // "Apply to All" button — submits global name for all unconfigured numbers
    const applyAllBtn = document.getElementById('apply-global-cnam-btn');
    if (applyAllBtn && globalInput) {
      applyAllBtn.addEventListener('click', async () => {
        const name = globalInput.value.trim();
        if (!name || name.length < 2) {
          showToast('Global name must be at least 2 characters', 'error');
          return;
        }
        if (name.length > 15) {
          showToast('Global name must be 15 characters or less', 'error');
          return;
        }

        // Find remaining unconfigured rows (not yet submitted)
        const remainingRows = modal.querySelectorAll('[data-cnam-row]');
        if (remainingRows.length === 0) {
          showToast('All numbers already configured', 'info');
          return;
        }

        applyAllBtn.disabled = true;
        applyAllBtn.textContent = 'Submitting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          let successCount = 0;

          for (const row of remainingRows) {
            const numberId = row.dataset.cnamRow;
            // Check if this number has a per-number override input visible with a value
            const overrideDiv = row.querySelector('.cnam-override-input');
            const overrideInput = row.querySelector('.cnam-input');
            const isOverriding = overrideDiv?.style.display !== 'none' && overrideInput?.value.trim();
            const nameToSubmit = isOverriding ? overrideInput.value.trim() : name;

            try {
              await submitCnamForNumber(numberId, nameToSubmit, session);
              replaceRowWithPending(numberId, nameToSubmit);
              successCount++;
            } catch (err) {
              console.error(`CNAM submit error for ${numberId}:`, err);
            }
          }

          if (successCount > 0) {
            showToast(`CNAM submitted for ${successCount} number${successCount > 1 ? 's' : ''}`, 'success');
            this.renderBrandedCallingSummary();
          }

          // Update button or hide if all done
          const stillUnconfigured = modal.querySelectorAll('[data-cnam-row]');
          if (stillUnconfigured.length === 0) {
            applyAllBtn.style.display = 'none';
          } else {
            applyAllBtn.disabled = false;
            applyAllBtn.textContent = `Apply to All (${stillUnconfigured.length})`;
          }
        } catch (err) {
          console.error('Apply all error:', err);
          showToast(err.message || 'Failed to submit CNAM requests', 'error');
          applyAllBtn.disabled = false;
          applyAllBtn.textContent = `Apply to All (${remainingRows.length})`;
        }
      });
    }

    // Per-number submit buttons (for overrides)
    modal.querySelectorAll('.cnam-submit-single-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        const row = modal.querySelector(`[data-cnam-row="${numberId}"]`);
        const input = row?.querySelector('.cnam-input');
        if (!input) return;

        const name = input.value.trim();
        if (!name || name.length < 2) {
          showToast('Name must be at least 2 characters', 'error');
          return;
        }
        if (name.length > 15) {
          showToast('Name must be 15 characters or less', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          await submitCnamForNumber(numberId, name, session);

          showToast('CNAM request submitted', 'success');
          replaceRowWithPending(numberId, name);
          this.renderBrandedCallingSummary();

          // Update "Apply to All" button count
          const stillUnconfigured = modal.querySelectorAll('[data-cnam-row]');
          const applyBtn = document.getElementById('apply-global-cnam-btn');
          if (applyBtn) {
            if (stillUnconfigured.length === 0) {
              applyBtn.style.display = 'none';
            } else {
              applyBtn.textContent = `Apply to All (${stillUnconfigured.length})`;
            }
          }
        } catch (err) {
          console.error('CNAM submit error:', err);
          showToast(err.message || 'Failed to submit CNAM request', 'error');
          btn.disabled = false;
          btn.textContent = 'Submit';
        }
      });
    });

    // Close button
    document.getElementById('close-branded-modal').addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  async showAgentAssignmentModal(number) {
    // Load all agents for this user (excluding system agent)
    const { data: agents, error } = await supabase
      .from('agent_configs')
      .select('id, name')
      .eq('user_id', this.userId)
      .neq('id', SYSTEM_AGENT_ID)
      .order('name');

    if (error) {
      console.error('Error loading agents:', error);
      return;
    }

    // Don't show current assignment if it's the system agent
    const isSystemAgent = number.agent_id === SYSTEM_AGENT_ID;
    const currentAgentId = isSystemAgent ? null : number.agent_id;
    const currentAgentName = isSystemAgent ? null : number.agent?.name;

    const modal = document.createElement('div');
    modal.id = 'agent-assignment-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        max-width: 400px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <div style="
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <h3 style="margin: 0; font-size: 1rem;">Agent Assignment</h3>
            <p style="margin: 0.25rem 0 0; font-size: 0.875rem; color: var(--text-secondary);">${this.formatPhoneNumber(number.phone_number)}</p>
          </div>
          <button id="close-agent-modal" style="
            background: transparent;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            color: var(--text-secondary);
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style="padding: 1rem; overflow-y: auto;">
          ${currentAgentId ? `
            <div style="margin-bottom: 1rem;">
              <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Current Assignment</label>
              <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem;
                background: rgba(99, 102, 241, 0.1);
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: var(--radius-md);
                margin-top: 0.5rem;
              ">
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(99, 102, 241)" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  ${currentAgentName}
                </span>
                <button class="detach-agent-btn" data-agent-id="${currentAgentId}" style="
                  background: transparent;
                  border: 1px solid rgba(239, 68, 68, 0.5);
                  color: rgb(239, 68, 68);
                  padding: 0.25rem 0.5rem;
                  border-radius: 0.25rem;
                  font-size: 0.75rem;
                  cursor: pointer;
                ">Detach</button>
              </div>
            </div>
          ` : `
            <div style="
              padding: 0.75rem;
              background: var(--bg-secondary);
              border-radius: var(--radius-md);
              margin-bottom: 1rem;
              text-align: center;
              color: var(--text-secondary);
              font-size: 0.875rem;
            ">System default (not assigned)</div>
          `}

          <div>
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
              ${currentAgentId ? 'Change to' : 'Assign Agent'}
            </label>
            <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
              ${agents.length === 0 ? `
                <div style="
                  padding: 1rem;
                  text-align: center;
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                ">No agents available. Create an agent first.</div>
              ` : agents.filter(a => a.id !== currentAgentId).map(agent => `
                <button class="assign-agent-btn" data-agent-id="${agent.id}" style="
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  padding: 0.75rem;
                  background: var(--bg-secondary);
                  border: 1px solid var(--border-color);
                  border-radius: var(--radius-md);
                  cursor: pointer;
                  text-align: left;
                  width: 100%;
                  color: var(--text-primary);
                  transition: border-color 0.15s;
                ">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  ${agent.name}
                </button>
              `).join('')}
              ${agents.length > 0 && agents.filter(a => a.id !== currentAgentId).length === 0 ? `
                <div style="
                  padding: 1rem;
                  text-align: center;
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                ">All agents already assigned or no other agents available.</div>
              ` : ''}
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    document.getElementById('close-agent-modal').addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Detach button
    modal.querySelector('.detach-agent-btn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const agentName = currentAgentName;

      // Show confirmation modal
      const confirmModal = document.createElement('div');
      confirmModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        padding: 1rem;
      `;
      confirmModal.innerHTML = `
        <div style="
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          max-width: 320px;
          width: 100%;
          padding: 1.25rem;
        ">
          <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Detach Agent?</h3>
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Remove <strong>${agentName}</strong> from ${this.formatPhoneNumber(number.phone_number)}? The agent will no longer handle calls or messages on this number.
          </p>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button id="cancel-detach" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="confirm-detach" class="btn btn-sm" style="background: rgb(239, 68, 68); color: white;">Detach</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmModal);

      document.getElementById('cancel-detach').addEventListener('click', () => {
        confirmModal.remove();
      });

      document.getElementById('confirm-detach').addEventListener('click', async () => {
        const confirmBtn = document.getElementById('confirm-detach');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Detaching...';

        const { error } = await supabase
          .from('service_numbers')
          .update({ agent_id: SYSTEM_AGENT_ID })
          .eq('id', number.id);

        if (error) {
          console.error('Error detaching agent:', error);
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Detach';
          confirmModal.remove();
          return;
        }

        confirmModal.remove();
        modal.remove();
        await this.loadServiceNumbersList();
      });
    });

    // Assign buttons
    modal.querySelectorAll('.assign-agent-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const agentId = btn.dataset.agentId;
        btn.disabled = true;
        btn.style.opacity = '0.5';

        const { error } = await supabase
          .from('service_numbers')
          .update({ agent_id: agentId })
          .eq('id', number.id);

        if (error) {
          console.error('Error assigning agent:', error);
          btn.disabled = false;
          btn.style.opacity = '1';
          return;
        }

        modal.remove();
        await this.loadServiceNumbersList();
      });
    });
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
  }

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

  normalizePhoneForComparison(phone) {
    // Strip to just digits for comparison
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    // Remove leading 1 for US numbers to normalize
    if (digits.length === 11 && digits[0] === '1') {
      return digits.substring(1);
    }
    return digits;
  }

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
      showToast(`Failed to initiate call: ${error.message}`, 'error');
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }
}
