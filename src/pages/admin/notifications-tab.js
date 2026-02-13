import { showToast } from '../../lib/toast.js';

export const notificationsTabMethods = {
  async renderNotificationsTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="support-tab">
        <div class="loading-spinner">Loading notification settings...</div>
      </div>
    `;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-notifications-api`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'get_config' }),
        }
      );

      if (!response.ok) throw new Error('Failed to load notification config');
      const data = await response.json();
      this.notifConfig = data.config || {};
      this.slackConnected = data.slackConnected;
      this.slackWorkspace = data.slackWorkspace;

      this.renderNotificationsContent();
    } catch (error) {
      console.error('Error loading notification config:', error);
      const container = document.querySelector('.support-tab');
      if (container) {
        container.innerHTML = `
          <div class="detail-placeholder">
            <p style="color: var(--error-color);">Failed to load notification settings: ${error.message}</p>
            <button class="btn btn-primary" onclick="window.adminPage.renderNotificationsTab()">Retry</button>
          </div>
        `;
      }
    }
  },

  renderNotificationsContent() {
    const container = document.querySelector('.support-tab');
    if (!container) return;
    const cfg = this.notifConfig;

    const smsConfigured = !!cfg.sms_phone;
    const emailConfigured = !!cfg.email_address;
    const slackConfigured = this.slackConnected && !!cfg.slack_channel;

    container.innerHTML = `
      <!-- Delivery Channels -->
      <div class="support-section">
        <h3>Delivery Channels</h3>
        <p class="notif-section-desc">Configure where admin notifications are sent.</p>
        <div class="notif-channels-grid">
          <!-- SMS Channel -->
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon notif-channel-icon-sms">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">SMS</span>
                <span class="notif-channel-status ${smsConfigured ? 'notif-status-active' : 'notif-status-inactive'}">
                  ${smsConfigured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <button class="btn btn-secondary notif-test-btn" data-channel="sms" title="Send test SMS">Test</button>
            </div>
            <div class="notif-channel-body">
              <input type="tel" id="notif-sms-phone" class="form-input" placeholder="+16045551234" value="${cfg.sms_phone || ''}">
            </div>
          </div>

          <!-- Email Channel -->
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon notif-channel-icon-email">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">Email</span>
                <span class="notif-channel-status ${emailConfigured ? 'notif-status-active' : 'notif-status-inactive'}">
                  ${emailConfigured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <button class="btn btn-secondary notif-test-btn" data-channel="email" title="Send test email">Test</button>
            </div>
            <div class="notif-channel-body">
              <input type="email" id="notif-email-address" class="form-input" placeholder="admin@magpipe.ai" value="${cfg.email_address || ''}">
            </div>
          </div>

          <!-- Slack Channel -->
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon notif-channel-icon-slack">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="13" y="2" width="3" height="8" rx="1.5"/><path d="M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5"/>
                  <rect x="8" y="14" width="3" height="8" rx="1.5"/><path d="M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5"/>
                  <rect x="14" y="13" width="8" height="3" rx="1.5"/><path d="M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5"/>
                  <rect x="2" y="8" width="8" height="3" rx="1.5"/><path d="M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">Slack</span>
                <span class="notif-channel-status ${slackConfigured ? 'notif-status-active' : this.slackConnected ? 'notif-status-inactive' : 'notif-status-disconnected'}">
                  ${slackConfigured ? `Connected${this.slackWorkspace ? ` (${this.slackWorkspace})` : ''}` : this.slackConnected ? 'No channel set' : 'Not connected'}
                </span>
              </div>
              <button class="btn btn-secondary notif-test-btn" data-channel="slack" title="Send test Slack message">Test</button>
            </div>
            <div class="notif-channel-body">
              <input type="text" id="notif-slack-channel" class="form-input" placeholder="#admin-alerts" value="${cfg.slack_channel || ''}">
            </div>
          </div>
        </div>
      </div>

      <!-- Alert Preferences -->
      <div class="support-section">
        <h3>Alert Preferences</h3>
        <p class="notif-section-desc">Choose which events trigger notifications on each channel.</p>
        <div class="support-card" style="padding: 0; overflow: hidden;">
          <table class="notif-matrix">
            <thead>
              <tr>
                <th class="notif-matrix-event">Event</th>
                <th class="notif-matrix-channel">SMS</th>
                <th class="notif-matrix-channel">Email</th>
                <th class="notif-matrix-channel">Slack</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="notif-matrix-event">
                  <div class="notif-event-name">Support Tickets</div>
                  <div class="notif-event-desc">New inbound support emails</div>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-tickets-sms" ${cfg.tickets_sms ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-tickets-email" ${cfg.tickets_email ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-tickets-slack" ${cfg.tickets_slack ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
              </tr>
              <tr>
                <td class="notif-matrix-event">
                  <div class="notif-event-name">User Signups</div>
                  <div class="notif-event-desc">When a new user creates an account</div>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-signups-sms" ${cfg.signups_sms ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-signups-email" ${cfg.signups_email ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-signups-slack" ${cfg.signups_slack ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
              </tr>
              <tr>
                <td class="notif-matrix-event">
                  <div class="notif-event-name">Vendor Status</div>
                  <div class="notif-event-desc">Service status changes (up / degraded / down)</div>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-vendor-status-sms" ${cfg.vendor_status_sms ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-vendor-status-email" ${cfg.vendor_status_email ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
                <td class="notif-matrix-channel">
                  <label class="notif-toggle">
                    <input type="checkbox" id="notif-vendor-status-slack" ${cfg.vendor_status_slack ? 'checked' : ''}>
                    <span class="notif-toggle-slider"></span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    `;

    this.attachNotificationsListeners();
  },

  _notifSaveConfig() {
    if (this._notifSaving) return;
    this._notifSaving = true;

    const payload = {
      action: 'update_config',
      sms_phone: document.getElementById('notif-sms-phone')?.value || '',
      email_address: document.getElementById('notif-email-address')?.value || '',
      slack_channel: document.getElementById('notif-slack-channel')?.value || '',
      tickets_sms: document.getElementById('notif-tickets-sms')?.checked || false,
      tickets_email: document.getElementById('notif-tickets-email')?.checked || false,
      tickets_slack: document.getElementById('notif-tickets-slack')?.checked || false,
      signups_sms: document.getElementById('notif-signups-sms')?.checked || false,
      signups_email: document.getElementById('notif-signups-email')?.checked || false,
      signups_slack: document.getElementById('notif-signups-slack')?.checked || false,
      vendor_status_sms: document.getElementById('notif-vendor-status-sms')?.checked || false,
      vendor_status_email: document.getElementById('notif-vendor-status-email')?.checked || false,
      vendor_status_slack: document.getElementById('notif-vendor-status-slack')?.checked || false,
    };

    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-notifications-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )
      .then(res => {
        if (!res.ok) throw new Error('Failed to save');
        showToast('Settings saved', 'success');
      })
      .catch(err => {
        showToast('Error: ' + err.message, 'error');
      })
      .finally(() => {
        this._notifSaving = false;
      });
  },

  attachNotificationsListeners() {
    // Auto-save: toggles save immediately
    document.querySelectorAll('.notif-toggle input').forEach(toggle => {
      toggle.addEventListener('change', () => this._notifSaveConfig());
    });

    // Auto-save: text inputs save on blur with debounce
    let debounceTimer = null;
    ['notif-sms-phone', 'notif-email-address', 'notif-slack-channel'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this._notifSaveConfig(), 800);
      });
      input.addEventListener('blur', () => {
        clearTimeout(debounceTimer);
        this._notifSaveConfig();
      });
    });

    // Test buttons
    document.querySelectorAll('.notif-test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const channel = btn.dataset.channel;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-notifications-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'test_channel', channel }),
            }
          );

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Test failed');
          showToast(`Test ${channel.toUpperCase()} sent`, 'success');
        } catch (error) {
          showToast('Error: ' + error.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  },
};
