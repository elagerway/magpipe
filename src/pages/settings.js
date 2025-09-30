/**
 * Settings Page
 */

import { User, AgentConfig } from '../models/index.js';
import { getCurrentUser, signOut, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class SettingsPage {
  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    const { profile } = await User.getProfile(user.id);
    const { config } = await AgentConfig.getByUserId(user.id);

    // Load notification preferences
    const { data: notifPrefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 800px; padding-top: 2rem;">
        <h1>Settings</h1>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

        <!-- User ID -->
        <div class="card">
          <div class="form-group">
            <strong>User ID:</strong>
            <code style="
              background: var(--bg-secondary);
              padding: 0.25rem 0.5rem;
              border-radius: var(--radius-sm);
              font-size: 0.875rem;
              color: var(--text-primary);
              user-select: all;
              display: inline-block;
              margin-left: 0.5rem;
            ">${user.id}</code>
          </div>
        </div>

        <!-- Phone Numbers -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="margin: 0 0 0.5rem 0;">Phone Numbers</h2>
              <p class="text-muted" style="margin: 0;">Manage your active service numbers</p>
            </div>
            <button class="btn btn-primary" onclick="navigateTo('/manage-numbers')">
              Manage Numbers
            </button>
          </div>
        </div>

        <!-- Profile Section -->
        <div class="card">
          <h2>Profile</h2>
          <div class="form-group">
            <strong>Name:</strong> ${profile?.name || 'N/A'}
          </div>
          <div class="form-group">
            <strong>Email:</strong> ${user.email}
          </div>
          <div class="form-group">
            <strong>Phone Number:</strong> ${profile?.phone_number || 'Not verified'}
            ${profile?.phone_verified ? '<span style="color: var(--success-color); margin-left: 0.5rem;">✓ Verified</span>' : ''}
          </div>
          <div class="form-group">
            <strong>Service Number:</strong> ${profile?.service_number ? this.formatPhoneNumber(profile.service_number) : 'Not configured'}
          </div>
        </div>

        <!-- Agent Configuration -->
        <div class="card">
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
              ">${config.retell_agent_id || 'Not assigned'}</code>
            </div>
            <div class="form-group">
              <strong>Voice:</strong> ${config.voice_id}
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

  attachEventListeners() {
    const signoutBtn = document.getElementById('signout-btn');
    const saveNotificationsBtn = document.getElementById('save-notifications-btn');
    const resetConfigBtn = document.getElementById('reset-config-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

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