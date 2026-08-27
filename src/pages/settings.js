/**
 * Settings Page
 */

import { User, Organization } from '../models/index.js';
import { getCurrentUser, signOut, supabase, getImpersonationAdminToken } from '../lib/supabase.js';
import { renderBottomNav, clearNavUserCache } from '../components/BottomNav.js';
import { createAccessCodeSettings, addAccessCodeSettingsStyles } from '../components/AccessCodeSettings.js';
import { addKnowledgeSourceManagerStyles } from '../components/KnowledgeSourceManager.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../components/ExternalTrunkSettings.js';
import { showToast } from '../lib/toast.js';
import { escapeHtml, formatPhoneNumber, getInitials } from '../lib/formatters.js';
import { createPhoneInput } from '../components/PhoneInput.js';

// Robust clipboard copy: prefers navigator.clipboard in secure contexts,
// falls back to a hidden textarea + execCommand('copy') for insecure
// contexts and older Safari where the async Clipboard API can fail.
async function copyTextToClipboard(value) {
  if (!value) return false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch { /* fall through to execCommand */ }
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

export default class SettingsPage {
  constructor() {
    this.accessCodeSettings = null;
    this.knowledgeManager = null;
    this.integrationSettings = null;
    this.cachedData = null;
    this.lastFetchTime = 0;
    this.avatarFile = null;
    this.activeTab = 'profile';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Add component styles
    addAccessCodeSettingsStyles();
    addKnowledgeSourceManagerStyles();
    addExternalTrunkSettingsStyles();

    // Use cached data if fetched within last 30 seconds
    const now = Date.now();
    let profile, billingInfo, serviceNumbers, organization;

    if (this.cachedData && (now - this.lastFetchTime) < 30000) {
      ({ profile, billingInfo, serviceNumbers, organization } = this.cachedData);
    } else {
      // Fetch all data in parallel for speed
      const [profileResult, billingResult, numbersResult, calComResult, orgResult, referralResult, slackIntegrationResult] = await Promise.all([
        User.getProfile(user.id),
        supabase.from('users').select('plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, credits_balance, credits_used_this_period, has_payment_method, received_signup_bonus, auto_recharge_enabled, auto_recharge_amount, auto_recharge_threshold, cc_bonus_claimed, recharge_bonus_claimed, referral_code, card_brand, card_last4').eq('id', user.id).single(),
        supabase.from('service_numbers').select('phone_number, is_active').eq('user_id', user.id).order('is_active', { ascending: false }),
        supabase.from('users').select('cal_com_access_token, cal_com_user_id').eq('id', user.id).single(),
        Organization.getForUser(user.id),
        supabase.from('referral_rewards').select('threshold_met').eq('referrer_id', user.id).eq('threshold_met', true).limit(1),
        supabase.from('user_integrations').select('id, status, external_workspace_id, integration_providers!inner(slug)').eq('user_id', user.id).eq('integration_providers.slug', 'slack').eq('status', 'connected').maybeSingle(),
      ]);

      profile = profileResult.profile;
      billingInfo = billingResult.data;
      serviceNumbers = numbersResult.data;
      organization = orgResult.organization;

      // Add Cal.com status to profile
      if (calComResult.data) {
        profile.cal_com_connected = !!calComResult.data.cal_com_access_token;
        profile.cal_com_user_id = calComResult.data.cal_com_user_id;
      }

      // Add referral completion status
      profile.has_completed_referral = (referralResult.data?.length || 0) > 0;

      // Store Slack connection status
      this.slackConnected = !!slackIntegrationResult.data;

      // Cache the data
      this.cachedData = { profile, billingInfo, serviceNumbers, organization };
      this.lastFetchTime = now;
    }

    // Merge billing info into profile
    if (billingInfo) {
      Object.assign(profile, billingInfo);
    }

    // Store organization for event listeners
    this.organization = organization;

    const activeNumbers = serviceNumbers?.filter(n => n.is_active) || [];
    const inactiveNumbers = serviceNumbers?.filter(n => !n.is_active) || [];

    // Get user initials for avatar fallback
    const userInitials = getInitials(profile?.name, user.email);

    // Check for billing, credits and Cal.com success/error in URL
    const urlParams = new URLSearchParams(window.location.search);
    const billingStatus = urlParams.get('billing');
    const creditsStatus = urlParams.get('credits');
    const paymentMethodStatus = urlParams.get('payment_method');
    const bonusClaimed = urlParams.get('bonus_claimed');
    const calConnected = urlParams.get('cal_connected');
    const calError = urlParams.get('cal_error');
    const integrationConnected = urlParams.get('integration_connected');
    const integrationError = urlParams.get('integration_error');

    // Handle integration OAuth redirects
    if (integrationConnected === 'slack') {
      showToast('Slack connected successfully!', 'success');
      this.slackConnected = true;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('integration_connected');
      window.history.replaceState({}, '', cleanUrl.toString());
    } else if (integrationError) {
      showToast('Failed to connect integration: ' + integrationError, 'error');
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('integration_error');
      window.history.replaceState({}, '', cleanUrl.toString());
    }

    // Store data for tab rendering
    this.profile = profile;
    this.user = user;
    this.billingInfo = billingInfo;
    this.serviceNumbers = serviceNumbers;
    this.activeNumbers = activeNumbers;
    this.inactiveNumbers = inactiveNumbers;
    this.userInitials = userInitials;

    // Check URL for tab param
    const tabParam = urlParams.get('tab');
    if (tabParam && ['profile', 'billing', 'branding', 'account', 'api'].includes(tabParam)) {
      this.activeTab = tabParam;
    }
    // Auto-switch to billing tab if coming from billing/credits/payment callback
    if (billingStatus || creditsStatus || paymentMethodStatus) {
      this.activeTab = 'billing';
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 2rem 1rem;">
        <h1 style="margin-bottom: 1rem;">Settings</h1>

        ${billingStatus === 'success' ? `
          <div class="alert alert-success" style="margin-bottom: 1rem;">
            You've successfully upgraded to Pro! Enjoy unlimited features.
          </div>
        ` : ''}
        ${billingStatus === 'canceled' ? `
          <div class="alert alert-warning" style="margin-bottom: 1rem;">
            Checkout was canceled. You can upgrade anytime from the Billing tab.
          </div>
        ` : ''}
        ${creditsStatus === 'success' ? `
          <div class="alert alert-success" style="margin-bottom: 1rem;">
            Credits added successfully! Your new balance is shown below.
          </div>
        ` : ''}
        ${creditsStatus === 'canceled' ? `
          <div class="alert alert-warning" style="margin-bottom: 1rem;">
            Credit purchase was canceled. You can add credits anytime below.
          </div>
        ` : ''}
        ${paymentMethodStatus === 'success' ? `
          <div class="alert alert-success" style="margin-bottom: 1rem;">
            ${bonusClaimed === 'true'
              ? '🎉 Payment method saved, auto-recharge enabled, and $20 free credits added to your account!'
              : 'Payment method saved successfully! You can now enable auto-recharge.'}
          </div>
        ` : ''}
        ${paymentMethodStatus === 'canceled' ? `
          <div class="alert alert-warning" style="margin-bottom: 1rem;">
            Payment method setup was canceled.
          </div>
        ` : ''}
        ${calConnected === 'true' ? `
          <div class="alert alert-success" style="margin-bottom: 1rem;">
            Cal.com connected successfully! You can now book appointments via voice commands.
          </div>
        ` : ''}
        ${calError ? `
          <div class="alert alert-error" style="margin-bottom: 1rem;">
            Failed to connect Cal.com: ${calError.replace(/_/g, ' ')}. Please try again.
          </div>
        ` : ''}

        <!-- Tabs -->
        <div class="settings-tabs-container">
          <div class="settings-tabs" id="settings-tabs">
            <button class="settings-tab ${this.activeTab === 'profile' ? 'active' : ''}" data-tab="profile">Profile</button>
            <button class="settings-tab ${this.activeTab === 'billing' ? 'active' : ''}" data-tab="billing">Billing</button>
            <button class="settings-tab ${this.activeTab === 'branding' ? 'active' : ''}" data-tab="branding">Branding</button>
            <button class="settings-tab ${this.activeTab === 'account' ? 'active' : ''}" data-tab="account">Account</button>
            <button class="settings-tab ${this.activeTab === 'api' ? 'active' : ''}" data-tab="api">API</button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="settings-tab-content" class="settings-tab-content">
          ${this.renderActiveTab()}
        </div>

      <style>
        .settings-tabs-container {
          margin-bottom: 1.5rem;
        }

        .settings-tabs {
          display: flex;
          gap: 0.25rem;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          border-bottom: 1px solid var(--border-color);
        }

        .settings-tabs::-webkit-scrollbar {
          display: none;
        }

        .settings-tab {
          padding: 0.75rem 1rem;
          border: none;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          white-space: nowrap;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.2s;
        }

        .settings-tab:hover {
          color: var(--text-primary);
        }

        .settings-tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .settings-tab-content {
          min-height: 300px;
        }

        @media (max-width: 768px) {
          .settings-tabs {
            padding-left: 0;
            padding-right: 1rem;
          }

          .settings-tab {
            padding: 0.6rem 0.75rem;
            font-size: 0.8rem;
          }
        }

        @media (max-width: 480px) {
          .settings-tab {
            padding: 0.55rem 0.625rem;
            font-size: 0.775rem;
          }
        }

        /* API Keys table */
        .api-keys-table-wrap {
          overflow-x: auto;
          margin: 0 -0.25rem;
        }
        .api-keys-table {
          width: 100%;
          /* border-collapse: separate is required for position:sticky on
             <td> to actually work — collapse silently breaks sticky in
             every browser. */
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.85rem;
        }
        .api-keys-table thead th {
          border-bottom: 2px solid var(--border-color);
        }
        .api-keys-table tbody td {
          border-bottom: 1px solid var(--border-color);
        }
        .api-keys-table thead tr {
          text-align: left;
        }
        .api-keys-table th {
          padding: 0.5rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .api-keys-table td {
          padding: 0.5rem;
          vertical-align: middle;
        }
        .api-keys-name-cell {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .api-keys-key-cell {
          white-space: nowrap;
        }
        .api-keys-key-cell code {
          font-size: 0.78rem;
          background: var(--bg-secondary);
          padding: 0.15rem 0.35rem;
          border-radius: 3px;
        }
        /* Action column sticks to the right edge so Revoke is always
           reachable even when the table needs to scroll horizontally.
           Requires border-collapse: separate on the parent table. */
        .api-keys-table .api-keys-action-col {
          position: sticky;
          right: 0;
          background: var(--bg-primary);
          padding-left: 0.75rem;
          box-shadow: -4px 0 6px -4px rgba(0, 0, 0, 0.08);
        }
        .api-keys-table th.api-keys-action-col {
          background: var(--bg-primary);
        }
        .api-keys-webhook-cell {
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .api-keys-webhook-url {
          font-size: 0.8rem;
          max-width: 160px;
          display: inline-block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          vertical-align: middle;
        }
        .api-keys-date-cell {
          color: var(--text-secondary);
          white-space: nowrap;
          font-size: 0.8rem;
        }
        .api-keys-action-col {
          text-align: right;
          white-space: nowrap;
          width: 1%;
        }
        .api-keys-mini-btn {
          font-size: 0.72rem;
          padding: 0.25rem 0.5rem;
          line-height: 1.2;
        }
        .api-keys-webhook-cell .api-keys-mini-btn {
          margin-left: 0.35rem;
        }
        .api-keys-dash {
          font-size: 0.8rem;
        }
        .api-keys-revoked {
          color: var(--text-secondary);
          font-size: 0.75rem;
        }

        @media (max-width: 1024px) {
          .api-keys-table .api-keys-extra {
            display: none;
          }
        }

        /* API key created — post-create copy panel */
        .api-key-created-card {
          margin-bottom: 1rem;
          padding: 1.25rem;
          background: var(--bg-secondary);
          border: 1px solid var(--primary-color);
          border-radius: var(--radius-md);
        }
        .api-key-created-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          color: var(--primary-color);
        }
        .api-key-created-header strong {
          font-size: 0.9rem;
        }
        .api-key-created-row {
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }
        .api-key-created-value {
          flex: 1;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          padding: 0.625rem 0.75rem;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          word-break: break-all;
          user-select: all;
          line-height: 1.4;
          display: flex;
          align-items: center;
        }
        .api-key-copy-action {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          white-space: nowrap;
        }
        .api-key-copy-icon {
          flex-shrink: 0;
        }
        .api-key-dismiss-action {
          margin-top: 0.75rem;
          width: 100%;
        }
        @media (max-width: 600px) {
          .api-key-created-row {
            flex-direction: column;
          }
          .api-key-copy-action {
            justify-content: center;
          }
        }
      </style>
      ${renderBottomNav('/settings')}
    `;

    this.attachEventListeners();
    this.attachTabListeners();

    // Apply custom favicon if set
    if (this.profile?.favicon_url) {
      this.applyFavicon(this.profile.favicon_url, this.profile?.favicon_white_bg);
    }
  }

  renderActiveTab() {
    switch (this.activeTab) {
      case 'profile':
        return this.renderProfileTab();
      case 'billing':
        return this.renderBillingTab();
      case 'branding':
        return this.renderBrandingTab();
      case 'account':
        return this.renderAccountTab();
      case 'api':
        return this.renderApiTab();
      default:
        return this.renderProfileTab();
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Render new tab content
    const tabContent = document.getElementById('settings-tab-content');
    tabContent.innerHTML = this.renderActiveTab();

    // Attach listeners for the new tab
    this.attachTabContentListeners();

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
  }

  attachTabListeners() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    // Attach listeners for initial tab
    this.attachTabContentListeners();
  }

  attachTabContentListeners() {
    switch (this.activeTab) {
      case 'profile':
        this.attachProfileTabListeners();
        break;
      case 'billing':
        this.attachBillingTabListeners();
        break;
      case 'branding':
        this.attachBrandingTabListeners();
        break;
      case 'account':
        this.attachAccountTabListeners();
        break;
      case 'api':
        this.attachApiTabListeners();
        break;
    }
  }

  renderProfileTab() {
    const pencilIcon = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink: 0; color: var(--text-tertiary); margin-left: auto;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`;

    return `
      <div class="card" style="margin-bottom: 1rem;">
        <h2>Profile</h2>

        <!-- Avatar -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Photo</label>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div id="avatar-preview" style="
              width: 80px;
              height: 80px;
              border-radius: 50%;
              background: var(--bg-secondary);
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              font-size: 1.5rem;
              font-weight: 600;
              color: var(--text-secondary);
              flex-shrink: 0;
            ">
              ${this.profile?.avatar_url
                ? `<img src="${this.profile.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : this.userInitials
              }
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="btn btn-sm btn-secondary" id="upload-avatar-btn">
                ${this.profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
              </button>
              <button class="btn btn-sm btn-secondary" id="remove-avatar-btn" style="display: ${this.profile?.avatar_url ? 'block' : 'none'};">
                Remove
              </button>
              <input type="file" id="avatar-input" accept="image/*" style="display: none;" />
            </div>
          </div>
          <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.75rem;">Max file size: 2MB</p>
        </div>

        <!-- Name -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.25rem 0;">Name</label>
          <div id="name-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s; display: flex; align-items: center; min-height: 44px; gap: 0.5rem;">
            <span style="flex: 1;">${this.profile?.name || '<span style="color: var(--text-tertiary);">Tap to add</span>'}</span>
            ${pencilIcon}
          </div>
          <div id="name-edit" style="display: none;">
            <input type="text" id="name-input" class="form-input" value="${this.profile?.name || ''}" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-name-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-name-btn">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Email -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.25rem 0;">Email</label>
          <div id="email-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s; display: flex; align-items: center; min-height: 44px; gap: 0.5rem;">
            <span style="flex: 1;">${this.user.email}</span>
            ${pencilIcon}
          </div>
          <div id="email-edit" style="display: none;">
            <input type="email" id="email-input" class="form-input" value="${this.user.email}" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-email-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-email-btn">Cancel</button>
            </div>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.875rem;">You'll need to verify your new email address</p>
          </div>
        </div>

        <!-- Phone Number -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.25rem 0;">Phone Number</label>
          <div id="phone-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s; display: flex; align-items: center; min-height: 44px; gap: 0.5rem;">
            <span style="flex: 1;">
              ${this.profile?.phone_number || '<span style="color: var(--text-tertiary);">Tap to add</span>'}
              ${this.profile?.phone_number && this.profile?.phone_verified ? '<span style="color: var(--success-color); margin-left: 0.5rem; font-size: 0.8125rem;">✓ Verified</span>' : ''}
            </span>
            ${pencilIcon}
          </div>
          <div id="phone-edit" style="display: none;">
            <div id="phone-input-container" style="margin-bottom: 0.5rem;"></div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-phone-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-phone-btn">Cancel</button>
            </div>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.875rem;">You'll need to verify your new phone number</p>
          </div>
          <div id="phone-verify" style="display: none;">
            <p class="text-muted" style="margin: 0 0 0.5rem 0; font-size: 0.875rem;">Enter the 6-digit code we sent to <strong id="phone-verify-number"></strong></p>
            <input type="text" id="phone-code-input" class="form-input" placeholder="123456" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="verify-phone-code-btn">Verify</button>
              <button class="btn btn-sm btn-secondary" id="cancel-phone-verify-btn">Cancel</button>
            </div>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.8125rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
              <a href="#" id="phone-code-resend">Resend code</a>
              <a href="#" id="phone-code-call">Call me instead</a>
            </p>
          </div>
        </div>

        <!-- Organization -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.25rem 0;">Organization</label>
          ${this.organization?.owner_id === this.user?.id ? `
          <div id="org-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s; display: flex; align-items: center; min-height: 44px; gap: 0.5rem;">
            <span style="flex: 1;">${this.organization?.name ? escapeHtml(this.organization.name) : '<span style="color: var(--text-tertiary);">Tap to add</span>'}</span>
            ${pencilIcon}
          </div>
          <div id="org-edit" style="display: none;">
            <input type="text" id="org-input" class="form-input" value="${escapeHtml(this.organization?.name || '')}" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-org-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-org-btn">Cancel</button>
            </div>
          </div>
          <button id="transfer-ownership-btn" style="margin-top: 0.5rem; background: none; border: none; padding: 0.25rem 0; color: var(--primary-color); font-size: 0.8rem; cursor: pointer;">Transfer ownership…</button>` : `
          <div style="padding: 0.5rem; min-height: 44px; display: flex; align-items: center;">
            <span style="flex: 1;">${this.organization?.name ? escapeHtml(this.organization.name) : '—'}</span>
          </div>`}
          <div id="incoming-transfer-mount"></div>
        </div>

        <!-- User ID (subtle, at the bottom of the profile card) -->
        <div class="form-group" style="margin: 0;">
          <label style="font-weight: 600; font-size: 0.8125rem; margin: 0 0 0.375rem 0; color: var(--text-secondary);">User ID</label>
          <code style="
            background: var(--bg-secondary);
            padding: 0.5rem;
            border-radius: var(--radius-sm);
            font-size: 0.7rem;
            color: var(--text-secondary);
            user-select: all;
            display: block;
            word-break: break-all;
          ">${this.user.id}</code>
        </div>
      </div>

      <!-- Phone Numbers (Mobile Only) -->
      <div class="card mobile-only" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 style="margin: 0;">Phone Numbers</h2>
          <button class="btn btn-secondary" onclick="navigateTo('/manage-numbers')">
            Manage Numbers
          </button>
        </div>

        ${this.activeNumbers.length > 0 ? `
          <div class="form-group">
            <strong>Active Numbers:</strong> ${this.activeNumbers.length}
          </div>
          ${this.activeNumbers.map(num => `
            <div class="form-group" style="padding-left: 1rem;">
              ${formatPhoneNumber(num.phone_number)}
            </div>
          `).join('')}
        ` : ''}

        ${this.inactiveNumbers.length > 0 ? `
          <div class="form-group" ${this.activeNumbers.length > 0 ? 'style="margin-top: 1rem;"' : ''}>
            <strong>Inactive Numbers:</strong> ${this.inactiveNumbers.length}
          </div>
          ${this.inactiveNumbers.map(num => `
            <div class="form-group" style="padding-left: 1rem; color: var(--text-secondary);">
              ${formatPhoneNumber(num.phone_number)}
            </div>
          `).join('')}
        ` : ''}

        ${this.activeNumbers.length === 0 && this.inactiveNumbers.length === 0 ? `
          <p class="text-muted">No service numbers configured</p>
        ` : ''}
      </div>

      <!-- External SIP Trunks (Mobile Only) -->
      <div id="external-trunk-settings-container" class="mobile-only" style="margin-bottom: 1rem;"></div>

      <!-- Apps (Mobile Only) -->
      <div class="card mobile-only" style="margin-bottom: 1rem;">
        <h2>Apps & Integrations</h2>
        <p class="text-muted" style="margin-bottom: 1rem;">Connect third-party services to extend your agent's capabilities</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button class="btn btn-secondary btn-full" onclick="navigateTo('/apps')" style="justify-content: flex-start;">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 0.5rem;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
            All Apps & Integrations
          </button>
        </div>
      </div>

      <!-- Team (Mobile Only) -->
      <div class="card mobile-only">
        <h2>Team</h2>
        <p class="text-muted" style="margin-bottom: 1rem;">Manage your team members and permissions</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button class="btn btn-secondary btn-full" onclick="navigateTo('/team')" style="justify-content: flex-start;">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 0.5rem;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            Manage Team
          </button>
        </div>
      </div>
    `;
  }

  attachProfileTabListeners() {
    // Avatar upload/remove
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    const avatarInput = document.getElementById('avatar-input');

    if (uploadAvatarBtn && avatarInput) {
      uploadAvatarBtn.addEventListener('click', () => avatarInput.click());
      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          showToast('Image must be less than 2MB', 'error');
          avatarInput.value = '';
          return;
        }
        uploadAvatarBtn.disabled = true;
        uploadAvatarBtn.textContent = 'Uploading...';
        try {
          const { user } = await getCurrentUser();
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
          const { error: updateError } = await supabase.from('users').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="width: 100%; height: 100%; object-fit: cover;" />`;
          uploadAvatarBtn.textContent = 'Change Photo';
          removeAvatarBtn.style.display = 'block';
          this.cachedData = null;
          clearNavUserCache();
          showToast('Photo updated successfully', 'success');
        } catch (error) {
          console.error('Avatar upload error:', error);
          showToast('Failed to upload photo. Please try again.', 'error');
        } finally {
          uploadAvatarBtn.disabled = false;
          if (uploadAvatarBtn.textContent === 'Uploading...') uploadAvatarBtn.textContent = 'Upload Photo';
          avatarInput.value = '';
        }
      });
    }

    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener('click', async () => {
        removeAvatarBtn.disabled = true;
        removeAvatarBtn.textContent = 'Removing...';
        try {
          const { user } = await getCurrentUser();
          const { profile } = await User.getProfile(user.id);
          const { error: updateError } = await supabase.from('users').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = getInitials(profile?.name, user.email);
          document.getElementById('upload-avatar-btn').textContent = 'Upload Photo';
          removeAvatarBtn.style.display = 'none';
          this.cachedData = null;
          clearNavUserCache();
          showToast('Photo removed successfully', 'success');
        } catch (error) {
          console.error('Avatar remove error:', error);
          showToast('Failed to remove photo. Please try again.', 'error');
        } finally {
          removeAvatarBtn.disabled = false;
          removeAvatarBtn.textContent = 'Remove';
        }
      });
    }

    // Name inline editing
    document.getElementById('name-display')?.addEventListener('click', () => {
      document.getElementById('name-display').style.display = 'none';
      document.getElementById('name-edit').style.display = 'block';
      document.getElementById('name-input').focus();
    });
    document.getElementById('cancel-name-btn')?.addEventListener('click', () => {
      document.getElementById('name-display').style.display = 'block';
      document.getElementById('name-edit').style.display = 'none';
    });
    document.getElementById('save-name-btn')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-name-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        const { user } = await getCurrentUser();
        const { error } = await supabase.from('users').update({ name: document.getElementById('name-input').value, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        showToast('Name updated successfully. Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error('Save name error:', error);
        showToast('Failed to save name. Please try again.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Email inline editing
    document.getElementById('email-display')?.addEventListener('click', () => {
      document.getElementById('email-display').style.display = 'none';
      document.getElementById('email-edit').style.display = 'block';
      document.getElementById('email-input').focus();
    });
    document.getElementById('cancel-email-btn')?.addEventListener('click', () => {
      document.getElementById('email-display').style.display = 'block';
      document.getElementById('email-edit').style.display = 'none';
    });
    document.getElementById('save-email-btn')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-email-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        const { user } = await getCurrentUser();
        const newEmail = document.getElementById('email-input').value;

        // Admin acting on a customer's behalf: go through admin-update-user,
        // which sets the address AND marks it verified in one service-role call.
        // The self-serve path below can't work here — it mails a confirmation
        // link to the customer's inbox, which the admin can't open, so the change
        // would sit unapplied forever. The customer still gets an email telling
        // them it changed (sent to both old and new address).
        const adminToken = getImpersonationAdminToken();
        if (adminToken) {
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'set_email', email: newEmail }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Failed to update email');
          showToast('Email updated and verified. The account holder has been notified.', 'success');
          setTimeout(() => window.location.reload(), 1500);
          return;
        }

        const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
        if (authError) throw authError;
        const { error } = await supabase.from('users').update({ email: newEmail, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        showToast('Email updated. Please check your new email for verification link...', 'success');
        setTimeout(() => navigateTo('/verify-email'), 2000);
      } catch (error) {
        console.error('Save email error:', error);
        showToast(error?.message || 'Failed to save email. Please try again.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Phone inline editing — country-code picker + formatting (same widget as verify-phone)
    document.getElementById('phone-display')?.addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'none';
      document.getElementById('phone-edit').style.display = 'block';
      // Re-create on every open: this.render() replaces the DOM, so a cached
      // instance would point at detached nodes
      this._phonePicker = createPhoneInput(
        document.getElementById('phone-input-container'),
        { initialValue: this.profile?.phone_number || '' }
      );
      this._phonePicker.focus();
    });
    document.getElementById('cancel-phone-btn')?.addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'block';
      document.getElementById('phone-edit').style.display = 'none';
    });
    // Inline phone verification: verify-phone-send texts (or calls with) a code,
    // verify-phone-check confirms it and sets users.phone_verified (service role)
    const phoneVerifyApi = async (fn, payload) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Verification request failed');
      return data;
    };

    const showPhoneVerifyPanel = (phoneNumber) => {
      this._pendingVerifyPhone = phoneNumber;
      document.getElementById('phone-display').style.display = 'none';
      document.getElementById('phone-edit').style.display = 'none';
      document.getElementById('phone-verify').style.display = 'block';
      document.getElementById('phone-verify-number').textContent = phoneNumber;
      document.getElementById('phone-code-input').value = '';
      document.getElementById('phone-code-input').focus();
    };

    document.getElementById('save-phone-btn')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-phone-btn');
      // Picker guarantees E.164 or null; getE164 enforces per-country length
      const newPhone = this._phonePicker ? this._phonePicker.getE164() : null;
      if (!newPhone) {
        showToast('Please enter a valid phone number', 'error');
        return;
      }
      const unchanged = newPhone === (this.profile?.phone_number || null);
      if (unchanged && this.profile?.phone_verified) {
        showToast('No changes made.', 'info');
        document.getElementById('phone-display').style.display = 'block';
        document.getElementById('phone-edit').style.display = 'none';
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        // Admin acting on a customer's behalf: set and verify directly. The SMS
        // code path below is unusable here — the code goes to the customer's
        // handset, which the admin doesn't have, so the number could never be
        // confirmed and would never persist.
        const adminToken = getImpersonationAdminToken();
        if (adminToken) {
          const { user } = await getCurrentUser();
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'set_phone', phone_number: newPhone, phone_verified: true }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Failed to update phone');
          showToast('Phone updated and verified.', 'success');
          setTimeout(() => window.location.reload(), 1200);
          return;
        }

        // Do NOT write users.phone_number here: verify-phone-check persists the
        // number and sets phone_verified only after the code is confirmed. This
        // keeps the existing verified number intact if the send fails or the user
        // abandons verification (no rollback needed, no stale-badge on Cancel).
        await phoneVerifyApi('verify-phone-send', { phoneNumber: newPhone });
        showToast(`Verification code sent to ${newPhone}`, 'success');
        showPhoneVerifyPanel(newPhone);
      } catch (error) {
        console.error('Send verification error:', error);
        showToast(error.message || 'Failed to send verification code. Please try again.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    const verifyPhoneCode = async () => {
      const verifyBtn = document.getElementById('verify-phone-code-btn');
      const code = document.getElementById('phone-code-input').value.trim();
      if (!/^\d{6}$/.test(code)) {
        showToast('Please enter the 6-digit code', 'error');
        return;
      }
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
      try {
        await phoneVerifyApi('verify-phone-check', { phoneNumber: this._pendingVerifyPhone, code });
        showToast('Phone number verified!', 'success');
        this.cachedData = null;
        this.render();
      } catch (error) {
        console.error('Verify phone error:', error);
        showToast(error.message || 'Invalid code. Please try again.', 'error');
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
      }
    };
    document.getElementById('verify-phone-code-btn')?.addEventListener('click', verifyPhoneCode);
    document.getElementById('phone-code-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); verifyPhoneCode(); }
    });
    document.getElementById('cancel-phone-verify-btn')?.addEventListener('click', () => {
      document.getElementById('phone-verify').style.display = 'none';
      document.getElementById('phone-display').style.display = 'flex';
    });
    document.getElementById('phone-code-resend')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await phoneVerifyApi('verify-phone-send', { phoneNumber: this._pendingVerifyPhone });
        showToast('Verification code resent', 'success');
      } catch (error) {
        showToast(error.message || 'Failed to resend code', 'error');
      }
    });
    document.getElementById('phone-code-call')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await phoneVerifyApi('verify-phone-send', { phoneNumber: this._pendingVerifyPhone, channel: 'voice' });
        showToast(`Calling ${this._pendingVerifyPhone} with your code now`, 'success');
      } catch (error) {
        showToast(error.message || 'Failed to start verification call', 'error');
      }
    });

    // Organization inline editing
    document.getElementById('org-display')?.addEventListener('click', () => {
      document.getElementById('org-display').style.display = 'none';
      document.getElementById('org-edit').style.display = 'block';
      document.getElementById('org-input').focus();
    });
    document.getElementById('cancel-org-btn')?.addEventListener('click', () => {
      document.getElementById('org-display').style.display = 'block';
      document.getElementById('org-edit').style.display = 'none';
    });
    document.getElementById('save-org-btn')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-org-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        if (!this.organization?.id) throw new Error('No organization found');
        // Only the org owner can rename it (a user can belong to a team they
        // don't own). The edit UI is already hidden for non-owners; this is the
        // defensive backstop.
        if (this.organization?.owner_id !== this.user?.id) {
          throw new Error('Only the organization owner can rename it');
        }
        const newName = document.getElementById('org-input').value.trim();
        if (!newName) throw new Error('Organization name cannot be empty');
        const { error } = await Organization.update(this.organization.id, { name: newName });
        if (error) throw error;
        document.getElementById('org-display').textContent = newName;
        document.getElementById('org-display').style.display = 'block';
        document.getElementById('org-edit').style.display = 'none';
        this.organization.name = newName;
        if (this.cachedData) this.cachedData.organization = this.organization;
        showToast('Organization name updated successfully', 'success');
      } catch (error) {
        console.error('Save org error:', error);
        showToast(error.message || 'Failed to save organization name. Please try again.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // ── Organization ownership transfer (#114) ──────────────────────────
    const callTransferFn = async (fn, body) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Request failed');
      return data;
    };

    // Owner initiates a transfer.
    document.getElementById('transfer-ownership-btn')?.addEventListener('click', () => {
      const orgLabel = this.organization?.name ? `"${escapeHtml(this.organization.name)}"` : 'this organization';
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:var(--bg-primary);border-radius:var(--radius-lg);padding:1.5rem;max-width:420px;width:100%;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
          <h2 style="margin:0 0 0.5rem;font-size:1.1rem;">Transfer ownership</h2>
          <p style="margin:0 0 1rem;font-size:0.85rem;color:var(--text-secondary);">The new owner must accept before anything changes. You'll become an editor of ${orgLabel}.</p>
          <label class="form-label">New owner's email</label>
          <input type="email" id="transfer-email-input" class="form-input" placeholder="person@example.com" style="margin-bottom:0.75rem;" />
          <label style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.85rem;line-height:1.4;">
            <input type="checkbox" id="transfer-billing-check" style="margin-top:0.15rem;" />
            <span>Also move billing (your paid plan &amp; Stripe subscription) to the new owner. If you're on the free plan this has no effect.</span>
          </label>
          <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem;">
            <button class="btn btn-secondary" id="transfer-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="transfer-send-btn">Send request</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('#transfer-cancel-btn').addEventListener('click', close);
      overlay.querySelector('#transfer-send-btn').addEventListener('click', async () => {
        const btn = overlay.querySelector('#transfer-send-btn');
        const email = overlay.querySelector('#transfer-email-input').value.trim();
        if (!email) { showToast("Enter the new owner's email", 'error'); return; }
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
          await callTransferFn('org-transfer-initiate', {
            toEmail: email,
            moveBilling: overlay.querySelector('#transfer-billing-check').checked,
          });
          showToast('Transfer request sent — awaiting their confirmation', 'success');
          close();
        } catch (e) {
          showToast(e.message || 'Failed to send request', 'error');
          btn.disabled = false; btn.textContent = 'Send request';
        }
      });
    });

    // Recipient sees a prompt if there's a pending incoming transfer.
    (async () => {
      try {
        if (!this.user?.id) return;
        const { data: incoming } = await supabase
          .from('organization_ownership_transfers')
          .select('id, move_billing, organizations(name)')
          .eq('to_user_id', this.user.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle();
        const mount = document.getElementById('incoming-transfer-mount');
        if (!incoming || !mount) return;
        // Escape: the org name is set by the initiator (a different user) and
        // rendered in the recipient's browser — must not allow HTML injection.
        const orgName = escapeHtml(incoming.organizations?.name || 'an organization');
        mount.innerHTML = `
          <div style="margin-top:0.75rem;padding:0.75rem;border:1px solid var(--primary-color);border-radius:var(--radius-md);background:var(--bg-secondary);">
            <div style="font-size:0.85rem;margin-bottom:0.5rem;">You've been offered ownership of <strong>${orgName}</strong>${incoming.move_billing ? ' (including billing)' : ''}.</div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn btn-sm btn-primary" id="incoming-accept-btn">Accept</button>
              <button class="btn btn-sm btn-secondary" id="incoming-decline-btn">Decline</button>
            </div>
          </div>`;
        const respond = async (action) => {
          mount.querySelectorAll('button').forEach(b => { b.disabled = true; });
          try {
            await callTransferFn('org-transfer-respond', { transferId: incoming.id, action });
            showToast(action === 'accept' ? 'You are now the owner' : 'Transfer declined', 'success');
            this.cachedData = null;
            setTimeout(() => window.location.reload(), 800);
          } catch (e) {
            showToast(e.message || 'Failed', 'error');
            mount.querySelectorAll('button').forEach(b => { b.disabled = false; });
          }
        };
        mount.querySelector('#incoming-accept-btn').addEventListener('click', () => respond('accept'));
        mount.querySelector('#incoming-decline-btn').addEventListener('click', () => respond('decline'));
      } catch (e) { console.error('incoming ownership transfer check failed', e); }
    })();

    // Initialize External SIP Trunk Settings (mobile only)
    const externalTrunkContainer = document.getElementById('external-trunk-settings-container');
    if (externalTrunkContainer && window.innerWidth <= 768) {
      createExternalTrunkSettings('external-trunk-settings-container');
    }
  }

  renderBillingTab() {
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <h2>Credits & Billing</h2>
        <div id="billing-section">
          ${!this.profile?.received_signup_bonus ? `
          <!-- Free Credits Offer Banner -->
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem; color: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
              <div>
                <div style="font-weight: 700; font-size: 1.25rem; margin-bottom: 0.25rem;">
                  Get $20 Free Credits!
                </div>
                <div style="font-size: 0.875rem; opacity: 0.9;">
                  Add a payment method and enable auto-recharge to get your $20 welcome bonus. You won't be charged until your free credits run out.
                </div>
              </div>
              <button class="btn" id="claim-bonus-btn" style="background: white; color: #6366f1; font-weight: 600; white-space: nowrap;">
                Claim $20 Free
              </button>
            </div>
          </div>
          ` : ''}

          ${this.profile?.has_payment_method ? `
          <!-- Payment Method on File -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              ${this.profile?.card_brand === 'link' ? '<img src="/images/stripe-link.png" alt="Link" style="width: 72px; height: auto; border-radius: 6px;">' : '<div style="width: 36px; height: 24px; background: white; border: 1px solid var(--border-color); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.625rem; font-weight: 700; color: #1a1f36; text-transform: uppercase;">' + (this.profile?.card_brand || 'Card') + '</div>'}
              <div>
                <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">${this.profile?.card_last4 ? ((this.profile?.card_brand || 'Card').charAt(0).toUpperCase() + (this.profile?.card_brand || 'card').slice(1) + ' •••• ' + this.profile.card_last4) : (this.profile?.card_brand === 'link' ? 'Stripe Link' : ((this.profile?.card_brand || 'Payment method').charAt(0).toUpperCase() + (this.profile?.card_brand || 'payment method').slice(1)))}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary);">Payment method on file</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="manage-card-btn" style="font-size: 0.75rem;">Manage</button>
          </div>
          ` : ''}

          ${this.renderBonusCreditsCard()}

          <!-- Auto-Recharge Settings -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <div>
                <h3 style="margin: 0; font-size: 1rem;">Auto-Recharge</h3>
                <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.75rem;">Automatically add credits when your balance is low</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="auto-recharge-enabled" ${this.profile?.auto_recharge_enabled ? 'checked' : ''} ${!this.profile?.has_payment_method ? 'disabled' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>

            ${!this.profile?.has_payment_method ? `
              <div style="background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.75rem;">
                <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--warning-text, #856404);">
                  Add a payment method to enable auto-recharge.
                </p>
                <button class="btn btn-sm btn-secondary" id="setup-payment-btn">Add Payment Method</button>
              </div>
            ` : ''}

            <div id="auto-recharge-settings" style="${this.profile?.auto_recharge_enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
              <div class="form-group" style="margin-bottom: 0.75rem;">
                <label for="recharge-threshold" style="font-size: 0.875rem;">Recharge when balance falls below:</label>
                <select id="recharge-threshold" class="form-input">
                  <option value="5" ${(this.profile?.auto_recharge_threshold ?? 5) == 5 ? 'selected' : ''}>$5</option>
                  <option value="10" ${this.profile?.auto_recharge_threshold == 10 ? 'selected' : ''}>$10</option>
                  <option value="20" ${this.profile?.auto_recharge_threshold == 20 ? 'selected' : ''}>$20</option>
                  <option value="50" ${this.profile?.auto_recharge_threshold == 50 ? 'selected' : ''}>$50</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="recharge-amount" style="font-size: 0.875rem;">Amount to add:</label>
                <select id="recharge-amount" class="form-input">
                  <option value="20" ${this.profile?.auto_recharge_amount == 20 ? 'selected' : ''}>$20</option>
                  <option value="50" ${(this.profile?.auto_recharge_amount ?? 50) == 50 ? 'selected' : ''}>$50</option>
                  <option value="100" ${this.profile?.auto_recharge_amount == 100 ? 'selected' : ''}>$100</option>
                  <option value="200" ${this.profile?.auto_recharge_amount == 200 ? 'selected' : ''}>$200</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Credits Balance -->
          <div class="credits-balance" style="display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: 1rem;">
            <div>
              <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Current Balance</div>
              <div style="font-weight: 700; font-size: 2rem; color: var(--text-primary);">
                $${(this.profile?.credits_balance ?? 20).toFixed(2)}
              </div>
              <div style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 0.25rem;">
                Used this period: $${(this.profile?.credits_used_this_period ?? 0).toFixed(2)}
              </div>
            </div>
            <button class="btn btn-primary" id="add-credits-btn">
              Add Credits
            </button>
          </div>

          <!-- Add Credits Options -->
          <div id="credits-options" style="display: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
            <h3 style="margin: 0 0 1rem 0; font-size: 1rem;">Select Amount</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
              <button class="btn btn-secondary credit-amount-btn" data-amount="20" style="padding: 1rem; font-size: 1rem;">$20</button>
              <button class="btn btn-secondary credit-amount-btn" data-amount="50" style="padding: 1rem; font-size: 1rem;">$50</button>
              <button class="btn btn-secondary credit-amount-btn" data-amount="100" style="padding: 1rem; font-size: 1rem;">$100</button>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label for="custom-amount" style="font-size: 0.875rem;">Or enter custom amount ($10-$1000):</label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="number" id="custom-amount" class="form-input" min="10" max="1000" step="1" placeholder="Enter amount" style="flex: 1;" />
                <button class="btn btn-primary" id="add-custom-credits-btn">Add</button>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="cancel-credits-btn" style="width: 100%;">Cancel</button>
          </div>

          <!-- Redeem Coupon Code -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
            <h3 style="margin: 0 0 0.25rem 0; font-size: 1rem;">Redeem a Code</h3>
            <p class="text-muted" style="margin: 0 0 0.75rem 0; font-size: 0.75rem;">Have a coupon code? Redeem it for free credits.</p>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="coupon-code-input" class="form-input" placeholder="Enter coupon code" style="flex: 1; text-transform: uppercase;" />
              <button class="btn btn-secondary" id="redeem-coupon-btn">Redeem</button>
            </div>
          </div>

          <!-- Pricing Info -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
            <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Usage Rates</h3>
            <div style="display: grid; gap: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
              <div style="display: flex; justify-content: space-between;">
                <span>Voice calls</span>
                <span>~$0.05-0.20/min</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>SMS messages</span>
                <span>$0.01/msg</span>
              </div>
            </div>
            <p class="text-muted" style="margin: 0.75rem 0 0 0; font-size: 0.75rem;">
              Voice rates vary by AI model and voice provider used.
            </p>
          </div>

          <!-- Transaction History -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 0.75rem; flex-wrap: wrap;">
              <h3 style="margin: 0; font-size: 1rem;">Transaction History</h3>
              <input type="text" id="transactions-search" class="form-input" placeholder="Search description or reference..." style="max-width: 250px; font-size: 0.8125rem; padding: 0.375rem 0.625rem;" />
            </div>
            <div id="transactions-container">
              <div id="transactions-loading" style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                Loading transactions...
              </div>
              <div id="transactions-table" style="display: none;">
                <div style="overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 0.8125rem;">
                    <thead>
                      <tr style="border-bottom: 1px solid var(--border-color);">
                        <th style="text-align: left; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Date</th>
                        <th style="text-align: left; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Description</th>
                        <th style="text-align: left; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Reference</th>
                        <th style="text-align: right; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Amount</th>
                        <th style="text-align: right; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Balance</th>
                      </tr>
                    </thead>
                    <tbody id="transactions-tbody"></tbody>
                  </table>
                </div>
                <div id="transactions-pagination" style="display: none; margin-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                  <button class="btn btn-secondary btn-sm" id="tx-prev-btn" disabled>&larr; Prev</button>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span id="tx-page-info" style="font-size: 0.8125rem; color: var(--text-secondary);"></span>
                    <select id="tx-page-size" class="form-input" style="font-size: 0.75rem; padding: 0.25rem 0.375rem; width: auto;">
                      <option value="10">10</option>
                      <option value="25" selected>25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">per page</span>
                  </div>
                  <button class="btn btn-secondary btn-sm" id="tx-next-btn">Next &rarr;</button>
                </div>
              </div>
              <div id="transactions-empty" style="display: none; text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                No transactions found.
              </div>
            </div>
          </div>

          ${this.profile?.stripe_customer_id ? `
          <!-- Receipts & Invoices -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-top: 1rem;">
            <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Receipts & Invoices</h3>
            <div id="receipts-container">
              <div id="receipts-loading" style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                Loading receipts...
              </div>
              <div id="receipts-table" style="display: none;">
                <div style="overflow-x: auto;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 0.8125rem;">
                    <thead>
                      <tr style="border-bottom: 1px solid var(--border-color);">
                        <th style="text-align: left; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Date</th>
                        <th style="text-align: left; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Description</th>
                        <th style="text-align: right; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Amount</th>
                        <th style="text-align: center; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Status</th>
                        <th style="text-align: center; padding: 0.5rem 0.5rem; color: var(--text-secondary); font-weight: 500;">Receipt</th>
                      </tr>
                    </thead>
                    <tbody id="receipts-tbody"></tbody>
                  </table>
                </div>
              </div>
              <div id="receipts-empty" style="display: none; text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                No receipts yet.
              </div>
            </div>
          </div>
          ` : ''}

          ${this.profile?.stripe_customer_id ? `
            <div style="margin-top: 1rem;">
              <button class="btn btn-secondary btn-sm" id="manage-billing-btn">
                Manage Payment Methods
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderBonusCreditsCard() {
    const ccClaimed = this.profile?.cc_bonus_claimed;
    const rechargeClaimed = this.profile?.recharge_bonus_claimed;
    const hasCard = this.profile?.has_payment_method;
    const autoRecharge = this.profile?.auto_recharge_enabled;
    const hasCompletedReferral = this.profile?.has_completed_referral;

    // Count completed items
    const completed = (ccClaimed ? 1 : 0) + (rechargeClaimed ? 1 : 0) + (hasCompletedReferral ? 1 : 0);
    const progressPercent = Math.round((completed / 3) * 100);

    // Don't show if all 3 are claimed
    if (completed === 3) return '';

    // CC item state
    let ccContent;
    if (ccClaimed) {
      ccContent = `<span style="color: #22c55e; font-weight: 600;">Claimed!</span>`;
    } else if (hasCard) {
      ccContent = `<button class="btn btn-sm btn-primary" id="claim-cc-bonus-btn" style="font-size: 0.75rem; padding: 0.25rem 0.75rem;">Claim $10</button>`;
    } else {
      ccContent = `<button class="btn btn-sm btn-secondary" id="bonus-add-card-btn" style="font-size: 0.75rem; padding: 0.25rem 0.75rem;">Add Card</button>`;
    }

    // Recharge item state
    let rechargeContent;
    if (rechargeClaimed) {
      rechargeContent = `<span style="color: #22c55e; font-weight: 600;">Claimed!</span>`;
    } else if (autoRecharge) {
      rechargeContent = `<button class="btn btn-sm btn-primary" id="claim-recharge-bonus-btn" style="font-size: 0.75rem; padding: 0.25rem 0.75rem;">Claim $10</button>`;
    } else {
      rechargeContent = `<span style="color: var(--text-secondary); font-size: 0.75rem;">Enable above to claim</span>`;
    }

    // Referral item state
    let referralContent;
    if (hasCompletedReferral) {
      referralContent = `<span style="color: #22c55e; font-weight: 600;">Earned!</span>`;
    } else {
      referralContent = `<button class="btn btn-sm btn-secondary" id="copy-referral-link-btn" style="font-size: 0.75rem; padding: 0.25rem 0.75rem;">Copy Invite Link</button>`;
    }

    return `
      <!-- Earn Bonus Credits -->
      <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h3 style="margin: 0; font-size: 1rem;">Earn Bonus Credits</h3>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${completed}/3 completed</span>
        </div>

        <!-- Progress bar -->
        <div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; margin-bottom: 1rem; overflow: hidden;">
          <div style="height: 100%; width: ${progressPercent}%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 3px; transition: width 0.3s ease;"></div>
        </div>

        <!-- Checklist -->
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <!-- 1. Add Credit Card -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; ${ccClaimed ? 'background: #22c55e; color: white;' : 'background: var(--bg-secondary); color: var(--text-secondary);'}">${ccClaimed ? '&#10003;' : '1'}</span>
              <div>
                <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Add a credit card</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">+$10 bonus</div>
              </div>
            </div>
            ${ccContent}
          </div>

          <!-- 2. Enable Auto-Recharge -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; ${rechargeClaimed ? 'background: #22c55e; color: white;' : 'background: var(--bg-secondary); color: var(--text-secondary);'}">${rechargeClaimed ? '&#10003;' : '2'}</span>
              <div>
                <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Enable auto-recharge</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">+$10 bonus</div>
              </div>
            </div>
            ${rechargeContent}
          </div>

          <!-- 3. Invite a Friend -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; ${hasCompletedReferral ? 'background: #22c55e; color: white;' : 'background: var(--bg-secondary); color: var(--text-secondary);'}">${hasCompletedReferral ? '&#10003;' : '3'}</span>
              <div>
                <div style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Invite a friend</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">+$10 for you, +$10 for them</div>
              </div>
            </div>
            ${referralContent}
          </div>
        </div>

        <p style="margin: 0.75rem 0 0 0; font-size: 0.7rem; color: var(--text-secondary);">
          Referral bonus is awarded after your friend makes 5 minutes of calls.
        </p>
      </div>
    `;
  }

  attachBillingTabListeners() {
    const addCreditsBtn = document.getElementById('add-credits-btn');
    const creditsOptions = document.getElementById('credits-options');
    const cancelCreditsBtn = document.getElementById('cancel-credits-btn');
    const creditAmountBtns = document.querySelectorAll('.credit-amount-btn');
    const addCustomCreditsBtn = document.getElementById('add-custom-credits-btn');
    const setupPaymentBtn = document.getElementById('setup-payment-btn');
    const manageBillingBtn = document.getElementById('manage-billing-btn');
    const manageCardBtn = document.getElementById('manage-card-btn');
    const autoRechargeEnabled = document.getElementById('auto-recharge-enabled');
    const autoRechargeSettings = document.getElementById('auto-recharge-settings');
    const rechargeThreshold = document.getElementById('recharge-threshold');
    const rechargeAmount = document.getElementById('recharge-amount');
    const claimBonusBtn = document.getElementById('claim-bonus-btn');

    if (addCreditsBtn && creditsOptions) {
      addCreditsBtn.addEventListener('click', () => {
        creditsOptions.style.display = 'block';
        addCreditsBtn.style.display = 'none';
      });
    }

    if (cancelCreditsBtn && creditsOptions && addCreditsBtn) {
      cancelCreditsBtn.addEventListener('click', () => {
        creditsOptions.style.display = 'none';
        addCreditsBtn.style.display = 'block';
      });
    }

    creditAmountBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const amount = parseInt(btn.dataset.amount);
        await this.purchaseCredits(amount);
      });
    });

    if (addCustomCreditsBtn) {
      addCustomCreditsBtn.addEventListener('click', async () => {
        const customInput = document.getElementById('custom-amount');
        const amount = parseInt(customInput.value);
        if (amount >= 10 && amount <= 1000) {
          await this.purchaseCredits(amount);
        } else {
          showToast('Please enter an amount between $10 and $1000', 'error');
        }
      });
    }

    if (setupPaymentBtn) {
      setupPaymentBtn.addEventListener('click', async () => {
        setupPaymentBtn.disabled = true;
        setupPaymentBtn.textContent = 'Loading...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-setup-payment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: `${window.location.origin}/settings?payment_method=success&tab=billing` })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create setup session');
          window.location.href = data.url;
        } catch (error) {
          console.error('Setup payment error:', error);
          showToast('Failed to setup payment method. Please try again.', 'error');
          setupPaymentBtn.disabled = false;
          setupPaymentBtn.textContent = 'Add Payment Method';
        }
      });
    }

    if (claimBonusBtn) {
      claimBonusBtn.addEventListener('click', async () => {
        claimBonusBtn.disabled = true;
        claimBonusBtn.textContent = 'Loading...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-setup-payment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: `${window.location.origin}/settings?payment_method=success&bonus_claimed=true&tab=billing` })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create setup session');
          window.location.href = data.url;
        } catch (error) {
          console.error('Claim bonus error:', error);
          showToast('Failed to setup payment method. Please try again.', 'error');
          claimBonusBtn.disabled = false;
          claimBonusBtn.textContent = 'Claim $20 Free';
        }
      });
    }

    if (manageBillingBtn) {
      manageBillingBtn.addEventListener('click', async () => {
        manageBillingBtn.disabled = true;
        manageBillingBtn.textContent = 'Loading...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-portal`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: `${window.location.origin}/settings?tab=billing` })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create portal session');
          window.location.href = data.url;
        } catch (error) {
          console.error('Billing portal error:', error);
          showToast('Failed to open billing portal. Please try again.', 'error');
          manageBillingBtn.disabled = false;
          manageBillingBtn.textContent = 'Manage Payment Methods';
        }
      });
    }

    if (manageCardBtn) {
      manageCardBtn.addEventListener('click', async () => {
        manageCardBtn.disabled = true;
        manageCardBtn.textContent = 'Loading...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-portal`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: `${window.location.origin}/settings?tab=billing` })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create portal session');
          window.location.href = data.url;
        } catch (error) {
          console.error('Billing portal error:', error);
          showToast('Failed to open billing portal. Please try again.', 'error');
          manageCardBtn.disabled = false;
          manageCardBtn.textContent = 'Manage';
        }
      });
    }

    if (autoRechargeEnabled && autoRechargeSettings) {
      autoRechargeEnabled.addEventListener('change', async () => {
        const isEnabled = autoRechargeEnabled.checked;
        autoRechargeSettings.style.opacity = isEnabled ? '1' : '0.5';
        autoRechargeSettings.style.pointerEvents = isEnabled ? 'auto' : 'none';
        try {
          const { user } = await getCurrentUser();
          await supabase.from('users').update({ auto_recharge_enabled: isEnabled }).eq('id', user.id);
          this.profile.auto_recharge_enabled = isEnabled;
          showToast(isEnabled ? 'Auto-recharge enabled' : 'Auto-recharge disabled', 'success');
        } catch (error) {
          console.error('Auto-recharge toggle error:', error);
          autoRechargeEnabled.checked = !isEnabled;
        }
      });
    }

    const saveAutoRechargeSettings = async () => {
      try {
        const { user } = await getCurrentUser();
        await supabase.from('users').update({
          auto_recharge_threshold: parseFloat(rechargeThreshold.value),
          auto_recharge_amount: parseFloat(rechargeAmount.value)
        }).eq('id', user.id);
      } catch (error) {
        console.error('Save auto-recharge settings error:', error);
      }
    };

    if (rechargeThreshold) rechargeThreshold.addEventListener('change', saveAutoRechargeSettings);
    if (rechargeAmount) rechargeAmount.addEventListener('change', saveAutoRechargeSettings);

    // Redeem coupon code
    const redeemCouponBtn = document.getElementById('redeem-coupon-btn');
    const couponCodeInput = document.getElementById('coupon-code-input');
    if (redeemCouponBtn && couponCodeInput) {
      const redeemCoupon = async () => {
        const code = couponCodeInput.value.trim();
        if (!code) {
          showToast('Please enter a coupon code', 'error');
          return;
        }
        redeemCouponBtn.disabled = true;
        redeemCouponBtn.textContent = 'Redeeming...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-coupon`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          const data = await response.json();
          if (!response.ok) {
            // Most coupons require a card on file (fraud guard) — point the user at setup
            if (data.code === 'payment_method_required') {
              showToast('Add a payment method first, then redeem your code.', 'error');
              document.getElementById('setup-payment-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              redeemCouponBtn.disabled = false;
              redeemCouponBtn.textContent = 'Redeem';
              return;
            }
            throw new Error(data.error || 'Could not redeem coupon');
          }
          showToast(`$${Number(data.amount).toFixed(2)} in credits added to your account!`, 'success');
          this.cachedData = null; // Force refresh
          this.render();
        } catch (error) {
          console.error('Redeem coupon error:', error);
          showToast(error.message || 'Failed to redeem coupon', 'error');
          redeemCouponBtn.disabled = false;
          redeemCouponBtn.textContent = 'Redeem';
        }
      };
      redeemCouponBtn.addEventListener('click', redeemCoupon);
      couponCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); redeemCoupon(); }
      });
    }

    // Bonus credits card listeners
    const claimCcBonusBtn = document.getElementById('claim-cc-bonus-btn');
    const claimRechargeBonusBtn = document.getElementById('claim-recharge-bonus-btn');
    const bonusAddCardBtn = document.getElementById('bonus-add-card-btn');
    const copyReferralLinkBtn = document.getElementById('copy-referral-link-btn');

    if (claimCcBonusBtn) {
      claimCcBonusBtn.addEventListener('click', async () => {
        claimCcBonusBtn.disabled = true;
        claimCcBonusBtn.textContent = 'Claiming...';
        try {
          const { user } = await getCurrentUser();
          const { data, error } = await supabase.rpc('claim_cc_bonus', { p_user_id: user.id });
          if (error) throw error;
          if (data?.success) {
            showToast('$10 bonus credited to your account!', 'success');
            this.cachedData = null; // Force refresh
            this.render();
          } else {
            showToast(data?.error || 'Could not claim bonus', 'error');
            claimCcBonusBtn.disabled = false;
            claimCcBonusBtn.textContent = 'Claim $10';
          }
        } catch (error) {
          console.error('Claim CC bonus error:', error);
          showToast('Failed to claim bonus. Please try again.', 'error');
          claimCcBonusBtn.disabled = false;
          claimCcBonusBtn.textContent = 'Claim $10';
        }
      });
    }

    if (claimRechargeBonusBtn) {
      claimRechargeBonusBtn.addEventListener('click', async () => {
        claimRechargeBonusBtn.disabled = true;
        claimRechargeBonusBtn.textContent = 'Claiming...';
        try {
          const { user } = await getCurrentUser();
          const { data, error } = await supabase.rpc('claim_recharge_bonus', { p_user_id: user.id });
          if (error) throw error;
          if (data?.success) {
            showToast('$10 bonus credited to your account!', 'success');
            this.cachedData = null;
            this.render();
          } else {
            showToast(data?.error || 'Could not claim bonus', 'error');
            claimRechargeBonusBtn.disabled = false;
            claimRechargeBonusBtn.textContent = 'Claim $10';
          }
        } catch (error) {
          console.error('Claim recharge bonus error:', error);
          showToast('Failed to claim bonus. Please try again.', 'error');
          claimRechargeBonusBtn.disabled = false;
          claimRechargeBonusBtn.textContent = 'Claim $10';
        }
      });
    }

    if (bonusAddCardBtn) {
      bonusAddCardBtn.addEventListener('click', async () => {
        bonusAddCardBtn.disabled = true;
        bonusAddCardBtn.textContent = 'Loading...';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-setup-payment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ returnUrl: `${window.location.origin}/settings?payment_method=success&tab=billing` })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create setup session');
          window.location.href = data.url;
        } catch (error) {
          console.error('Bonus add card error:', error);
          showToast('Failed to setup payment method. Please try again.', 'error');
          bonusAddCardBtn.disabled = false;
          bonusAddCardBtn.textContent = 'Add Card';
        }
      });
    }

    if (copyReferralLinkBtn) {
      copyReferralLinkBtn.addEventListener('click', async () => {
        try {
          let code = this.profile?.referral_code;
          // Generate code if not exists
          if (!code) {
            const { user } = await getCurrentUser();
            const { data, error } = await supabase.rpc('generate_referral_code', { p_user_id: user.id });
            if (error) throw error;
            code = data;
          }
          const referralUrl = `https://magpipe.ai/signup?ref=${code}`;
          await navigator.clipboard.writeText(referralUrl);
          showToast('Referral link copied to clipboard!', 'success');
          copyReferralLinkBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (copyReferralLinkBtn) copyReferralLinkBtn.textContent = 'Copy Invite Link';
          }, 2000);
        } catch (error) {
          console.error('Copy referral link error:', error);
          showToast('Failed to copy link. Please try again.', 'error');
        }
      });
    }

    // --- Transaction History ---
    this.txPage = 0;
    this.txPageSize = 25;
    this.txSearch = '';
    this.loadTransactions();

    const txSearchInput = document.getElementById('transactions-search');
    let txSearchTimer;
    if (txSearchInput) {
      txSearchInput.addEventListener('input', () => {
        clearTimeout(txSearchTimer);
        txSearchTimer = setTimeout(() => {
          this.txSearch = txSearchInput.value.trim();
          this.txPage = 0;
          this.loadTransactions();
        }, 300);
      });
    }

    const txPrevBtn = document.getElementById('tx-prev-btn');
    const txNextBtn = document.getElementById('tx-next-btn');
    const txPageSize = document.getElementById('tx-page-size');
    if (txPrevBtn) {
      txPrevBtn.addEventListener('click', () => {
        if (this.txPage > 0) {
          this.txPage--;
          this.loadTransactions();
        }
      });
    }
    if (txNextBtn) {
      txNextBtn.addEventListener('click', () => {
        this.txPage++;
        this.loadTransactions();
      });
    }
    if (txPageSize) {
      txPageSize.addEventListener('change', () => {
        this.txPageSize = parseInt(txPageSize.value);
        this.txPage = 0;
        this.loadTransactions();
      });
    }

    // --- Receipts & Invoices ---
    if (this.profile?.stripe_customer_id) {
      this.loadReceipts();
    }
  }

  async loadTransactions() {
    const pageSize = this.txPageSize || 25;
    try {
      const { user } = await getCurrentUser();
      const from = this.txPage * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('credit_transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (this.txSearch) {
        query = query.or(`description.ilike.%${this.txSearch}%,reference_id.ilike.%${this.txSearch}%`);
      }

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      const loading = document.getElementById('transactions-loading');
      const table = document.getElementById('transactions-table');
      const empty = document.getElementById('transactions-empty');
      const tbody = document.getElementById('transactions-tbody');
      const pagination = document.getElementById('transactions-pagination');
      const prevBtn = document.getElementById('tx-prev-btn');
      const nextBtn = document.getElementById('tx-next-btn');
      const pageInfo = document.getElementById('tx-page-info');

      if (loading) loading.style.display = 'none';

      if (!data || data.length === 0) {
        if (table) table.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
      }

      if (empty) empty.style.display = 'none';
      if (table) table.style.display = 'block';

      const rows = data.map(tx => {
        const date = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const isPositive = tx.amount > 0;
        const amountColor = isPositive ? '#22c55e' : '#ef4444';
        const amountPrefix = isPositive ? '+' : '';
        const refId = tx.reference_id ? tx.reference_id.slice(0, 8) + '...' : '—';
        const refCell = tx.reference_id
          ? `<span class="tx-ref-copy" data-ref="${tx.reference_id}" title="Click to copy: ${tx.reference_id}" style="cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px;">${refId}</span>`
          : '—';
        return `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.5rem; white-space: nowrap; color: var(--text-secondary);">${date}</td>
            <td style="padding: 0.5rem; color: var(--text-primary);">${tx.description || tx.transaction_type}</td>
            <td style="padding: 0.5rem; color: var(--text-secondary); font-family: monospace; font-size: 0.75rem;">${refCell}</td>
            <td style="padding: 0.5rem; text-align: right; font-weight: 600; color: ${amountColor};">${amountPrefix}$${Math.abs(tx.amount).toFixed(2)}</td>
            <td style="padding: 0.5rem; text-align: right; color: var(--text-secondary);">$${Number(tx.balance_after).toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      if (tbody) tbody.innerHTML = rows;

      // Click-to-copy reference IDs (delegate once)
      if (tbody && !tbody.dataset.copyBound) {
        tbody.dataset.copyBound = 'true';
        tbody.addEventListener('click', async (e) => {
          const el = e.target.closest('.tx-ref-copy');
          if (!el) return;
          const ref = el.dataset.ref;
          try {
            await navigator.clipboard.writeText(ref);
            const orig = el.textContent;
            el.textContent = 'Copied!';
            setTimeout(() => { el.textContent = orig; }, 1500);
          } catch {
            showToast('Failed to copy', 'error');
          }
        });
      }

      // Pagination controls
      const totalPages = Math.ceil((count || 0) / pageSize);
      if (pagination) pagination.style.display = totalPages > 1 ? 'flex' : 'none';
      if (prevBtn) prevBtn.disabled = this.txPage === 0;
      if (nextBtn) nextBtn.disabled = this.txPage >= totalPages - 1;
      if (pageInfo) pageInfo.textContent = `Page ${this.txPage + 1} of ${totalPages}`;
    } catch (error) {
      console.error('Load transactions error:', error);
      const loading = document.getElementById('transactions-loading');
      if (loading) loading.textContent = 'Failed to load transactions.';
    }
  }

  async loadReceipts() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-portal`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_invoices' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load receipts');

      const loading = document.getElementById('receipts-loading');
      const table = document.getElementById('receipts-table');
      const empty = document.getElementById('receipts-empty');
      const tbody = document.getElementById('receipts-tbody');

      if (loading) loading.style.display = 'none';

      if (!data.invoices || data.invoices.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }

      if (table) table.style.display = 'block';

      const rows = data.invoices.map(inv => {
        const date = new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const statusBadge = inv.status === 'succeeded'
          ? '<span style="background: #dcfce7; color: #166534; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem;">Paid</span>'
          : `<span style="background: var(--bg-secondary); color: var(--text-secondary); padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem;">${inv.status}</span>`;
        const receiptLink = inv.receipt_url
          ? `<a href="${inv.receipt_url}" target="_blank" rel="noopener" style="color: var(--primary); font-size: 0.8125rem; text-decoration: none;">View Receipt</a>`
          : '—';
        return `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.5rem; white-space: nowrap; color: var(--text-secondary);">${date}</td>
            <td style="padding: 0.5rem; color: var(--text-primary);">${inv.description}</td>
            <td style="padding: 0.5rem; text-align: right; font-weight: 600; color: var(--text-primary);">$${inv.amount.toFixed(2)}</td>
            <td style="padding: 0.5rem; text-align: center;">${statusBadge}</td>
            <td style="padding: 0.5rem; text-align: center;">${receiptLink}</td>
          </tr>
        `;
      }).join('');

      if (tbody) tbody.innerHTML = rows;
    } catch (error) {
      console.error('Load receipts error:', error);
      const loading = document.getElementById('receipts-loading');
      if (loading) loading.textContent = 'Failed to load receipts.';
    }
  }

  renderBrandingTab() {
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <h2>Brand</h2>
        <p class="text-muted" style="margin-bottom: 1rem; font-size: 0.875rem;">Customize your workspace with your own logo and favicon.</p>

        <!-- Logo -->
        <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Logo</label>
          <p class="text-muted" style="font-size: 0.75rem; margin-bottom: 0.75rem;">Displayed in the sidebar navigation. Recommended: 200x50px, PNG or SVG.</p>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div id="logo-preview" style="
              width: 160px;
              height: 40px;
              border-radius: var(--radius-sm);
              background: var(--bg-secondary);
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              font-size: 0.75rem;
              color: var(--text-secondary);
              border: 1px dashed var(--border-color);
            ">
              <img src="${this.profile?.logo_url || '/magpipe-logo.png'}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="btn btn-sm btn-secondary" id="upload-logo-btn">
                ${this.profile?.logo_url ? 'Change Logo' : 'Upload Custom Logo'}
              </button>
              <button class="btn btn-sm btn-secondary" id="remove-logo-btn" style="display: ${this.profile?.logo_url ? 'block' : 'none'};">
                Reset to Default
              </button>
              <input type="file" id="logo-input" accept="image/png,image/svg+xml,image/jpeg" style="display: none;" />
            </div>
          </div>
        </div>

        <!-- Favicon -->
        <div class="form-group">
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Favicon</label>
          <p class="text-muted" style="font-size: 0.75rem; margin-bottom: 0.75rem;">Browser tab icon. Recommended: 32x32px or 64x64px, PNG or ICO.</p>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div id="favicon-preview" style="
              width: 48px;
              height: 48px;
              border-radius: ${this.profile?.favicon_white_bg ? '8px' : 'var(--radius-sm)'};
              background: ${this.profile?.favicon_white_bg ? '#ffffff' : 'var(--bg-secondary)'};
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              font-size: 0.625rem;
              color: var(--text-secondary);
              border: 1px dashed var(--border-color);
            ">
              ${this.profile?.favicon_url
                ? `<img src="${this.profile.favicon_url}" style="width: 32px; height: 32px; object-fit: contain;" />`
                : 'No icon'
              }
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="btn btn-sm btn-secondary" id="upload-favicon-btn">
                ${this.profile?.favicon_url ? 'Change Favicon' : 'Upload Favicon'}
              </button>
              <button class="btn btn-sm btn-secondary" id="remove-favicon-btn" style="display: ${this.profile?.favicon_url ? 'block' : 'none'};">
                Remove
              </button>
              <input type="file" id="favicon-input" accept="image/png,image/x-icon,image/ico" style="display: none;" />
            </div>
          </div>

          <!-- White background option -->
          <div style="display: ${this.profile?.favicon_url ? 'flex' : 'none'}; align-items: center; justify-content: space-between; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);" id="favicon-white-bg-container">
            <div>
              <label style="font-weight: 500; font-size: 0.875rem;">White background</label>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.75rem;">Add white background for transparent icons</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="favicon-white-bg" ${this.profile?.favicon_white_bg ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  attachBrandingTabListeners() {
    // Logo upload/remove
    const uploadLogoBtn = document.getElementById('upload-logo-btn');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    const logoInput = document.getElementById('logo-input');

    if (uploadLogoBtn && logoInput) {
      uploadLogoBtn.addEventListener('click', () => logoInput.click());
      logoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          showToast('Logo must be less than 2MB', 'error');
          logoInput.value = '';
          return;
        }
        uploadLogoBtn.disabled = true;
        uploadLogoBtn.textContent = 'Uploading...';
        try {
          const resizedBlob = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const maxWidth = 140;
              let width = img.width;
              let height = img.height;
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to resize image'));
              }, file.type || 'image/png', 0.9);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
          });
          const { user } = await getCurrentUser();
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/logo-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('brand-assets').upload(fileName, resizedBlob, { cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(fileName);
          const { error: updateError } = await supabase.from('users').update({ logo_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('logo-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
          uploadLogoBtn.textContent = 'Change Logo';
          removeLogoBtn.style.display = 'block';
          this.cachedData = null;
          clearNavUserCache();
          showToast('Logo updated successfully', 'success');
        } catch (error) {
          console.error('Logo upload error:', error);
          showToast('Failed to upload logo. Please try again.', 'error');
        } finally {
          uploadLogoBtn.disabled = false;
          if (uploadLogoBtn.textContent === 'Uploading...') uploadLogoBtn.textContent = 'Upload Logo';
          logoInput.value = '';
        }
      });
    }

    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', async () => {
        removeLogoBtn.disabled = true;
        removeLogoBtn.textContent = 'Removing...';
        try {
          const { user } = await getCurrentUser();
          const { error: updateError } = await supabase.from('users').update({ logo_url: null, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('logo-preview');
          preview.innerHTML = '<img src="/magpipe-logo.png" style="max-width: 100%; max-height: 100%; object-fit: contain;" />';
          document.getElementById('upload-logo-btn').textContent = 'Upload Custom Logo';
          removeLogoBtn.style.display = 'none';
          this.cachedData = null;
          clearNavUserCache();
          showToast('Logo reset to default', 'success');
        } catch (error) {
          console.error('Logo remove error:', error);
          showToast('Failed to remove logo. Please try again.', 'error');
        } finally {
          removeLogoBtn.disabled = false;
          removeLogoBtn.textContent = 'Reset to Default';
        }
      });
    }

    // Favicon upload/remove
    const uploadFaviconBtn = document.getElementById('upload-favicon-btn');
    const removeFaviconBtn = document.getElementById('remove-favicon-btn');
    const faviconInput = document.getElementById('favicon-input');

    if (uploadFaviconBtn && faviconInput) {
      uploadFaviconBtn.addEventListener('click', () => faviconInput.click());
      faviconInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
          showToast('Favicon must be less than 500KB', 'error');
          faviconInput.value = '';
          return;
        }
        uploadFaviconBtn.disabled = true;
        uploadFaviconBtn.textContent = 'Uploading...';
        try {
          const { user } = await getCurrentUser();
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/favicon-${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('brand-assets').upload(fileName, file, { cacheControl: '3600', upsert: false });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(fileName);
          const { error: updateError } = await supabase.from('users').update({ favicon_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('favicon-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="width: 32px; height: 32px; object-fit: contain;" />`;
          uploadFaviconBtn.textContent = 'Change Favicon';
          removeFaviconBtn.style.display = 'block';
          this.updateFavicon(publicUrl);
          this.cachedData = null;
          showToast('Favicon updated successfully', 'success');
        } catch (error) {
          console.error('Favicon upload error:', error);
          showToast('Failed to upload favicon. Please try again.', 'error');
        } finally {
          uploadFaviconBtn.disabled = false;
          if (uploadFaviconBtn.textContent === 'Uploading...') uploadFaviconBtn.textContent = 'Upload Favicon';
          faviconInput.value = '';
        }
      });
    }

    if (removeFaviconBtn) {
      removeFaviconBtn.addEventListener('click', async () => {
        removeFaviconBtn.disabled = true;
        removeFaviconBtn.textContent = 'Removing...';
        try {
          const { user } = await getCurrentUser();
          const { error: updateError } = await supabase.from('users').update({ favicon_url: null, updated_at: new Date().toISOString() }).eq('id', user.id);
          if (updateError) throw updateError;
          const preview = document.getElementById('favicon-preview');
          preview.innerHTML = 'No icon';
          document.getElementById('upload-favicon-btn').textContent = 'Upload Favicon';
          removeFaviconBtn.style.display = 'none';
          this.updateFavicon(null);
          this.cachedData = null;
          showToast('Favicon removed successfully', 'success');
        } catch (error) {
          console.error('Favicon remove error:', error);
          showToast('Failed to remove favicon. Please try again.', 'error');
        } finally {
          removeFaviconBtn.disabled = false;
          removeFaviconBtn.textContent = 'Remove';
        }
      });
    }

    // Favicon white background toggle
    const faviconWhiteBg = document.getElementById('favicon-white-bg');
    if (faviconWhiteBg) {
      faviconWhiteBg.addEventListener('change', async () => {
        const isEnabled = faviconWhiteBg.checked;
        try {
          const { user } = await getCurrentUser();
          await supabase.from('users').update({ favicon_white_bg: isEnabled, updated_at: new Date().toISOString() }).eq('id', user.id);

          // Update the preview background and border-radius
          const preview = document.getElementById('favicon-preview');
          if (preview) {
            preview.style.background = isEnabled ? '#ffffff' : 'var(--bg-secondary)';
            preview.style.borderRadius = isEnabled ? '8px' : 'var(--radius-sm)';
          }

          // Re-apply favicon with new setting
          if (this.profile?.favicon_url) {
            this.profile.favicon_white_bg = isEnabled;
            this.applyFavicon(this.profile.favicon_url, isEnabled);
          }

          this.cachedData = null;
          clearNavUserCache();
          showToast(isEnabled ? 'White background enabled' : 'White background disabled', 'success');
        } catch (error) {
          console.error('Favicon white bg toggle error:', error);
          faviconWhiteBg.checked = !isEnabled;
        }
      });
    }
  }

  renderApiTab() {
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
          <div>
            <h2 style="margin: 0 0 0.25rem 0;">API Keys</h2>
            <p class="text-muted" style="margin: 0; font-size: 0.85rem;">
              Generate keys to authenticate with the Magpipe REST API. Keys are shown once at creation.
            </p>
          </div>
          <button class="btn btn-primary" id="generate-api-key-btn" style="white-space: nowrap;">
            Generate New Key
          </button>
        </div>

        <!-- Generate key form (hidden by default) -->
        <div id="api-key-generate-form" class="hidden" style="margin-bottom: 1rem; padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label" for="api-key-name-input">Key Name</label>
            <input type="text" id="api-key-name-input" class="form-input" placeholder="e.g. Production, CI/CD, Testing" maxlength="64" />
          </div>
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label class="form-label" for="api-key-webhook-input">Webhook URL <span style="font-weight: 400; color: var(--text-secondary);">(optional)</span></label>
            <input type="url" id="api-key-webhook-input" class="form-input" placeholder="https://your-server.com/webhook" maxlength="2048" />
            <p class="form-help">Receives POST events for calls, SMS, and chat sessions.</p>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button class="btn btn-secondary" id="api-key-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="api-key-create-btn">Create</button>
          </div>
        </div>

        <!-- Newly created key display (hidden by default) -->
        <div id="api-key-created-display" class="hidden api-key-created-card">
          <div class="api-key-created-header">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <strong>Copy your API key now — it won't be shown again.</strong>
          </div>
          <div class="api-key-created-row">
            <code id="api-key-full-value" class="api-key-created-value"></code>
            <button class="btn btn-primary api-key-copy-action" id="api-key-copy-btn" type="button">
              <svg class="api-key-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="api-key-copy-label">Copy key</span>
            </button>
          </div>
          <button class="btn btn-secondary api-key-dismiss-action" id="api-key-dismiss-btn" type="button">I've saved it</button>
        </div>

        <!-- Keys list -->
        <div id="api-keys-list">
          <div style="text-align: center; padding: 1rem; color: var(--text-secondary);">Loading...</div>
        </div>
      </div>

      <!-- Webhook Payload Reference -->
      <div class="card">
        <details id="webhook-payload-reference">
          <summary style="cursor: pointer; font-weight: 600; font-size: 1rem; user-select: none;">
            Webhook Payload Reference
          </summary>
          <div style="margin-top: 1rem;">
            <p style="margin: 0 0 0.75rem 0; font-size: 0.85rem; color: var(--text-secondary);">
              Each API key with a webhook URL receives a <code>POST</code> request with <code>Content-Type: application/json</code> when one of the events below fires. Timeout is 10 seconds. Failed deliveries retry up to 5 times with exponential backoff. Each request includes an <code>x-magpipe-signature</code> header containing an HMAC-SHA256 signature of the body, signed with your webhook signing secret.
            </p>
            <p style="margin: 0 0 1rem 0; font-size: 0.85rem; color: var(--text-secondary);">
              Verify: compute <code>HMAC-SHA256(secret, raw_body)</code> and compare to the header value (format: <code>sha256=&lt;hex&gt;</code>). Return <code>410 Gone</code> from your endpoint to permanently stop deliveries.
            </p>

            <p style="margin: 1rem 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">call.completed</p>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">Fires when a voice call ends.</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "event": "call.completed",
  "timestamp": "2026-02-18T15:30:45.123Z",
  "data": {
    "call_record_id": "uuid",
    "direction": "inbound | outbound",
    "caller_number": "+16045551234",
    "service_number": "+16042101966",
    "agent_id": "uuid",
    "agent_name": "Reception Agent",
    "duration_seconds": 127,
    "transcript": "Agent: Hello...\\n\\nCaller: Hi...",
    "summary": "Caller requested a consultation.",
    "extracted_data": { "caller_name": "John" },
    "status": "completed"
  }
}</pre>

            <p style="margin: 1.25rem 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">sms.received</p>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">Fires on every inbound SMS to one of your service numbers (skipped only for content-loop traps).</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "event": "sms.received",
  "timestamp": "2026-02-18T15:30:45.123Z",
  "data": {
    "sms_message_id": "uuid",
    "agent_id": "uuid | null",
    "service_number": "+16042101966",
    "from_number": "+16045551234",
    "to_number": "+16042101966",
    "body": "Hi, can you call me back?",
    "media_urls": [],
    "received_at": "2026-02-18T15:30:45.000Z"
  }
}</pre>

            <p style="margin: 1.25rem 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">sms.sent</p>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">
              Fires on every outbound SMS. The <code>trigger</code> field tells you the source:
              <code>manual</code> (sent from inbox), <code>agent_reply</code> (AI auto-reply),
              <code>notification</code> (owner notification SMS — no <code>sms_message_id</code>; dedup on <code>notification_id</code>),
              <code>api</code> (sent via REST/MCP API).
            </p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "event": "sms.sent",
  "timestamp": "2026-02-18T15:30:46.456Z",
  "data": {
    "sms_message_id": "uuid | null",
    "notification_id": "uuid | undefined",
    "agent_id": "uuid | null",
    "service_number": "+16042101966",
    "from_number": "+16042101966",
    "to_number": "+16045551234",
    "body": "Thanks — we'll be in touch shortly.",
    "trigger": "manual | agent_reply | notification | api",
    "sent_at": "2026-02-18T15:30:46.456Z"
  }
}</pre>

            <p style="margin: 1.25rem 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">chat.session.completed</p>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">
              Fires when a website-chat session closes — either explicitly via <code>close-chat-session</code> or automatically after 30 minutes of inactivity.
            </p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "event": "chat.session.completed",
  "timestamp": "2026-02-18T15:30:45.123Z",
  "data": {
    "chat_session_id": "uuid",
    "widget_id": "uuid",
    "agent_id": "uuid",
    "visitor_id": "uuid",
    "started_at": "2026-02-18T15:00:12.000Z",
    "ended_at": "2026-02-18T15:30:00.000Z",
    "message_count": 8,
    "transcript": [
      { "role": "user", "content": "...", "timestamp": "..." },
      { "role": "assistant", "content": "...", "timestamp": "..." }
    ],
    "summary": "Visitor asked about pricing.",
    "extracted_data": { "email": "user@example.com" },
    "ended_reason": "explicit | inactivity"
  }
}</pre>

            <p style="margin: 1.25rem 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">Field notes</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.5rem;">
              <thead>
                <tr style="text-align: left; border-bottom: 1px solid var(--border-color);">
                  <th style="padding: 0.35rem 0.5rem 0.35rem 0;">Field</th>
                  <th style="padding: 0.35rem 0.5rem;">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>transcript</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null when the agent's PII storage is disabled</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>body</code> <span style="color: var(--text-secondary);">(SMS)</span></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">redacted or null per agent's PII storage setting</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>summary</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null if interaction was too short to summarize</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>extracted_data</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null if no dynamic variables are configured on the agent</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>media_urls</code> <span style="color: var(--text-secondary);">(SMS)</span></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">array of MMS attachment URLs, empty if none</td>
                </tr>
              </tbody>
            </table>

            <p style="margin: 1.25rem 0 0.5rem 0; font-size: 0.8rem; color: var(--text-secondary);">
              <strong>WhatsApp:</strong> inbound WhatsApp messages forward to the per-account webhook URL configured under WhatsApp settings (separate from API key webhooks).
            </p>
          </div>
        </details>
      </div>

      <!-- Voice API Reference -->
      <div class="card" style="margin-top: 1rem;">
        <details>
          <summary style="cursor: pointer; font-weight: 600; font-size: 1rem; user-select: none;">
            Voice API Reference
          </summary>
          <div style="margin-top: 1rem;">
            <p style="margin: 0 0 0.75rem 0; font-size: 0.85rem; color: var(--text-secondary);">
              List available voices and update an agent's voice via the REST API using your API key.
            </p>

            <p style="font-weight: 600; font-size: 0.85rem; margin: 0.75rem 0 0.35rem 0;">List voices</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">POST https://api.magpipe.ai/functions/v1/list-voices
