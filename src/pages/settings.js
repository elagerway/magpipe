/**
 * Settings Page
 */

import { User, Organization } from '../models/index.js';
import { getCurrentUser, signOut, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearNavUserCache } from '../components/BottomNav.js';
import { createAccessCodeSettings, addAccessCodeSettingsStyles } from '../components/AccessCodeSettings.js';
import { createKnowledgeSourceManager, addKnowledgeSourceManagerStyles } from '../components/KnowledgeSourceManager.js';
import { createExternalTrunkSettings, addExternalTrunkSettingsStyles } from '../components/ExternalTrunkSettings.js';
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
      const [profileResult, billingResult, notifResult, numbersResult, calComResult, orgResult] = await Promise.all([
        User.getProfile(user.id),
        supabase.from('users').select('plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end, credits_balance, credits_used_this_period, has_payment_method, received_signup_bonus, auto_recharge_enabled, auto_recharge_amount, auto_recharge_threshold').eq('id', user.id).single(),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).single(),
        supabase.from('service_numbers').select('phone_number, is_active').eq('user_id', user.id).order('is_active', { ascending: false }),
        supabase.from('users').select('cal_com_access_token, cal_com_user_id').eq('id', user.id).single(),
        Organization.getForUser(user.id)
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

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 2rem 1rem;">
        <h1 style="margin-bottom: 1.5rem;">Settings</h1>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

        ${billingStatus === 'success' ? `
          <div class="alert alert-success" style="margin-bottom: 1rem;">
            You've successfully upgraded to Pro! Enjoy unlimited features.
          </div>
        ` : ''}
        ${billingStatus === 'canceled' ? `
          <div class="alert alert-warning" style="margin-bottom: 1rem;">
            Checkout was canceled. You can upgrade anytime from the Billing section below.
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
            ">${user.id}</code>
          </div>
        </div>

        <!-- Profile Section -->
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
                ${profile?.avatar_url
                  ? `<img src="${profile.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" />`
                  : userInitials
                }
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-sm btn-secondary" id="upload-avatar-btn">
                  ${profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
                </button>
                <button class="btn btn-sm btn-secondary" id="remove-avatar-btn" style="display: ${profile?.avatar_url ? 'block' : 'none'};">
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
            <div id="name-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${profile?.name || 'Click to add'}</div>
            <div id="name-edit" style="display: none;">
              <input type="text" id="name-input" class="form-input" value="${profile?.name || ''}" style="margin-bottom: 0.5rem;" />
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-primary" id="save-name-btn">Save</button>
                <button class="btn btn-sm btn-secondary" id="cancel-name-btn">Cancel</button>
              </div>
            </div>
          </div>

          <!-- Email -->
          <div class="form-group" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
            <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Email</label>
            <div id="email-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${user.email}</div>
            <div id="email-edit" style="display: none;">
              <input type="email" id="email-input" class="form-input" value="${user.email}" style="margin-bottom: 0.5rem;" />
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
              ${profile?.phone_number || 'Click to add'}
              ${profile?.phone_verified ? '<span style="color: var(--success-color); margin-left: 0.5rem;">✓ Verified</span>' : ''}
            </div>
            <div id="phone-edit" style="display: none;">
              <input type="tel" id="phone-input" class="form-input" value="${profile?.phone_number || ''}" placeholder="+1 (555) 123-4567" style="margin-bottom: 0.5rem;" />
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
            <div id="org-display" style="cursor: pointer; padding: 0.5rem; border-radius: var(--radius-sm); transition: background 0.2s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">${organization?.name || 'Click to add'}</div>
            <div id="org-edit" style="display: none;">
              <input type="text" id="org-input" class="form-input" value="${organization?.name || ''}" style="margin-bottom: 0.5rem;" />
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm btn-primary" id="save-org-btn">Save</button>
                <button class="btn btn-sm btn-secondary" id="cancel-org-btn">Cancel</button>
              </div>
            </div>
          </div>

        </div>

        <!-- Brand Section -->
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
                ${profile?.logo_url
                  ? `<img src="${profile.logo_url}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`
                  : 'No logo'
                }
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-sm btn-secondary" id="upload-logo-btn">
                  ${profile?.logo_url ? 'Change Logo' : 'Upload Logo'}
                </button>
                <button class="btn btn-sm btn-secondary" id="remove-logo-btn" style="display: ${profile?.logo_url ? 'block' : 'none'};">
                  Remove
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
                border-radius: var(--radius-sm);
                background: var(--bg-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: 0.625rem;
                color: var(--text-secondary);
                border: 1px dashed var(--border-color);
              ">
                ${profile?.favicon_url
                  ? `<img src="${profile.favicon_url}" style="width: 32px; height: 32px; object-fit: contain;" />`
                  : 'No icon'
                }
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn btn-sm btn-secondary" id="upload-favicon-btn">
                  ${profile?.favicon_url ? 'Change Favicon' : 'Upload Favicon'}
                </button>
                <button class="btn btn-sm btn-secondary" id="remove-favicon-btn" style="display: ${profile?.favicon_url ? 'block' : 'none'};">
                  Remove
                </button>
                <input type="file" id="favicon-input" accept="image/png,image/x-icon,image/ico" style="display: none;" />
              </div>
            </div>
          </div>
        </div>

        <!-- Credits & Billing Section -->
        <div class="card" style="margin-bottom: 1rem;">
          <h2>Credits & Billing</h2>
          <div id="billing-section">
            ${!profile?.received_signup_bonus ? `
            <!-- Free Credits Offer Banner -->
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem; color: white;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <div style="font-weight: 700; font-size: 1.25rem; margin-bottom: 0.25rem;">
                    🎁 Get $20 Free Credits!
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

            <!-- Credits Balance -->
            <div class="credits-balance" style="display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: 1rem;">
              <div>
                <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Current Balance</div>
                <div style="font-weight: 700; font-size: 2rem; color: var(--text-primary);">
                  $${(profile?.credits_balance ?? 20).toFixed(2)}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 0.25rem;">
                  Used this period: $${(profile?.credits_used_this_period ?? 0).toFixed(2)}
                </div>
              </div>
              <button class="btn btn-primary" id="add-credits-btn">
                Add Credits
              </button>
            </div>

            <!-- Add Credits Options (hidden by default, shown on button click) -->
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
                  <input type="checkbox" id="auto-recharge-enabled" ${profile?.auto_recharge_enabled ? 'checked' : ''} ${!profile?.has_payment_method ? 'disabled' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              ${!profile?.has_payment_method ? `
                <div style="background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.75rem;">
                  <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: var(--warning-text, #856404);">
                    Add a payment method to enable auto-recharge.
                  </p>
                  <button class="btn btn-sm btn-secondary" id="setup-payment-btn">Add Payment Method</button>
                </div>
              ` : ''}

              <div id="auto-recharge-settings" style="${profile?.auto_recharge_enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                <div class="form-group" style="margin-bottom: 0.75rem;">
                  <label for="recharge-threshold" style="font-size: 0.875rem;">Recharge when balance falls below:</label>
                  <select id="recharge-threshold" class="form-input">
                    <option value="5" ${(profile?.auto_recharge_threshold ?? 5) == 5 ? 'selected' : ''}>$5</option>
                    <option value="10" ${profile?.auto_recharge_threshold == 10 ? 'selected' : ''}>$10</option>
                    <option value="20" ${profile?.auto_recharge_threshold == 20 ? 'selected' : ''}>$20</option>
                    <option value="50" ${profile?.auto_recharge_threshold == 50 ? 'selected' : ''}>$50</option>
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="recharge-amount" style="font-size: 0.875rem;">Amount to add:</label>
                  <select id="recharge-amount" class="form-input">
                    <option value="20" ${profile?.auto_recharge_amount == 20 ? 'selected' : ''}>$20</option>
                    <option value="50" ${(profile?.auto_recharge_amount ?? 50) == 50 ? 'selected' : ''}>$50</option>
                    <option value="100" ${profile?.auto_recharge_amount == 100 ? 'selected' : ''}>$100</option>
                    <option value="200" ${profile?.auto_recharge_amount == 200 ? 'selected' : ''}>$200</option>
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
                  <span>$0.001/msg</span>
                </div>
              </div>
              <p class="text-muted" style="margin: 0.75rem 0 0 0; font-size: 0.75rem;">
                Voice rates vary by AI model and voice provider used.
              </p>
            </div>

            ${profile?.stripe_customer_id ? `
              <div style="margin-top: 1rem;">
                <button class="btn btn-secondary btn-sm" id="manage-billing-btn">
                  Manage Payment Methods
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Phone Numbers (Mobile Only - on desktop, this is on the Phone page) -->
        <div class="card mobile-only" style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="margin: 0;">Phone Numbers</h2>
            <button class="btn btn-secondary" onclick="navigateTo('/manage-numbers')">
              Manage Numbers
            </button>
          </div>

          ${activeNumbers.length > 0 ? `
            <div class="form-group">
              <strong>Active Numbers:</strong> ${activeNumbers.length}
            </div>
            ${activeNumbers.map(num => `
              <div class="form-group" style="padding-left: 1rem;">
                ${this.formatPhoneNumber(num.phone_number)}
              </div>
            `).join('')}
          ` : ''}

          ${inactiveNumbers.length > 0 ? `
            <div class="form-group" ${activeNumbers.length > 0 ? 'style="margin-top: 1rem;"' : ''}>
              <strong>Inactive Numbers:</strong> ${inactiveNumbers.length}
            </div>
            ${inactiveNumbers.map(num => `
              <div class="form-group" style="padding-left: 1rem; color: var(--text-secondary);">
                ${this.formatPhoneNumber(num.phone_number)}
              </div>
            `).join('')}
          ` : ''}

          ${activeNumbers.length === 0 && inactiveNumbers.length === 0 ? `
            <p class="text-muted">No service numbers configured</p>
          ` : ''}
        </div>

        <!-- External SIP Trunks (Mobile Only - on desktop, this is on the Phone page) -->
        <div id="external-trunk-settings-container" class="mobile-only" style="margin-bottom: 1rem;"></div>

        <!-- Apps (Mobile Only) -->
        <div class="card mobile-only">
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

        <!-- Notifications -->
        <div class="card">
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
                <input type="checkbox" id="email-enabled" ${notifPrefs?.email_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="form-group">
              <label for="email-address">Email Address</label>
              <input
                type="email"
                id="email-address"
                class="form-input"
                value="${notifPrefs?.email_address || user.email}"
                placeholder="your@email.com"
              />
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="email-inbound-calls" ${notifPrefs?.email_inbound_calls ? 'checked' : ''} />
                <span>Inbound calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="email-all-calls" ${notifPrefs?.email_all_calls ? 'checked' : ''} />
                <span>All calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="email-inbound-messages" ${notifPrefs?.email_inbound_messages ? 'checked' : ''} />
                <span>Inbound messages</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="email-all-messages" ${notifPrefs?.email_all_messages ? 'checked' : ''} />
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
                <input type="checkbox" id="sms-enabled" ${notifPrefs?.sms_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="form-group">
              <label for="sms-phone-number">Phone Number</label>
              <input
                type="tel"
                id="sms-phone-number"
                class="form-input"
                value="${notifPrefs?.sms_phone_number || profile?.phone_number || ''}"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="sms-inbound-calls" ${notifPrefs?.sms_inbound_calls ? 'checked' : ''} />
                <span>Inbound calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="sms-all-calls" ${notifPrefs?.sms_all_calls ? 'checked' : ''} />
                <span>All calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="sms-inbound-messages" ${notifPrefs?.sms_inbound_messages ? 'checked' : ''} />
                <span>Inbound messages</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="sms-all-messages" ${notifPrefs?.sms_all_messages ? 'checked' : ''} />
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
                <input type="checkbox" id="push-enabled" ${notifPrefs?.push_enabled ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div id="push-status" style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
              Checking push notification support...
            </div>
            <div id="push-options" style="display: ${notifPrefs?.push_enabled ? 'block' : 'none'};">
              <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                  <input type="checkbox" id="push-inbound-calls" ${notifPrefs?.push_inbound_calls !== false ? 'checked' : ''} />
                  <span>Inbound calls</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                  <input type="checkbox" id="push-all-calls" ${notifPrefs?.push_all_calls ? 'checked' : ''} />
                  <span>All calls</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                  <input type="checkbox" id="push-inbound-messages" ${notifPrefs?.push_inbound_messages !== false ? 'checked' : ''} />
                  <span>Inbound messages</span>
                </label>
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                  <input type="checkbox" id="push-all-messages" ${notifPrefs?.push_all_messages ? 'checked' : ''} />
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

        <!-- Phone Admin Access Code -->
        <div class="card">
          <div id="access-code-container"></div>
        </div>

        <!-- Knowledge Base (Mobile Only - on desktop, this has its own page) -->
        <div class="card mobile-only">
          <h2>Knowledge Base</h2>
          <p class="text-muted">Add URLs to your assistant's knowledge base so it can reference your website content during conversations</p>
          <div id="knowledge-source-container"></div>
        </div>

        <!-- Danger Zone -->
        <div class="card" style="border: 2px solid var(--error-color);">
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
      </div>
      ${renderBottomNav('/settings')}
    `;

    this.attachEventListeners();
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

  updateFavicon(url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url || '/favicon.ico';
  }

  async purchaseCredits(amount) {
    const errorMessage = document.getElementById('error-message');
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
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = 'Failed to start checkout. Please try again.';
      errorMessage.classList.remove('hidden');

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
    // Initialize access code settings component
    const accessCodeContainer = document.getElementById('access-code-container');
    if (accessCodeContainer) {
      this.accessCodeSettings = createAccessCodeSettings(accessCodeContainer);
    }

    // Avatar upload/remove
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    const avatarInput = document.getElementById('avatar-input');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    if (uploadAvatarBtn && avatarInput) {
      uploadAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
      });

      avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Image must be less than 2MB';
          errorMessage.classList.remove('hidden');
          avatarInput.value = '';
          return;
        }

        uploadAvatarBtn.disabled = true;
        uploadAvatarBtn.textContent = 'Uploading...';
        errorMessage.classList.add('hidden');

        try {
          const { user } = await getCurrentUser();

          // Upload to Supabase Storage
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) throw uploadError;

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

          // Update user record
          const { error: updateError } = await supabase
            .from('users')
            .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          // Update preview
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="width: 100%; height: 100%; object-fit: cover;" />`;
          uploadAvatarBtn.textContent = 'Change Photo';
          removeAvatarBtn.style.display = 'block';

          // Clear caches to ensure nav updates
          this.cachedData = null;
          clearNavUserCache();

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Photo updated successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Avatar upload error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to upload photo. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          uploadAvatarBtn.disabled = false;
          if (uploadAvatarBtn.textContent === 'Uploading...') {
            uploadAvatarBtn.textContent = 'Upload Photo';
          }
          avatarInput.value = '';
        }
      });
    }

    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener('click', async () => {
        removeAvatarBtn.disabled = true;
        removeAvatarBtn.textContent = 'Removing...';
        errorMessage.classList.add('hidden');

        try {
          const { user } = await getCurrentUser();
          const { profile } = await User.getProfile(user.id);

          // Update user record to remove avatar_url
          const { error: updateError } = await supabase
            .from('users')
            .update({ avatar_url: null, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          // Update preview with initials
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = this.getInitials(profile?.name, user.email);
          uploadAvatarBtn.textContent = 'Upload Photo';
          removeAvatarBtn.style.display = 'none';

          // Clear caches to ensure nav updates
          this.cachedData = null;
          clearNavUserCache();

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Photo removed successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Avatar remove error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to remove photo. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          removeAvatarBtn.disabled = false;
          removeAvatarBtn.textContent = 'Remove';
        }
      });
    }

    // Logo upload/remove
    const uploadLogoBtn = document.getElementById('upload-logo-btn');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    const logoInput = document.getElementById('logo-input');

    if (uploadLogoBtn && logoInput) {
      uploadLogoBtn.addEventListener('click', () => {
        logoInput.click();
      });

      logoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Logo must be less than 2MB';
          errorMessage.classList.remove('hidden');
          logoInput.value = '';
          return;
        }

        uploadLogoBtn.disabled = true;
        uploadLogoBtn.textContent = 'Uploading...';
        errorMessage.classList.add('hidden');

        try {
          // Resize image to max 140px width while maintaining aspect ratio
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

          const { error: uploadError } = await supabase.storage
            .from('brand-assets')
            .upload(fileName, resizedBlob, { cacheControl: '3600', upsert: false });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('brand-assets')
            .getPublicUrl(fileName);

          const { error: updateError } = await supabase
            .from('users')
            .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          const preview = document.getElementById('logo-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
          uploadLogoBtn.textContent = 'Change Logo';
          removeLogoBtn.style.display = 'block';

          this.cachedData = null;
          clearNavUserCache();

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Logo updated successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Logo upload error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to upload logo. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          uploadLogoBtn.disabled = false;
          if (uploadLogoBtn.textContent === 'Uploading...') {
            uploadLogoBtn.textContent = 'Upload Logo';
          }
          logoInput.value = '';
        }
      });
    }

    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', async () => {
        removeLogoBtn.disabled = true;
        removeLogoBtn.textContent = 'Removing...';
        errorMessage.classList.add('hidden');

        try {
          const { user } = await getCurrentUser();

          const { error: updateError } = await supabase
            .from('users')
            .update({ logo_url: null, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          const preview = document.getElementById('logo-preview');
          preview.innerHTML = 'No logo';
          uploadLogoBtn.textContent = 'Upload Logo';
          removeLogoBtn.style.display = 'none';

          this.cachedData = null;
          clearNavUserCache();

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Logo removed successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Logo remove error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to remove logo. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          removeLogoBtn.disabled = false;
          removeLogoBtn.textContent = 'Remove';
        }
      });
    }

    // Favicon upload/remove
    const uploadFaviconBtn = document.getElementById('upload-favicon-btn');
    const removeFaviconBtn = document.getElementById('remove-favicon-btn');
    const faviconInput = document.getElementById('favicon-input');

    if (uploadFaviconBtn && faviconInput) {
      uploadFaviconBtn.addEventListener('click', () => {
        faviconInput.click();
      });

      faviconInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 500 * 1024) {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Favicon must be less than 500KB';
          errorMessage.classList.remove('hidden');
          faviconInput.value = '';
          return;
        }

        uploadFaviconBtn.disabled = true;
        uploadFaviconBtn.textContent = 'Uploading...';
        errorMessage.classList.add('hidden');

        try {
          const { user } = await getCurrentUser();
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/favicon-${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('brand-assets')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('brand-assets')
            .getPublicUrl(fileName);

          const { error: updateError } = await supabase
            .from('users')
            .update({ favicon_url: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          const preview = document.getElementById('favicon-preview');
          preview.innerHTML = `<img src="${publicUrl}" style="width: 32px; height: 32px; object-fit: contain;" />`;
          uploadFaviconBtn.textContent = 'Change Favicon';
          removeFaviconBtn.style.display = 'block';

          // Update the actual favicon
          this.updateFavicon(publicUrl);

          this.cachedData = null;

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Favicon updated successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Favicon upload error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to upload favicon. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          uploadFaviconBtn.disabled = false;
          if (uploadFaviconBtn.textContent === 'Uploading...') {
            uploadFaviconBtn.textContent = 'Upload Favicon';
          }
          faviconInput.value = '';
        }
      });
    }

    if (removeFaviconBtn) {
      removeFaviconBtn.addEventListener('click', async () => {
        removeFaviconBtn.disabled = true;
        removeFaviconBtn.textContent = 'Removing...';
        errorMessage.classList.add('hidden');

        try {
          const { user } = await getCurrentUser();

          const { error: updateError } = await supabase
            .from('users')
            .update({ favicon_url: null, updated_at: new Date().toISOString() })
            .eq('id', user.id);

          if (updateError) throw updateError;

          const preview = document.getElementById('favicon-preview');
          preview.innerHTML = 'No icon';
          uploadFaviconBtn.textContent = 'Upload Favicon';
          removeFaviconBtn.style.display = 'none';

          // Reset favicon to default
          this.updateFavicon(null);

          this.cachedData = null;

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Favicon removed successfully';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Favicon remove error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to remove favicon. Please try again.';
          errorMessage.classList.remove('hidden');
        } finally {
          removeFaviconBtn.disabled = false;
          removeFaviconBtn.textContent = 'Remove';
        }
      });
    }

    // Credits and Billing buttons
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

    // Show/hide credits options
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

    // Handle preset credit amounts
    creditAmountBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const amount = parseInt(btn.dataset.amount);
        await this.purchaseCredits(amount);
      });
    });

    // Handle custom credit amount
    if (addCustomCreditsBtn) {
      addCustomCreditsBtn.addEventListener('click', async () => {
        const customInput = document.getElementById('custom-amount');
        const amount = parseInt(customInput.value);
        if (amount >= 10 && amount <= 1000) {
          await this.purchaseCredits(amount);
        } else {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Please enter an amount between $10 and $1000';
          errorMessage.classList.remove('hidden');
        }
      });
    }

    // Setup payment method
    if (setupPaymentBtn) {
      setupPaymentBtn.addEventListener('click', async () => {
        setupPaymentBtn.disabled = true;
        setupPaymentBtn.textContent = 'Loading...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-setup-payment`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              returnUrl: `${window.location.origin}/settings?payment_method=success`
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create setup session');

          window.location.href = data.url;
        } catch (error) {
          console.error('Setup payment error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to setup payment method. Please try again.';
          errorMessage.classList.remove('hidden');
          setupPaymentBtn.disabled = false;
          setupPaymentBtn.textContent = 'Add Payment Method';
        }
      });
    }

    // Claim bonus button (same flow as setup payment, redirects to Stripe to add card)
    const claimBonusBtn = document.getElementById('claim-bonus-btn');
    if (claimBonusBtn) {
      claimBonusBtn.addEventListener('click', async () => {
        claimBonusBtn.disabled = true;
        claimBonusBtn.textContent = 'Loading...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-setup-payment`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              returnUrl: `${window.location.origin}/settings?payment_method=success&bonus_claimed=true`
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create setup session');

          window.location.href = data.url;
        } catch (error) {
          console.error('Claim bonus error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to setup payment method. Please try again.';
          errorMessage.classList.remove('hidden');
          claimBonusBtn.disabled = false;
          claimBonusBtn.textContent = 'Claim $20 Free';
        }
      });
    }

    // Manage billing portal
    if (manageBillingBtn) {
      manageBillingBtn.addEventListener('click', async () => {
        manageBillingBtn.disabled = true;
        manageBillingBtn.textContent = 'Loading...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-portal`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              returnUrl: `${window.location.origin}/settings`
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create portal session');

          window.location.href = data.url;
        } catch (error) {
          console.error('Billing portal error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to open billing portal. Please try again.';
          errorMessage.classList.remove('hidden');
          manageBillingBtn.disabled = false;
          manageBillingBtn.textContent = 'Manage Payment Methods';
        }
      });
    }

    // Auto-recharge toggle
    if (autoRechargeEnabled && autoRechargeSettings) {
      autoRechargeEnabled.addEventListener('change', async () => {
        const isEnabled = autoRechargeEnabled.checked;
        autoRechargeSettings.style.opacity = isEnabled ? '1' : '0.5';
        autoRechargeSettings.style.pointerEvents = isEnabled ? 'auto' : 'none';

        try {
          const { user } = await getCurrentUser();
          await supabase
            .from('users')
            .update({ auto_recharge_enabled: isEnabled })
            .eq('id', user.id);

          successMessage.className = 'alert alert-success';
          successMessage.textContent = isEnabled ? 'Auto-recharge enabled' : 'Auto-recharge disabled';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } catch (error) {
          console.error('Auto-recharge toggle error:', error);
          autoRechargeEnabled.checked = !isEnabled; // Revert
        }
      });
    }

    // Auto-recharge threshold/amount changes
    const saveAutoRechargeSettings = async () => {
      try {
        const { user } = await getCurrentUser();
        await supabase
          .from('users')
          .update({
            auto_recharge_threshold: parseFloat(rechargeThreshold.value),
            auto_recharge_amount: parseFloat(rechargeAmount.value)
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Save auto-recharge settings error:', error);
      }
    };

    if (rechargeThreshold) {
      rechargeThreshold.addEventListener('change', saveAutoRechargeSettings);
    }
    if (rechargeAmount) {
      rechargeAmount.addEventListener('change', saveAutoRechargeSettings);
    }

    // Initialize knowledge source manager component (mobile only - on desktop it has its own page)
    const knowledgeContainer = document.getElementById('knowledge-source-container');
    if (knowledgeContainer && window.innerWidth <= 768) {
      this.knowledgeManager = createKnowledgeSourceManager(knowledgeContainer);
    }

    // Initialize External SIP Trunk Settings component (mobile only - on desktop it's on Phone page)
    const externalTrunkContainer = document.getElementById('external-trunk-settings-container');
    if (externalTrunkContainer && window.innerWidth <= 768) {
      createExternalTrunkSettings('external-trunk-settings-container');
    }

    // Legacy Cal.com integration buttons (for backward compatibility - can be removed later)
    const connectCalComBtn = document.getElementById('connect-calcom-btn');
    const disconnectCalComBtn = document.getElementById('disconnect-calcom-btn');

    if (connectCalComBtn) {
      connectCalComBtn.addEventListener('click', async () => {
        connectCalComBtn.disabled = true;
        connectCalComBtn.textContent = 'Connecting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cal-com-oauth-start`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to start OAuth');

          // Redirect to Cal.com OAuth
          window.location.href = data.url;
        } catch (error) {
          console.error('Cal.com connect error:', error);
          alert('Failed to connect Cal.com. Please try again.');
          connectCalComBtn.disabled = false;
          connectCalComBtn.textContent = 'Connect Cal.com';
        }
      });
    }

    if (disconnectCalComBtn) {
      disconnectCalComBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to disconnect Cal.com? You won\'t be able to book appointments via voice until you reconnect.')) {
          return;
        }

        disconnectCalComBtn.disabled = true;
        disconnectCalComBtn.textContent = 'Disconnecting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cal-com-disconnect`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to disconnect');
          }

          // Reload to show updated status
          window.location.reload();
        } catch (error) {
          console.error('Cal.com disconnect error:', error);
          alert('Failed to disconnect Cal.com. Please try again.');
          disconnectCalComBtn.disabled = false;
          disconnectCalComBtn.textContent = 'Disconnect';
        }
      });
    }

    const signoutBtn = document.getElementById('signout-btn');
    const saveNotificationsBtn = document.getElementById('save-notifications-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');

    // Name inline editing
    document.getElementById('name-display').addEventListener('click', () => {
      document.getElementById('name-display').style.display = 'none';
      document.getElementById('name-edit').style.display = 'block';
      document.getElementById('name-input').focus();
    });

    document.getElementById('cancel-name-btn').addEventListener('click', () => {
      document.getElementById('name-display').style.display = 'block';
      document.getElementById('name-edit').style.display = 'none';
    });

    document.getElementById('save-name-btn').addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-name-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user } = await getCurrentUser();
        const { error } = await supabase
          .from('users')
          .update({
            name: document.getElementById('name-input').value,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Name updated successfully. Reloading...';

        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        console.error('Save name error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to save name. Please try again.';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Email inline editing
    document.getElementById('email-display').addEventListener('click', () => {
      document.getElementById('email-display').style.display = 'none';
      document.getElementById('email-edit').style.display = 'block';
      document.getElementById('email-input').focus();
    });

    document.getElementById('cancel-email-btn').addEventListener('click', () => {
      document.getElementById('email-display').style.display = 'block';
      document.getElementById('email-edit').style.display = 'none';
    });

    document.getElementById('save-email-btn').addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-email-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user } = await getCurrentUser();
        const newEmail = document.getElementById('email-input').value;

        // Update email in Supabase Auth
        const { error: authError } = await supabase.auth.updateUser({ email: newEmail });
        if (authError) throw authError;

        // Update email in users table
        const { error } = await supabase
          .from('users')
          .update({
            email: newEmail,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Email updated. Please check your new email for verification link...';

        setTimeout(() => navigateTo('/verify-email'), 2000);
      } catch (error) {
        console.error('Save email error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to save email. Please try again.';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Phone inline editing
    document.getElementById('phone-display').addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'none';
      document.getElementById('phone-edit').style.display = 'block';
      document.getElementById('phone-input').focus();
    });

    document.getElementById('cancel-phone-btn').addEventListener('click', () => {
      document.getElementById('phone-display').style.display = 'block';
      document.getElementById('phone-edit').style.display = 'none';
    });

    document.getElementById('save-phone-btn').addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-phone-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user } = await getCurrentUser();
        const { profile } = await User.getProfile(user.id);
        const newPhone = document.getElementById('phone-input').value;

        // Normalize phone numbers for comparison (remove all non-digits)
        const normalizePhone = (phone) => phone ? phone.replace(/\D/g, '') : '';
        const oldPhoneNormalized = normalizePhone(profile?.phone_number);
        const newPhoneNormalized = normalizePhone(newPhone);

        // Check if the phone number actually changed
        const phoneChanged = oldPhoneNormalized !== newPhoneNormalized;

        if (!phoneChanged) {
          // Phone number didn't actually change
          // If it's not verified, send to verify; otherwise just close edit mode
          if (!profile?.phone_verified) {
            successMessage.className = 'alert alert-success';
            successMessage.textContent = 'Redirecting to verification...';
            setTimeout(() => navigateTo('/verify-phone'), 1000);
          } else {
            // Already verified, just close edit mode
            successMessage.className = 'alert alert-success';
            successMessage.textContent = 'No changes made.';
            document.getElementById('phone-display').style.display = 'block';
            document.getElementById('phone-edit').style.display = 'none';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            setTimeout(() => successMessage.classList.add('hidden'), 2000);
          }
          return;
        }

        // Phone number changed - update and mark as unverified
        const { error } = await supabase
          .from('users')
          .update({
            phone_number: newPhone,
            phone_verified: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Phone number updated. Redirecting to verification...';

        setTimeout(() => navigateTo('/verify-phone'), 1500);
      } catch (error) {
        console.error('Save phone error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to save phone number. Please try again.';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Organization inline editing
    document.getElementById('org-display').addEventListener('click', () => {
      document.getElementById('org-display').style.display = 'none';
      document.getElementById('org-edit').style.display = 'block';
      document.getElementById('org-input').focus();
    });

    document.getElementById('cancel-org-btn').addEventListener('click', () => {
      document.getElementById('org-display').style.display = 'block';
      document.getElementById('org-edit').style.display = 'none';
    });

    document.getElementById('save-org-btn').addEventListener('click', async () => {
      const saveBtn = document.getElementById('save-org-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        if (!this.organization?.id) {
          throw new Error('No organization found');
        }

        const newName = document.getElementById('org-input').value.trim();
        if (!newName) {
          throw new Error('Organization name cannot be empty');
        }

        const { error } = await Organization.update(this.organization.id, { name: newName });
        if (error) throw error;

        // Update display and cache
        document.getElementById('org-display').textContent = newName;
        document.getElementById('org-display').style.display = 'block';
        document.getElementById('org-edit').style.display = 'none';
        this.organization.name = newName;
        if (this.cachedData) {
          this.cachedData.organization = this.organization;
        }

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Organization name updated successfully';
        successMessage.classList.remove('hidden');
        setTimeout(() => successMessage.classList.add('hidden'), 3000);
      } catch (error) {
        console.error('Save org error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to save organization name. Please try again.';
        errorMessage.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Sign out
    signoutBtn.addEventListener('click', async () => {
      signoutBtn.disabled = true;
      signoutBtn.textContent = 'Signing out...';

      try {
        await signOut();
        // Router will handle redirect via auth state change
      } catch (error) {
        console.error('Sign out error:', error);
        signoutBtn.disabled = false;
        signoutBtn.textContent = 'Sign Out';
      }
    });

    // Push notifications setup
    this.initPushNotificationUI();

    // Save notifications
    saveNotificationsBtn.addEventListener('click', async () => {
      saveNotificationsBtn.disabled = true;
      saveNotificationsBtn.textContent = 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

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

        const { error } = await supabase
          .from('notification_preferences')
          .upsert(preferences, { onConflict: 'user_id' });

        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Notification settings saved successfully';

        setTimeout(() => {
          successMessage.classList.add('hidden');
        }, 3000);
      } catch (error) {
        console.error('Save notifications error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to save notification settings. Please try again.';
      } finally {
        saveNotificationsBtn.disabled = false;
        saveNotificationsBtn.textContent = 'Save Notification Settings';
      }
    });

    // Delete account
    deleteAccountBtn.addEventListener('click', async () => {
      const confirmation = prompt(
        'This will permanently delete your account and all data. Type "DELETE" to confirm:'
      );

      if (confirmation !== 'DELETE') {
        return;
      }

      deleteAccountBtn.disabled = true;
      deleteAccountBtn.textContent = 'Deleting...';
      errorMessage.classList.add('hidden');

      try {
        // TODO: Implement account deletion
        // This would require a Supabase Edge Function or admin API call
        // For now, show a message
        errorMessage.className = 'alert alert-warning';
        errorMessage.textContent = 'Account deletion is not yet implemented. Please contact support.';

        deleteAccountBtn.disabled = false;
        deleteAccountBtn.textContent = 'Delete Account';
      } catch (error) {
        console.error('Delete account error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to delete account. Please try again.';

        deleteAccountBtn.disabled = false;
        deleteAccountBtn.textContent = 'Delete Account';
      }
    });
  }

  /**
   * Initialize push notification UI and event handlers
   */
  async initPushNotificationUI() {
    const pushStatus = document.getElementById('push-status');
    const pushEnabled = document.getElementById('push-enabled');
    const pushOptions = document.getElementById('push-options');
    const testPushBtn = document.getElementById('test-push-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

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
          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Push notifications enabled successfully!';
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        } else {
          pushStatus.textContent = result.error || 'Failed to enable push notifications.';
          pushEnabled.checked = false;
          pushOptions.style.display = 'none';
          // Show help modal for permission errors
          if (result.error?.includes('permission') || result.error?.includes('blocked')) {
            this.showPushHelpModal();
          } else {
            errorMessage.className = 'alert alert-error';
            errorMessage.textContent = result.error || 'Failed to enable push notifications.';
            errorMessage.classList.remove('hidden');
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
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Test notification sent!';
        successMessage.classList.remove('hidden');
        setTimeout(() => successMessage.classList.add('hidden'), 3000);
      } catch (error) {
        console.error('Test notification error:', error);
        // Show help modal for permission errors
        if (error.message?.includes('permission') || error.message?.includes('blocked')) {
          this.showPushHelpModal();
        } else {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = error.message || 'Failed to send test notification.';
          errorMessage.classList.remove('hidden');
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