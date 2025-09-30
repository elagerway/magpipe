/**
 * Settings Page
 */

import { User, AgentConfig } from '../models/index.js';
import { getCurrentUser, signOut } from '../lib/supabase.js';
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

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 800px; padding-top: 2rem;">
        <h1>Settings</h1>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

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

        <!-- Notifications (Placeholder) -->
        <div class="card">
          <h2>Notifications</h2>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="email-notifications" checked />
              <span>Email notifications for missed calls</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="sms-notifications" />
              <span>SMS notifications for important messages</span>
            </label>
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

    // Save notifications (placeholder)
    saveNotificationsBtn.addEventListener('click', () => {
      successMessage.className = 'alert alert-success';
      successMessage.textContent = 'Notification settings saved successfully';

      setTimeout(() => {
        successMessage.classList.add('hidden');
      }, 3000);
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