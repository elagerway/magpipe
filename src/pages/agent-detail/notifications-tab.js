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
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-inbound-calls" />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-all-calls" />
              <span>All calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-inbound-messages" />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-email-all-messages" />
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
              <input type="checkbox" id="notif-sms-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="form-group">
            <label for="notif-sms-phone-number">Phone Number</label>
            <input type="tel" id="notif-sms-phone-number" class="form-input" placeholder="+1 (555) 123-4567" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-inbound-calls" />
              <span>Inbound calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-all-calls" />
              <span>All calls</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-inbound-messages" />
              <span>Inbound messages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
              <input type="checkbox" id="notif-sms-all-messages" />
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
              <input type="checkbox" id="notif-push-enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div id="notif-push-status" style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
            Checking push notification support...
          </div>
          <div id="notif-push-options" style="display: none;">
            <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-inbound-calls" />
                <span>Inbound calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-all-calls" />
                <span>All calls</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-inbound-messages" />
                <span>Inbound messages</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem;">
                <input type="checkbox" id="notif-push-all-messages" />
                <span>All messages</span>
              </label>
            </div>
            <button class="btn btn-sm btn-secondary" id="notif-test-push-btn" style="margin-top: 0.75rem;">
              Send Test Notification
            </button>
          </div>
        </div>

        <div id="notif-save-status" style="text-align: center; font-size: 0.875rem; color: var(--text-secondary); min-height: 1.25rem;"></div>

        <!-- App Notifications (Slack, HubSpot) -->
        ${this.renderAppNotificationCards()}

        </div>
      </div>
    `;
  },

  renderAppNotificationCards() {
    const appIcons = {
      slack: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z" fill="#E01E5A"/><path d="M2 14.5a2.5 2.5 0 0 0 5 0V12H4.5A2.5 2.5 0 0 0 2 14.5z" fill="#36C5F0"/><path d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z" fill="#2EB67D"/><path d="M22 9.5a2.5 2.5 0 0 0-5 0V12h2.5A2.5 2.5 0 0 0 22 9.5z" fill="#ECB22E"/><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5V7h2.5a2.5 2.5 0 0 0 0-5z" fill="#36C5F0"/><path d="M2 9.5A2.5 2.5 0 0 0 4.5 12H7V9.5a2.5 2.5 0 0 0-5 0z" fill="#E01E5A"/><path d="M14.5 22a2.5 2.5 0 0 0 2.5-2.5V17h-2.5a2.5 2.5 0 0 0 0 5z" fill="#ECB22E"/><path d="M22 14.5a2.5 2.5 0 0 0-2.5-2.5H17v2.5a2.5 2.5 0 0 0 5 0z" fill="#2EB67D"/></svg>`,
      hubspot: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.5 8.2V5.8c.8-.4 1.3-1.2 1.3-2.1C18.8 2.2 17.6 1 16.1 1S13.4 2.2 13.4 3.7c0 .9.5 1.7 1.3 2.1v2.4c-1.1.2-2.1.7-2.9 1.4L5.6 5.1c.1-.2.1-.5.1-.7 0-1.2-1-2.2-2.2-2.2S1.3 3.2 1.3 4.4s1 2.2 2.2 2.2c.4 0 .8-.1 1.2-.3l6.1 4.5c-.7 1-1.1 2.2-1.1 3.5 0 1.2.4 2.4 1 3.3l-1.8 1.8c-.2-.1-.5-.1-.7-.1-1.2 0-2.2 1-2.2 2.2s1 2.2 2.2 2.2 2.2-1 2.2-2.2c0-.3 0-.5-.1-.7l1.8-1.8c1 .7 2.3 1.2 3.6 1.2 3.5 0 6.3-2.8 6.3-6.3 0-3.1-2.2-5.7-5.1-6.3h-.4zM16 18.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z" fill="#FF7A59"/></svg>`,
    };

    const notifiableApps = this.connectedApps.filter(a => ['slack', 'hubspot'].includes(a.slug));

    if (notifiableApps.length === 0) {
      return `
        <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">App Notifications</h3>
          <p class="text-muted" style="margin: 0; font-size: 0.875rem;">
            Connect apps in the <a href="#" onclick="navigateTo('/apps'); return false;">Apps</a> page to send data to Slack, HubSpot, and more.
          </p>
        </div>
      `;
    }

    const hasTranslateTo = !!this.agent.translate_to;

    const appCards = notifiableApps.map(app => {
      const prefs = this.agent.functions?.app_functions?.[app.slug] || {};
      const enabled = prefs.enabled !== false;
      const sms = prefs.sms !== false;
      const calls = prefs.calls !== false;
      const webChat = prefs.web_chat !== false;
      const translations = prefs.translations !== false;

      const icon = appIcons[app.slug] || '';
      const disabledClass = !enabled ? 'app-func-disabled' : '';

      return `
        <div class="app-func-card ${disabledClass}" data-app="${app.slug}">
          <div class="app-func-header">
            <div class="app-func-title">
              <span class="app-func-icon">${icon}</span>
              <span class="app-func-name">${app.name}</span>
            </div>
            <label class="toggle-switch-sm">
              <input type="checkbox" class="app-func-master-toggle" data-app="${app.slug}" ${enabled ? 'checked' : ''} />
              <span class="toggle-slider-sm"></span>
            </label>
          </div>
          <div class="app-func-channels">
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="sms" ${sms ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>SMS messages</span>
            </label>
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="calls" ${calls ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>Call summaries</span>
            </label>
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="web_chat" ${webChat ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>Web chat messages</span>
            </label>
            ${hasTranslateTo ? `
              <label class="app-func-channel">
                <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="translations" ${translations ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
                <span>Include translations</span>
              </label>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <h3 style="margin: 1rem 0 0.5rem 0; font-size: 1rem;">App Notifications</h3>
      <p class="section-desc" style="margin-bottom: 0.75rem;">Control which apps receive data from conversations.</p>
      <div class="app-func-cards" style="margin-bottom: 1rem;">
        ${appCards}
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
    document.querySelectorAll('#notif-email-enabled, #notif-email-inbound-calls, #notif-email-all-calls, #notif-email-inbound-messages, #notif-email-all-messages, #notif-sms-enabled, #notif-sms-inbound-calls, #notif-sms-all-calls, #notif-sms-inbound-messages, #notif-sms-all-messages, #notif-push-enabled, #notif-push-inbound-calls, #notif-push-all-calls, #notif-push-inbound-messages, #notif-push-all-messages').forEach(el => {
      el.addEventListener('change', autoSaveNotifications);
    });

    // Debounce text inputs (email address, phone number)
    document.querySelectorAll('#notif-email-address, #notif-sms-phone-number').forEach(el => {
      el.addEventListener('input', autoSaveNotifications);
    });

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
};
