/**
 * Settings Page
 */

import { User, AgentConfig } from '../models/index.js';
import { getCurrentUser, signOut, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { createAccessCodeSettings, addAccessCodeSettingsStyles } from '../components/AccessCodeSettings.js';
import { createKnowledgeSourceManager, addKnowledgeSourceManagerStyles } from '../components/KnowledgeSourceManager.js';

// ElevenLabs Voices - subset for display purposes
const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Rachel (Default)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', label: 'Adam' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', label: 'Sarah' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', label: 'Domi' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', label: 'Dave' },
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', label: 'Fin' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', label: 'Antoni' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', label: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', label: 'George' },
  { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', label: 'Emily' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', label: 'Elli' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', label: 'Callum' },
  { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick', label: 'Patrick' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', label: 'Harry' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', label: 'Liam' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', label: 'Dorothy' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', label: 'Josh' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', label: 'Arnold' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', label: 'Charlotte' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Alice', label: 'Alice' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Matilda', label: 'Matilda' },
  { id: 'Yko7PKHZNXotIFUBG7I9', name: 'Matthew', label: 'Matthew' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', label: 'James' },
  { id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph', label: 'Joseph' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', label: 'Jeremy' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Michael', label: 'Michael' },
  { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Ethan', label: 'Ethan' },
  { id: 'g5CIjZEefAph4nQFvHAz', name: 'Chris', label: 'Chris' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Gigi', label: 'Gigi' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', label: 'Brian' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', label: 'Daniel' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', label: 'Bill' },
  { id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie', label: 'Jessie' },
];

export default class SettingsPage {
  constructor() {
    this.accessCodeSettings = null;
    this.knowledgeManager = null;
    this.cachedData = null;
    this.lastFetchTime = 0;
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

    // Use cached data if fetched within last 30 seconds
    const now = Date.now();
    let profile, billingInfo, config, notifPrefs, serviceNumbers;

    if (this.cachedData && (now - this.lastFetchTime) < 30000) {
      ({ profile, billingInfo, config, notifPrefs, serviceNumbers } = this.cachedData);
    } else {
      // Fetch all data in parallel for speed
      const [profileResult, billingResult, configResult, notifResult, numbersResult] = await Promise.all([
        User.getProfile(user.id),
        supabase.from('users').select('plan, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_current_period_end').eq('id', user.id).single(),
        AgentConfig.getByUserId(user.id),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).single(),
        supabase.from('service_numbers').select('phone_number, is_active').eq('user_id', user.id).order('is_active', { ascending: false })
      ]);

      profile = profileResult.profile;
      billingInfo = billingResult.data;
      config = configResult.config;
      notifPrefs = notifResult.data;
      serviceNumbers = numbersResult.data;

      // Cache the data
      this.cachedData = { profile, billingInfo, config, notifPrefs, serviceNumbers };
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

    const activeNumbers = serviceNumbers?.filter(n => n.is_active) || [];
    const inactiveNumbers = serviceNumbers?.filter(n => !n.is_active) || [];

    // Check for billing success/canceled in URL
    const urlParams = new URLSearchParams(window.location.search);
    const billingStatus = urlParams.get('billing');

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 800px; padding: 2rem 1rem;">
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

        </div>

        <!-- Billing & Plan Section -->
        <div class="card" style="margin-bottom: 1rem;">
          <h2>Billing & Plan</h2>
          <div id="billing-section">
            <div class="billing-plan" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: 1rem;">
              <div>
                <div style="font-weight: 600; font-size: 1.1rem;">
                  ${profile?.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
                  ${profile?.plan === 'pro' ? '<span style="background: var(--success-color); color: white; padding: 0.125rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; margin-left: 0.5rem;">ACTIVE</span>' : ''}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem;">
                  ${profile?.plan === 'pro' ? '$9.99/month' : 'Limited features'}
                </div>
              </div>
              ${profile?.plan === 'pro' ? `
                <button class="btn btn-secondary" id="manage-billing-btn">
                  Manage Billing
                </button>
              ` : `
                <button class="btn btn-primary" id="upgrade-btn">
                  Upgrade to Pro
                </button>
              `}
            </div>

            ${profile?.plan === 'free' ? `
              <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
                <h3 style="margin: 0 0 0.75rem 0; font-size: 1rem;">Pro Plan Features</h3>
                <ul style="margin: 0; padding-left: 1.25rem; color: var(--text-secondary);">
                  <li style="margin-bottom: 0.5rem;">Unlimited phone numbers</li>
                  <li style="margin-bottom: 0.5rem;">Voice cloning capabilities</li>
                  <li style="margin-bottom: 0.5rem;">Priority support</li>
                  <li style="margin-bottom: 0.5rem;">Advanced analytics</li>
                  <li>Unlimited calls, minutes, and SMS</li>
                </ul>
              </div>
            ` : `
              <div style="color: var(--text-secondary); font-size: 0.875rem;">
                ${profile?.stripe_current_period_end ? `Next billing date: ${new Date(profile.stripe_current_period_end).toLocaleDateString()}` : ''}
              </div>
            `}
          </div>
        </div>

        <!-- Agent Configuration -->
        <div class="card" style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="margin: 0;">Agent Configuration</h2>
            <button class="btn btn-secondary" onclick="navigateTo('/agent-config')">
              Edit Configuration
            </button>
          </div>

          ${config ? `
            <div class="form-group">
              <strong>Agent ID:</strong>
              <code style="
                background: var(--bg-secondary);
                padding: 0.25rem 0.5rem;
                border-radius: var(--radius-sm);
                font-size: 0.875rem;
                color: var(--text-primary);
                user-select: all;
              ">${config.agent_id || 'Not assigned'}</code>
            </div>
            <div class="form-group">
              <strong>Voice:</strong> ${this.getVoiceName(config.voice_id, config.cloned_voice_name)}
            </div>
            <div class="form-group">
              <strong>Response Style:</strong> ${config.response_style || 'N/A'}
            </div>
            <div class="form-group">
              <strong>Vetting Strategy:</strong> ${config.vetting_strategy || 'N/A'}
            </div>
            <div class="form-group">
              <strong>Transfer Unknown Callers:</strong> ${config.transfer_unknown_callers ? 'Yes' : 'No'}
            </div>
            <div class="form-group">
              <strong>Creativity Level:</strong> ${config.temperature || 'N/A'}
            </div>
          ` : '<p class="text-muted">Agent not configured</p>'}
        </div>

        <!-- Phone Numbers -->
        <div class="card" style="margin-bottom: 1rem;">
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

        <!-- Quick Links -->
        <div class="card">
          <h2>Quick Links</h2>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-secondary btn-full" onclick="navigateTo('/contacts')" style="justify-content: flex-start;">
              📇 Manage Contacts
            </button>
            <button class="btn btn-secondary btn-full" onclick="navigateTo('/calls')" style="justify-content: flex-start;">
              📞 Call History
            </button>
            <button class="btn btn-secondary btn-full" onclick="navigateTo('/messages')" style="justify-content: flex-start;">
              💬 Messages
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

          <button class="btn btn-primary" id="save-notifications-btn">
            Save Notification Settings
          </button>
        </div>

        <!-- Phone Admin Access Code -->
        <div class="card">
          <div id="access-code-container"></div>
        </div>

        <!-- Knowledge Base -->
        <div class="card">
          <h2>Knowledge Base</h2>
          <p class="text-muted">Add URLs to your assistant's knowledge base so it can reference your website content during conversations</p>
          <div id="knowledge-source-container"></div>
        </div>

        <!-- Danger Zone -->
        <div class="card" style="border: 2px solid var(--error-color);">
          <h2 style="color: var(--error-color);">Danger Zone</h2>
          <p class="text-muted">These actions cannot be undone</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-danger" id="reset-config-btn">
              Reset Agent Configuration
            </button>
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

  getVoiceName(voiceId, clonedVoiceName) {
    // If cloned voice, use that name
    if (clonedVoiceName) {
      return clonedVoiceName;
    }

    // Look up ElevenLabs voice by ID
    const voice = ELEVENLABS_VOICES.find(v => v.id === voiceId);
    if (voice) {
      return voice.label || voice.name;
    }

    // Fallback to ID if not found
    return voiceId || 'Not set';
  }

  attachEventListeners() {
    // Initialize access code settings component
    const accessCodeContainer = document.getElementById('access-code-container');
    if (accessCodeContainer) {
      this.accessCodeSettings = createAccessCodeSettings(accessCodeContainer);
    }

    // Billing buttons
    const upgradeBtn = document.getElementById('upgrade-btn');
    const manageBillingBtn = document.getElementById('manage-billing-btn');

    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', async () => {
        upgradeBtn.disabled = true;
        upgradeBtn.textContent = 'Loading...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              successUrl: `${window.location.origin}/settings?billing=success`,
              cancelUrl: `${window.location.origin}/settings?billing=canceled`
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to create checkout session');

          // Redirect to Stripe Checkout
          window.location.href = data.url;
        } catch (error) {
          console.error('Upgrade error:', error);
          alert('Failed to start checkout. Please try again.');
          upgradeBtn.disabled = false;
          upgradeBtn.textContent = 'Upgrade to Pro';
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

          // Redirect to Stripe Billing Portal
          window.location.href = data.url;
        } catch (error) {
          console.error('Billing portal error:', error);
          alert('Failed to open billing portal. Please try again.');
          manageBillingBtn.disabled = false;
          manageBillingBtn.textContent = 'Manage Billing';
        }
      });
    }

    // Initialize knowledge source manager component
    const knowledgeContainer = document.getElementById('knowledge-source-container');
    if (knowledgeContainer) {
      this.knowledgeManager = createKnowledgeSourceManager(knowledgeContainer);
    }

    const signoutBtn = document.getElementById('signout-btn');
    const saveNotificationsBtn = document.getElementById('save-notifications-btn');
    const resetConfigBtn = document.getElementById('reset-config-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

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

    // Reset agent config
    resetConfigBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset your agent configuration to defaults? This cannot be undone.')) {
        return;
      }

      resetConfigBtn.disabled = true;
      resetConfigBtn.textContent = 'Resetting...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user } = await getCurrentUser();
        const { config, error } = await AgentConfig.resetToDefaults(user.id);

        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Agent configuration reset successfully. Reloading...';

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        console.error('Reset config error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to reset configuration. Please try again.';

        resetConfigBtn.disabled = false;
        resetConfigBtn.textContent = 'Reset Agent Configuration';
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
}