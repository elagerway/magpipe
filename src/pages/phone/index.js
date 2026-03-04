/**
 * Phone Page - Dialpad View
 */

import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { renderBottomNav, setPhoneNavActive } from '../../components/BottomNav.js';
import { User, Organization } from '../../models/index.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../../components/ExternalTrunkSettings.js';
import { showToast } from '../../lib/toast.js';

import { dialpadMethods } from './dialpad.js';
import { numberManagementMethods } from './number-management.js';
import { callHandlerMethods } from './call-handler.js';

class PhonePage {
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
      // Mobile: Dialer + compact number controls below
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

          <!-- My Numbers -->
          <div style="margin-top: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0 0.25rem;">
              <h2 style="margin: 0; font-size: 1rem; font-weight: 600;">My Numbers</h2>
              <button class="btn btn-primary btn-sm" id="add-number-btn" style="font-size: 0.8125rem; padding: 0.375rem 0.75rem;">+ Add</button>
            </div>
            <div id="numbers-list-container">
              <div class="text-muted" style="text-align: center; padding: 1rem; font-size: 0.875rem;">Loading...</div>
            </div>
          </div>

          <!-- Branded Calling -->
          <div style="margin-top: 1rem;">
            <div style="
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: var(--radius-lg);
              padding: 0.875rem 1rem;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 0.75rem;
            ">
              <div style="min-width: 0;">
                <div style="font-weight: 600; font-size: 0.9375rem;">Branded Calling</div>
                <div id="branded-calling-summary" style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.125rem;">Loading...</div>
              </div>
              <button class="btn btn-sm" id="configure-cnam-btn" style="
                background: rgb(168, 85, 247);
                color: white;
                border-color: rgb(168, 85, 247);
                white-space: nowrap;
                flex-shrink: 0;
                font-size: 0.8125rem;
                padding: 0.375rem 0.75rem;
              ">Configure</button>
            </div>
          </div>

          <!-- External SIP Trunks -->
          <div style="margin-top: 1rem;" id="external-trunk-settings-container"></div>
        </div>
        ${renderBottomNav('/phone')}
      `;

      // Wire up mobile number controls
      createExternalTrunkSettings('external-trunk-settings-container');
      document.getElementById('configure-cnam-btn')?.addEventListener('click', () => {
        this.showBrandedCallingModal();
      });
      // loadServiceNumbersList populates the list and calls attachNumbersEventListeners (wires add-number-btn)
      await this.loadServiceNumbersList();
      this.renderBrandedCallingSummary();
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

}

Object.assign(PhonePage.prototype,
  dialpadMethods,
  numberManagementMethods,
  callHandlerMethods,
);

export default PhonePage;
