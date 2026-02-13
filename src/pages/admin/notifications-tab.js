import { showToast } from '../../lib/toast.js';

export const notificationsTabMethods = {
  async renderNotificationsTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="support-tab" style="padding: 1rem;">
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

    container.innerHTML = `
      <!-- Delivery Channels -->
      <div class="support-section">
        <h3>Delivery Channels</h3>
        <div class="support-card">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">SMS Phone</label>
            <input type="tel" id="notif-sms-phone" class="form-input" style="max-width: 300px;" placeholder="+16045551234" value="${cfg.sms_phone || ''}">
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">Email Address</label>
            <input type="email" id="notif-email-address" class="form-input" style="max-width: 300px;" placeholder="admin@magpipe.ai" value="${cfg.email_address || ''}">
          </div>
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label class="form-label">Slack Channel</label>
            <input type="text" id="notif-slack-channel" class="form-input" style="max-width: 300px;" placeholder="#admin-alerts" value="${cfg.slack_channel || ''}">
          </div>
          ${this.slackConnected
            ? `<div style="display: flex; align-items: center; gap: 0.5rem; color: var(--success-color); font-size: 0.85rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                Connected${this.slackWorkspace ? ` (${this.slackWorkspace})` : ''}
              </div>`
            : `<div style="color: var(--text-muted); font-size: 0.85rem;">Slack not connected</div>`
          }
        </div>
      </div>

      <!-- Ticket Alerts -->
      <div class="support-section">
        <h3>Ticket Alerts</h3>
        <div class="support-card">
          <p style="color: var(--text-muted); margin-bottom: 0.75rem;">New inbound support emails</p>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-tickets-sms" ${cfg.tickets_sms ? 'checked' : ''}> SMS
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-tickets-email" ${cfg.tickets_email ? 'checked' : ''}> Email
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-tickets-slack" ${cfg.tickets_slack ? 'checked' : ''}> Slack
            </label>
          </div>
        </div>
      </div>

      <!-- New User Signups -->
      <div class="support-section">
        <h3>New User Signups</h3>
        <div class="support-card">
          <p style="color: var(--text-muted); margin-bottom: 0.75rem;">When a new user creates an account</p>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-signups-sms" ${cfg.signups_sms ? 'checked' : ''}> SMS
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-signups-email" ${cfg.signups_email ? 'checked' : ''}> Email
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-signups-slack" ${cfg.signups_slack ? 'checked' : ''}> Slack
            </label>
          </div>
        </div>
      </div>

      <!-- Vendor Status Alerts -->
      <div class="support-section">
        <h3>Vendor Status Alerts</h3>
        <div class="support-card">
          <p style="color: var(--text-muted); margin-bottom: 0.75rem;">When a service changes status (operational / degraded / down)</p>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-vendor-status-sms" ${cfg.vendor_status_sms ? 'checked' : ''}> SMS
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-vendor-status-email" ${cfg.vendor_status_email ? 'checked' : ''}> Email
            </label>
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="notif-vendor-status-slack" ${cfg.vendor_status_slack ? 'checked' : ''}> Slack
            </label>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="support-section">
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
          <button class="btn btn-primary" id="notif-save-btn">Save</button>
          <button class="btn btn-secondary" id="notif-test-sms-btn" style="font-size: 0.85rem;">Test SMS</button>
          <button class="btn btn-secondary" id="notif-test-email-btn" style="font-size: 0.85rem;">Test Email</button>
          <button class="btn btn-secondary" id="notif-test-slack-btn" style="font-size: 0.85rem;">Test Slack</button>
        </div>
      </div>
    `;

    this.attachNotificationsListeners();
  },

  attachNotificationsListeners() {
    // Save button
    document.getElementById('notif-save-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('notif-save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-notifications-api`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'update_config',
              sms_phone: document.getElementById('notif-sms-phone').value,
              email_address: document.getElementById('notif-email-address').value,
              slack_channel: document.getElementById('notif-slack-channel').value,
              tickets_sms: document.getElementById('notif-tickets-sms').checked,
              tickets_email: document.getElementById('notif-tickets-email').checked,
              tickets_slack: document.getElementById('notif-tickets-slack').checked,
              signups_sms: document.getElementById('notif-signups-sms').checked,
              signups_email: document.getElementById('notif-signups-email').checked,
              signups_slack: document.getElementById('notif-signups-slack').checked,
              vendor_status_sms: document.getElementById('notif-vendor-status-sms').checked,
              vendor_status_email: document.getElementById('notif-vendor-status-email').checked,
              vendor_status_slack: document.getElementById('notif-vendor-status-slack').checked,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to save');
        showToast('Notification settings saved', 'success');
      } catch (error) {
        showToast('Error: ' + error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    });

    // Test buttons
    ['sms', 'email', 'slack'].forEach(channel => {
      document.getElementById(`notif-test-${channel}-btn`)?.addEventListener('click', async () => {
        const btn = document.getElementById(`notif-test-${channel}-btn`);
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
