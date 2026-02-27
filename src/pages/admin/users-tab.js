import { showToast } from '../../lib/toast.js';
import { COUNTRY_CODES } from '../verify-phone.js';

export const usersTabMethods = {
  async renderUsersTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-content">
        <!-- User List Panel -->
        <div class="admin-list-panel">
          <!-- Search & Filters -->
          <div class="admin-filters">
            <div class="search-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="text" id="search-input" placeholder="Search users..." class="form-input" value="${this.filters.search || ''}" />
            </div>
            <div class="filter-row">
              <select id="filter-status" class="form-input form-select">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>
              <select id="filter-role" class="form-input form-select">
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="support">Support</option>
                <option value="admin">Admin</option>
                <option value="god">God</option>
              </select>
            </div>
          </div>

          <!-- User List -->
          <div id="user-list" class="user-list">
            <div class="loading-spinner">Loading users...</div>
          </div>

          <!-- Pagination -->
          <div id="pagination" class="pagination"></div>
        </div>

        <!-- User Detail Panel -->
        <div id="detail-panel" class="admin-detail-panel">
          <div class="detail-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <p>Select a user to view details</p>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    await this.loadUsers();
  },

  attachEventListeners() {
    // Search
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.filters.search = e.target.value;
        this.pagination.page = 1;
        this.loadUsers();
      }, 300);
    });

    // Filters
    document.getElementById('filter-status').addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.pagination.page = 1;
      this.loadUsers();
    });

    document.getElementById('filter-role').addEventListener('change', (e) => {
      this.filters.role = e.target.value;
      this.pagination.page = 1;
      this.loadUsers();
    });
  },

  async loadUsers() {
    if (this.loading) return;
    this.loading = true;

    const userList = document.getElementById('user-list');
    userList.innerHTML = '<div class="loading-spinner">Loading users...</div>';

    try {
      const params = new URLSearchParams({
        page: this.pagination.page.toString(),
        limit: this.pagination.limit.toString(),
        ...(this.filters.search && { search: this.filters.search }),
        ...(this.filters.status !== 'all' && { status: this.filters.status }),
        ...(this.filters.role !== 'all' && { role: this.filters.role })
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }

      this.users = data.users;
      this.pagination = data.pagination;

      this.renderUserList();
      this.renderPagination();
    } catch (error) {
      console.error('Error loading users:', error);
      userList.innerHTML = `<div class="loading-spinner" style="color: var(--error-color);">Error: ${error.message}</div>`;
    } finally {
      this.loading = false;
    }
  },

  renderUserList() {
    const userList = document.getElementById('user-list');

    if (this.users.length === 0) {
      userList.innerHTML = '<div class="loading-spinner">No users found</div>';
      return;
    }

    userList.innerHTML = this.users.map(user => `
      <div class="user-item ${this.selectedUser?.id === user.id ? 'selected' : ''}" data-user-id="${user.id}">
        <div class="user-avatar">${(user.name || user.email)[0].toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${user.name || 'Unknown'}</div>
          <div class="user-email">${user.email}</div>
        </div>
        <div class="user-badges">
          <span class="badge badge-${user.account_status}">${user.account_status}</span>
        </div>
      </div>
    `).join('');

    // Add click handlers
    userList.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        const userId = item.dataset.userId;
        this.selectUser(userId);
      });
    });
  },

  renderPagination() {
    const pagination = document.getElementById('pagination');
    const { page, totalPages, total } = this.pagination;

    pagination.innerHTML = `
      <button class="btn btn-sm btn-secondary" ${page <= 1 ? 'disabled' : ''} id="prev-page">Previous</button>
      <span class="pagination-info">Page ${page} of ${totalPages} (${total} users)</span>
      <button class="btn btn-sm btn-secondary" ${page >= totalPages ? 'disabled' : ''} id="next-page">Next</button>
    `;

    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.pagination.page > 1) {
        this.pagination.page--;
        this.loadUsers();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (this.pagination.page < this.pagination.totalPages) {
        this.pagination.page++;
        this.loadUsers();
      }
    });
  },

  async selectUser(userId) {
    const detailPanel = document.getElementById('detail-panel');
    detailPanel.innerHTML = '<div class="loading-spinner">Loading user details...</div>';

    // Update selected state in list
    document.querySelectorAll('.user-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.userId === userId);
    });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-get-user?userId=${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load user details');
      }

      this.selectedUser = data.user;
      this.renderUserDetail(data);
    } catch (error) {
      console.error('Error loading user details:', error);
      detailPanel.innerHTML = `<div class="loading-spinner" style="color: var(--error-color);">Error: ${error.message}</div>`;
    }
  },

  renderUserDetail(data) {
    const { user, serviceNumbers, agentConfig, stats } = data;
    const detailPanel = document.getElementById('detail-panel');

    detailPanel.innerHTML = `
      <!-- Header -->
      <div class="detail-header">
        <div class="detail-avatar">${(user.name || user.email)[0].toUpperCase()}</div>
        <div>
          <div class="detail-name">${user.name || 'Unknown'}</div>
          <div class="user-email">${user.email}</div>
          <div class="user-badges" style="margin-top: 0.5rem;">
            <span class="badge badge-${user.role}">${user.role}</span>
            <span class="badge badge-${user.account_status}">${user.account_status}</span>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="detail-section">
        <h3>Statistics</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.calls}</div>
            <div class="stat-label">Calls</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.messages}</div>
            <div class="stat-label">Messages</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.contacts}</div>
            <div class="stat-label">Contacts</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.phoneNumbers}</div>
            <div class="stat-label">Numbers</div>
          </div>
        </div>
      </div>

      <!-- Account Info -->
      <div class="detail-section">
        <h3>Account Information</h3>
        <div class="detail-row">
          <span class="detail-label">User ID</span>
          <span class="detail-value" style="font-family: monospace; font-size: 0.75rem;">${user.id}</span>
        </div>
        ${(user.signup_city || user.signup_country || user.signup_ip) ? `
        <div class="detail-row">
          <span class="detail-label">Region</span>
          <span class="detail-value">
            ${[user.signup_city, user.signup_country].filter(Boolean).join(', ') || ''}
            ${user.signup_ip ? `<span style="color: var(--text-muted); font-size: 0.75rem; margin-left: 0.4rem;">(${user.signup_ip})</span>` : ''}
          </span>
        </div>
        ` : ''}
        <div class="detail-row" id="phone-display-row">
          <span class="detail-label">Phone Number</span>
          <span class="detail-value" style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem;">
            <span id="phone-display-value">${user.phone_number || 'Not set'}</span>
            <span id="phone-verified-badge" style="font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 8px; ${user.phone_verified ? 'background: rgba(16,185,129,0.1); color: #10b981;' : 'background: rgba(128,128,128,0.1); color: var(--text-muted);'}">${user.phone_verified ? 'verified' : 'unverified'}</span>
            <button id="btn-edit-phone" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 0.75rem; padding: 0; text-decoration: underline;">edit</button>
            ${user.phone_verified ? `<button id="btn-send-welcome-email" style="background: none; border: 1px solid var(--primary-color); color: var(--primary-color); border-radius: 4px; cursor: pointer; font-size: 0.72rem; padding: 0.15rem 0.5rem; white-space: nowrap;">✉ Welcome Email</button>` : ''}
          </span>
        </div>
        <div id="phone-edit-form" style="display: none; padding: 0.5rem 0 0.25rem;">
          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
            <div style="position: relative; flex-shrink: 0;">
              <select id="admin-phone-country" style="position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 1rem;">
                ${COUNTRY_CODES.map((c, i) => `<option value="${c.code}" data-index="${i}"${i === 0 ? ' selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`).join('')}
              </select>
              <span id="admin-phone-country-display" style="display: inline-flex; align-items: center; padding: 0.4rem 0.6rem; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-weight: 500; font-size: 0.85rem; white-space: nowrap; pointer-events: none;">${COUNTRY_CODES[0].flag} ${COUNTRY_CODES[0].code} ▾</span>
            </div>
            <input type="tel" id="admin-phone-number" class="form-input" placeholder="555-123-4567" maxlength="12" style="width: 140px;" />
            <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; cursor: pointer; white-space: nowrap;">
              <input type="checkbox" id="input-phone-verified" ${user.phone_verified ? 'checked' : ''} style="width: 14px; height: 14px;" />
              Mark verified
            </label>
            <button class="btn btn-sm btn-primary" id="btn-phone-save">Save</button>
            <button class="btn btn-sm btn-secondary" id="btn-phone-cancel">Cancel</button>
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-label">Created</span>
          <span class="detail-value">${new Date(user.created_at).toLocaleDateString()}</span>
        </div>
        ${user.suspended_at ? `
          <div class="detail-row" style="background: #fef3c7; padding: 0.5rem; border-radius: var(--radius-sm);">
            <span class="detail-label">Suspended</span>
            <span class="detail-value">${new Date(user.suspended_at).toLocaleDateString()}: ${user.suspended_reason}</span>
          </div>
        ` : ''}
        ${user.banned_at ? `
          <div class="detail-row" style="background: #fee2e2; padding: 0.5rem; border-radius: var(--radius-sm);">
            <span class="detail-label">Banned</span>
            <span class="detail-value">${new Date(user.banned_at).toLocaleDateString()}: ${user.banned_reason}</span>
          </div>
        ` : ''}
      </div>

      <!-- Credits -->
      <div class="detail-section">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <h3 style="margin: 0;">Credits</h3>
          <button class="btn btn-sm btn-primary" id="btn-add-credits" style="font-size: 0.8rem; padding: 0.3rem 0.7rem;">+ Add Credits</button>
        </div>
        <div class="detail-row">
          <span class="detail-label">Balance</span>
          <span class="detail-value" id="user-credits-balance" style="font-weight: 600; color: var(--primary-color);">$${parseFloat(user.credits_balance || 0).toFixed(2)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Used This Period</span>
          <span class="detail-value">$${parseFloat(user.credits_used_this_period || 0).toFixed(2)}</span>
        </div>
        <div id="credits-form" style="display: none; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <div style="display: flex; gap: 0.5rem; align-items: flex-end; flex-wrap: wrap;">
            <div>
              <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Amount ($)</label>
              <input type="number" id="credits-amount" class="form-input" placeholder="e.g. 10.00" step="0.01" style="width: 110px;" />
            </div>
            <div style="flex: 1; min-width: 140px;">
              <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Reason</label>
              <input type="text" id="credits-reason" class="form-input" placeholder="e.g. Manual top-up" />
            </div>
            <button class="btn btn-sm btn-primary" id="btn-credits-submit" style="white-space: nowrap;">Apply</button>
            <button class="btn btn-sm btn-secondary" id="btn-credits-cancel">Cancel</button>
          </div>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.4rem 0 0;">Use negative amounts to deduct credits.</p>
        </div>
      </div>

      <!-- Phone Numbers -->
      <div class="detail-section">
        <h3>Phone Numbers</h3>
        ${serviceNumbers.length > 0 ? `
          <div class="phone-list">
            ${serviceNumbers.map(num => `
              <div class="phone-item">
                <span>${num.phone_number}</span>
                <div class="user-badges">
                  ${num.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge">Inactive</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color: var(--text-muted);">No phone numbers</p>'}
      </div>

      <!-- Actions -->
      <div class="detail-section">
        <h3>Actions</h3>

        <!-- Impersonate -->
        <div class="action-group">
          <label>Login As</label>
          <button class="btn btn-sm btn-impersonate" id="btn-impersonate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Impersonate User
          </button>
        </div>

        <!-- Role -->
        <div class="action-group">
          <label>Role</label>
          <select id="select-role" class="form-input form-select" style="width: auto;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="support" ${user.role === 'support' ? 'selected' : ''}>Support</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="god" ${user.role === 'god' ? 'selected' : ''}>God</option>
          </select>
          <button class="btn btn-sm btn-primary" id="btn-save-role">Save</button>
        </div>

        <!-- Status Actions -->
        <div class="action-group">
          <label>Status</label>
          <div class="detail-actions">
            ${user.account_status === 'active' ? `
              <button class="btn btn-sm btn-suspend" id="btn-suspend">Suspend</button>
              <button class="btn btn-sm btn-ban" id="btn-ban">Ban</button>
            ` : `
              <button class="btn btn-sm btn-reactivate" id="btn-reactivate">Reactivate</button>
            `}
          </div>
        </div>
      </div>
    `;

    this.attachDetailEventListeners(user);
  },

  attachDetailEventListeners(user) {
    // Impersonate
    document.getElementById('btn-impersonate')?.addEventListener('click', () => {
      this.impersonateUser(user.id);
    });

    // Save Role
    document.getElementById('btn-save-role')?.addEventListener('click', async () => {
      const role = document.getElementById('select-role').value;
      await this.updateUser(user.id, { role });
    });

    // Suspend
    document.getElementById('btn-suspend')?.addEventListener('click', async () => {
      const reason = prompt('Reason for suspension:');
      if (reason) {
        await this.updateUser(user.id, { action: 'suspend', reason });
      }
    });

    // Ban
    document.getElementById('btn-ban')?.addEventListener('click', async () => {
      const reason = prompt('Reason for ban:');
      if (reason && confirm('Are you sure you want to ban this user?')) {
        await this.updateUser(user.id, { action: 'ban', reason });
      }
    });

    // Reactivate
    document.getElementById('btn-reactivate')?.addEventListener('click', async () => {
      if (confirm('Reactivate this user?')) {
        await this.updateUser(user.id, { action: 'reactivate' });
      }
    });

    // Phone edit — country picker + formatting
    let adminPhoneCountryCode = COUNTRY_CODES[0].code;

    document.getElementById('btn-edit-phone')?.addEventListener('click', () => {
      document.getElementById('phone-edit-form').style.display = 'block';
      document.getElementById('admin-phone-number')?.focus();
    });

    document.getElementById('btn-phone-cancel')?.addEventListener('click', () => {
      document.getElementById('phone-edit-form').style.display = 'none';
    });

    document.getElementById('admin-phone-country')?.addEventListener('change', (e) => {
      const country = COUNTRY_CODES[e.target.selectedIndex];
      adminPhoneCountryCode = country.code;
      const isNA = adminPhoneCountryCode === '+1';
      document.getElementById('admin-phone-country-display').textContent = `${country.flag} ${country.code} ▾`;
      const input = document.getElementById('admin-phone-number');
      input.placeholder = isNA ? '555-123-4567' : 'Phone number';
      input.maxLength = isNA ? 12 : 15;
      input.value = '';
      input.focus();
    });

    document.getElementById('admin-phone-number')?.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (adminPhoneCountryCode === '+1') {
        if (v.startsWith('1') && v.length === 11) v = v.slice(1);
        if (v.length > 10) v = v.slice(0, 10);
        if (v.length > 6) v = `${v.slice(0,3)}-${v.slice(3,6)}-${v.slice(6)}`;
        else if (v.length > 3) v = `${v.slice(0,3)}-${v.slice(3)}`;
      } else {
        const max = 15 - adminPhoneCountryCode.replace('+', '').length;
        if (v.length > max) v = v.slice(0, max);
      }
      e.target.value = v;
    });

    document.getElementById('btn-phone-save')?.addEventListener('click', async () => {
      const phoneInput = document.getElementById('admin-phone-number');
      const verifiedInput = document.getElementById('input-phone-verified');
      const saveBtn = document.getElementById('btn-phone-save');

      const digits = phoneInput.value.replace(/\D/g, '');
      const phone_number = digits ? (adminPhoneCountryCode + digits) : null;
      const phone_verified = verifiedInput.checked;

      if (digits && !/^\+[1-9]\d{6,14}$/.test(phone_number)) {
        showToast('Invalid phone number', 'error');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, action: 'set_phone', phone_number, phone_verified })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update');

        document.getElementById('phone-display-value').textContent = phone_number || 'Not set';
        const badge = document.getElementById('phone-verified-badge');
        badge.textContent = phone_verified ? 'verified' : 'unverified';
        badge.style.cssText = `margin-left: 0.4rem; font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 8px; ${phone_verified ? 'background: rgba(16,185,129,0.1); color: #10b981;' : 'background: rgba(128,128,128,0.1); color: var(--text-muted);'}`;

        document.getElementById('phone-edit-form').style.display = 'none';
        showToast('Phone number updated', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    });

    // Credits form toggle
    document.getElementById('btn-add-credits')?.addEventListener('click', () => {
      const form = document.getElementById('credits-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display !== 'none') document.getElementById('credits-amount')?.focus();
    });

    document.getElementById('btn-credits-cancel')?.addEventListener('click', () => {
      document.getElementById('credits-form').style.display = 'none';
      document.getElementById('credits-amount').value = '';
      document.getElementById('credits-reason').value = '';
    });

    document.getElementById('btn-credits-submit')?.addEventListener('click', async () => {
      await this.adjustCredits(user.id);
    });

    // Welcome email
    document.getElementById('btn-send-welcome-email')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-send-welcome-email');
      if (!confirm(`Send welcome email to ${user.email}?`)) return;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-send-welcome-email`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to send');
        showToast('Welcome email sent', 'success');
        btn.textContent = '✓ Sent';
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✉ Welcome Email';
      }
    });
  },

  async adjustCredits(userId) {
    const amountInput = document.getElementById('credits-amount');
    const reasonInput = document.getElementById('credits-reason');
    const submitBtn = document.getElementById('btn-credits-submit');

    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();

    if (isNaN(amount) || amount === 0) {
      showToast('Enter a valid non-zero amount', 'error');
      return;
    }
    if (!reason) {
      showToast('Reason is required', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Applying...';

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-adjust-credits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId, amount, reason })
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to adjust credits');

      // Update balance display in-place
      const balanceEl = document.getElementById('user-credits-balance');
      if (balanceEl && data.balance != null) {
        balanceEl.textContent = `$${parseFloat(data.balance).toFixed(2)}`;
      }

      document.getElementById('credits-form').style.display = 'none';
      amountInput.value = '';
      reasonInput.value = '';

      showToast(`Credits ${amount > 0 ? 'added' : 'deducted'} successfully`, 'success');
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Apply';
    }
  },

  async updateUser(userId, updates) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId, ...updates })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      // Refresh user details and list
      await this.selectUser(userId);
      await this.loadUsers();

      showToast(data.message || 'User updated successfully', 'success');
    } catch (error) {
      console.error('Error updating user:', error);
      showToast('Error: ' + error.message, 'error');
    }
  },

  async impersonateUser(userId) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-impersonate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId, baseUrl: window.location.origin })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create impersonation token');
      }

      // Open in new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error impersonating user:', error);
      showToast('Error: ' + error.message, 'error');
    }
  },
};
