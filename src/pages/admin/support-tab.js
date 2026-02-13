import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

export const supportTabMethods = {
  async renderSupportTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="support-tab">
        <div class="support-loading">
          <div class="loading-spinner">Loading support config...</div>
        </div>
      </div>
    `;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'get_config' }),
        }
      );

      if (!response.ok) throw new Error('Failed to load support config');
      const data = await response.json();
      this.supportConfig = data.config || {};
      this.supportGmailConnected = data.gmailConnected;
      this.supportAgents = data.agents || [];
      this.supportFilter = this.supportFilter || 'open';
      this.supportThreadView = null;

      this.renderSupportContent();
    } catch (error) {
      console.error('Error loading support config:', error);
      const container = document.querySelector('.support-tab');
      if (container) {
        container.innerHTML = `
          <div class="detail-placeholder">
            <p style="color: var(--error-color);">Failed to load support config: ${error.message}</p>
            <button class="btn btn-primary" onclick="window.adminPage.renderSupportTab()">Retry</button>
          </div>
        `;
      }
    }
  },

  renderSupportContent() {
    const container = document.querySelector('.support-tab');
    if (!container) return;
    if (!this.supportSubTab) this.supportSubTab = 'tickets';

    container.innerHTML = `
      <!-- Sub-tab navigation -->
      <div class="support-subtabs">
        <button class="support-subtab ${this.supportSubTab === 'tickets' ? 'active' : ''}" data-support-subtab="tickets">Tickets</button>
        <button class="support-subtab ${this.supportSubTab === 'settings' ? 'active' : ''}" data-support-subtab="settings">Settings</button>
      </div>

      <!-- Tickets sub-tab -->
      <div id="support-subtab-tickets" class="support-subtab-content" style="display: ${this.supportSubTab === 'tickets' ? 'block' : 'none'};">
        <div class="support-section">
          <div class="tl-toolbar">
            <div class="tl-filter-group">
              <button class="kpi-filter-btn ${this.supportFilter === 'open' ? 'active' : ''}" data-support-filter="open">Open</button>
              <button class="kpi-filter-btn ${this.supportFilter === 'closed' ? 'active' : ''}" data-support-filter="closed">Closed</button>
              <button class="kpi-filter-btn ${this.supportFilter === 'all' ? 'active' : ''}" data-support-filter="all">All</button>
            </div>
            <div class="tl-filter-selects">
              <select id="support-priority-filter" class="form-input form-select tl-filter-select">
                <option value="">All Priorities</option>
                <option value="low" ${this.supportPriorityFilter === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${this.supportPriorityFilter === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${this.supportPriorityFilter === 'high' ? 'selected' : ''}>High</option>
                <option value="urgent" ${this.supportPriorityFilter === 'urgent' ? 'selected' : ''}>Urgent</option>
              </select>
              <select id="support-assignee-filter" class="form-input form-select tl-filter-select">
                <option value="">All Assignees</option>
              </select>
            </div>
            <button class="btn btn-primary" id="new-ticket-btn" style="font-size: 0.8rem; padding: 0.35rem 0.75rem; white-space: nowrap;">+ New</button>
          </div>
          <div id="new-ticket-form-container" style="display: none;"></div>
          <div id="support-tickets-list">
            <div class="loading-spinner">Loading tickets...</div>
          </div>
        </div>
      </div>

      <!-- Settings sub-tab -->
      <div id="support-subtab-settings" class="support-subtab-content" style="display: ${this.supportSubTab === 'settings' ? 'block' : 'none'};">
        <!-- Email Connection -->
        <div class="support-section">
          <h3>Email Connection</h3>
          <p class="notif-section-desc">Connect a Gmail account to sync support emails.</p>
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon notif-channel-icon-email">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">Gmail</span>
                <span class="notif-channel-status ${this.supportGmailConnected ? 'notif-status-active' : 'notif-status-inactive'}">
                  ${this.supportGmailConnected ? (this.supportConfig.gmail_address || 'Connected') : 'Not connected'}
                </span>
                ${this.supportGmailConnected && this.supportConfig.last_polled_at ? `<span class="notif-channel-status notif-status-inactive" style="font-size: 0.7rem;">Last polled: ${new Date(this.supportConfig.last_polled_at).toLocaleString()}</span>` : ''}
              </div>
              ${this.supportGmailConnected ? `
                <button class="btn btn-secondary notif-test-btn" id="connect-gmail-btn">Change</button>
                <button class="btn btn-secondary notif-test-btn" id="disconnect-gmail-btn" style="color: var(--error-color);">Disconnect</button>
              ` : `
                <button class="btn btn-primary notif-test-btn" id="connect-gmail-btn">Connect</button>
              `}
            </div>
            ${this.supportGmailConnected ? `
              <div class="notif-channel-body">
                <div class="form-group">
                  <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Send As</label>
                  <input type="text" id="support-send-as-email" class="form-input" placeholder="e.g. help@yourdomain.com" value="${this.escapeHtml(this.supportConfig.send_as_email || '')}" style="max-width: 320px;">
                  <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">Outgoing emails will be sent from this address. Must be a verified Send As alias in Gmail.</p>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- AI Agent Settings -->
        <div class="support-section">
          <h3>AI Agent</h3>
          <p class="notif-section-desc">Select an agent to handle automated support responses. The agent's system prompt, knowledge base, and memory will be used.</p>
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon" style="background: #ede9fe; color: #7c3aed;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">AI Agent</span>
                <span class="notif-channel-status ${this.supportConfig.agent_mode === 'auto' ? 'notif-status-active' : this.supportConfig.agent_mode === 'draft' ? 'notif-status-active' : 'notif-status-inactive'}">
                  ${this.supportConfig.agent_mode === 'auto' ? 'Auto mode' : this.supportConfig.agent_mode === 'draft' ? 'Draft mode' : 'Disabled'}
                </span>
              </div>
            </div>
            <div class="notif-channel-body">
              <div class="form-group" style="margin-bottom: 0.75rem;">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Mode</label>
                <select id="support-agent-mode" class="form-input form-select">
                  <option value="off" ${this.supportConfig.agent_mode === 'off' ? 'selected' : ''}>Off</option>
                  <option value="draft" ${this.supportConfig.agent_mode === 'draft' ? 'selected' : ''}>Draft (AI drafts, you approve)</option>
                  <option value="auto" ${this.supportConfig.agent_mode === 'auto' ? 'selected' : ''}>Auto (AI sends immediately)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Agent</label>
                <select id="support-agent-id" class="form-input form-select">
                  <option value="">None (default prompt)</option>
                  ${(this.supportAgents || []).map(a => `
                    <option value="${a.id}" ${this.supportConfig.support_agent_id === a.id ? 'selected' : ''}>${this.escapeHtml(a.name || a.agent_name || 'Unnamed Agent')}</option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Ticket Creation from Chat -->
        <div class="support-section">
          <h3>Chat Widget</h3>
          <p class="notif-section-desc">Allow agents to create support tickets from chat conversations.</p>
          <div class="notif-channel-card">
            <div class="notif-channel-header">
              <div class="notif-channel-icon" style="background: #fef3c7; color: #d97706;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                  <path d="M9 18h6"/><path d="M10 22h4"/>
                </svg>
              </div>
              <div class="notif-channel-info">
                <span class="notif-channel-name">Support Tickets</span>
                <span class="notif-channel-status ${this.supportConfig.ticket_creation_enabled !== false ? 'notif-status-active' : 'notif-status-inactive'}">
                  ${this.supportConfig.ticket_creation_enabled !== false ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <label class="toggle-switch" style="margin-left: auto;">
                <input type="checkbox" id="support-ticket-creation-toggle" ${this.supportConfig.ticket_creation_enabled !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

      </div>

      <!-- Thread View (hidden initially) -->
      <div id="support-thread-view" class="thread-view" style="display: none;"></div>
    `;

    // Sub-tab switching
    container.querySelectorAll('.support-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.supportSubTab = btn.dataset.supportSubtab;
        container.querySelectorAll('.support-subtab').forEach(b =>
          b.classList.toggle('active', b.dataset.supportSubtab === this.supportSubTab)
        );
        document.getElementById('support-subtab-tickets').style.display = this.supportSubTab === 'tickets' ? 'block' : 'none';
        document.getElementById('support-subtab-settings').style.display = this.supportSubTab === 'settings' ? 'block' : 'none';
      });
    });

    this.attachSupportListeners();
    this.loadSupportTickets();
  },

  _supportSaveAgentSettings() {
    if (this._agentSaving) return;
    this._agentSaving = true;

    const mode = document.getElementById('support-agent-mode')?.value || 'off';
    const agentId = document.getElementById('support-agent-id')?.value || '';

    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_config',
          agent_mode: mode,
          support_agent_id: agentId,
        }),
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
        this._agentSaving = false;
      });
  },

  _supportSaveSendAs(email) {
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_config',
          send_as_email: email,
        }),
      }
    )
      .then(res => {
        if (!res.ok) throw new Error('Failed to save');
        showToast('Send As email saved', 'success');
      })
      .catch(err => {
        showToast('Error: ' + err.message, 'error');
      });
  },

  _supportSaveTicketCreation(enabled) {
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_config',
          ticket_creation_enabled: enabled,
        }),
      }
    )
      .then(res => {
        if (!res.ok) throw new Error('Failed to save');
        showToast(enabled ? 'Ticket creation enabled' : 'Ticket creation disabled', 'success');
      })
      .catch(err => {
        showToast('Error: ' + err.message, 'error');
      });
  },

  attachSupportListeners() {
    // Connect Gmail
    const connectBtn = document.getElementById('connect-gmail-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-oauth-start`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ provider: 'google_email' }),
            }
          );
          const data = await response.json();
          if (data.url) {
            window.location.href = data.url;
          } else {
            throw new Error(data.error || 'Failed to start OAuth');
          }
        } catch (error) {
          showToast('Error: ' + error.message, 'error');
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect Gmail';
        }
      });
    }

    // Disconnect Gmail
    const disconnectBtn = document.getElementById('disconnect-gmail-btn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
          title: 'Disconnect Gmail',
          message: 'Disconnect this Gmail account? Polling will stop and you won\'t be able to send replies until you reconnect.',
          confirmText: 'Disconnect',
          confirmStyle: 'danger',
        });
        if (!confirmed) return;
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Disconnecting...';
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'disconnect_gmail' }),
            }
          );
          if (!response.ok) throw new Error('Failed to disconnect');
          showToast('Gmail disconnected', 'success');
          this.renderSupportTab();
        } catch (error) {
          showToast('Error: ' + error.message, 'error');
          disconnectBtn.disabled = false;
          disconnectBtn.textContent = 'Disconnect';
        }
      });
    }

    // Auto-save agent settings: both dropdowns save immediately
    document.getElementById('support-agent-mode')?.addEventListener('change', () => this._supportSaveAgentSettings());
    document.getElementById('support-agent-id')?.addEventListener('change', () => this._supportSaveAgentSettings());

    // Send As email - save on blur
    const sendAsInput = document.getElementById('support-send-as-email');
    if (sendAsInput) {
      sendAsInput.addEventListener('blur', () => {
        const val = sendAsInput.value.trim();
        if (val !== (this.supportConfig.send_as_email || '')) {
          this.supportConfig.send_as_email = val;
          this._supportSaveSendAs(val);
        }
      });
      sendAsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendAsInput.blur(); }
      });
    }

    // Ticket creation from chat toggle
    document.getElementById('support-ticket-creation-toggle')?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      this.supportConfig.ticket_creation_enabled = enabled;
      // Update status text
      const statusEl = e.target.closest('.notif-channel-header')?.querySelector('.notif-channel-status');
      if (statusEl) {
        statusEl.textContent = enabled ? 'Enabled' : 'Disabled';
        statusEl.className = `notif-channel-status ${enabled ? 'notif-status-active' : 'notif-status-inactive'}`;
      }
      this._supportSaveTicketCreation(enabled);
    });

    // Ticket filters
    document.querySelectorAll('[data-support-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.supportFilter = btn.dataset.supportFilter;
        document.querySelectorAll('[data-support-filter]').forEach(b =>
          b.classList.toggle('active', b.dataset.supportFilter === this.supportFilter)
        );
        this.loadSupportTickets();
      });
    });

    // Priority filter
    document.getElementById('support-priority-filter')?.addEventListener('change', (e) => {
      this.supportPriorityFilter = e.target.value;
      this.loadSupportTickets();
    });

    // Assignee filter
    document.getElementById('support-assignee-filter')?.addEventListener('change', (e) => {
      this.supportAssigneeFilter = e.target.value;
      this.loadSupportTickets();
    });

    // Load assignees for the filter dropdown
    this.loadAssignees();

    // New Ticket button
    document.getElementById('new-ticket-btn')?.addEventListener('click', () => {
      this.toggleNewTicketForm();
    });
  },

  async loadSupportTickets() {
    const listContainer = document.getElementById('support-tickets-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div class="loading-spinner">Loading tickets...</div>';

    try {
      const payload = { action: 'list', status: this.supportFilter };
      if (this.supportPriorityFilter) payload.priority = this.supportPriorityFilter;
      if (this.supportAssigneeFilter) payload.assigned_to = this.supportAssigneeFilter;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error('Failed to load tickets');
      const data = await response.json();
      const tickets = data.tickets || [];

      if (tickets.length === 0) {
        listContainer.innerHTML = `
          <div class="tl-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <p>No tickets found.</p>
          </div>`;
        return;
      }

      const priorityColors = { low: 'priority-low', medium: 'priority-medium', high: 'priority-high', urgent: 'priority-urgent' };
      const timeAgo = (d) => {
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(d).toLocaleDateString();
      };

      const viewedTickets = JSON.parse(localStorage.getItem('viewed-tickets') || '[]');

      listContainer.innerHTML = `
        <div class="tl-list">
          ${tickets.map(t => {
            const ticketId = t.ticket_ref || (t.thread_id || t.id || '').substring(0, 8).toUpperCase();
            const priority = t.priority || 'medium';
            const threadKey = t.thread_id || t.id;
            const isNew = !viewedTickets.includes(threadKey);
            return `
              <div class="tl-item ${isNew ? 'tl-item-new' : ''}" data-thread-id="${threadKey}" data-ticket-status="${t.status}">
                <div class="tl-item-left">
                  <span class="priority-badge ${priorityColors[priority] || 'priority-medium'}">${priority}</span>
                  <span class="tl-item-ref">#${this.escapeHtml(ticketId)}</span>
                </div>
                <div class="tl-item-main">
                  <div class="tl-item-top">
                    ${isNew ? '<span class="tl-new-badge">NEW</span>' : ''}
                    <span class="tl-item-subject">${this.escapeHtml(t.subject || '(no subject)')}</span>
                  </div>
                  <div class="tl-item-bottom">
                    <span class="tl-item-from">${this.escapeHtml(t.from_name || t.from_email || 'Unknown')}</span>
                    ${t.assigned_name ? `<span class="tl-item-detail">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      ${this.escapeHtml(t.assigned_name)}
                    </span>` : ''}
                    ${t.due_date ? `<span class="tl-item-detail">Due ${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
                  </div>
                </div>
                <div class="tl-item-right">
                  <span class="tl-item-time">${timeAgo(t.received_at)}</span>
                  <div class="tl-item-badges">
                    ${t.has_pending_draft ? '<span class="ai-draft-indicator ai-draft-pending" title="Pending AI draft">AI</span>' : t.ai_responded ? '<span class="ai-draft-indicator ai-draft-sent" title="AI responded">AI</span>' : ''}
                    <span class="ticket-status-badge ticket-status-${t.status}">${t.status}</span>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      `;

      // Attach row click handlers
      listContainer.querySelectorAll('.tl-item').forEach(row => {
        row.addEventListener('click', () => {
          this.openSupportThread(row.dataset.threadId, row.dataset.ticketStatus);
        });
      });

    } catch (error) {
      console.error('Error loading tickets:', error);
      listContainer.innerHTML = `<p style="color: var(--error-color); padding: 1rem;">Error: ${error.message}</p>`;
    }
  },

  async openSupportThread(threadId, currentStatus) {
    const threadView = document.getElementById('support-thread-view');
    if (!threadView) return;

    // Update URL with thread ID
    this.updateUrl({ tab: 'support', thread: threadId });

    // Mark ticket as viewed
    const viewed = JSON.parse(localStorage.getItem('viewed-tickets') || '[]');
    if (!viewed.includes(threadId)) {
      viewed.push(threadId);
      localStorage.setItem('viewed-tickets', JSON.stringify(viewed));
    }

    // Hide main content, show thread
    document.querySelectorAll('.support-subtabs, .support-subtab-content').forEach(s => s.style.display = 'none');
    threadView.style.display = 'block';
    threadView.innerHTML = '<div class="loading-spinner">Loading thread...</div>';

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'thread', threadId }),
        }
      );

      if (!response.ok) throw new Error('Failed to load thread');
      const data = await response.json();
      const messages = data.messages || [];
      const notes = data.notes || [];

      // Resolve status from data if not passed (e.g. deep-link reload)
      if (!currentStatus) {
        currentStatus = messages[0]?.status || 'open';
      }

      const subject = messages[0]?.subject || '(no subject)';
      const firstMsg = messages[0] || {};
      const pendingDraft = messages.find(m => m.ai_draft_status === 'pending');

      // Load assignees if not cached
      if (!this.supportAssignees) await this.loadAssignees();
      const assignees = this.supportAssignees || [];

      const assigneeOptions = assignees.map(a =>
        `<option value="${a.id}" ${firstMsg.assigned_to === a.id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
      ).join('');

      const currentTags = (firstMsg.tags || []).join(', ');
      const currentDue = firstMsg.due_date ? new Date(firstMsg.due_date).toISOString().split('T')[0] : '';

      // Determine "Submitted By" source
      let submittedBy = '';
      if (firstMsg.from_name || firstMsg.from_email) {
        submittedBy = firstMsg.from_name
          ? `${this.escapeHtml(firstMsg.from_name)} (${this.escapeHtml(firstMsg.from_email || '')})`
          : this.escapeHtml(firstMsg.from_email);
      } else if (threadId && threadId.startsWith('manual-')) {
        submittedBy = 'Manual Entry';
      } else if (threadId && threadId.startsWith('chat-')) {
        submittedBy = `Chat Widget${firstMsg.from_email ? ' (' + this.escapeHtml(firstMsg.from_email) + ')' : ''}`;
      }

      const ticketRef = firstMsg.ticket_ref || (threadId || '').substring(0, 8).toUpperCase();

      const statusBadgeClass = currentStatus === 'open' ? 'ticket-status-open' : 'ticket-status-closed';

      threadView.innerHTML = `
        <div class="tv-topbar">
          <button class="btn btn-secondary thread-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </button>
          <div class="tv-topbar-right">
            <button class="btn ${currentStatus === 'open' ? 'btn-secondary' : 'btn-primary'}" id="toggle-status-btn" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
              ${currentStatus === 'open' ? 'Close Ticket' : 'Reopen Ticket'}
            </button>
          </div>
        </div>

        <div class="tv-subject-row">
          <span class="tv-ref-badge">#${this.escapeHtml(ticketRef)}</span>
          <h2 class="tv-subject">${this.escapeHtml(subject)}</h2>
        </div>

        <div class="tv-meta">
          ${submittedBy ? `<span class="tv-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${submittedBy}
            </span>` : ''}
        </div>

        <div class="tv-sidebar-fields">
          <div class="tv-field-group">
            <label>Priority</label>
            <select id="thread-priority" class="form-input form-select">
              <option value="low" ${firstMsg.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${firstMsg.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${firstMsg.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="urgent" ${firstMsg.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
          </div>
          <div class="tv-field-group">
            <label>Assignee</label>
            <select id="thread-assignee" class="form-input form-select">
              <option value="">Unassigned</option>
              ${assigneeOptions}
            </select>
          </div>
          <div class="tv-field-group">
            <label>Due Date</label>
            <input type="date" id="thread-due-date" class="form-input" value="${currentDue}">
          </div>
          <div class="tv-field-group">
            <label>Tags</label>
            <input type="text" id="thread-tags" class="form-input" value="${this.escapeHtml(currentTags)}" placeholder="tag1, tag2, ...">
            ${(firstMsg.tags || []).length > 0 ? `
              <div class="tv-tags-list">
                ${(firstMsg.tags || []).map(tag => `<span class="tag-pill">${this.escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="tv-section-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Conversation
        </div>

        <div class="tv-messages">
          ${messages.map(m => {
            const isAi = m.direction === 'outbound' && m.ai_draft_status === 'sent';
            return `
            <div class="tv-msg tv-msg-${m.direction}${isAi ? ' tv-msg-ai' : ''}">
              <div class="tv-msg-avatar">${isAi ? 'AI' : (m.from_name || m.from_email || '?')[0].toUpperCase()}</div>
              <div class="tv-msg-content">
                <div class="tv-msg-header">
                  <strong>${this.escapeHtml(m.from_name || m.from_email || 'Unknown')}${isAi ? ' <span class="tv-ai-tag">AI</span>' : ''}</strong>
                  <span>${new Date(m.received_at).toLocaleString()}</span>
                </div>
                <div class="tv-msg-body">${this.escapeHtml(m.body_text || '').replace(/\n/g, '<br>')}</div>
              </div>
            </div>`;
          }).join('')}
        </div>

        ${pendingDraft ? `
          <div class="tv-draft">
            <div class="tv-draft-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              AI Draft Reply
            </div>
            <div class="tv-draft-body">${this.escapeHtml(pendingDraft.ai_draft || '').replace(/\n/g, '<br>')}</div>
            <div class="tv-draft-actions">
              <button class="btn btn-primary" id="approve-draft-btn" data-ticket-id="${pendingDraft.id}">Approve & Send</button>
              <button class="btn btn-secondary" id="edit-draft-btn" data-draft-text="${this.escapeHtml(pendingDraft.ai_draft || '')}">Edit</button>
              <button class="btn btn-secondary" id="reject-draft-btn" data-ticket-id="${pendingDraft.id}" style="color: var(--error-color);">Reject</button>
            </div>
          </div>
        ` : ''}

        <div class="tv-reply">
          <textarea id="support-reply-text" class="form-input" rows="3" placeholder="Type your reply..."></textarea>
          <div class="tv-reply-footer">
            <button class="btn btn-primary" id="send-reply-btn">Send Reply to Customer</button>
          </div>
        </div>

        <div class="tv-section-label" style="margin-top: 1.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Internal Notes
        </div>

        <div class="tv-notes">
          ${notes.length > 0 ? notes.map(n => `
            <div class="tv-note">
              <div class="tv-note-header">
                <strong>${this.escapeHtml(n.author_name || 'Unknown')}</strong>
                <span>${new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div class="tv-note-body">${this.escapeHtml(n.content).replace(/\n/g, '<br>')}</div>
            </div>
          `).join('') : '<p class="tv-notes-empty">No notes yet.</p>'}
          <div class="tv-note-input">
            <textarea id="new-note-text" class="form-input" rows="2" placeholder="Add an internal note..."></textarea>
            <button class="btn btn-secondary" id="add-note-btn">Add Note</button>
          </div>
        </div>
      `;

      // Back button
      threadView.querySelector('.thread-back-btn').addEventListener('click', () => {
        threadView.style.display = 'none';
        document.querySelector('.support-subtabs').style.display = '';
        document.getElementById('support-subtab-tickets').style.display = 'block';
        this.supportSubTab = 'tickets';
        this.updateUrl({ tab: 'support' });
        this.loadSupportTickets();
      });

      // Auto-save ticket detail fields
      let ticketDetailDebounce = null;
      const saveTicketDetails = () => {
        clearTimeout(ticketDetailDebounce);
        ticketDetailDebounce = setTimeout(async () => {
          const priority = document.getElementById('thread-priority')?.value;
          const assigned_to = document.getElementById('thread-assignee')?.value;
          const due_date = document.getElementById('thread-due-date')?.value || null;
          const tagsStr = document.getElementById('thread-tags')?.value || '';
          const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
          try {
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${this.session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'update_ticket', threadId, priority, assigned_to, tags, due_date }),
              }
            );
            if (!res.ok) throw new Error('Failed to save');
            showToast('Ticket updated', 'success');
          } catch (e) {
            showToast('Error: ' + e.message, 'error');
          }
        }, 300);
      };
      ['thread-priority', 'thread-assignee', 'thread-due-date'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', saveTicketDetails);
      });
      const tagsEl = document.getElementById('thread-tags');
      if (tagsEl) {
        let tagsDebounce = null;
        tagsEl.addEventListener('input', () => {
          clearTimeout(tagsDebounce);
          tagsDebounce = setTimeout(saveTicketDetails, 800);
        });
        tagsEl.addEventListener('blur', saveTicketDetails);
      }

      // Add note
      document.getElementById('add-note-btn')?.addEventListener('click', async () => {
        const noteText = document.getElementById('new-note-text');
        const content = noteText.value.trim();
        if (!content) return;

        const btn = document.getElementById('add-note-btn');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'add_note', threadId, content }),
            }
          );
          if (!res.ok) throw new Error('Failed to add note');
          this.openSupportThread(threadId, currentStatus);
        } catch (e) {
          showToast('Error: ' + e.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Add Note';
        }
      });

      // Toggle status
      document.getElementById('toggle-status-btn')?.addEventListener('click', async () => {
        const newStatus = currentStatus === 'open' ? 'closed' : 'open';

        if (newStatus === 'closed') {
          const confirmed = await showConfirmModal({
            title: 'Close Ticket',
            message: 'Are you sure you want to close this ticket? The customer will no longer receive replies until it is reopened.',
            confirmText: 'Close Ticket',
            cancelText: 'Cancel',
            isDangerous: true,
          });
          if (!confirmed) return;
        }

        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'update_status', threadId, status: newStatus }),
            }
          );
          this.openSupportThread(threadId, newStatus);
        } catch (e) {
          showToast('Error: ' + e.message, 'error');
        }
      });

      // Send reply
      document.getElementById('send-reply-btn')?.addEventListener('click', async () => {
        const replyText = document.getElementById('support-reply-text');
        const body = replyText.value.trim();
        if (!body) return;

        const btn = document.getElementById('send-reply-btn');
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'send_reply', threadId, replyBody: body }),
            }
          );

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to send');
          }

          replyText.value = '';
          this.openSupportThread(threadId, currentStatus);
        } catch (e) {
          showToast('Error: ' + e.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Send Reply to Customer';
        }
      });

      // Approve draft
      document.getElementById('approve-draft-btn')?.addEventListener('click', async (e) => {
        const ticketId = e.target.dataset.ticketId;
        e.target.disabled = true;
        e.target.textContent = 'Sending...';
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'approve_draft', ticketId }),
            }
          );
          if (!res.ok) throw new Error('Failed to approve');
          showToast('Draft approved and sent!', 'success');
          this.openSupportThread(threadId, currentStatus);
        } catch (e) {
          showToast('Error: ' + e.message, 'error');
        }
      });

      // Edit draft - copy text into reply textarea
      document.getElementById('edit-draft-btn')?.addEventListener('click', (e) => {
        const draftText = e.target.dataset.draftText;
        document.getElementById('support-reply-text').value = draftText;
        document.getElementById('support-reply-text').focus();
        // Reject the original draft
        const ticketId = document.getElementById('approve-draft-btn')?.dataset?.ticketId;
        if (ticketId) {
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'reject_draft', ticketId }),
            }
          ).catch(() => {});
          // Hide draft card
          document.querySelector('.ai-draft-card')?.remove();
        }
      });

      // Reject draft
      document.getElementById('reject-draft-btn')?.addEventListener('click', async (e) => {
        const ticketId = e.target.dataset.ticketId;
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'reject_draft', ticketId }),
            }
          );
          document.querySelector('.ai-draft-card')?.remove();
        } catch (e) {
          showToast('Error: ' + e.message, 'error');
        }
      });

    } catch (error) {
      threadView.innerHTML = `<p style="color: var(--error-color); padding: 1rem;">Error: ${error.message}</p>`;
    }
  },

  async loadAssignees() {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'list_assignees' }),
        }
      );
      if (!response.ok) return;
      const data = await response.json();
      this.supportAssignees = data.assignees || [];

      // Populate the filter dropdown if it exists
      const filterSelect = document.getElementById('support-assignee-filter');
      if (filterSelect) {
        const currentVal = this.supportAssigneeFilter || '';
        filterSelect.innerHTML = '<option value="">All Assignees</option>' +
          this.supportAssignees.map(a =>
            `<option value="${a.id}" ${currentVal === a.id ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
          ).join('');
      }
    } catch (e) {
      console.error('Failed to load assignees:', e);
    }
  },

  toggleNewTicketForm() {
    const container = document.getElementById('new-ticket-form-container');
    if (!container) return;

    if (container.style.display === 'block') {
      container.style.display = 'none';
      return;
    }

    const assignees = this.supportAssignees || [];
    const assigneeOptions = assignees.map(a =>
      `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`
    ).join('');

    container.style.display = 'block';
    container.innerHTML = `
      <div class="new-ticket-form">
        <h4 style="margin: 0 0 0.75rem 0;">New Ticket</h4>
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label class="form-label" style="font-size: 0.8rem;">On Behalf Of</label>
          <div class="behalf-search-wrapper" style="position: relative;">
            <input type="text" id="new-ticket-behalf" class="form-input" placeholder="Search user or type address..." autocomplete="nope" role="combobox">
            <input type="hidden" id="new-ticket-behalf-email" value="">
            <input type="hidden" id="new-ticket-behalf-name" value="">
            <div id="behalf-suggestions" class="behalf-suggestions" style="display: none;"></div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <input type="text" id="new-ticket-subject" class="form-input" placeholder="Subject *">
        </div>
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <textarea id="new-ticket-description" class="form-input" rows="3" placeholder="Description"></textarea>
        </div>
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label" style="font-size: 0.8rem;">Priority</label>
            <select id="new-ticket-priority" class="form-input form-select">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label" style="font-size: 0.8rem;">Assignee</label>
            <select id="new-ticket-assignee" class="form-input form-select">
              <option value="">Unassigned</option>
              ${assigneeOptions}
            </select>
          </div>
          <div class="form-group" style="flex: 1; min-width: 120px;">
            <label class="form-label" style="font-size: 0.8rem;">Due Date</label>
            <input type="date" id="new-ticket-due" class="form-input">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <input type="text" id="new-ticket-tags" class="form-input" placeholder="Tags (comma separated)">
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" id="submit-new-ticket-btn">Create Ticket</button>
          <button class="btn btn-secondary" id="cancel-new-ticket-btn">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById('cancel-new-ticket-btn')?.addEventListener('click', () => {
      container.style.display = 'none';
    });

    // On Behalf Of - smart user search
    const behalfInput = document.getElementById('new-ticket-behalf');
    const behalfSuggestions = document.getElementById('behalf-suggestions');
    let behalfDebounce = null;

    if (behalfInput) {
      behalfInput.addEventListener('input', () => {
        clearTimeout(behalfDebounce);
        const query = behalfInput.value.trim();
        if (query.length < 2) {
          behalfSuggestions.style.display = 'none';
          return;
        }
        behalfDebounce = setTimeout(async () => {
          try {
            const params = new URLSearchParams({ search: query, limit: '5' });
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users?${params}`,
              {
                headers: {
                  'Authorization': `Bearer ${this.session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            if (!res.ok) return;
            const data = await res.json();
            const users = data.users || [];

            if (users.length === 0) {
              behalfSuggestions.style.display = 'none';
              // Clear hidden fields so raw input is used
              document.getElementById('new-ticket-behalf-email').value = '';
              document.getElementById('new-ticket-behalf-name').value = '';
              return;
            }

            behalfSuggestions.innerHTML = users.map(u => `
              <div class="behalf-suggestion-item" data-email="${this.escapeHtml(u.email)}" data-name="${this.escapeHtml(u.name || '')}">
                <strong>${this.escapeHtml(u.name || 'Unknown')}</strong>
                <span>${this.escapeHtml(u.email)}</span>
              </div>
            `).join('');
            behalfSuggestions.style.display = 'block';

            behalfSuggestions.querySelectorAll('.behalf-suggestion-item').forEach(item => {
              item.addEventListener('click', () => {
                const email = item.dataset.email;
                const name = item.dataset.name;
                behalfInput.value = name ? `${name} (${email})` : email;
                document.getElementById('new-ticket-behalf-email').value = email;
                document.getElementById('new-ticket-behalf-name').value = name;
                behalfSuggestions.style.display = 'none';
              });
            });
          } catch (e) {
            console.error('Behalf search error:', e);
          }
        }, 300);
      });

      // Clear hidden fields when user manually edits after selecting
      behalfInput.addEventListener('keydown', () => {
        document.getElementById('new-ticket-behalf-email').value = '';
        document.getElementById('new-ticket-behalf-name').value = '';
      });

      // Close suggestions on click outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.behalf-search-wrapper')) {
          behalfSuggestions.style.display = 'none';
        }
      });
    }

    document.getElementById('submit-new-ticket-btn')?.addEventListener('click', async () => {
      const subject = document.getElementById('new-ticket-subject').value.trim();
      if (!subject) {
        showToast('Subject is required', 'error');
        return;
      }

      const description = document.getElementById('new-ticket-description').value.trim();
      const priority = document.getElementById('new-ticket-priority').value;
      const assigned_to = document.getElementById('new-ticket-assignee').value;
      const due_date = document.getElementById('new-ticket-due').value || null;
      const tagsStr = document.getElementById('new-ticket-tags').value;
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

      // On behalf of
      const from_email = document.getElementById('new-ticket-behalf-email').value || document.getElementById('new-ticket-behalf').value.trim() || null;
      const from_name = document.getElementById('new-ticket-behalf-name').value || null;

      const btn = document.getElementById('submit-new-ticket-btn');
      btn.disabled = true;
      btn.textContent = 'Creating...';

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'create_ticket', subject, description, priority, tags, assigned_to, due_date, from_email, from_name }),
          }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create ticket');
        }

        showToast('Ticket created', 'success');
        container.style.display = 'none';
        this.loadSupportTickets();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Ticket';
      }
    });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
