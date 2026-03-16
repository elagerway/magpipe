import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';
import { supabase } from '../../lib/supabase.js';
import { escapeHtml } from '../../lib/formatters.js';

export const supportTabMethods = {
  // Config cache (60s TTL)
  _supportConfigCache: null,
  _supportConfigCacheTime: 0,

  async _fetchSupportConfig() {
    const now = Date.now();
    if (this._supportConfigCache && (now - this._supportConfigCacheTime) < 60000) {
      return this._supportConfigCache;
    }
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
    this._supportConfigCache = data;
    this._supportConfigCacheTime = now;
    return data;
  },

  async renderSupportTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="support-tab">
        <div class="support-loading">
          <div class="loading-spinner">Loading support...</div>
        </div>
      </div>
    `;

    this.supportFilter = this.supportFilter || 'open';
    if (!this.supportPage) this.supportPage = 1;
    if (!this.supportPerPage) this.supportPerPage = parseInt(localStorage.getItem('support-per-page') || '25');
    this.supportThreadView = null;

    try {
      // Fire config, tickets, and assignees in parallel
      const isGithubFilter = this.supportFilter === 'github';
      const ticketPayload = { action: 'list', status: isGithubFilter ? 'all' : this.supportFilter, page: this.supportPage, limit: this.supportPerPage };
      if (isGithubFilter) ticketPayload.has_github_issue = true;
      if (this.supportPriorityFilter) ticketPayload.priority = this.supportPriorityFilter;
      if (this.supportAssigneeFilter) ticketPayload.assigned_to = this.supportAssigneeFilter;

      const [configData, ticketsResponse, assigneesResponse] = await Promise.all([
        this._fetchSupportConfig(),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ticketPayload),
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'list_assignees' }),
        }),
      ]);

      // Process config
      this.supportConfig = configData.config || {};
      this.supportGmailConnected = configData.gmailConnected;
      this.supportAgents = configData.agents || [];

      // Process tickets
      if (ticketsResponse.ok) {
        const ticketsData = await ticketsResponse.json();
        this._supportTicketsData = ticketsData;
      }

      // Process assignees
      if (assigneesResponse.ok) {
        const assigneesData = await assigneesResponse.json();
        this.supportAssignees = assigneesData.assignees || [];
      }

      await this.renderSupportContent();
    } catch (error) {
      console.error('Error loading support tab:', error);
      const container = document.querySelector('.support-tab');
      if (container) {
        container.innerHTML = `
          <div class="detail-placeholder">
            <p style="color: var(--error-color);">Failed to load support: ${error.message}</p>
            <button class="btn btn-primary" onclick="window.adminPage.renderSupportTab()">Retry</button>
          </div>
        `;
      }
    }
  },

  async renderSupportContent() {
    const container = document.querySelector('.support-tab');
    if (!container) return;
    if (!this.supportSubTab) this.supportSubTab = 'tickets';

    container.innerHTML = `
      <!-- Sub-tab navigation -->
      <div class="support-subtabs">
        <button class="support-subtab ${this.supportSubTab === 'tickets' ? 'active' : ''}" data-support-subtab="tickets">Tickets</button>
        <button class="support-subtab ${this.supportSubTab === 'users' ? 'active' : ''}" data-support-subtab="users">Users</button>
        <button class="support-subtab ${this.supportSubTab === 'global-agent' ? 'active' : ''}" data-support-subtab="global-agent">Global Agent</button>
        <button class="support-subtab ${this.supportSubTab === 'chat' ? 'active' : ''}" data-support-subtab="chat">Chat</button>
        <button class="support-subtab ${this.supportSubTab === 'settings' ? 'active' : ''}" data-support-subtab="settings">Settings</button>
        <button class="support-subtab ${this.supportSubTab === 'errors' ? 'active' : ''}" data-support-subtab="errors">Errors</button>
        <button class="support-subtab ${this.supportSubTab === 'numbers' ? 'active' : ''}" data-support-subtab="numbers">Numbers</button>
      </div>

      <!-- Tickets sub-tab -->
      <div id="support-subtab-tickets" class="support-subtab-content" style="display: ${this.supportSubTab === 'tickets' ? 'flex' : 'none'};">
        <div class="support-section">
          <div class="tl-toolbar">
            <div class="tl-filter-group">
              <button class="kpi-filter-btn ${this.supportFilter === 'open' ? 'active' : ''}" data-support-filter="open">Open</button>
              <button class="kpi-filter-btn ${this.supportFilter === 'closed' ? 'active' : ''}" data-support-filter="closed">Closed</button>
              <button class="kpi-filter-btn ${this.supportFilter === 'all' ? 'active' : ''}" data-support-filter="all">All</button>
              <button class="kpi-filter-btn ${this.supportFilter === 'github' ? 'active' : ''}" data-support-filter="github" style="display: inline-flex; align-items: center; gap: 0.3rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                GitHub
              </button>
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

      <!-- Users sub-tab -->
      <div id="support-subtab-users" class="support-subtab-content" style="display: ${this.supportSubTab === 'users' ? 'flex' : 'none'};">
        <div class="loading-spinner">Loading users...</div>
      </div>

      <!-- Global Agent sub-tab -->
      <div id="support-subtab-global-agent" class="support-subtab-content" style="display: ${this.supportSubTab === 'global-agent' ? 'flex' : 'none'};">
        <div class="loading-spinner">Loading...</div>
      </div>

      <!-- Chat sub-tab -->
      <div id="support-subtab-chat" class="support-subtab-content" style="display: ${this.supportSubTab === 'chat' ? 'flex' : 'none'};">
        <div class="loading-spinner">Loading...</div>
      </div>

      <!-- Settings sub-tab -->
      <div id="support-subtab-settings" class="support-subtab-content" style="display: ${this.supportSubTab === 'settings' ? 'flex' : 'none'};">
        <!-- Per-Channel AI Agent Settings -->
        <div class="support-section">
          <h3>AI Agents</h3>
          <p class="notif-section-desc">Assign an agent per channel. Each agent's system prompt, knowledge base, and memory will be used for that channel.</p>

          ${this._renderChannelAgentCard({
            id: 'email',
            label: 'Email Agent',
            icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
            iconBg: '#ede9fe',
            iconColor: '#7c3aed',
            modeField: 'agent_mode',
            agentField: 'support_agent_id',
            agentType: 'email',
          })}

          ${this._renderChannelAgentCard({
            id: 'sms',
            label: 'SMS Agent',
            icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>`,
            iconBg: '#dcfce7',
            iconColor: '#16a34a',
            modeField: 'sms_agent_mode',
            agentField: 'sms_agent_id',
            agentType: 'text',
          })}

          ${this._renderChannelAgentCard({
            id: 'chat',
            label: 'Chat Agent',
            icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
            iconBg: '#fef3c7',
            iconColor: '#d97706',
            modeField: 'chat_agent_mode',
            agentField: 'chat_agent_id',
            agentType: 'chat_widget',
          })}
        </div>


      </div>

      <!-- Errors sub-tab -->
      <div id="support-subtab-errors" class="support-subtab-content" style="display: ${this.supportSubTab === 'errors' ? 'flex' : 'none'};">
        <div class="loading-spinner">Loading errors...</div>
      </div>

      <!-- Numbers sub-tab -->
      <div id="support-subtab-numbers" class="support-subtab-content" style="display: ${this.supportSubTab === 'numbers' ? 'flex' : 'none'};">
        <div class="loading-spinner">Loading...</div>
      </div>

      <!-- Thread View (hidden initially) -->
      <div id="support-thread-view" class="thread-view" style="display: none;"></div>
    `;

    // Sub-tab switching
    this._supportLazyLoaded = {};
    const allSupportPanes = ['tickets', 'users', 'global-agent', 'chat', 'settings', 'errors', 'numbers'];
    container.querySelectorAll('.support-subtab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.supportSubTab = btn.dataset.supportSubtab;
        container.querySelectorAll('.support-subtab').forEach(b =>
          b.classList.toggle('active', b.dataset.supportSubtab === this.supportSubTab)
        );
        this.updateUrl({ tab: 'support', subtab: this.supportSubTab });
        // Hide all, show active
        allSupportPanes.forEach(p => {
          const el = document.getElementById(`support-subtab-${p}`);
          if (el) el.style.display = p === this.supportSubTab ? 'flex' : 'none';
        });

        // Destroy omniChat when leaving chat sub-tab
        if (this.supportSubTab !== 'chat' && this.omniChat) {
          this.omniChat.destroy();
          this.omniChat = null;
        }

        // Lazy-load on first visit
        await this._loadSupportSubtab(this.supportSubTab);
      });
    });

    this.attachSupportListeners();

    // Listen for new tickets from feedback form (works across browser tabs)
    if (this._supportBroadcast) this._supportBroadcast.close();
    this._supportBroadcast = new BroadcastChannel('support-tickets');
    this._supportBroadcast.onmessage = (e) => {
      const t = e.data;
      if (!t) return;
      const list = document.querySelector('#support-tickets-list .tl-list');
      if (!list) return;
      const threadId = t.thread_id;
      if (!threadId) return;
      const row = document.createElement('div');
      row.className = 'tl-item tl-item-new';
      row.dataset.threadId = threadId;
      row.dataset.ticketStatus = 'open';
      row.innerHTML = `
        <div class="tl-item-left">
          <span class="priority-badge priority-medium">medium</span>
          <span class="tl-item-ref">#${escapeHtml(t.ticket_ref || 'NEW')}</span>
        </div>
        <div class="tl-item-main">
          <div class="tl-item-top">
            <span class="tl-new-badge">NEW</span>
            <span class="tl-item-subject">${escapeHtml(t.subject || '(no subject)')}</span>
          </div>
          <div class="tl-item-bottom">
            <span class="tl-item-from">${escapeHtml(t.from_name || t.from_email || 'Unknown')}</span>
          </div>
        </div>
        <div class="tl-item-right">
          <span class="tl-item-time">just now</span>
          <div class="tl-item-badges">
            <span class="ticket-status-badge ticket-status-open">open</span>
          </div>
        </div>`;
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => this.openSupportThread(threadId, 'open'));
      list.prepend(row);
    };

    // Render pre-fetched tickets if available, otherwise load fresh
    if (this._supportTicketsData) {
      this.renderSupportTicketsList(this._supportTicketsData);
      this._supportTicketsData = null;
    } else {
      this.loadSupportTickets();
    }


    // Populate assignee filter dropdown with pre-fetched data
    if (this.supportAssignees) {
      const filterSelect = document.getElementById('support-assignee-filter');
      if (filterSelect) {
        const currentVal = this.supportAssigneeFilter || '';
        filterSelect.innerHTML = '<option value="">All Assignees</option>' +
          this.supportAssignees.map(a =>
            `<option value="${a.id}" ${currentVal === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
          ).join('');
      }
    }

    // Lazy-load initial sub-tab if not tickets/settings
    if (this.supportSubTab && this.supportSubTab !== 'tickets' && this.supportSubTab !== 'settings') {
      await this._loadSupportSubtab(this.supportSubTab);
    }
  },

  async _loadSupportSubtab(subtab) {
    // Tickets and settings are rendered inline — no lazy load needed
    if (subtab === 'tickets' || subtab === 'settings') return;

    if (this._supportLazyLoaded[subtab]) return;
    this._supportLazyLoaded[subtab] = true;

    const pane = document.getElementById(`support-subtab-${subtab}`);
    if (!pane) return;

    // ID swap: let existing render methods write into the pane
    const outer = document.getElementById('admin-tab-content');
    outer.id = '_admin-tab-content-outer';
    pane.id = 'admin-tab-content';

    try {
      if (subtab === 'users') {
        await this.renderUsersTab();
      } else if (subtab === 'global-agent') {
        await this.renderGlobalAgentTab();
      } else if (subtab === 'chat') {
        await this.renderChatTab();
      } else if (subtab === 'errors') {
        await this.renderErrorsTab();
      } else if (subtab === 'numbers') {
        await this.renderNumbersTab();
      }
    } finally {
      // Restore IDs
      const inner = document.getElementById('admin-tab-content');
      if (inner) inner.id = `support-subtab-${subtab}`;
      const outerEl = document.getElementById('_admin-tab-content-outer');
      if (outerEl) outerEl.id = 'admin-tab-content';
    }
  },

  _renderChannelAgentCard({ id, label, icon, iconBg, iconColor, modeField, agentField, agentType }) {
    const mode = this.supportConfig[modeField] || 'off';
    const agentId = this.supportConfig[agentField] || '';
    const filteredAgents = (this.supportAgents || []).filter(a => a.agent_type === agentType);
    const statusClass = mode === 'off' ? 'notif-status-inactive' : 'notif-status-active';
    const statusText = mode === 'auto' ? 'Auto mode' : mode === 'draft' ? 'Draft mode' : 'Disabled';

    return `
      <div class="notif-channel-card">
        <div class="notif-channel-header">
          <div class="notif-channel-icon" style="background: ${iconBg}; color: ${iconColor};">
            ${icon}
          </div>
          <div class="notif-channel-info">
            <span class="notif-channel-name">${label}</span>
            <span class="notif-channel-status ${statusClass}">${statusText}</span>
          </div>
        </div>
        <div class="notif-channel-body">
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Mode</label>
            <select id="support-${id}-agent-mode" class="form-input form-select" data-channel-agent>
              <option value="off" ${mode === 'off' ? 'selected' : ''}>Off</option>
              <option value="draft" ${mode === 'draft' ? 'selected' : ''}>Draft (AI drafts, you approve)</option>
              <option value="auto" ${mode === 'auto' ? 'selected' : ''}>Auto (AI sends immediately)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Agent</label>
            <select id="support-${id}-agent-id" class="form-input form-select" data-channel-agent>
              <option value="">None (default prompt)</option>
              ${filteredAgents.map(a => `
                <option value="${a.id}" ${agentId === a.id ? 'selected' : ''}>${escapeHtml(a.name || a.agent_name || 'Unnamed Agent')}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  },

  _supportSaveAgentSettings() {
    if (this._agentSaving) return;
    this._agentSaving = true;

    const payload = {
      action: 'update_config',
      agent_mode: document.getElementById('support-email-agent-mode')?.value || 'off',
      support_agent_id: document.getElementById('support-email-agent-id')?.value || '',
      sms_agent_mode: document.getElementById('support-sms-agent-mode')?.value || 'off',
      sms_agent_id: document.getElementById('support-sms-agent-id')?.value || '',
      chat_agent_mode: document.getElementById('support-chat-agent-mode')?.value || 'off',
      chat_agent_id: document.getElementById('support-chat-agent-id')?.value || '',
    };

    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
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
        // Invalidate cache so next tab switch fetches fresh data
        this._supportConfigCacheTime = 0;
        // Update status labels inline
        for (const ch of ['email', 'sms', 'chat']) {
          const modeEl = document.getElementById(`support-${ch}-agent-mode`);
          if (!modeEl) continue;
          const mode = modeEl.value;
          const card = modeEl.closest('.notif-channel-card');
          const statusEl = card?.querySelector('.notif-channel-status');
          if (statusEl) {
            statusEl.textContent = mode === 'auto' ? 'Auto mode' : mode === 'draft' ? 'Draft mode' : 'Disabled';
            statusEl.className = `notif-channel-status ${mode === 'off' ? 'notif-status-inactive' : 'notif-status-active'}`;
          }
        }
        showToast('Settings saved', 'success');
      })
      .catch(err => {
        showToast('Error: ' + err.message, 'error');
      })
      .finally(() => {
        this._agentSaving = false;
      });
  },

  attachSupportListeners() {
    // Auto-save agent settings: any channel dropdown saves all channels
    document.querySelectorAll('[data-channel-agent]').forEach(el => {
      el.addEventListener('change', () => this._supportSaveAgentSettings());
    });

    // Ticket filters (reset page to 1 on filter change)
    document.querySelectorAll('[data-support-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.supportFilter = btn.dataset.supportFilter;
        this.supportPage = 1;
        document.querySelectorAll('[data-support-filter]').forEach(b =>
          b.classList.toggle('active', b.dataset.supportFilter === this.supportFilter)
        );
        this.loadSupportTickets();
      });
    });

    // Priority filter
    document.getElementById('support-priority-filter')?.addEventListener('change', (e) => {
      this.supportPriorityFilter = e.target.value;
      this.supportPage = 1;
      this.loadSupportTickets();
    });

    // Assignee filter
    document.getElementById('support-assignee-filter')?.addEventListener('change', (e) => {
      this.supportAssigneeFilter = e.target.value;
      this.supportPage = 1;
      this.loadSupportTickets();
    });

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
      const isGithubFilter = this.supportFilter === 'github';
      const payload = { action: 'list', status: isGithubFilter ? 'all' : this.supportFilter, page: this.supportPage || 1, limit: this.supportPerPage || 25 };
      if (isGithubFilter) payload.has_github_issue = true;
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
      this.renderSupportTicketsList(data);
    } catch (error) {
      console.error('Error loading tickets:', error);
      if (listContainer) {
        listContainer.innerHTML = `<p style="color: var(--error-color); padding: 1rem;">Error: ${error.message}</p>`;
      }
    }
  },

  renderSupportTicketsList(data) {
    const listContainer = document.getElementById('support-tickets-list');
    if (!listContainer) return;

    const tickets = data.tickets || [];
    const total = data.total || 0;
    const page = data.page || 1;
    const limit = data.limit || 25;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Sync current page state
    this.supportPage = page;

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

    // Build pagination bar
    let pageNums = '';
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNums += `<button class="btn btn-sm support-page-btn" data-page="${i}" style="padding:0.2rem 0.5rem;min-width:30px;${i === page ? 'background:var(--primary-color);color:#fff;border-color:var(--primary-color);' : ''}">${i}</button>`;
      }
    } else {
      const pages = [1];
      if (page > 3) pages.push(-1);
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push(-1);
      pages.push(totalPages);
      for (const p of pages) {
        if (p === -1) {
          pageNums += `<span style="color:var(--text-muted);padding:0 2px;">&hellip;</span>`;
        } else {
          pageNums += `<button class="btn btn-sm support-page-btn" data-page="${p}" style="padding:0.2rem 0.5rem;min-width:30px;${p === page ? 'background:var(--primary-color);color:#fff;border-color:var(--primary-color);' : ''}">${p}</button>`;
        }
      }
    }

    const perPageOptions = [10, 25, 50, 100];
    const perPageSelect = `<select class="support-per-page-select" style="font-size:0.8rem;padding:0.15rem 0.3rem;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;">
      ${perPageOptions.map(n => `<option value="${n}" ${n === limit ? 'selected' : ''}>${n}</option>`).join('')}
    </select>`;

    const paginationHtml = `
      <div class="support-pagination" style="display:flex;align-items:center;justify-content:space-between;margin-top:0.75rem;font-size:0.85rem;">
        <span style="color:var(--text-muted);">${total} ticket${total !== 1 ? 's' : ''} &middot; ${perPageSelect} per page</span>
        ${totalPages > 1 ? `<div style="display:flex;align-items:center;gap:0.25rem;">
          <button class="btn btn-secondary btn-sm support-page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} style="padding:0.25rem 0.5rem;">&laquo;</button>
          ${pageNums}
          <button class="btn btn-secondary btn-sm support-page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} style="padding:0.25rem 0.5rem;">&raquo;</button>
        </div>` : ''}
      </div>
    `;

    listContainer.innerHTML = `
      ${paginationHtml}
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
                <span class="tl-item-ref">#${escapeHtml(ticketId)}</span>
              </div>
              <div class="tl-item-main">
                <div class="tl-item-top">
                  ${isNew ? '<span class="tl-new-badge">NEW</span>' : ''}
                  <span class="tl-item-subject">${escapeHtml(t.subject || '(no subject)')}</span>
                </div>
                <div class="tl-item-bottom">
                  <span class="tl-item-from">${escapeHtml(t.from_name || t.from_email || 'Unknown')}</span>
                  ${t.assigned_name ? `<span class="tl-item-detail">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    ${escapeHtml(t.assigned_name)}
                  </span>` : ''}
                  ${t.due_date ? `<span class="tl-item-detail">Due ${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
                </div>
              </div>
              <div class="tl-item-right">
                <span class="tl-item-time">${timeAgo(t.received_at)}</span>
                <div class="tl-item-badges">
                  ${t.github_issue_url
                    ? `<a href="${escapeHtml(t.github_issue_url)}" target="_blank" rel="noopener" class="gh-pill gh-pill-linked" data-gh-link>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                        Issue
                      </a>`
                    : `<button class="gh-pill gh-pill-create" data-gh-create data-ticket-ref="${escapeHtml(ticketId)}" data-ticket-subject="${escapeHtml(t.subject || '(no subject)')}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                        + Issue
                      </button>`
                  }
                  ${t.has_pending_draft ? '<span class="ai-draft-indicator ai-draft-pending" title="Pending AI draft">AI</span>' : t.ai_responded ? '<span class="ai-draft-indicator ai-draft-sent" title="AI responded">AI</span>' : ''}
                  <span class="ticket-status-badge ticket-status-${t.status}">${t.status}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
      ${paginationHtml}
    `;

    // Attach pagination listeners
    listContainer.querySelectorAll('.support-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.supportPage = parseInt(btn.dataset.page);
        this.loadSupportTickets();
        document.getElementById('support-tickets-list')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Per-page selector
    listContainer.querySelectorAll('.support-per-page-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this.supportPerPage = parseInt(e.target.value);
        this.supportPage = 1;
        localStorage.setItem('support-per-page', String(this.supportPerPage));
        this.loadSupportTickets();
      });
    });

    // Attach row click handlers
    listContainer.querySelectorAll('.tl-item').forEach(row => {
      row.addEventListener('click', (e) => {
        // Don't open thread if clicking a GitHub badge
        if (e.target.closest('[data-gh-link]') || e.target.closest('[data-gh-create]')) return;
        this.openSupportThread(row.dataset.threadId, row.dataset.ticketStatus);
      });
    });

    // GitHub issue links — stop propagation so they open in new tab
    listContainer.querySelectorAll('[data-gh-link]').forEach(link => {
      link.addEventListener('click', (e) => e.stopPropagation());
    });

    // GitHub issue create buttons
    listContainer.querySelectorAll('[data-gh-create]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.tl-item');
        const tId = row.dataset.threadId;
        const tRef = btn.dataset.ticketRef;
        const tSubject = btn.dataset.ticketSubject;
        this._createGithubIssueFromList(tId, tRef, tSubject, (data) => {
          // Replace create pill with linked pill
          const link = document.createElement('a');
          link.href = data.issue_url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'gh-pill gh-pill-linked';
          link.dataset.ghLink = '';
          link.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg> Issue`;
          link.addEventListener('click', (ev) => ev.stopPropagation());
          btn.replaceWith(link);
        });
      });
    });
  },

  async openSupportThread(threadId, currentStatus) {
    const threadView = document.getElementById('support-thread-view');
    if (!threadView) return;

    // Clean up previous real-time subscription
    if (this._supportThreadSub) {
      supabase.removeChannel(this._supportThreadSub);
      this._supportThreadSub = null;
    }

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
        `<option value="${a.id}" ${firstMsg.assigned_to === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
      ).join('');

      const currentTags = (firstMsg.tags || []).join(', ');
      const currentDue = firstMsg.due_date ? new Date(firstMsg.due_date).toISOString().split('T')[0] : '';

      // Determine "Submitted By" source
      let submittedBy = '';
      if (firstMsg.from_name || firstMsg.from_email) {
        submittedBy = firstMsg.from_name
          ? `${escapeHtml(firstMsg.from_name)} (${escapeHtml(firstMsg.from_email || '')})`
          : escapeHtml(firstMsg.from_email);
      } else if (threadId && threadId.startsWith('manual-')) {
        submittedBy = 'Manual Entry';
      } else if (threadId && threadId.startsWith('chat-')) {
        submittedBy = `Chat Widget${firstMsg.from_email ? ' (' + escapeHtml(firstMsg.from_email) + ')' : ''}`;
      }

      const ticketRef = firstMsg.ticket_ref || (threadId || '').substring(0, 8).toUpperCase();

      const statusBadgeClass = currentStatus === 'open' ? 'ticket-status-open' : 'ticket-status-closed';
      const githubIssueUrl = firstMsg.github_issue_url || null;

      threadView.innerHTML = `
        <div class="tv-topbar">
          <button class="btn btn-secondary thread-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </button>
          <div class="tv-topbar-right">
            ${githubIssueUrl
              ? `<a href="${escapeHtml(githubIssueUrl)}" target="_blank" rel="noopener" class="gh-pill gh-pill-linked">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  View Issue
                </a>`
              : `<button class="gh-pill gh-pill-create" id="create-github-issue-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  + GitHub Issue
                </button>`
            }
            <button class="btn ${currentStatus === 'open' ? 'btn-secondary' : 'btn-primary'}" id="toggle-status-btn" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
              ${currentStatus === 'open' ? 'Close Ticket' : 'Reopen Ticket'}
            </button>
          </div>
        </div>

        <div class="tv-subject-row">
          <span class="tv-ref-badge">#${escapeHtml(ticketRef)}</span>
          <h2 class="tv-subject">${escapeHtml(subject)}</h2>
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
            <input type="text" id="thread-tags" class="form-input" value="${escapeHtml(currentTags)}" placeholder="tag1, tag2, ...">
            ${(firstMsg.tags || []).length > 0 ? `
              <div class="tv-tags-list">
                ${(firstMsg.tags || []).map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
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
                  <strong>${escapeHtml(m.from_name || m.from_email || 'Unknown')}${isAi ? ' <span class="tv-ai-tag">AI</span>' : ''}</strong>
                  <span>${new Date(m.received_at).toLocaleString()}</span>
                </div>
                <div class="tv-msg-body ${m.body_html ? 'email-html-content' : 'email-text-content'}">${
                  m.body_html
                    ? this.sanitizeHtml(this.stripHtmlQuotedText(m.body_html))
                    : escapeHtml(m.body_text || '').replace(/\n/g, '<br>')
                }</div>
                ${m.attachments && m.attachments.length > 0 ? `
                  <div class="tv-msg-attachments">
                    ${m.attachments.map(a => `
                      <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener" class="tv-attachment-thumb">
                        <img src="${escapeHtml(a.url)}" loading="lazy" alt="${escapeHtml(a.filename)}">
                        <span>${escapeHtml(a.filename)}</span>
                      </a>
                    `).join('')}
                  </div>
                ` : ''}
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
            <div class="tv-draft-body">${escapeHtml(pendingDraft.ai_draft || '').replace(/\n/g, '<br>')}</div>
            <div class="tv-draft-actions">
              <button class="btn btn-primary" id="approve-draft-btn" data-ticket-id="${pendingDraft.id}">Approve & Send</button>
              <button class="btn btn-secondary" id="edit-draft-btn" data-draft-text="${escapeHtml(pendingDraft.ai_draft || '')}">Edit</button>
              <button class="btn btn-secondary" id="reject-draft-btn" data-ticket-id="${pendingDraft.id}" style="color: var(--error-color);">Reject</button>
            </div>
          </div>
        ` : ''}

        <div class="tv-reply">
          <div id="support-reply-toolbar" style="
            display: flex; align-items: center; gap: 0.25rem; padding: 0.375rem 0.75rem;
            border: 1px solid var(--border-color); border-bottom: none; border-radius: 8px 8px 0 0;
            background: var(--bg-secondary);
          ">
            <button class="support-format-btn" data-cmd="bold" title="Bold" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);font-weight:bold;font-size:0.875rem;">B</button>
            <button class="support-format-btn" data-cmd="italic" title="Italic" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);font-style:italic;font-size:0.875rem;">I</button>
            <button class="support-format-btn" data-cmd="underline" title="Underline" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);text-decoration:underline;font-size:0.875rem;">U</button>
            <div style="width:1px;height:18px;background:var(--border-color);margin:0 0.25rem;"></div>
            <button class="support-format-btn" data-cmd="createLink" title="Insert Link" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button class="support-format-btn" data-cmd="insertUnorderedList" title="Bulleted List" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <div style="width:1px;height:18px;background:var(--border-color);margin:0 0.25rem;"></div>
            <button id="support-attach-btn" title="Attach file" style="background:none;border:none;padding:0.375rem;cursor:pointer;border-radius:4px;color:var(--text-primary);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input type="file" id="support-file-input" multiple accept="image/*,video/*,.pdf,.doc,.docx,.txt" style="display:none;" />
          </div>
          <div id="support-reply-editor" contenteditable="true" style="
            min-height: 80px; padding: 0.75rem; border: 1px solid var(--border-color);
            border-radius: 0 0 8px 8px; outline: none; font-size: 0.875rem; line-height: 1.6;
            color: var(--text-primary); background: var(--bg-primary);
          " data-placeholder="Type your reply..."></div>
          <div id="support-attachment-previews" class="email-attachment-previews" style="display:none;"></div>
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
                <strong>${escapeHtml(n.author_name || 'Unknown')}</strong>
                <span>${new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div class="tv-note-body">${escapeHtml(n.content).replace(/\n/g, '<br>')}</div>
            </div>
          `).join('') : '<p class="tv-notes-empty">No notes yet.</p>'}
          <div class="tv-note-input">
            <textarea id="new-note-text" class="form-input" rows="2" placeholder="Add an internal note..."></textarea>
            <button class="btn btn-secondary" id="add-note-btn">Add Note</button>
          </div>
        </div>
      `;

      // Back button (preserves current page)
      threadView.querySelector('.thread-back-btn').addEventListener('click', () => {
        // Unsubscribe from real-time updates
        if (this._supportThreadSub) {
          supabase.removeChannel(this._supportThreadSub);
          this._supportThreadSub = null;
        }
        threadView.style.display = 'none';
        document.querySelector('.support-subtabs').style.display = '';
        document.getElementById('support-subtab-tickets').style.display = 'flex';
        this.supportSubTab = 'tickets';
        this.updateUrl({ tab: 'support' });
        this.loadSupportTickets(); // supportPage is preserved
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

      // Formatting toolbar
      document.querySelectorAll('.support-format-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const cmd = btn.dataset.cmd;
          if (cmd === 'createLink') {
            const url = prompt('Enter URL:');
            if (url) document.execCommand('createLink', false, url);
          } else {
            document.execCommand(cmd, false, null);
          }
          document.getElementById('support-reply-editor')?.focus();
        });
      });

      // Placeholder behavior for contenteditable
      const replyEditor = document.getElementById('support-reply-editor');
      const updatePlaceholder = () => {
        if (!replyEditor.textContent.trim() && !replyEditor.querySelector('img')) {
          replyEditor.classList.add('empty');
        } else {
          replyEditor.classList.remove('empty');
        }
      };
      replyEditor.addEventListener('input', updatePlaceholder);
      replyEditor.addEventListener('focus', updatePlaceholder);
      replyEditor.addEventListener('blur', updatePlaceholder);
      updatePlaceholder();

      // Attachment upload
      this._supportAttachments = [];
      const attachBtn = document.getElementById('support-attach-btn');
      const fileInput = document.getElementById('support-file-input');
      attachBtn?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        if (this._supportAttachments.length + files.length > 5) {
          showToast('Maximum 5 attachments allowed', 'error');
          fileInput.value = '';
          return;
        }
        for (const file of files) {
          if (file.size > 25 * 1024 * 1024) {
            showToast(`${file.name} exceeds 25MB limit`, 'error');
            continue;
          }
          const userId = this.session?.user?.id || 'anonymous';
          const fileExt = file.name.split('.').pop();
          const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('support-attachments')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
          if (uploadError) {
            console.error('Upload error:', uploadError);
            showToast('Failed to upload ' + file.name, 'error');
            continue;
          }
          const { data: { publicUrl } } = supabase.storage
            .from('support-attachments')
            .getPublicUrl(fileName);
          this._supportAttachments.push({ url: publicUrl, filename: file.name, type: file.type, size: file.size });
          if (file.type.startsWith('image/')) {
            replyEditor.focus();
            document.execCommand('insertHTML', false,
              `<img src="${publicUrl}" alt="${escapeHtml(file.name)}" style="max-width: 100%; height: auto; border-radius: 4px; margin: 0.5rem 0;">`
            );
          }
        }
        this._renderSupportAttachmentPreviews();
        fileInput.value = '';
      });

      // Send reply
      document.getElementById('send-reply-btn')?.addEventListener('click', async () => {
        const editor = document.getElementById('support-reply-editor');
        const bodyHtml = editor?.innerHTML || '';
        const bodyText = editor?.textContent?.trim() || '';
        if (!bodyText) return;

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
              body: JSON.stringify({
                action: 'send_reply',
                threadId,
                replyBody: bodyText,
                replyBodyHtml: bodyHtml,
                attachments: this._supportAttachments?.length ? this._supportAttachments : undefined,
              }),
            }
          );

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to send');
          }

          editor.innerHTML = '';
          this._supportAttachments = [];
          this._renderSupportAttachmentPreviews();
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
        const editor = document.getElementById('support-reply-editor');
        if (editor) {
          editor.textContent = draftText;
          editor.focus();
        }
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

      // Create GitHub issue — show preview modal (uses shared method)
      const threadAttachments = messages.flatMap(m => m.attachments || []);
      document.getElementById('create-github-issue-btn')?.addEventListener('click', () => {
        this._showGithubIssueModal(threadId, ticketRef, subject, notes, (data) => {
          // Replace pill with linked version
          const createBtn = document.getElementById('create-github-issue-btn');
          if (createBtn) {
            const link = document.createElement('a');
            link.href = data.issue_url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'gh-pill gh-pill-linked';
            link.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg> View Issue`;
            createBtn.replaceWith(link);
          }
        }, threadAttachments);
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

      // Real-time subscription for new/updated messages in this thread
      this._supportThreadSub = supabase
        .channel(`support-thread-${threadId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'support_tickets',
          filter: `thread_id=eq.${threadId}`,
        }, () => {
          this.openSupportThread(threadId, currentStatus);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `thread_id=eq.${threadId}`,
        }, () => {
          this.openSupportThread(threadId, currentStatus);
        })
        .subscribe();

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
            `<option value="${a.id}" ${currentVal === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
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
      `<option value="${a.id}">${escapeHtml(a.name)}</option>`
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
        <div class="new-ticket-images-area">
          <input type="file" id="new-ticket-file-input" accept="image/*" multiple style="display: none;">
          <button type="button" class="new-ticket-images-btn" id="new-ticket-add-images-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            Add Images
          </button>
          <div class="new-ticket-image-previews" id="new-ticket-image-previews"></div>
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

    // Image upload handling
    this._newTicketImages = [];
    const fileInput = document.getElementById('new-ticket-file-input');
    const addImagesBtn = document.getElementById('new-ticket-add-images-btn');
    const previewsContainer = document.getElementById('new-ticket-image-previews');

    addImagesBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', () => {
      for (const file of fileInput.files) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) {
          showToast(`${file.name} exceeds 5MB limit`, 'error');
          continue;
        }
        if (this._newTicketImages.length >= 10) {
          showToast('Maximum 10 images', 'error');
          break;
        }
        this._newTicketImages.push(file);
      }
      fileInput.value = '';
      this._renderNewTicketImagePreviews();
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
                signal: AbortSignal.timeout(5000),
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
              <div class="behalf-suggestion-item" data-email="${escapeHtml(u.email)}" data-name="${escapeHtml(u.name || '')}">
                <strong>${escapeHtml(u.name || 'Unknown')}</strong>
                <span>${escapeHtml(u.email)}</span>
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
        // Generate thread_id client-side so we can upload images to the right path
        const threadId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Upload images if any
        let attachments = [];
        if (this._newTicketImages && this._newTicketImages.length > 0) {
          btn.textContent = 'Uploading images...';
          for (const file of this._newTicketImages) {
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `${threadId}/${timestamp}-${safeName}`;

            const { error: uploadErr } = await supabase.storage
              .from('support-attachments')
              .upload(storagePath, file, { contentType: file.type, upsert: false });

            if (uploadErr) {
              console.error('Image upload failed:', uploadErr);
              continue;
            }

            attachments.push({
              filename: file.name,
              url: `https://api.magpipe.ai/storage/v1/object/public/support-attachments/${storagePath}`,
              mime_type: file.type,
              size_bytes: file.size,
            });
          }
          btn.textContent = 'Creating...';
        }

        const payload = {
          action: 'create_ticket', subject, description, priority, tags,
          assigned_to, due_date, from_email, from_name, thread_id: threadId,
        };
        if (attachments.length > 0) payload.attachments = attachments;

        const res = await fetch(
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

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create ticket');
        }

        this._newTicketImages = [];
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

  /**
   * Show the GitHub Issue creation modal.
   * @param {string} threadId
   * @param {string} ticketRef - e.g. "TKT-000123"
   * @param {string} subject
   * @param {Array} notes - enriched notes with author_name, content, created_at
   * @param {Function} [onCreated] - callback({ issue_url, issue_number })
   * @param {Array} [attachments] - image attachments from thread messages
   */
  _showGithubIssueModal(threadId, ticketRef, subject, notes, onCreated, attachments) {
    const previewTitle = `[${ticketRef}] ${subject}`;
    const ticketLink = `https://magpipe.ai/admin?tab=support&thread=${threadId}`;
    let previewBody = `**Support Ticket**: [#${ticketRef}](${ticketLink})\n\n---\n`;
    if (notes && notes.length > 0) {
      previewBody += `\n## Internal Notes\n\n`;
      for (const n of notes) {
        const date = new Date(n.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        previewBody += `**${n.author_name || 'Unknown'}** (${date}):\n${n.content}\n\n---\n\n`;
      }
    } else {
      previewBody += `\n*No internal notes yet.*\n`;
    }

    document.getElementById('github-issue-modal-overlay')?.remove();

    const modalHtml = `
      <div class="contact-modal-overlay" id="github-issue-modal-overlay"
           onclick="document.getElementById('github-issue-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 650px;">
          <div class="contact-modal-header">
            <h3>Create GitHub Issue</h3>
            <button class="close-modal-btn" onclick="document.getElementById('github-issue-modal-overlay').style.display='none'">&times;</button>
          </div>
          <form id="github-issue-form">
            <div class="contact-modal-body scrollable">
              <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Title</label>
                <input type="text" id="gh-issue-title" class="form-input" value="${escapeHtml(previewTitle)}">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Body (Markdown)</label>
                <textarea id="gh-issue-body" class="form-input" rows="14" style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(previewBody)}</textarea>
              </div>
              ${attachments && attachments.length > 0 ? `
                <div class="form-group" style="margin-top: 0.75rem;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem;">
                    <input type="checkbox" id="gh-issue-include-images" checked>
                    Include ${attachments.length} image${attachments.length > 1 ? 's' : ''}
                  </label>
                  <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.4rem;">
                    ${attachments.map(a => `
                      <a href="${escapeHtml(a.url)}" target="_blank" style="display:block; border:1px solid var(--border-color); border-radius:4px; overflow:hidden;">
                        <img src="${escapeHtml(a.url)}" style="width:60px; height:45px; object-fit:cover; display:block;" alt="${escapeHtml(a.filename)}">
                      </a>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('github-issue-modal-overlay').style.display='none'">Cancel</button>
              <button type="submit" class="btn btn-primary" id="gh-issue-submit-btn">Create Issue</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('github-issue-modal-overlay').style.display = 'flex';

    document.getElementById('github-issue-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('gh-issue-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      const editedTitle = document.getElementById('gh-issue-title').value.trim();
      let editedBody = document.getElementById('gh-issue-body').value.trim();

      // Append image attachments if checkbox is checked
      const includeImages = document.getElementById('gh-issue-include-images')?.checked;
      if (includeImages && attachments && attachments.length > 0) {
        editedBody += '\n\n## Attachments\n\n';
        for (const a of attachments) {
          editedBody += `![${a.filename}](${a.url})\n\n`;
        }
      }

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'create_github_issue', thread_id: threadId, title: editedTitle, body: editedBody }),
          }
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create issue');
        }
        const data = await res.json();
        document.getElementById('github-issue-modal-overlay')?.remove();
        showToast(`GitHub issue #${data.issue_number} created`, 'success');
        if (onCreated) onCreated(data);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Issue';
      }
    });
  },

  /**
   * Fetch notes for a thread and show the GitHub issue creation modal.
   * Used from the ticket list where notes aren't loaded yet.
   */
  async _createGithubIssueFromList(threadId, ticketRef, subject, onCreated) {
    try {
      // Fetch notes and thread messages in parallel
      const [notesRes, threadRes] = await Promise.all([
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'get_notes', threadId }),
          }
        ),
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tickets-api`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'thread', threadId }),
          }
        ),
      ]);
      if (!notesRes.ok) throw new Error('Failed to load notes');
      const notesData = await notesRes.json();
      const threadData = threadRes.ok ? await threadRes.json() : {};
      const allAttachments = (threadData.messages || []).flatMap(m => m.attachments || []);
      this._showGithubIssueModal(threadId, ticketRef, subject, notesData.notes || [], onCreated, allAttachments);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  },

  _renderNewTicketImagePreviews() {
    const container = document.getElementById('new-ticket-image-previews');
    if (!container) return;
    container.innerHTML = this._newTicketImages.map((file, i) => {
      const url = URL.createObjectURL(file);
      return `
        <div class="new-ticket-image-preview" data-idx="${i}">
          <img src="${url}" alt="${escapeHtml(file.name)}">
          <button type="button" class="new-ticket-image-remove" data-remove-idx="${i}">&times;</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.new-ticket-image-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.removeIdx);
        this._newTicketImages.splice(idx, 1);
        this._renderNewTicketImagePreviews();
      });
    });
  },

  // ── Errors sub-tab ──────────────────────────────────────────────

  async renderErrorsTab() {
    const content = document.getElementById('admin-tab-content');
    if (!content) return;

    this._errorsPage = 1;
    this._errorsPerPage = 25;

    content.innerHTML = `
      <div class="support-section">
        <div class="tl-toolbar" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="margin: 0;">System Error Logs</h3>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-left: auto;">
            <select id="errors-severity-filter" class="form-input form-select" style="max-width: 140px; font-size: 0.85rem;">
              <option value="">All Severity</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
            <select id="errors-source-filter" class="form-input form-select" style="max-width: 150px; font-size: 0.85rem;">
              <option value="">All Sources</option>
              <option value="supabase">Supabase</option>
              <option value="vercel">Vercel (Frontend)</option>
              <option value="scheduled">Scheduled</option>
              <option value="render">Render (Agent)</option>
            </select>
            <select id="errors-type-filter" class="form-input form-select" style="max-width: 200px; font-size: 0.85rem;">
              <option value="">All Types</option>
              <option value="sms_verification">SMS Verification</option>
              <option value="sms_notification">SMS Notification</option>
              <option value="gmail_token_expired">Gmail Token Expired</option>
              <option value="scheduled_function_stale">Scheduled Function Stale</option>
              <option value="edge_function_error">Edge Function Error</option>
              <option value="frontend_js_error">Frontend JS Error</option>
              <option value="knowledge_upload_error">KB Upload Error</option>
            </select>
            <button class="btn btn-secondary" id="errors-refresh-btn" style="font-size: 0.85rem; padding: 0.35rem 0.75rem; white-space: nowrap;">↻ Refresh</button>
          </div>
        </div>
        <div id="errors-table-container">
          <div class="loading-spinner">Loading errors...</div>
        </div>
      </div>
    `;

    const refilter = () => { this._errorsPage = 1; this._loadErrorLogs(); };
    document.getElementById('errors-type-filter')?.addEventListener('change', refilter);
    document.getElementById('errors-source-filter')?.addEventListener('change', refilter);
    document.getElementById('errors-severity-filter')?.addEventListener('change', refilter);
    document.getElementById('errors-refresh-btn')?.addEventListener('click', () => this._loadErrorLogs());

    await this._loadErrorLogs();
  },

  async _loadErrorLogs() {
    const container = document.getElementById('errors-table-container');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner">Loading errors...</div>';

    try {
      const typeFilter = document.getElementById('errors-type-filter')?.value || '';
      const sourceFilter = document.getElementById('errors-source-filter')?.value || '';
      const severityFilter = document.getElementById('errors-severity-filter')?.value || '';
      const from = (this._errorsPage - 1) * this._errorsPerPage;
      const to = from + this._errorsPerPage - 1;

      let query = supabase
        .from('system_error_logs')
        .select('*, users(email, phone_number)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (typeFilter) query = query.eq('error_type', typeFilter);
      if (sourceFilter) query = query.eq('source', sourceFilter);
      if (severityFilter) query = query.eq('severity', severityFilter);

      const { data: errors, error, count } = await query;
      if (error) throw error;

      if (!errors || errors.length === 0) {
        container.innerHTML = `
          <div class="detail-placeholder" style="padding: 2rem; text-align: center; color: var(--text-muted);">
            No errors found.
          </div>
        `;
        return;
      }

      const totalPages = Math.ceil((count || 0) / this._errorsPerPage);

      container.innerHTML = `
        <div style="overflow-x: auto;">
          <table class="data-table" style="width: 100%; font-size: 0.85rem;">
            <thead>
              <tr>
                <th style="white-space: nowrap;">Date</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Type</th>
                <th>Message</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              ${errors.map(err => {
                const date = new Date(err.created_at);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const userEmail = err.users?.email || '';
                const severityBadge = err.severity === 'warning'
                  ? `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:#fef3c7;color:#92400e;">warning</span>`
                  : `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:#fee2e2;color:#991b1b;">error</span>`;
                const sourceBadge = this._errorSourceBadge(err.source || 'supabase');
                const typeBadge = this._errorTypeBadge(err.error_type);
                // Show metadata details as tooltip on message
                const metaStr = err.metadata && Object.keys(err.metadata).length
                  ? Object.entries(err.metadata).map(([k, v]) => `${k}: ${v}`).join(' | ')
                  : '';
                return `
                  <tr>
                    <td style="white-space: nowrap; color: var(--text-muted);">${dateStr}<br><span style="font-size: 0.75rem;">${timeStr}</span></td>
                    <td>${severityBadge}</td>
                    <td>${sourceBadge}</td>
                    <td>${typeBadge}</td>
                    <td style="max-width: 320px;">
                      <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(err.error_message + (metaStr ? '\n' + metaStr : ''))}">${escapeHtml(err.error_message)}</div>
                      ${err.error_code ? `<div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(err.error_code)}</div>` : ''}
                    </td>
                    <td>${err.user_id ? `<a href="#" class="error-user-link" data-user-id="${err.user_id}" style="font-size: 0.8rem;">${escapeHtml(userEmail || 'View user')}</a>` : '<span style="color: var(--text-muted);">—</span>'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.5rem 0;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">${count} total${totalPages > 1 ? ` — page ${this._errorsPage} of ${totalPages}` : ''}</span>
          ${totalPages > 1 ? `
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary" id="errors-prev-btn" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" ${this._errorsPage <= 1 ? 'disabled' : ''}>Prev</button>
              <button class="btn btn-secondary" id="errors-next-btn" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;" ${this._errorsPage >= totalPages ? 'disabled' : ''}>Next</button>
            </div>
          ` : ''}
        </div>
      `;

      document.getElementById('errors-prev-btn')?.addEventListener('click', () => {
        if (this._errorsPage > 1) { this._errorsPage--; this._loadErrorLogs(); }
      });
      document.getElementById('errors-next-btn')?.addEventListener('click', () => {
        if (this._errorsPage < totalPages) { this._errorsPage++; this._loadErrorLogs(); }
      });

      container.querySelectorAll('.error-user-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.supportSubTab = 'users';
          this._supportLazyLoaded['users'] = false;
          this.renderSupportContent();
        });
      });

    } catch (err) {
      console.error('Error loading error logs:', err);
      container.innerHTML = `
        <div class="detail-placeholder" style="padding: 2rem; text-align: center; color: var(--error-color);">
          Failed to load error logs: ${escapeHtml(err.message)}
        </div>
      `;
    }
  },

  _errorSourceBadge(source) {
    const map = {
      supabase:  { label: 'Supabase',  bg: '#ede9fe', color: '#5b21b6' },
      vercel:    { label: 'Vercel',    bg: '#f0fdf4', color: '#166534' },
      scheduled: { label: 'Scheduled', bg: '#e0f2fe', color: '#075985' },
      render:    { label: 'Render',    bg: '#fef9c3', color: '#854d0e' },
    };
    const b = map[source] || { label: source, bg: '#f3f4f6', color: '#374151' };
    return `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:${b.bg};color:${b.color};white-space:nowrap;">${b.label}</span>`;
  },

  _errorTypeBadge(type) {
    const map = {
      sms_verification:        { label: 'SMS Verify',   bg: '#fef3c7', color: '#92400e' },
      sms_notification:        { label: 'SMS Notif',    bg: '#fee2e2', color: '#991b1b' },
      gmail_token_expired:     { label: 'Gmail Token',  bg: '#fee2e2', color: '#991b1b' },
      scheduled_function_stale:{ label: 'Cron Stale',   bg: '#fef9c3', color: '#854d0e' },
      edge_function_error:     { label: 'Edge Fn',      bg: '#f3e8ff', color: '#6b21a8' },
      frontend_js_error:       { label: 'Frontend JS',  bg: '#e0f2fe', color: '#075985' },
      knowledge_upload_error:  { label: 'KB Upload',    bg: '#fce7f3', color: '#9d174d' },
    };
    const b = map[type] || { label: type.replace(/_/g, ' '), bg: '#f3f4f6', color: '#374151' };
    return `<span style="display:inline-block;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:${b.bg};color:${b.color};white-space:nowrap;">${b.label}</span>`;
  },

  _renderSupportAttachmentPreviews() {
    const container = document.getElementById('support-attachment-previews');
    if (!container) return;
    if (!this._supportAttachments?.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'flex';
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
    container.innerHTML = this._supportAttachments.map((a, i) => {
      const isVideo = a.type?.startsWith('video/');
      const isImage = a.type?.startsWith('image/');
      const safeName = esc(a.filename || 'file');
      const thumb = isImage
        ? `<img src="${a.url}" alt="${safeName}" loading="lazy">`
        : isVideo
          ? `<video src="${a.url}" muted></video>`
          : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.5rem;">📎</div>`;
      return `
        <div class="email-attachment-preview">
          ${thumb}
          <button class="remove-attachment" data-idx="${i}" title="Remove">&times;</button>
          <div class="attachment-name">${safeName}</div>
        </div>
      `;
    }).join('');
    container.querySelectorAll('.remove-attachment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._supportAttachments.splice(parseInt(e.currentTarget.dataset.idx), 1);
        this._renderSupportAttachmentPreviews();
      });
    });
  },

  sanitizeHtml(html) {
    if (!html) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const removeTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'];
    removeTags.forEach(tag => { doc.querySelectorAll(tag).forEach(el => el.remove()); });
    const safeTags = new Set([
      'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'a', 'b', 'strong', 'i', 'em', 'u', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr', 'pre', 'code',
      'sup', 'sub', 'dl', 'dt', 'dd', 'abbr', 'mark', 'small',
    ]);
    for (const el of doc.body.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      if (!safeTags.has(tag)) { el.replaceWith(...el.childNodes); continue; }
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction') el.removeAttribute(attr.name);
        if (['href', 'src', 'action'].includes(n)) {
          const v = (attr.value || '').trim().toLowerCase();
          if (v.startsWith('javascript:') || v.startsWith('data:text/html')) el.removeAttribute(attr.name);
        }
      }
      if (tag === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      if (tag === 'img') { el.style.maxWidth = '100%'; el.style.height = 'auto'; }
    }
    return doc.body.innerHTML;
  },

  stripHtmlQuotedText(html) {
    if (!html) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('.gmail_quote, .gmail_extra, .gmail_signature').forEach(el => el.remove());
    doc.querySelectorAll('.yahoo_quoted, .yahoo-quoted').forEach(el => el.remove());
    doc.querySelectorAll('#divRplyFwdMsg, #appendonsend, .MsoNormal[style*="border-top"]').forEach(el => el.remove());
    doc.querySelectorAll('blockquote[type="cite"]').forEach(el => el.remove());
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (/^On\s.+wrote:\s*$/.test(node.textContent.trim())) {
        let current = node.parentElement;
        if (current) {
          while (current.nextSibling) current.parentNode.removeChild(current.nextSibling);
          current.remove();
        }
        break;
      }
    }
    return doc.body.innerHTML;
  },
};
