/**
 * Phone Page — tabbed: Numbers | Phone | Lookup | Blocked | Fraud
 *
 * Top nav matches the agent-detail tab style (desktop tab bar, mobile
 * <select> dropdown). All panels render up-front and are shown/hidden
 * on switch, so the existing per-section wiring runs once and unchanged.
 */

import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { renderBottomNav, setPhoneNavActive } from '../../components/BottomNav.js';
import { User, Organization } from '../../models/index.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../../components/ExternalTrunkSettings.js';
import { showToast } from '../../lib/toast.js';

import { dialpadMethods } from './dialpad.js';
import { numberManagementMethods } from './number-management.js';
import { callHandlerMethods } from './call-handler.js';
import { blockedCallersMethods } from './blocked-callers-management.js';
import { lookupMethods } from './lookup.js';
import { fraudMethods } from './fraud.js';

const PHONE_TABS = ['numbers', 'phone', 'lookup', 'blocked', 'fraud'];

function addPhoneTabStyles() {
  if (document.getElementById('phone-tab-styles')) return;
  const style = document.createElement('style');
  style.id = 'phone-tab-styles';
  style.textContent = `
    .phone-tabs-container { position: relative; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; }
    .phone-tabs { display: flex; gap: 0.5rem; overflow-x: auto; scrollbar-width: none; }
    .phone-tabs::-webkit-scrollbar { display: none; }
    .phone-tab { flex: 0 0 auto; padding: 0.75rem 1rem; border: none; background: none; color: var(--text-secondary); font-size: 0.9375rem; font-weight: 500; cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
    .phone-tab:hover { color: var(--text-primary); }
    .phone-tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
    .phone-tab-select-wrapper { display: none; position: relative; margin-bottom: 1.5rem; }
    .phone-tab-select { width: 100%; padding: 0.6rem 2rem 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9375rem; appearance: none; -webkit-appearance: none; background: var(--bg-primary); color: var(--text-primary); }
    .phone-tab-select-chevron { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-secondary); }
    @media (max-width: 768px) {
      .phone-tabs-container { display: none; }
      .phone-tab-select-wrapper { display: block; }
    }
  `;
  document.head.appendChild(style);
}

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
    this.activeTab = 'phone';
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

  // Numbers management panel — service numbers, branded calling, globally
  // blocked numbers, external SIP trunks (+ the block-number modal).
  renderNumbersPanel() {
    return `
      <!-- Service Numbers Section -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 style="margin: 0;">My Service Numbers</h2>
            <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Manage your phone numbers</p>
          </div>
          <button class="btn btn-primary" id="add-number-btn">+ Add Number</button>
        </div>
        <div id="numbers-list-container">
          <div class="text-muted" style="text-align: center; padding: 2rem;">Loading numbers...</div>
        </div>
      </div>

      <!-- Branded Calling Section -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div>
            <h2 style="margin: 0;">Branded Calling</h2>
            <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Display your business name on outbound calls</p>
          </div>
          <button class="btn btn-primary" id="configure-cnam-btn" style="background: rgb(168, 85, 247); border-color: rgb(168, 85, 247);">Configure</button>
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
    `;
  }

  // Blocked Numbers panel — the workspace-wide blocklist (its own sub-nav tab).
  // List + add + edit-label + unblock all run through blockedCallersMethods
  // against the manage-blocked-callers edge function.
  // Fraud panel — the GLOBAL list, shared across every workspace. Distinct
  // from Blocked, which is this workspace's own list: an entry here was caught
  // defrauding someone (possibly someone else) and is blocked platform-wide.
  renderFraudPanel() {
    return `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 0.75rem; flex-wrap: wrap;">
          <div>
            <h2 style="margin: 0;">Fraud Numbers</h2>
            <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">
              Shared across every workspace. Calls, texts and WhatsApp from these numbers are
              rejected everywhere. Numbers are added automatically when a call transcript shows
              obvious fraud, and numbers reported to the FTC and FCC in the last 7 days appear here too.
            </p>
          </div>
          <button class="btn btn-primary" id="fraud-report-btn">+ Report</button>
        </div>
        ${this.renderRiskLegend()}

        <form id="fraud-search-form" style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;" role="search">
          <input id="fraud-search-input" type="search" autocomplete="off"
            placeholder="Search every number — area code, last 4 digits, full number, or CNAM"
            style="flex: 1; min-width: 0; padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9375rem; background: var(--bg-primary); color: var(--text-primary);">
          <button type="submit" class="btn btn-secondary" style="white-space: nowrap;">Search</button>
        </form>
        <div id="fraud-search-status" style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.75rem; display: none;"></div>

        <div id="fraud-list-container">
          <div class="text-muted" style="text-align: center; padding: 1.5rem; font-size: 0.875rem;">Loading…</div>
        </div>
        <div id="fraud-pager" style="display: none; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); font-size: 0.8125rem;"></div>
      </div>

    `;
  }

  renderBlockedPanel() {
    return `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div>
            <h2 style="margin: 0;">Blocked Numbers</h2>
            <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Workspace-wide. Inbound calls hit a busy signal; SMS &amp; WhatsApp are dropped silently.</p>
          </div>
          <button class="btn btn-primary" id="bc-add-btn">+ Block</button>
        </div>
        <div id="blocked-callers-list-container">
          <div class="text-muted" style="text-align: center; padding: 1.5rem; font-size: 0.875rem;">Loading…</div>
        </div>
      </div>

      ${this.renderBlockedCallerModal()}
    `;
  }

  renderTabNav() {
    const btn = (tab, label) =>
      `<button class="phone-tab${this.activeTab === tab ? ' active' : ''}" data-tab="${tab}">${label}</button>`;
    const opt = (tab, label) =>
      `<option value="${tab}"${this.activeTab === tab ? ' selected' : ''}>${label}</option>`;
    return `
      <div class="phone-tabs-container">
        <div class="phone-tabs">
          ${btn('numbers', 'Numbers')}
          ${btn('phone', 'Phone')}
          ${btn('lookup', 'Lookup')}
          ${btn('blocked', 'Blocked')}
          ${btn('fraud', 'Fraud')}
        </div>
      </div>
      <div class="phone-tab-select-wrapper">
        <select class="phone-tab-select" id="phone-tab-select">
          ${opt('numbers', 'Numbers')}
          ${opt('phone', 'Phone')}
          ${opt('lookup', 'Lookup')}
          ${opt('blocked', 'Blocked')}
          ${opt('fraud', 'Fraud')}
        </select>
        <svg class="phone-tab-select-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
    `;
  }

  switchTab(tab) {
    if (!PHONE_TABS.includes(tab)) tab = 'phone';
    this.activeTab = tab;
    document.querySelectorAll('.phone-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    PHONE_TABS.forEach(t => {
      const panel = document.getElementById(`phone-panel-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
    });
    const sel = document.getElementById('phone-tab-select');
    if (sel && sel.value !== tab) sel.value = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url);
    if (tab === 'lookup') setTimeout(() => document.getElementById('lookup-input')?.focus(), 0);
  }

  async render() {
    const { user } = await getCurrentUser();
    if (!user) {
      navigateTo('/login');
      return;
    }
    this.userId = user.id;

    const { profile } = await User.getProfile(user.id);
    await this.loadUserPhoneNumber();

    addExternalTrunkSettingsStyles();
    addPhoneTabStyles();

    // Initial tab from ?tab= (deep-link), default 'phone'.
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    this.activeTab = PHONE_TABS.includes(tabParam) ? tabParam : 'phone';
    const dialNumber = urlParams.get('dial');
    if (dialNumber) this.activeTab = 'phone'; // a ?dial= link lands on the dialer

    const panelStyle = (t) => `style="${this.activeTab === t ? '' : 'display: none;'}"`;

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 1.5rem;">
        ${this.renderTabNav()}
        <div id="phone-tab-content">
          <div id="phone-panel-numbers" ${panelStyle('numbers')}>
            ${this.renderNumbersPanel()}
          </div>
          <div id="phone-panel-phone" ${panelStyle('phone')}>
            <div style="max-width: 420px; margin: 0 auto; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.5rem;">
              ${this.renderDialpadContent()}
            </div>
          </div>
          <div id="phone-panel-lookup" ${panelStyle('lookup')}>
            ${this.renderLookupContent()}
          </div>
          <div id="phone-panel-blocked" ${panelStyle('blocked')}>
            ${this.renderBlockedPanel()}
          </div>
          <div id="phone-panel-fraud" ${panelStyle('fraud')}>
            <div id="fraud-panel">
              ${this.renderFraudPanel()}
              ${this.renderFraudReportModal()}
            </div>
          </div>
        </div>
      </div>
      ${renderBottomNav('/phone')}
    `;

    // Wire tab switching
    document.querySelectorAll('.phone-tab').forEach(b =>
      b.addEventListener('click', () => this.switchTab(b.dataset.tab)));
    document.getElementById('phone-tab-select')?.addEventListener('change', (e) =>
      this.switchTab(e.target.value));

    // Numbers panel wiring (runs once; panel is in the DOM even when hidden)
    createExternalTrunkSettings('external-trunk-settings-container');
    await this.loadServiceNumbersList();
    this.renderBrandedCallingSummary();
    document.getElementById('configure-cnam-btn')?.addEventListener('click', () => this.showBrandedCallingModal());
    await this.loadBlockedCallersList();
    this._bindBlockedCallerModal();

    // Fraud panel wiring
    this.attachFraudListeners();
    await this.loadFraudList();

    // Phone (dialer) + Lookup wiring
    setPhoneNavActive(true);
    this.attachEventListeners();
    this.attachLookupListeners();

    // Handle ?dial= prefill
    if (dialNumber) {
      const dialInput = document.getElementById('call-search-input');
      if (dialInput) dialInput.value = dialNumber;
      const url = new URL(window.location.href);
      url.searchParams.delete('dial');
      window.history.replaceState({}, '', url);
    }
  }

  // Modal markup for reporting a number to the global fraud list. Reporting
  // blocks the number for every workspace, so the form asks what happened
  // rather than taking a bare number — the answer is the evidence another
  // workspace sees when it asks why one of its callers is blocked.
  // Wiring lives in fraud.js#attachFraudListeners.
  renderFraudReportModal() {
    const field = 'padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9375rem; background: var(--bg-primary); color: var(--text-primary);';
    return `
      <div id="fraud-modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
        <div style="background: var(--bg-primary); border-radius: var(--radius-lg); max-width: 480px; width: 100%; padding: 1.5rem; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <h3 style="margin: 0;">Report a fraud number</h3>
            <button type="button" id="fraud-modal-close" aria-label="Close" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary);">×</button>
          </div>
          <p class="text-muted" style="margin: 0 0 1rem; font-size: 0.8125rem;">
            This blocks the number for every Magpipe workspace, not just yours. Calls get a busy
            signal; texts and WhatsApp messages are dropped.
          </p>
          <form id="fraud-report-form" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem;">
              <span>Phone number</span>
              <input id="fraud-number" type="tel" placeholder="(604) 555-1234" autocomplete="off" required style="${field}">
            </label>
            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem;">
              <span>What kind of fraud?</span>
              <select id="fraud-category" required style="${field}">
                <option value="">Choose one…</option>
                <option value="gift_card">Gift card scam</option>
                <option value="wire_transfer">Wire transfer scam</option>
                <option value="bank_impersonation">Bank impersonation</option>
                <option value="government_impersonation">Government impersonation</option>
                <option value="tech_support">Tech support scam</option>
                <option value="crypto">Crypto scam</option>
                <option value="credential_phishing">Credential phishing</option>
                <option value="extortion">Extortion or threats</option>
                <option value="invoice_fraud">Invoice fraud</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem;">
              <span>What happened?</span>
              <textarea id="fraud-evidence" rows="3" maxlength="500" required
                placeholder="e.g. Caller said they were from the CRA and demanded gift cards to avoid arrest."
                style="${field} resize: vertical; font-family: inherit;"></textarea>
              <span class="text-muted" style="font-size: 0.75rem;">
                Kept to your workspace — other workspaces see the number and the category, never your notes.
              </span>
            </label>
            <div id="fraud-modal-error" style="display: none; color: var(--danger-color, #b91c1c); font-size: 0.8125rem;"></div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
              <button type="button" id="fraud-modal-cancel" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="fraud-submit-btn" class="btn btn-primary">Report and block</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // Modal markup for the Globally Blocked Numbers section. Inlined so the
  // numbers panel includes it via template interpolation; event wiring lives
  // in blocked-callers-management.js#_bindBlockedCallerModal.
  renderBlockedCallerModal() {
    return `
      <div id="bc-modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
        <div id="bc-modal-inner" style="background: var(--bg-primary); border-radius: var(--radius-lg); max-width: 460px; width: 100%; padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 id="bc-modal-title" style="margin: 0;">Block a number</h3>
            <button id="bc-modal-close" aria-label="Close" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary);">×</button>
          </div>
          <form id="bc-form" style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem;">
              <span>Phone number</span>
              <input id="bc-number" type="tel" placeholder="(604) 555-1234" autocomplete="off" required style="padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9375rem;">
              <span class="text-muted" style="font-size: 0.75rem;">Calls return a busy signal. SMS &amp; WhatsApp are silently dropped.</span>
            </label>
            <label style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem;">
              <span>Label (optional)</span>
              <input id="bc-label" type="text" placeholder="e.g. solar panel spammer" maxlength="200" style="padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9375rem;">
            </label>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
              <button type="button" id="bc-modal-cancel" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="bc-save-btn" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

Object.assign(PhonePage.prototype,
  dialpadMethods,
  numberManagementMethods,
  callHandlerMethods,
  blockedCallersMethods,
  lookupMethods,
  fraudMethods,
);

export default PhonePage;
