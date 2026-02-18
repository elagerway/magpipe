/**
 * Settings Page
 */

import { User, Organization } from '../models/index.js';
import { getCurrentUser, signOut, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearNavUserCache } from '../components/BottomNav.js';
import { createAccessCodeSettings, addAccessCodeSettingsStyles } from '../components/AccessCodeSettings.js';
import { createKnowledgeSourceManager, addKnowledgeSourceManagerStyles } from '../components/KnowledgeSourceManager.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../components/ExternalTrunkSettings.js';
import { showToast } from '../lib/toast.js';
import {
  isPushSupported,
  getPermissionStatus,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed,
  showTestNotification
} from '../services/pushNotifications.js';

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
    let profile, billingInfo, notifPrefs, serviceNumbers, organization;

    if (this.cachedData && (now - this.lastFetchTime) < 30000) {
      ({ profile, billingInfo, notifPrefs, serviceNumbers, organization } = this.cachedData);
    } else {
      // Fetch all data in parallel for speed
      const [profileResult, billingResult, notifResult, numbersResult, calComResult, orgResult, referralResult] = await Promise.all([
        User.getProfile(user.id),
        supabase.from('users').select('plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, credits_balance, credits_used_this_period, has_payment_method, received_signup_bonus, auto_recharge_enabled, auto_recharge_amount, auto_recharge_threshold, cc_bonus_claimed, recharge_bonus_claimed, referral_code').eq('id', user.id).single(),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).single(),
        supabase.from('service_numbers').select('phone_number, is_active').eq('user_id', user.id).order('is_active', { ascending: false }),
        supabase.from('users').select('cal_com_access_token, cal_com_user_id').eq('id', user.id).single(),
        Organization.getForUser(user.id),
        supabase.from('referral_rewards').select('threshold_met').eq('referrer_id', user.id).eq('threshold_met', true).limit(1)
      ]);

      profile = profileResult.profile;
      billingInfo = billingResult.data;
      notifPrefs = notifResult.data;
      serviceNumbers = numbersResult.data;
      organization = orgResult.organization;

      // Add Cal.com status to profile
      if (calComResult.data) {
        profile.cal_com_connected = !!calComResult.data.cal_com_access_token;
        profile.cal_com_user_id = calComResult.data.cal_com_user_id;
      }

      // Add referral completion status
      profile.has_completed_referral = (referralResult.data?.length || 0) > 0;

      // Cache the data
      this.cachedData = { profile, billingInfo, notifPrefs, serviceNumbers, organization };
      this.lastFetchTime = now;
    }

    // Merge billing info into profile
    if (billingInfo) {
      Object.assign(profile, billingInfo);
    }

    console.log('Profile data:', {
      phone_number: profile?.phone_number,
      phone_verified: profile?.phone_verified
    });

    // Store organization for event listeners
    this.organization = organization;

    const activeNumbers = serviceNumbers?.filter(n => n.is_active) || [];
    const inactiveNumbers = serviceNumbers?.filter(n => !n.is_active) || [];

    // Get user initials for avatar fallback
    const userInitials = this.getInitials(profile?.name, user.email);

    // Check for billing, credits and Cal.com success/error in URL
    const urlParams = new URLSearchParams(window.location.search);
    const billingStatus = urlParams.get('billing');
    const creditsStatus = urlParams.get('credits');
    const paymentMethodStatus = urlParams.get('payment_method');
    const bonusClaimed = urlParams.get('bonus_claimed');
    const calConnected = urlParams.get('cal_connected');
    const calError = urlParams.get('cal_error');

    // Store data for tab rendering
    this.profile = profile;
    this.user = user;
    this.billingInfo = billingInfo;
    this.notifPrefs = notifPrefs;
    this.serviceNumbers = serviceNumbers;
    this.activeNumbers = activeNumbers;
    this.inactiveNumbers = inactiveNumbers;
    this.userInitials = userInitials;

    // Check URL for tab param
    const tabParam = urlParams.get('tab');
    if (tabParam && ['profile', 'billing', 'branding', 'notifications', 'account', 'api'].includes(tabParam)) {
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
            <button class="settings-tab ${this.activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">Notifications</button>
            <button class="settings-tab ${this.activeTab === 'account' ? 'active' : ''}" data-tab="account">Account</button>
            <button class="settings-tab ${this.activeTab === 'api' ? 'active' : ''}" data-tab="api">API</button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="settings-tab-content" class="settings-tab-content">
          ${this.renderActiveTab()}
        </div>

      <!-- Push Notifications Help Modal -->
      <div id="push-help-modal" class="modal-overlay hidden">
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2 style="margin: 0;">Enable Push Notifications</h2>
            <button class="modal-close-btn" id="close-push-help-modal">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div id="push-help-content">
            <!-- Content populated by JS based on platform -->
          </div>
          <div style="margin-top: 1.5rem;">
            <button class="btn btn-primary" id="push-help-done-btn" style="width: 100%;">Got it</button>
          </div>
        </div>
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

  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);

    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }

    return phoneNumber;
  }

  getInitials(name, email) {
    if (name) {
      const parts = name.split(' ');
      return parts.length > 1
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.substring(0, 2).toUpperCase();
    }
    return email ? email.substring(0, 2).toUpperCase() : 'U';
  }

  renderActiveTab() {
    switch (this.activeTab) {
      case 'profile':
        return this.renderProfileTab();
      case 'billing':
        return this.renderBillingTab();
      case 'branding':
        return this.renderBrandingTab();
      case 'notifications':
        return this.renderNotificationsTab();
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
      case 'notifications':
        this.attachNotificationsTabListeners();
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
    return `
      <!-- User ID -->
      <div class="card" style="margin-bottom: 1rem;">
        <div class="form-group" style="margin: 0;">
          <strong style="display: block; margin-bottom: 0.5rem;">User ID:</strong>
          <code style="
            background: var(--bg-secondary);
            padding: 0.5rem;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            color: var(--text-primary);
            user-select: all;
            display: block;
            word-break: break-all;
          ">${this.user.id}</code>
        </div>
      </div>

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
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Name</label>
          <div id="name-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${this.profile?.name || 'Click to add'}</div>
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
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Email</label>
          <div id="email-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${this.user.email}</div>
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
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Phone Number</label>
          <div id="phone-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
            ${this.profile?.phone_number || 'Click to add'}
            ${this.profile?.phone_verified ? '<span style="color: var(--success-color); margin-left: 0.5rem;">✓ Verified</span>' : ''}
          </div>
          <div id="phone-edit" style="display: none;">
            <input type="tel" id="phone-input" class="form-input" value="${this.profile?.phone_number || ''}" placeholder="+1 (555) 123-4567" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-phone-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-phone-btn">Cancel</button>
            </div>
            <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.875rem;">You'll need to verify your new phone number</p>
          </div>
        </div>

        <!-- Organization -->
        <div class="form-group">
          <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Organization</label>
          <div id="org-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${this.organization?.name || 'Click to add'}</div>
          <div id="org-edit" style="display: none;">
            <input type="text" id="org-input" class="form-input" value="${this.organization?.name || ''}" style="margin-bottom: 0.5rem;" />
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm btn-primary" id="save-org-btn">Save</button>
              <button class="btn btn-sm btn-secondary" id="cancel-org-btn">Cancel</button>
            </div>
          </div>
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
              ${this.formatPhoneNumber(num.phone_number)}
            </div>
          `).join('')}
        ` : ''}

        ${this.inactiveNumbers.length > 0 ? `
          <div class="form-group" ${this.activeNumbers.length > 0 ? 'style="margin-top: 1rem;"' : ''}>
            <strong>Inactive Numbers:</strong> ${this.inactiveNumbers.length}
          </div>
          ${this.inactiveNumbers.map(num => `
            <div class="form-group" style="padding-left: 1rem; color: var(--text-secondary);">
              ${this.formatPhoneNumber(num.phone_number)}
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
          preview.innerHTML = this.getInitials(profile?.name, user.email);
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
        const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
        if (authError) throw authError;
        const { error } = await supabase.from('users').update({ email: newEmail, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        showToast('Email updated. Please check your new email for verification link...', 'success');
        setTimeout(() => navigateTo('/verify-email'), 2000);
      } catch (error) {
        console.error('Save email error:', error);
        showToast('Failed to save email. Please try again.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Phone inline editing
    document.getElementById('phone-display')?.addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'none';
      document.getElementById('phone-edit').style.display = 'block';
      document.getElementById('phone-input').focus();
    });
    document.getElementById('cancel-phone-btn')?.addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'block';
      document.getElementById('phone-edit').style.display = 'none';
    });
    document.getElementById('save-phone-btn')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-phone-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        const { user } = await getCurrentUser();
        const { profile } = await User.getProfile(user.id);
        const newPhone = document.getElementById('phone-input').value;
        const normalizePhone = (phone) => phone ? phone.replace(/\D/g, '') : '';
        const oldPhoneNormalized = normalizePhone(profile?.phone_number);
        const newPhoneNormalized = normalizePhone(newPhone);
        const phoneChanged = oldPhoneNormalized !== newPhoneNormalized;
        if (!phoneChanged) {
          if (!profile?.phone_verified) {
            showToast('Redirecting to verification...', 'success');
            setTimeout(() => navigateTo('/verify-phone'), 1000);
          } else {
            showToast('No changes made.', 'info');
            document.getElementById('phone-display').style.display = 'block';
            document.getElementById('phone-edit').style.display = 'none';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
          }
          return;
        }
        const { error } = await supabase.from('users').update({ phone_number: newPhone, phone_verified: false, updated_at: new Date().toISOString() }).eq('id', user.id);
        if (error) throw error;
        showToast('Phone number updated. Redirecting to verification...', 'success');
        setTimeout(() => navigateTo('/verify-phone'), 1500);
      } catch (error) {
        console.error('Save phone error:', error);
        showToast('Failed to save phone number. Please try again.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
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

          ${this.renderBonusCreditsCard()}

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

          <!-- Pricing Info -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
            <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Usage Rates</h3>
            <div style="display: grid; gap: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
              <div style="display: flex; justify-content: space-between;">
                <span>Voice calls</span>
                <span>~$0.07-0.10/min</span>
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

    if (autoRechargeEnabled && autoRechargeSettings) {
      autoRechargeEnabled.addEventListener('change', async () => {
        const isEnabled = autoRechargeEnabled.checked;
        autoRechargeSettings.style.opacity = isEnabled ? '1' : '0.5';
        autoRechargeSettings.style.pointerEvents = isEnabled ? 'auto' : 'none';
        try {
          const { user } = await getCurrentUser();
          await supabase.from('users').update({ auto_recharge_enabled: isEnabled }).eq('id', user.id);
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

  renderNotificationsTab() {
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <h2>Notifications</h2>
        <p class="text-muted" style="margin-bottom: 1.5rem;">Receive alerts for missed calls and new messages</p>

        <!-- Email Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Email Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get alerts sent to your email</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="email-enabled" ${this.notifPrefs?.email_enabled ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group">
            <label for="email-address">Email Address</label>
            <input type="email" id="email-address" class="form-input" value="${this.notifPrefs?.email_address || this.user.email}" placeholder="your@email.com" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="email-inbound-calls" ${this.notifPrefs?.email_inbound_calls ? 'checked' : ''} />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="email-all-calls" ${this.notifPrefs?.email_all_calls ? 'checked' : ''} />
              <span>All calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="email-inbound-messages" ${this.notifPrefs?.email_inbound_messages ? 'checked' : ''} />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="email-all-messages" ${this.notifPrefs?.email_all_messages ? 'checked' : ''} />
              <span>All messages</span>
            </label>
          </div>
        </div>

        <!-- SMS Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">SMS Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get alerts sent to your phone</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="sms-enabled" ${this.notifPrefs?.sms_enabled ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group">
            <label for="sms-phone-number">Phone Number</label>
            <input type="tel" id="sms-phone-number" class="form-input" value="${this.notifPrefs?.sms_phone_number || this.profile?.phone_number || ''}" placeholder="+1 (555) 123-4567" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="sms-inbound-calls" ${this.notifPrefs?.sms_inbound_calls ? 'checked' : ''} />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="sms-all-calls" ${this.notifPrefs?.sms_all_calls ? 'checked' : ''} />
              <span>All calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="sms-inbound-messages" ${this.notifPrefs?.sms_inbound_messages ? 'checked' : ''} />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="sms-all-messages" ${this.notifPrefs?.sms_all_messages ? 'checked' : ''} />
              <span>All messages</span>
            </label>
          </div>
        </div>

        <!-- Push Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Push Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get instant alerts on this device</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="push-enabled" ${this.notifPrefs?.push_enabled ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="push-status" style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
            Checking push notification support...
          </div>
          <div id="push-options" style="display: ${this.notifPrefs?.push_enabled ? 'block' : 'none'};">
            <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="push-inbound-calls" ${this.notifPrefs?.push_inbound_calls !== false ? 'checked' : ''} />
                <span>Inbound calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="push-all-calls" ${this.notifPrefs?.push_all_calls ? 'checked' : ''} />
                <span>All calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="push-inbound-messages" ${this.notifPrefs?.push_inbound_messages !== false ? 'checked' : ''} />
                <span>Inbound messages</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="push-all-messages" ${this.notifPrefs?.push_all_messages ? 'checked' : ''} />
                <span>All messages</span>
              </label>
            </div>
            <button class="btn btn-sm btn-secondary" id="test-push-btn" style="margin-top: 0.75rem;">
              Send Test Notification
            </button>
          </div>
        </div>

        <button class="btn btn-primary" id="save-notifications-btn">
          Save Notification Settings
        </button>
      </div>

      <!-- Knowledge Base (Mobile Only) -->
      <div class="card mobile-only">
        <h2>Knowledge Base</h2>
        <p class="text-muted">Add URLs to your assistant's knowledge base so it can reference your website content during conversations</p>
        <div id="knowledge-source-container"></div>
      </div>
    `;
  }

  attachNotificationsTabListeners() {
    const saveNotificationsBtn = document.getElementById('save-notifications-btn');

    // Push notifications setup
    this.initPushNotificationUI();

    // Save notifications
    if (saveNotificationsBtn) {
      saveNotificationsBtn.addEventListener('click', async () => {
        saveNotificationsBtn.disabled = true;
        saveNotificationsBtn.textContent = 'Saving...';
        try {
          const { user } = await getCurrentUser();
          const preferences = {
            user_id: user.id,
            email_enabled: document.getElementById('email-enabled').checked,
            email_address: document.getElementById('email-address').value,
            email_inbound_calls: document.getElementById('email-inbound-calls').checked,
            email_all_calls: document.getElementById('email-all-calls').checked,
            email_inbound_messages: document.getElementById('email-inbound-messages').checked,
            email_all_messages: document.getElementById('email-all-messages').checked,
            sms_enabled: document.getElementById('sms-enabled').checked,
            sms_phone_number: document.getElementById('sms-phone-number').value,
            sms_inbound_calls: document.getElementById('sms-inbound-calls').checked,
            sms_all_calls: document.getElementById('sms-all-calls').checked,
            sms_inbound_messages: document.getElementById('sms-inbound-messages').checked,
            sms_all_messages: document.getElementById('sms-all-messages').checked,
            push_enabled: document.getElementById('push-enabled').checked,
            push_inbound_calls: document.getElementById('push-inbound-calls').checked,
            push_all_calls: document.getElementById('push-all-calls').checked,
            push_inbound_messages: document.getElementById('push-inbound-messages').checked,
            push_all_messages: document.getElementById('push-all-messages').checked,
            updated_at: new Date().toISOString()
          };
          const { error } = await supabase.from('notification_preferences').upsert(preferences, { onConflict: 'user_id' });
          if (error) throw error;
          showToast('Notification settings saved successfully', 'success');
        } catch (error) {
          console.error('Save notifications error:', error);
          showToast('Failed to save notification settings. Please try again.', 'error');
        } finally {
          saveNotificationsBtn.disabled = false;
          saveNotificationsBtn.textContent = 'Save Notification Settings';
        }
      });
    }

    // Initialize knowledge source manager (mobile only)
    const knowledgeContainer = document.getElementById('knowledge-source-container');
    if (knowledgeContainer && window.innerWidth <= 768) {
      this.knowledgeManager = createKnowledgeSourceManager(knowledgeContainer);
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
        <div id="api-key-generate-form" class="hidden" style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-sm);">
          <label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Key Name</label>
          <input type="text" id="api-key-name-input" placeholder="e.g. Production, CI/CD, Testing" style="width: 100%; margin-bottom: 0.75rem;" maxlength="64" />
          <label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Webhook URL <span style="font-weight: 400; color: var(--text-secondary);">(optional)</span></label>
          <input type="url" id="api-key-webhook-input" placeholder="https://your-server.com/webhook" style="width: 100%; margin-bottom: 0.75rem;" maxlength="2048" />
          <p style="margin: 0 0 0.75rem 0; font-size: 0.8rem; color: var(--text-secondary);">Receives POST with call data when calls complete.</p>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button class="btn btn-secondary" id="api-key-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="api-key-create-btn">Create</button>
          </div>
        </div>

        <!-- Newly created key display (hidden by default) -->
        <div id="api-key-created-display" class="hidden" style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-secondary); border: 1px solid var(--primary-color); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <svg width="16" height="16" fill="none" stroke="var(--primary-color)" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <strong style="color: var(--primary-color);">Copy your API key now — it won't be shown again.</strong>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <code id="api-key-full-value" style="
              flex: 1;
              background: var(--bg-primary);
              padding: 0.5rem;
              border-radius: var(--radius-sm);
              font-size: 0.8rem;
              word-break: break-all;
              user-select: all;
            "></code>
            <button class="btn btn-secondary" id="api-key-copy-btn" style="white-space: nowrap;">Copy</button>
          </div>
          <button class="btn btn-secondary" id="api-key-dismiss-btn" style="margin-top: 0.75rem; width: 100%;">Done</button>
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
              When a call completes, each API key with a webhook URL receives a <code>POST</code> request with <code>Content-Type: application/json</code>. Timeout is 10 seconds.
            </p>
            <p style="margin: 0 0 0.5rem 0; font-weight: 600; font-size: 0.85rem;">call.completed</p>
<pre style="background: var(--bg-secondary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.78rem; overflow-x: auto; margin: 0; line-height: 1.5;">{
  "event": "call.completed",
  "timestamp": "2026-02-18T15:30:45.123456Z",
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
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.75rem;">
              <thead>
                <tr style="text-align: left; border-bottom: 1px solid var(--border-color);">
                  <th style="padding: 0.35rem 0.5rem 0.35rem 0;">Field</th>
                  <th style="padding: 0.35rem 0.5rem;">Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>transcript</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null when PII storage is disabled</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>summary</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null if call was too short for a summary</td>
                </tr>
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.35rem 0.5rem 0.35rem 0;"><code>extracted_data</code></td>
                  <td style="padding: 0.35rem 0.5rem; color: var(--text-secondary);">null if no dynamic variables configured on agent</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
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
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead>
            <tr style="text-align: left; border-bottom: 1px solid var(--border-color);">
              <th style="padding: 0.5rem 0.5rem 0.5rem 0;">Name</th>
              <th style="padding: 0.5rem;">Key</th>
              <th style="padding: 0.5rem;" class="desktop-only">Webhook</th>
              <th style="padding: 0.5rem;" class="desktop-only">Created</th>
              <th style="padding: 0.5rem;" class="desktop-only">Last Used</th>
              <th style="padding: 0.5rem; text-align: right;"></th>
            </tr>
          </thead>
          <tbody>
            ${keys.map(key => `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 0.5rem 0.5rem 0.5rem 0; font-weight: 500;">${this.escapeHtml(key.name)}</td>
                <td style="padding: 0.5rem;">
                  <code style="font-size: 0.8rem; background: var(--bg-secondary); padding: 0.15rem 0.35rem; border-radius: 3px;">${key.key_prefix}...</code>
                </td>
                <td style="padding: 0.5rem; color: var(--text-secondary);" class="desktop-only">
                  ${key.is_active ? (key.webhook_url
                    ? `<span style="font-size: 0.8rem; max-width: 180px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;" title="${this.escapeHtml(key.webhook_url)}">${this.escapeHtml(key.webhook_url)}</span>
                       <button class="btn btn-secondary api-key-edit-webhook-btn" data-key-id="${key.id}" data-webhook-url="${this.escapeHtml(key.webhook_url)}" style="font-size: 0.7rem; padding: 0.15rem 0.35rem; margin-left: 0.25rem; vertical-align: middle;">Edit</button>`
                    : `<button class="btn btn-secondary api-key-edit-webhook-btn" data-key-id="${key.id}" data-webhook-url="" style="font-size: 0.7rem; padding: 0.15rem 0.35rem;">+ Add</button>`
                  ) : '<span style="font-size: 0.75rem;">—</span>'}
                </td>
                <td style="padding: 0.5rem; color: var(--text-secondary);" class="desktop-only">
                  ${new Date(key.created_at).toLocaleDateString()}
                </td>
                <td style="padding: 0.5rem; color: var(--text-secondary);" class="desktop-only">
                  ${key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                </td>
                <td style="padding: 0.5rem; text-align: right;">
                  ${key.is_active
                    ? `<button class="btn btn-secondary api-key-revoke-btn" data-key-id="${key.id}" data-key-name="${this.escapeHtml(key.name)}" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">Revoke</button>`
                    : `<span style="color: var(--text-secondary); font-size: 0.75rem;">Revoked</span>`
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      // Attach revoke listeners
      listContainer.querySelectorAll('.api-key-revoke-btn').forEach(btn => {
        btn.addEventListener('click', () => this.revokeApiKey(btn.dataset.keyId, btn.dataset.keyName));
      });

      // Attach edit webhook listeners
      listContainer.querySelectorAll('.api-key-edit-webhook-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showEditWebhookModal(btn.dataset.keyId, btn.dataset.webhookUrl));
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showEditWebhookModal(keyId, currentUrl) {
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
          <h3>Edit Webhook URL</h3>
          <button class="close-modal-btn" id="webhook-modal-close">&times;</button>
        </div>
        <form id="webhook-edit-form">
          <div class="contact-modal-body">
            <label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Webhook URL</label>
            <input type="url" id="webhook-edit-url" value="${this.escapeHtml(currentUrl || '')}" placeholder="https://your-server.com/webhook" style="width: 100%;" maxlength="2048" />
            <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary);">
              Receives a POST request with call data when calls complete. Leave empty to disable.
            </p>
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
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(fullValueEl.textContent);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        } catch {
          // Fallback: select the text
          const range = document.createRange();
          range.selectNodeContents(fullValueEl);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
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
    this.setupPushHelpModal();
  }

  /**
   * Initialize push notification UI and event handlers
   */
  async initPushNotificationUI() {
    const pushStatus = document.getElementById('push-status');
    const pushEnabled = document.getElementById('push-enabled');
    const pushOptions = document.getElementById('push-options');
    const testPushBtn = document.getElementById('test-push-btn');

    // Check if push is supported
    if (!isPushSupported()) {
      pushStatus.textContent = 'Push notifications are not supported on this device/browser.';
      pushEnabled.disabled = true;
      return;
    }

    // Check permission status
    const permission = getPermissionStatus();
    const subscribed = await isSubscribed();

    if (permission === 'denied') {
      pushStatus.innerHTML = 'Push notifications are blocked. <a href="javascript:void(0)" onclick="alert(\'Open your browser settings and allow notifications for this site.\')">Learn how to enable</a>';
      pushEnabled.disabled = true;
    } else if (subscribed) {
      pushStatus.textContent = 'Push notifications are active on this device.';
      pushEnabled.checked = true;
      pushOptions.style.display = 'block';
    } else if (permission === 'granted') {
      pushStatus.textContent = 'Push notifications are available. Enable above to receive alerts.';
    } else {
      pushStatus.textContent = 'Enable push notifications to receive instant alerts on this device.';
    }

    // Handle push toggle change
    pushEnabled.addEventListener('change', async () => {
      const isEnabled = pushEnabled.checked;
      pushOptions.style.display = isEnabled ? 'block' : 'none';

      if (isEnabled) {
        // Try to subscribe
        pushStatus.textContent = 'Setting up push notifications...';
        const result = await subscribeToPush();

        if (result.success) {
          pushStatus.textContent = 'Push notifications are now active on this device.';
          showToast('Push notifications enabled successfully!', 'success');
        } else {
          pushStatus.textContent = result.error || 'Failed to enable push notifications.';
          pushEnabled.checked = false;
          pushOptions.style.display = 'none';
          // Show help modal for permission errors
          if (result.error?.includes('permission') || result.error?.includes('blocked')) {
            this.showPushHelpModal();
          } else {
            showToast(result.error || 'Failed to enable push notifications.', 'error');
          }
        }
      } else {
        // Unsubscribe
        pushStatus.textContent = 'Disabling push notifications...';
        const result = await unsubscribeFromPush();

        if (result.success) {
          pushStatus.textContent = 'Push notifications disabled.';
        } else {
          pushStatus.textContent = result.error || 'Failed to disable push notifications.';
        }
      }
    });

    // Handle test notification button
    testPushBtn.addEventListener('click', async () => {
      testPushBtn.disabled = true;
      testPushBtn.textContent = 'Sending...';

      try {
        await showTestNotification();
        showToast('Test notification sent!', 'success');
      } catch (error) {
        console.error('Test notification error:', error);
        // Show help modal for permission errors
        if (error.message?.includes('permission') || error.message?.includes('blocked')) {
          this.showPushHelpModal();
        } else {
          showToast(error.message || 'Failed to send test notification.', 'error');
        }
      } finally {
        testPushBtn.disabled = false;
        testPushBtn.textContent = 'Send Test Notification';
      }
    });

    // Setup push help modal
    this.setupPushHelpModal();
  }

  /**
   * Setup push help modal event listeners
   */
  setupPushHelpModal() {
    const modal = document.getElementById('push-help-modal');
    const closeBtn = document.getElementById('close-push-help-modal');
    const doneBtn = document.getElementById('push-help-done-btn');

    const closeModal = () => modal.classList.add('hidden');

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  /**
   * Show the push notifications help modal with platform-specific instructions
   */
  showPushHelpModal() {
    const modal = document.getElementById('push-help-modal');
    const content = document.getElementById('push-help-content');

    if (!modal || !content) return;

    // Detect platform
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isMac = /Macintosh/.test(ua);
    const isWindows = /Windows/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isChrome = /Chrome/.test(ua);
    const isFirefox = /Firefox/.test(ua);

    let instructions = '';

    if (isIOS) {
      instructions = `
        <p style="margin-bottom: 1rem;">To enable push notifications on iOS:</p>
        <ol style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
          <li>Open <strong>Settings</strong> on your iPhone/iPad</li>
          <li>Scroll down and tap <strong>Safari</strong> (or your browser)</li>
          <li>Tap <strong>Notifications</strong></li>
          <li>Enable <strong>Allow Notifications</strong></li>
          <li>Return here and try again</li>
        </ol>
        <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
          Note: iOS requires Safari 16.4+ or the app installed to Home Screen for push notifications.
        </p>
      `;
    } else if (isAndroid) {
      instructions = `
        <p style="margin-bottom: 1rem;">To enable push notifications on Android:</p>
        <ol style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
          <li>Tap the <strong>lock icon</strong> in the address bar</li>
          <li>Tap <strong>Permissions</strong> or <strong>Site settings</strong></li>
          <li>Find <strong>Notifications</strong> and set to <strong>Allow</strong></li>
          <li>Return here and try again</li>
        </ol>
        <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
          You may also need to check your phone's Settings > Apps > ${isChrome ? 'Chrome' : 'Browser'} > Notifications.
        </p>
      `;
    } else if (isMac) {
      const browser = isSafari ? 'Safari' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : 'your browser';
      instructions = `
        <p style="margin-bottom: 1rem;">To enable push notifications on Mac:</p>
        <ol style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
          <li>Open <strong>System Settings</strong> (Apple menu)</li>
          <li>Click <strong>Notifications</strong></li>
          <li>Find <strong>${browser}</strong> in the list</li>
          <li>Enable <strong>Allow Notifications</strong></li>
          <li>Set alert style to <strong>Banners</strong> or <strong>Alerts</strong></li>
          <li>Return here and try again</li>
        </ol>
        <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
          Also check the lock icon in the address bar to ensure this site can send notifications.
        </p>
      `;
    } else if (isWindows) {
      instructions = `
        <p style="margin-bottom: 1rem;">To enable push notifications on Windows:</p>
        <ol style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
          <li>Click the <strong>lock icon</strong> in the address bar</li>
          <li>Find <strong>Notifications</strong> and set to <strong>Allow</strong></li>
          <li>If blocked, go to browser settings and reset permissions for this site</li>
          <li>Return here and try again</li>
        </ol>
        <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
          Also check Windows Settings > System > Notifications to ensure browser notifications are enabled.
        </p>
      `;
    } else {
      instructions = `
        <p style="margin-bottom: 1rem;">To enable push notifications:</p>
        <ol style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
          <li>Click the <strong>lock icon</strong> in your browser's address bar</li>
          <li>Find <strong>Notifications</strong> in the permissions</li>
          <li>Change it from "Block" to <strong>Allow</strong></li>
          <li>Check your device's system notification settings</li>
          <li>Return here and try again</li>
        </ol>
      `;
    }

    content.innerHTML = instructions;
    modal.classList.remove('hidden');
  }
}