Authorization: Bearer mgp_your_key_here
Content-Type: application/json

{}

// Optional filters:
{ "provider": "elevenlabs" }   // or "openai"
{ "include_builtin": false }   // custom/cloned voices only</pre>

            <p style="font-weight: 600; font-size: 0.85rem; margin: 0.75rem 0 0.35rem 0;">Response</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "voices": [
    { "id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "description": "Soft, American female", "provider": "elevenlabs", "is_custom": false },
    { "id": "openai-alloy",          "name": "Alloy",  "description": "Neutral, professional",  "provider": "openai",      "is_custom": false },
    ...
  ]
}</pre>

            <p style="font-weight: 600; font-size: 0.85rem; margin: 0.75rem 0 0.35rem 0;">Set agent voice</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.5rem 0;">Pass a <code>voice_id</code> from the list above to <code>update-agent</code>:</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">POST https://api.magpipe.ai/functions/v1/update-agent
Authorization: Bearer mgp_your_key_here
Content-Type: application/json

{
  "agent_id": "uuid",
  "voice_id": "EXAVITQu4vr4xnSDxMaL"
}</pre>
          </div>
        </details>
      </div>

      <!-- MCP Server -->
      <div class="card" style="margin-top: 1rem;">
        <div style="margin-bottom: 1rem;">
          <h2 style="margin: 0 0 0.25rem 0;">MCP Server</h2>
          <p class="text-muted" style="margin: 0; font-size: 0.85rem;">
            Connect AI coding tools like Claude Code and Cursor to your Magpipe account. The MCP server exposes your agents, calls, SMS, contacts, and phone numbers as tools.
          </p>
        </div>

        <div style="margin-bottom: 1rem;">
          <p style="font-weight: 600; font-size: 0.85rem; margin: 0 0 0.5rem 0;">1. Install</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.8rem; overflow-x: auto; margin: 0; line-height: 1.5; user-select: all;">npx magpipe-mcp-server</pre>
        </div>

        <div style="margin-bottom: 1rem;">
          <p style="font-weight: 600; font-size: 0.85rem; margin: 0 0 0.5rem 0;">2. Configure Claude Code</p>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.5rem 0;">Add to <code>~/.claude.json</code>:</p>
          <div style="position: relative;">
