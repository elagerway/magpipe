import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import {
  isPushSupported,
  getPermissionStatus,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed,
  showTestNotification
} from '../../services/pushNotifications.js';

export const notificationsTabMethods = {
  renderNotificationsTab() {
    // notifPrefs is loaded in attachNotificationsTabListeners via async fetch
    const prefs = this._notifPrefs || {};
    const isVoice = ['inbound_voice', 'outbound_voice'].includes(this.agent.agent_type);
    const isText = this.agent.agent_type === 'text';
    const isWebChat = this.agent.agent_type === 'web_chat';

    return `
      <div class="config-section">
        <h3>Notifications</h3>
        <p class="section-desc">Receive alerts for missed calls and new messages from this agent</p>

        <div id="notif-loading" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading notification preferences...</div>
        <div id="notif-content" style="display: none;">

        <!-- Email Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Email Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get alerts sent to your email</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="notif-email-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group">
            <label for="notif-email-address">Email Address</label>
            <input type="email" id="notif-email-address" class="form-input" placeholder="your@email.com" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            ${isVoice ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-inbound-calls" />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-all-calls" />
              <span>All calls</span>
            </label>
            ` : ''}
            ${isText || isWebChat ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-inbound-messages" />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-all-messages" />
              <span>All messages</span>
            </label>
            ` : ''}
          </div>
          <button class="btn btn-sm btn-secondary" id="notif-test-email-btn" style="margin-top: 0.75rem;">Send Test Notification</button>
        </div>

        <!-- SMS Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">SMS Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get alerts sent to your phone</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="notif-sms-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group">
            <label for="notif-sms-phone-number">Phone Number</label>
            <input type="tel" id="notif-sms-phone-number" class="form-input" placeholder="+1 (555) 123-4567" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            ${isVoice ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-inbound-calls" />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-all-calls" />
              <span>All calls</span>
            </label>
            ` : ''}
            ${isText || isWebChat ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-inbound-messages" />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-all-messages" />
              <span>All messages</span>
            </label>
            ` : ''}
          </div>
          <button class="btn btn-sm btn-secondary" id="notif-test-sms-btn" style="margin-top: 0.75rem;">Send Test Notification</button>
        </div>

        <!-- Push Notifications -->
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Push Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get instant alerts on this device</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="notif-push-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="notif-push-status" style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
            Checking push notification support...
          </div>
          <div id="notif-push-options" style="display: none;">
            <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
              ${isVoice ? `
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-inbound-calls" />
                <span>Inbound calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-all-calls" />
                <span>All calls</span>
              </label>
              ` : ''}
              ${isText || isWebChat ? `
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-inbound-messages" />
                <span>Inbound messages</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-all-messages" />
                <span>All messages</span>
              </label>
              ` : ''}
            </div>
            <button class="btn btn-sm btn-secondary" id="notif-test-push-btn" style="margin-top: 0.75rem;">
              Send Test Notification
            </button>
          </div>
        </div>

        <!-- Slack Notifications -->
        ${this.connectedApps.some(a => a.slug === 'slack') ? `
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Slack Notifications</h3>
              <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Get alerts sent to your Slack workspace</p>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="notif-slack-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            ${isVoice ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-slack-inbound-calls" />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-slack-all-calls" />
              <span>All calls</span>
            </label>
            ` : ''}
            ${isText || isWebChat ? `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-slack-inbound-messages" />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-slack-all-messages" />
              <span>All messages</span>
            </label>
            ` : ''}
          </div>
          <button class="btn btn-sm btn-secondary" id="notif-test-slack-btn" style="margin-top: 0.75rem;">
            Send Test Notification
          </button>
        </div>
        ` : ''}

        <div id="notif-save-status" style="text-align: center; font-size: 0.875rem; color: var(--text-secondary); min-height: 1.25rem;"></div>

        </div>
      </div>
    `;
  },

  async attachNotificationsTabListeners() {
    const agentId = this.agentId;
    const userId = this.userId;

    // Load notification preferences for this agent
    let prefs = null;
    const { data: agentPrefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .maybeSingle();

    if (agentPrefs) {
      prefs = agentPrefs;
    } else {
      // Fallback to user-level prefs (agent_id IS NULL)
      const { data: userPrefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .is('agent_id', null)
        .maybeSingle();
      prefs = userPrefs;
    }

    // Get user email/phone for defaults
    const { user } = await getCurrentUser();
    const { data: profile } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .single();

    // Populate form values
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    const setChecked = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!val;
    };

    // Email
    setChecked('notif-email-enabled', prefs?.email_enabled);
    setVal('notif-email-address', prefs?.email_address || user?.email || '');
    setChecked('notif-email-inbound-calls', prefs?.email_inbound_calls);
    setChecked('notif-email-all-calls', prefs?.email_all_calls);
    setChecked('notif-email-inbound-messages', prefs?.email_inbound_messages);
    setChecked('notif-email-all-messages', prefs?.email_all_messages);

    // SMS
    setChecked('notif-sms-enabled', prefs?.sms_enabled);
    setVal('notif-sms-phone-number', prefs?.sms_phone_number || profile?.phone_number || '');
    setChecked('notif-sms-inbound-calls', prefs?.sms_inbound_calls);
    setChecked('notif-sms-all-calls', prefs?.sms_all_calls);
    setChecked('notif-sms-inbound-messages', prefs?.sms_inbound_messages);
    setChecked('notif-sms-all-messages', prefs?.sms_all_messages);

    // Push
    setChecked('notif-push-enabled', prefs?.push_enabled);
    setChecked('notif-push-inbound-calls', prefs?.push_inbound_calls !== false);
    setChecked('notif-push-all-calls', prefs?.push_all_calls);
    setChecked('notif-push-inbound-messages', prefs?.push_inbound_messages !== false);
    setChecked('notif-push-all-messages', prefs?.push_all_messages);

    // Slack
    setChecked('notif-slack-enabled', prefs?.slack_enabled);
    setChecked('notif-slack-inbound-calls', prefs?.slack_inbound_calls);
    setChecked('notif-slack-all-calls', prefs?.slack_all_calls);
    setChecked('notif-slack-inbound-messages', prefs?.slack_inbound_messages);
    setChecked('notif-slack-all-messages', prefs?.slack_all_messages);

    // Show push options if enabled
    const pushOptions = document.getElementById('notif-push-options');
    if (pushOptions && prefs?.push_enabled) {
      pushOptions.style.display = 'block';
    }

    // Hide loading, show content
    const loadingEl = document.getElementById('notif-loading');
    const contentEl = document.getElementById('notif-content');
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // Push notifications setup
    this.initNotifPushUI();

    // Auto-save: debounced save on any notification input change
    let notifSaveTimer = null;
    const statusEl = document.getElementById('notif-save-status');
    const autoSaveNotifications = () => {
      clearTimeout(notifSaveTimer);
      notifSaveTimer = setTimeout(async () => {
        if (statusEl) statusEl.textContent = 'Saving...';
        try {
          const preferences = {
            user_id: userId,
            agent_id: agentId,
            email_enabled: document.getElementById('notif-email-enabled')?.checked || false,
            email_address: document.getElementById('notif-email-address')?.value || '',
            email_inbound_calls: document.getElementById('notif-email-inbound-calls')?.checked || false,
            email_all_calls: document.getElementById('notif-email-all-calls')?.checked || false,
            email_inbound_messages: document.getElementById('notif-email-inbound-messages')?.checked || false,
            email_all_messages: document.getElementById('notif-email-all-messages')?.checked || false,
            sms_enabled: document.getElementById('notif-sms-enabled')?.checked || false,
            sms_phone_number: document.getElementById('notif-sms-phone-number')?.value || '',
            sms_inbound_calls: document.getElementById('notif-sms-inbound-calls')?.checked || false,
            sms_all_calls: document.getElementById('notif-sms-all-calls')?.checked || false,
            sms_inbound_messages: document.getElementById('notif-sms-inbound-messages')?.checked || false,
            sms_all_messages: document.getElementById('notif-sms-all-messages')?.checked || false,
            push_enabled: document.getElementById('notif-push-enabled')?.checked || false,
            push_inbound_calls: document.getElementById('notif-push-inbound-calls')?.checked || false,
            push_all_calls: document.getElementById('notif-push-all-calls')?.checked || false,
            push_inbound_messages: document.getElementById('notif-push-inbound-messages')?.checked || false,
            push_all_messages: document.getElementById('notif-push-all-messages')?.checked || false,
            slack_enabled: document.getElementById('notif-slack-enabled')?.checked || false,
            slack_inbound_calls: document.getElementById('notif-slack-inbound-calls')?.checked || false,
            slack_all_calls: document.getElementById('notif-slack-all-calls')?.checked || false,
            slack_inbound_messages: document.getElementById('notif-slack-inbound-messages')?.checked || false,
            slack_all_messages: document.getElementById('notif-slack-all-messages')?.checked || false,
            updated_at: new Date().toISOString()
          };
          const { error } = await supabase
            .from('notification_preferences')
            .upsert(preferences, { onConflict: 'user_id,agent_id' });
          if (error) throw error;
          if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { statusEl.textContent = ''; }, 1500); }
        } catch (error) {
          console.error('Auto-save notifications error:', error);
          if (statusEl) statusEl.textContent = 'Save failed';
        }
      }, 500);
    };

    // Bind change events on all notification checkboxes
    document.querySelectorAll('#notif-email-enabled, #notif-email-inbound-calls, #notif-email-all-calls, #notif-email-inbound-messages, #notif-email-all-messages, #notif-sms-enabled, #notif-sms-inbound-calls, #notif-sms-all-calls, #notif-sms-inbound-messages, #notif-sms-all-messages, #notif-push-enabled, #notif-push-inbound-calls, #notif-push-all-calls, #notif-push-inbound-messages, #notif-push-all-messages, #notif-slack-enabled, #notif-slack-inbound-calls, #notif-slack-all-calls, #notif-slack-inbound-messages, #notif-slack-all-messages').forEach(el => {
      el.addEventListener('change', autoSaveNotifications);
    });

    // Debounce text inputs (email address, phone number)
    document.querySelectorAll('#notif-email-address, #notif-sms-phone-number').forEach(el => {
      el.addEventListener('input', autoSaveNotifications);
    });

    // Test notification buttons
    this.attachTestNotificationListeners();

    // App Functions listeners (Slack, HubSpot cards)
    this.attachAppFunctionListeners();
  },

  async initNotifPushUI() {
    const pushStatus = document.getElementById('notif-push-status');
    const pushEnabled = document.getElementById('notif-push-enabled');
    const pushOptions = document.getElementById('notif-push-options');
    const testPushBtn = document.getElementById('notif-test-push-btn');

    if (!pushStatus || !pushEnabled) return;

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
      pushStatus.textContent = 'Push notifications are blocked. Enable in browser settings.';
      pushEnabled.disabled = true;
    } else if (subscribed) {
      pushStatus.textContent = 'Push notifications are active on this device.';
      pushEnabled.checked = true;
      if (pushOptions) pushOptions.style.display = 'block';
    } else if (permission === 'granted') {
      pushStatus.textContent = 'Push notifications are available. Enable above to receive alerts.';
    } else {
      pushStatus.textContent = 'Enable push notifications to receive instant alerts on this device.';
    }

    // Handle push toggle change
    pushEnabled.addEventListener('change', async () => {
      const isEnabled = pushEnabled.checked;
      if (pushOptions) pushOptions.style.display = isEnabled ? 'block' : 'none';

      if (isEnabled) {
        pushStatus.textContent = 'Setting up push notifications...';
        const result = await subscribeToPush();

        if (result.success) {
          pushStatus.textContent = 'Push notifications are now active on this device.';
          showToast('Push notifications enabled successfully!', 'success');
        } else {
          pushStatus.textContent = result.error || 'Failed to enable push notifications.';
          pushEnabled.checked = false;
          if (pushOptions) pushOptions.style.display = 'none';
          showToast(result.error || 'Failed to enable push notifications.', 'error');
        }
      } else {
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
    if (testPushBtn) {
      testPushBtn.addEventListener('click', async () => {
        testPushBtn.disabled = true;
        testPushBtn.textContent = 'Sending...';

        try {
          await showTestNotification();
          showToast('Test notification sent!', 'success');
        } catch (error) {
          console.error('Test notification error:', error);
          showToast(error.message || 'Failed to send test notification.', 'error');
        } finally {
          testPushBtn.disabled = false;
          testPushBtn.textContent = 'Send Test Notification';
        }
      });
    }
  },

  attachTestNotificationListeners() {
    const sendTest = async (btn, endpoint, payload) => {
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Failed to send');
        showToast('Test notification sent!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to send test notification', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Test Notification';
      }
    };

    const testPayload = {
      userId: this.userId,
      agentId: this.agentId,
      type: 'completed_call',
      data: {
        callerNumber: '+1 (555) 000-0000',
        timestamp: new Date().toISOString(),
        duration: 42,
        successful: true,
      },
    };

    const emailBtn = document.getElementById('notif-test-email-btn');
    if (emailBtn) {
      emailBtn.addEventListener('click', () => sendTest(emailBtn, 'send-notification-email', testPayload));
    }

    const smsBtn = document.getElementById('notif-test-sms-btn');
    if (smsBtn) {
      smsBtn.addEventListener('click', () => sendTest(smsBtn, 'send-notification-sms', testPayload));
    }

    const slackBtn = document.getElementById('notif-test-slack-btn');
    if (slackBtn) {
      slackBtn.addEventListener('click', () => sendTest(slackBtn, 'send-notification-slack', testPayload));
    }
  },
};
