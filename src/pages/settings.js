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

    console.log('Profile data:', {
      phone_number: profile?.phone_number,
      phone_verified: profile?.phone_verified
    });

    // Load notification preferences
    const { data: notifPrefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Load active service number
    const { data: serviceNumber } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 800px; padding: 2rem 1rem;">
        <h1 style="margin-bottom: 1.5rem;">Settings</h1>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

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

        <!-- Phone Numbers -->
        <div class="card" style="margin-bottom: 1rem;">
          <h2 style="margin: 0 0 0.5rem 0;">Phone Numbers</h2>
          <p class="text-muted" style="margin: 0 0 1rem 0;">Manage your active service numbers</p>
          <button class="btn btn-primary btn-full" onclick="navigateTo('/manage-numbers')">
            Manage Numbers
          </button>
        </div>

        <!-- Profile Section -->
        <div class="card">
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

          <!-- Service Number (read-only) -->
          <div class="form-group">
            <label style="font-weight: 600; margin: 0 0 0.5rem 0;">Service Number</label>
            <div style="padding: 0.5rem;">${serviceNumber?.phone_number ? this.formatPhoneNumber(serviceNumber.phone_number) : 'Not configured'}</div>
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

          <!-- Voice AI Stack Toggle -->
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h3 style="margin: 0; font-size: 1rem;">Voice AI Backend</h3>
                <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">
                  <span id="voice-stack-label">${config?.active_voice_stack === 'livekit' ? 'LiveKit (Custom Voices)' : 'Retell (Standard)'}</span>
                </p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="voice-stack-toggle" ${config?.active_voice_stack === 'livekit' ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
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
    const voiceStackToggle = document.getElementById('voice-stack-toggle');

    // Voice AI stack toggle
    if (voiceStackToggle) {
      voiceStackToggle.addEventListener('change', async (e) => {
        const newStack = e.target.checked ? 'livekit' : 'retell';
        const label = document.getElementById('voice-stack-label');

        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');

        try {
          const { data, error } = await supabase.functions.invoke('admin-switch-voice-stack', {
            body: { stack: newStack }
          });

          if (error) throw error;

          // Update label
          label.textContent = newStack === 'livekit' ? 'LiveKit (Custom Voices)' : 'Retell (Standard)';

          successMessage.className = 'alert alert-success';
          successMessage.textContent = `Switched to ${newStack === 'livekit' ? 'LiveKit' : 'Retell'} voice AI backend`;

          setTimeout(() => {
            successMessage.classList.add('hidden');
          }, 3000);
        } catch (error) {
          console.error('Switch voice stack error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Failed to switch voice AI backend. Please try again.';

          // Revert toggle
          e.target.checked = !e.target.checked;
        }
      });
    }

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