<pre id="mcp-claude-config" style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "mcpServers": {
    "magpipe": {
      "command": "npx",
      "args": ["-y", "magpipe-mcp-server"],
      "env": {
        "MAGPIPE_API_KEY": "mgp_your_key_here"
      }
    }
  }
}</pre>
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('mcp-claude-config').textContent)" style="position: absolute; top: 0.5rem; right: 0.5rem; font-size: 0.75rem; padding: 0.25rem 0.5rem;">Copy</button>
          </div>
        </div>

        <div>
          <p style="font-weight: 600; font-size: 0.85rem; margin: 0 0 0.5rem 0;">Or configure Cursor</p>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.5rem 0;">Add to <code>.cursor/mcp.json</code>:</p>
          <div style="position: relative;">
<pre id="mcp-cursor-config" style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "mcpServers": {
    "magpipe": {
      "command": "npx",
      "args": ["-y", "magpipe-mcp-server"],
      "env": {
        "MAGPIPE_API_KEY": "mgp_your_key_here"
      }
    }
  }
}</pre>
            <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(document.getElementById('mcp-cursor-config').textContent)" style="position: absolute; top: 0.5rem; right: 0.5rem; font-size: 0.75rem; padding: 0.25rem 0.5rem;">Copy</button>
          </div>
        </div>
      </div>
    `;
  }

  async loadApiKeys() {
    const listContainer = document.getElementById('api-keys-list');
    if (!listContainer) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'list' })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load keys');

      const keys = data.keys || [];

      if (keys.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-secondary);">
            <p style="margin: 0;">No API keys yet. Generate one to get started.</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = `
        <div class="api-keys-table-wrap">
          <table class="api-keys-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th class="api-keys-extra">Webhook</th>
                <th class="api-keys-extra">Created</th>
                <th class="api-keys-extra">Last Used</th>
                <th class="api-keys-action-col"></th>
              </tr>
            </thead>
            <tbody>
              ${keys.map(key => `
                <tr>
                  <td class="api-keys-name-cell">${escapeHtml(key.name)}</td>
                  <td class="api-keys-key-cell">
                    <code>${key.key_prefix}...</code>
                  </td>
                  <td class="api-keys-extra api-keys-webhook-cell">
                    ${key.is_active ? (key.webhook_url
                      ? `<span class="api-keys-webhook-url" title="${escapeHtml(key.webhook_url)}">${escapeHtml(key.webhook_url)}</span>
                         <button class="btn btn-secondary api-key-edit-webhook-btn api-keys-mini-btn" data-key-id="${key.id}" data-webhook-url="${escapeHtml(key.webhook_url)}" data-webhook-secret="${escapeHtml(key.webhook_secret || '')}">Edit</button>`
                      : `<button class="btn btn-secondary api-key-edit-webhook-btn api-keys-mini-btn" data-key-id="${key.id}" data-webhook-url="" data-webhook-secret="">+ Add</button>`
                    ) : '<span class="api-keys-dash">—</span>'}
                  </td>
                  <td class="api-keys-extra api-keys-date-cell">
                    ${new Date(key.created_at).toLocaleDateString()}
                  </td>
                  <td class="api-keys-extra api-keys-date-cell">
                    ${key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td class="api-keys-action-col">
                    ${key.is_active
                      ? `<button class="btn btn-secondary api-key-revoke-btn api-keys-mini-btn" data-key-id="${key.id}" data-key-name="${escapeHtml(key.name)}">Revoke</button>`
                      : `<span class="api-keys-revoked">Revoked</span>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Attach revoke listeners
      listContainer.querySelectorAll('.api-key-revoke-btn').forEach(btn => {
        btn.addEventListener('click', () => this.revokeApiKey(btn.dataset.keyId, btn.dataset.keyName));
      });

      // Attach edit webhook listeners
      listContainer.querySelectorAll('.api-key-edit-webhook-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showEditWebhookModal(btn.dataset.keyId, btn.dataset.webhookUrl, btn.dataset.webhookSecret));
      });

    } catch (error) {
      console.error('Error loading API keys:', error);
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--error-color);">
          Failed to load API keys. Please try again.
        </div>
      `;
    }
  }

  async revokeApiKey(keyId, keyName) {
    const { showConfirmModal } = await import('../components/ConfirmModal.js');
    const confirmed = await showConfirmModal({
      title: 'Revoke API Key',
      message: `Are you sure you want to revoke "${keyName}"? Any applications using this key will lose access immediately.`,
      confirmText: 'Revoke',
      confirmStyle: 'danger',
    });
    if (!confirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'revoke', key_id: keyId })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to revoke key');

      // Reload the list
      this.loadApiKeys();
    } catch (error) {
      console.error('Error revoking API key:', error);
      showToast('Failed to revoke API key. Please try again.', 'error');
    }
  }

  showEditWebhookModal(keyId, currentUrl, currentSecret) {
    // Remove any existing modal
    const existing = document.getElementById('webhook-edit-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'webhook-edit-overlay';
    overlay.className = 'contact-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = () => { overlay.style.display = 'none'; overlay.remove(); };
    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 500px;">
        <div class="contact-modal-header">
          <h3>Edit Webhook</h3>
          <button class="close-modal-btn" id="webhook-modal-close">&times;</button>
        </div>
        <form id="webhook-edit-form">
          <div class="contact-modal-body">
            <div class="form-group">
              <label class="form-label" for="webhook-edit-url">Webhook URL</label>
              <input type="url" id="webhook-edit-url" class="form-input" value="${escapeHtml(currentUrl || '')}" placeholder="https://your-server.com/webhook" maxlength="2048" />
            </div>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">
              Receives a POST request with call data when calls complete. Leave empty to disable.
            </p>
            ${currentSecret ? `
              <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm);">
                <label style="font-weight: 600; display: block; margin-bottom: 0.35rem; font-size: 0.85rem;">Signing Secret</label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <code id="webhook-secret-display" style="flex: 1; font-size: 0.75rem; word-break: break-all; user-select: all;">${escapeHtml(currentSecret)}</code>
                  <button type="button" class="btn btn-secondary" id="webhook-secret-copy-btn" style="font-size: 0.7rem; padding: 0.2rem 0.4rem; white-space: nowrap;">Copy</button>
                </div>
                <p style="margin: 0.35rem 0 0 0; font-size: 0.75rem; color: var(--text-secondary);">
                  Verify deliveries using the <code>x-magpipe-signature</code> header (HMAC-SHA256).
                </p>
              </div>
            ` : `
              <p style="margin: 0.75rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">
                A signing secret will be generated when you save a webhook URL.
              </p>
            `}
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary" id="webhook-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="webhook-modal-save">Save</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => { overlay.style.display = 'none'; overlay.remove(); };
    document.getElementById('webhook-modal-close').onclick = closeModal;
    document.getElementById('webhook-modal-cancel').onclick = closeModal;
    document.getElementById('webhook-edit-url').focus();

    // Copy secret button
    const secretCopyBtn = document.getElementById('webhook-secret-copy-btn');
    if (secretCopyBtn) {
      secretCopyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(document.getElementById('webhook-secret-display').textContent);
          secretCopyBtn.textContent = 'Copied!';
          setTimeout(() => { secretCopyBtn.textContent = 'Copy'; }, 2000);
        } catch { /* ignore */ }
      };
    }

    document.getElementById('webhook-edit-form').onsubmit = async (e) => {
      e.preventDefault();
      const newUrl = document.getElementById('webhook-edit-url').value.trim();
      const saveBtn = document.getElementById('webhook-modal-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'update', key_id: keyId, webhook_url: newUrl || null })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update webhook');

        closeModal();
        showToast('Webhook URL updated', 'success');
        this.loadApiKeys();
      } catch (error) {
        console.error('Error updating webhook:', error);
        showToast(error.message || 'Failed to update webhook URL.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };
  }

  attachApiTabListeners() {
    const generateBtn = document.getElementById('generate-api-key-btn');
    const generateForm = document.getElementById('api-key-generate-form');
    const nameInput = document.getElementById('api-key-name-input');
    const webhookInput = document.getElementById('api-key-webhook-input');
    const createBtn = document.getElementById('api-key-create-btn');
    const cancelBtn = document.getElementById('api-key-cancel-btn');
    const createdDisplay = document.getElementById('api-key-created-display');
    const fullValueEl = document.getElementById('api-key-full-value');
    const copyBtn = document.getElementById('api-key-copy-btn');
    const dismissBtn = document.getElementById('api-key-dismiss-btn');

    // Load existing keys
    this.loadApiKeys();

    // Show generate form
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        generateForm.classList.remove('hidden');
        createdDisplay.classList.add('hidden');
        nameInput.value = '';
        webhookInput.value = '';
        nameInput.focus();
      });
    }

    // Cancel generate
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        generateForm.classList.add('hidden');
      });
    }

    // Create key
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }

        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-api-keys`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'generate', name, webhook_url: webhookInput.value.trim() || undefined })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to generate key');

          // Show the created key
          generateForm.classList.add('hidden');
          createdDisplay.classList.remove('hidden');
          fullValueEl.textContent = data.key;

          // Reload the list
          this.loadApiKeys();
        } catch (error) {
          console.error('Error generating API key:', error);
          showToast(error.message || 'Failed to generate API key.', 'error');
        } finally {
          createBtn.disabled = false;
          createBtn.textContent = 'Create';
        }
      });
    }

    // Allow Enter key in name input
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createBtn.click();
        }
      });
    }

    // Copy key
    if (copyBtn) {
      const labelEl = copyBtn.querySelector('.api-key-copy-label');
      const setLabel = (text) => { if (labelEl) labelEl.textContent = text; };

      copyBtn.addEventListener('click', async () => {
        const copied = await copyTextToClipboard(fullValueEl.textContent || '');
        if (copied) {
          setLabel('Copied!');
          setTimeout(() => setLabel('Copy key'), 2000);
        } else {
          // Last-resort: select the value so user can Cmd/Ctrl+C manually
          const range = document.createRange();
          range.selectNodeContents(fullValueEl);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          setLabel('Press Cmd/Ctrl+C');
          setTimeout(() => setLabel('Copy key'), 2500);
        }
      });
    }

    // Dismiss created key display
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        createdDisplay.classList.add('hidden');
      });
    }
  }

  renderAccountTab() {
    return `
      <!-- Phone Admin Access Code -->
      <div class="card" style="margin-bottom: 1rem;">
        <div id="access-code-container"></div>
      </div>

      <!-- Danger Zone -->
      <div class="card" style="border: 2px solid var(--error-color); margin-bottom: 1rem;">
        <h2 style="color: var(--error-color);">Danger Zone</h2>
        <p class="text-muted">These actions cannot be undone</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-danger" id="delete-account-btn">
            Delete Account
          </button>
        </div>
      </div>

      <!-- Sign Out -->
      <div class="card">
        <button class="btn btn-secondary btn-full" id="signout-btn">
          Sign Out
        </button>
      </div>
    `;
  }

  attachAccountTabListeners() {
    const signoutBtn = document.getElementById('signout-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');

    // Initialize access code settings component
    const accessCodeContainer = document.getElementById('access-code-container');
    if (accessCodeContainer) {
      this.accessCodeSettings = createAccessCodeSettings(accessCodeContainer);
    }

    // Sign out
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        signoutBtn.disabled = true;
        signoutBtn.textContent = 'Signing out...';
        try {
          await signOut();
        } catch (error) {
          console.error('Sign out error:', error);
          signoutBtn.disabled = false;
          signoutBtn.textContent = 'Sign Out';
        }
      });
    }

    // Delete account
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', async () => {
        const confirmation = prompt('This will permanently delete your account and all data. Type "DELETE" to confirm:');
        if (confirmation !== 'DELETE') return;
        deleteAccountBtn.disabled = true;
        deleteAccountBtn.textContent = 'Deleting...';
        try {
          showToast('Account deletion is not yet implemented. Please contact support.', 'warning');
          deleteAccountBtn.disabled = false;
          deleteAccountBtn.textContent = 'Delete Account';
        } catch (error) {
          console.error('Delete account error:', error);
          showToast('Failed to delete account. Please try again.', 'error');
          deleteAccountBtn.disabled = false;
          deleteAccountBtn.textContent = 'Delete Account';
        }
      });
    }
  }

  updateFavicon(url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url || '/favicon.ico';
  }

  applyFavicon(url, withWhiteBg = false) {
    if (!url) {
      this.updateFavicon(null);
      return;
    }

    if (!withWhiteBg) {
      this.updateFavicon(url);
      return;
    }

    // Create a canvas to add white background with rounded corners
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 32;
      const radius = 6;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw rounded rectangle path
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(size - radius, 0);
      ctx.quadraticCurveTo(size, 0, size, radius);
      ctx.lineTo(size, size - radius);
      ctx.quadraticCurveTo(size, size, size - radius, size);
      ctx.lineTo(radius, size);
      ctx.quadraticCurveTo(0, size, 0, size - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();

      // Fill with white background
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Clip to rounded rectangle for the image
      ctx.clip();

      // Draw the favicon centered
      const scale = Math.min(size / img.width, size / img.height);
      const x = (size - img.width * scale) / 2;
      const y = (size - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

      // Convert to data URL and set as favicon
      const dataUrl = canvas.toDataURL('image/png');
      this.updateFavicon(dataUrl);
    };
    img.onerror = () => {
      // Fallback to original if processing fails
      this.updateFavicon(url);
    };
    img.src = url;
  }

  async purchaseCredits(amount) {
    const addCreditsBtn = document.getElementById('add-credits-btn');
    const creditsOptions = document.getElementById('credits-options');

    try {
      // Disable all credit buttons while processing
      document.querySelectorAll('.credit-amount-btn, #add-custom-credits-btn').forEach(btn => {
        btn.disabled = true;
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-add-credits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount,
          successUrl: `${window.location.origin}/settings?credits=success`,
          cancelUrl: `${window.location.origin}/settings?credits=canceled`
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create checkout session');

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('Purchase credits error:', error);
      showToast('Failed to start checkout. Please try again.', 'error');

      // Re-enable buttons
      document.querySelectorAll('.credit-amount-btn, #add-custom-credits-btn').forEach(btn => {
        btn.disabled = false;
      });

      // Reset UI
      if (creditsOptions) creditsOptions.style.display = 'none';
      if (addCreditsBtn) addCreditsBtn.style.display = 'block';
    }
  }

  attachEventListeners() {
    // Add component styles (called once on page load)
    // Tab-specific listeners are handled by attachTabContentListeners
  }

}