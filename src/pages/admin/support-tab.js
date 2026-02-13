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
          <div class="support-filter-bar">
            <button class="kpi-filter-btn ${this.supportFilter === 'open' ? 'active' : ''}" data-support-filter="open">Open</button>
            <button class="kpi-filter-btn ${this.supportFilter === 'closed' ? 'active' : ''}" data-support-filter="closed">Closed</button>
            <button class="kpi-filter-btn ${this.supportFilter === 'all' ? 'active' : ''}" data-support-filter="all">All</button>
            <select id="support-priority-filter" class="form-input form-select" style="max-width: 140px; font-size: 0.8rem; padding: 0.35rem 0.5rem; margin-left: 0.5rem;">
              <option value="">All Priorities</option>
              <option value="low" ${this.supportPriorityFilter === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${this.supportPriorityFilter === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${this.supportPriorityFilter === 'high' ? 'selected' : ''}>High</option>
              <option value="urgent" ${this.supportPriorityFilter === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
            <select id="support-assignee-filter" class="form-input form-select" style="max-width: 160px; font-size: 0.8rem; padding: 0.35rem 0.5rem;">
              <option value="">All Assignees</option>
            </select>
            <button class="btn btn-primary" id="new-ticket-btn" style="margin-left: auto; font-size: 0.8rem; padding: 0.35rem 0.75rem;">+ New Ticket</button>
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
          <div class="support-card">
            ${this.supportGmailConnected ? `
              <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="width: 10px; height: 10px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
                  <div>
                    <strong>${this.supportConfig.gmail_address || 'Connected'}</strong>
                    ${this.supportConfig.last_polled_at ? `<div style="color: var(--text-muted); font-size: 0.8rem;">Last polled: ${new Date(this.supportConfig.last_polled_at).toLocaleString()}</div>` : ''}
                  </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="btn btn-primary" id="connect-gmail-btn" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">Change Email</button>
                  <button class="btn btn-secondary" id="disconnect-gmail-btn" style="font-size: 0.8rem; padding: 0.35rem 0.75rem; color: var(--error-color);">Disconnect</button>
                </div>
              </div>
            ` : `
              <p style="color: var(--text-muted); margin-bottom: 0.75rem;">Connect a Gmail account to sync support emails.</p>
              <button class="btn btn-primary" id="connect-gmail-btn">Connect Gmail</button>
            `}
          </div>
        </div>

        <!-- AI Agent Settings -->
        <div class="support-section">
          <h3>AI Agent Settings</h3>
          <div class="support-card">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">Mode</label>
              <select id="support-agent-mode" class="form-input form-select" style="max-width: 300px;">
                <option value="off" ${this.supportConfig.agent_mode === 'off' ? 'selected' : ''}>Off</option>
                <option value="draft" ${this.supportConfig.agent_mode === 'draft' ? 'selected' : ''}>Draft (AI drafts, you approve)</option>
                <option value="auto" ${this.supportConfig.agent_mode === 'auto' ? 'selected' : ''}>Auto (AI sends immediately)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label">System Prompt</label>
              <textarea id="support-agent-prompt" class="form-input" rows="3" placeholder="You are a support agent for Magpipe. Be helpful and concise.">${this.supportConfig.agent_system_prompt || ''}</textarea>
            </div>
            <button class="btn btn-primary" id="save-agent-settings-btn">Save Agent Settings</button>
            <span id="agent-settings-status" class="form-status" style="display: none;"></span>
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

    // Save agent settings
    document.getElementById('save-agent-settings-btn')?.addEventListener('click', async () => {
      const mode = document.getElementById('support-agent-mode').value;
      const prompt = document.getElementById('support-agent-prompt').value;
      const status = document.getElementById('agent-settings-status');

      try {
        const response = await fetch(
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
              agent_system_prompt: prompt,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to save');
        status.style.display = 'inline';
        status.className = 'form-status success';
        status.textContent = 'Saved';
        setTimeout(() => { status.style.display = 'none'; }, 2000);
      } catch (error) {
        status.style.display = 'inline';
        status.className = 'form-status error';
        status.textContent = 'Error: ' + error.message;
      }
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
        listContainer.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No tickets found.</p>';
        return;
      }

      const priorityBadge = (p) => {
        const colors = { low: 'priority-low', medium: 'priority-medium', high: 'priority-high', urgent: 'priority-urgent' };
        return `<span class="priority-badge ${colors[p] || 'priority-medium'}">${p || 'medium'}</span>`;
      };
      const formatDue = (d) => d ? new Date(d).toLocaleDateString() : '';

      listContainer.innerHTML = `
        <table class="support-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>From</th>
              <th>Subject</th>
              <th>Assigned</th>
              <th>Due</th>
              <th>Date</th>
              <th>Status</th>
              <th>AI</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map(t => `
              <tr class="ticket-row" data-thread-id="${t.thread_id || t.id}" data-ticket-status="${t.status}">
                <td>${priorityBadge(t.priority)}</td>
                <td>${this.escapeHtml(t.from_name || t.from_email || '')}</td>
                <td>${this.escapeHtml(t.subject || '(no subject)')}</td>
                <td>${this.escapeHtml(t.assigned_name || '')}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${formatDue(t.due_date)}</td>
                <td>${new Date(t.received_at).toLocaleDateString()}</td>
                <td><span class="ticket-status-badge ticket-status-${t.status}">${t.status}</span></td>
                <td>${t.has_pending_draft ? '<span class="ai-draft-indicator" title="Pending AI draft">AI</span>' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      // Attach row click handlers
      listContainer.querySelectorAll('.ticket-row').forEach(row => {
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

      const ticketRef = firstMsg.ticket_ref || '';

      threadView.innerHTML = `
        <div class="thread-header">
          <button class="btn btn-secondary thread-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h3 style="margin: 0; flex: 1;">${this.escapeHtml(subject)}</h3>
          <button class="btn ${currentStatus === 'open' ? 'btn-secondary' : 'btn-primary'}" id="toggle-status-btn">
            ${currentStatus === 'open' ? 'Close Ticket' : 'Reopen Ticket'}
          </button>
        </div>

        ${submittedBy || ticketRef ? `
          <div class="ticket-meta-bar">
            ${submittedBy ? `<span class="ticket-meta-item">Submitted by: <strong>${submittedBy}</strong></span>` : ''}
            ${ticketRef ? `<span class="ticket-meta-item">Ref: <strong>${this.escapeHtml(ticketRef)}</strong></span>` : ''}
          </div>
        ` : ''}

        <div class="ticket-detail-fields">
          <div class="ticket-detail-row">
            <div class="ticket-detail-field">
              <label>Priority</label>
              <select id="thread-priority" class="form-input form-select">
                <option value="low" ${firstMsg.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${firstMsg.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${firstMsg.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="urgent" ${firstMsg.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
              </select>
            </div>
            <div class="ticket-detail-field">
              <label>Assignee</label>
              <select id="thread-assignee" class="form-input form-select">
                <option value="">Unassigned</option>
                ${assigneeOptions}
              </select>
            </div>
            <div class="ticket-detail-field">
              <label>Due Date</label>
              <input type="date" id="thread-due-date" class="form-input" value="${currentDue}">
            </div>
          </div>
          <div class="ticket-detail-row" style="margin-top: 0.5rem;">
            <div class="ticket-detail-field" style="flex: 1;">
              <label>Tags</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="text" id="thread-tags" class="form-input" value="${this.escapeHtml(currentTags)}" placeholder="tag1, tag2, ...">
              </div>
            </div>
            <div style="display: flex; align-items: flex-end;">
              <button class="btn btn-primary" id="save-ticket-details-btn" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;">Save</button>
              <span id="ticket-detail-status" class="form-status" style="display: none; margin-left: 0.5rem;"></span>
            </div>
          </div>
          ${(firstMsg.tags || []).length > 0 ? `
            <div style="margin-top: 0.5rem; display: flex; gap: 0.25rem; flex-wrap: wrap;">
              ${(firstMsg.tags || []).map(tag => `<span class="tag-pill">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <div class="thread-messages">
          ${messages.map(m => `
            <div class="thread-message thread-message-${m.direction}">
              <div class="thread-message-header">
                <strong>${this.escapeHtml(m.from_name || m.from_email || '')}</strong>
                <span style="color: var(--text-muted); font-size: 0.8rem;">${new Date(m.received_at).toLocaleString()}</span>
              </div>
              <div class="thread-message-body">${this.escapeHtml(m.body_text || '').replace(/\n/g, '<br>')}</div>
            </div>
          `).join('')}
        </div>

        ${pendingDraft ? `
          <div class="ai-draft-card">
            <div class="ai-draft-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22"/>
                <path d="M8 6a4 4 0 0 1 .64-2.18"/>
              </svg>
              AI Draft Reply
            </div>
            <div class="ai-draft-body">${this.escapeHtml(pendingDraft.ai_draft || '').replace(/\n/g, '<br>')}</div>
            <div class="ai-draft-actions">
              <button class="btn btn-primary" id="approve-draft-btn" data-ticket-id="${pendingDraft.id}">Approve & Send</button>
              <button class="btn btn-secondary" id="edit-draft-btn" data-draft-text="${this.escapeHtml(pendingDraft.ai_draft || '')}">Edit</button>
              <button class="btn btn-secondary" id="reject-draft-btn" data-ticket-id="${pendingDraft.id}" style="color: var(--error-color);">Reject</button>
            </div>
          </div>
        ` : ''}

        <div class="reply-area">
          <textarea id="support-reply-text" class="form-input" rows="4" placeholder="Type your reply..."></textarea>
          <button class="btn btn-primary" id="send-reply-btn">Send Reply</button>
        </div>

        <div class="ticket-notes-section">
          <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem;">Internal Notes</h4>
          <div id="ticket-notes-list">
            ${notes.length > 0 ? notes.map(n => `
              <div class="ticket-note">
                <div class="ticket-note-header">
                  <strong>${this.escapeHtml(n.author_name || 'Unknown')}</strong>
                  <span>${new Date(n.created_at).toLocaleString()}</span>
                </div>
                <div class="ticket-note-body">${this.escapeHtml(n.content).replace(/\n/g, '<br>')}</div>
              </div>
            `).join('') : '<p style="color: var(--text-muted); font-size: 0.85rem;">No notes yet.</p>'}
          </div>
          <div class="ticket-note-input">
            <textarea id="new-note-text" class="form-input" rows="2" placeholder="Add an internal note..."></textarea>
            <button class="btn btn-secondary" id="add-note-btn" style="align-self: flex-end; font-size: 0.8rem;">Add Note</button>
          </div>
        </div>
      `;

      // Back button
      threadView.querySelector('.thread-back-btn').addEventListener('click', () => {
        threadView.style.display = 'none';
        document.querySelector('.support-subtabs').style.display = '';
        document.getElementById('support-subtab-tickets').style.display = 'block';
        this.supportSubTab = 'tickets';
        this.loadSupportTickets();
      });

      // Save ticket detail fields
      document.getElementById('save-ticket-details-btn')?.addEventListener('click', async () => {
        const priority = document.getElementById('thread-priority').value;
        const assigned_to = document.getElementById('thread-assignee').value;
        const due_date = document.getElementById('thread-due-date').value || null;
        const tagsStr = document.getElementById('thread-tags').value;
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
        const statusEl = document.getElementById('ticket-detail-status');

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
          statusEl.style.display = 'inline';
          statusEl.className = 'form-status success';
          statusEl.textContent = 'Saved';
          setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
        } catch (e) {
          statusEl.style.display = 'inline';
          statusEl.className = 'form-status error';
          statusEl.textContent = 'Error';
        }
      });

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
          btn.textContent = 'Send Reply';
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
            body: JSON.stringify({ action: 'create_ticket', subject, description, priority, tags, assigned_to, due_date }),
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
