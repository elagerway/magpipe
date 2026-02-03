/**
 * Admin Portal Page
 * Manage users, plans, and phone numbers
 */

import { getCurrentUser, getCurrentSession, supabase } from '../lib/supabase.js';

export default class AdminPage {
  constructor() {
    this.users = [];
    this.selectedUser = null;
    this.pagination = { page: 1, limit: 20, total: 0, totalPages: 0 };
    this.filters = { search: '', plan: 'all', status: 'all', role: 'all' };
    this.loading = false;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'support')) {
      navigateTo('/agent');
      return;
    }

    // Get session for API calls
    const { session } = await getCurrentSession();
    this.session = session;

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="admin-container">
        <!-- Header -->
        <header class="admin-header">
          <div class="admin-header-left">
            <button class="btn btn-icon" onclick="navigateTo('/agent')" title="Back to Agent">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <h1>Admin Portal</h1>
          </div>
          <div class="admin-header-right">
            <span class="badge badge-${profile.role}">${profile.role}</span>
          </div>
        </header>

        <!-- Main Content -->
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
                <input type="text" id="search-input" placeholder="Search users..." class="form-input" />
              </div>
              <div class="filter-row">
                <select id="filter-plan" class="form-input form-select">
                  <option value="all">All Plans</option>
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                </select>
                <select id="filter-status" class="form-input form-select">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="banned">Banned</option>
                </select>
                <select id="filter-role" class="form-input form-select">
                  <option value="all">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="support">Support</option>
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
      </div>
    `;

    this.addStyles();
    this.attachEventListeners();
    await this.loadUsers();
  }

  addStyles() {
    if (document.getElementById('admin-styles')) return;

    const style = document.createElement('style');
    style.id = 'admin-styles';
    style.textContent = `
      .admin-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--bg-secondary);
      }

      .admin-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border-color);
      }

      .admin-header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .admin-header h1 {
        margin: 0;
        font-size: 1.5rem;
      }

      .admin-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .admin-list-panel {
        width: 400px;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        border-right: 1px solid var(--border-color);
      }

      .admin-filters {
        padding: 1rem;
        border-bottom: 1px solid var(--border-color);
      }

      .search-box {
        position: relative;
        margin-bottom: 0.75rem;
      }

      .search-box svg {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-muted);
      }

      .search-box input {
        padding-left: 2.5rem;
      }

      .filter-row {
        display: flex;
        gap: 0.5rem;
      }

      .filter-row select {
        flex: 1;
        font-size: 0.875rem;
      }

      .user-list {
        flex: 1;
        overflow-y: auto;
      }

      .user-item {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: background 0.2s;
      }

      .user-item:hover {
        background: var(--bg-secondary);
      }

      .user-item.selected {
        background: var(--primary-color-light);
        border-left: 3px solid var(--primary-color);
      }

      .user-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 1rem;
        font-weight: 600;
        color: var(--primary-color);
      }

      .user-info {
        flex: 1;
        min-width: 0;
      }

      .user-name {
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .user-email {
        font-size: 0.875rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .user-badges {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      .badge {
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .badge-free { background: #e5e7eb; color: #374151; }
      .badge-pro { background: #dbeafe; color: #1d4ed8; }
      .badge-active { background: #d1fae5; color: #059669; }
      .badge-suspended { background: #fef3c7; color: #d97706; }
      .badge-banned { background: #fee2e2; color: #dc2626; }
      .badge-admin { background: #ede9fe; color: #7c3aed; }
      .badge-support { background: #fce7f3; color: #db2777; }
      .badge-user { background: #e5e7eb; color: #374151; }

      .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .pagination button {
        padding: 0.5rem 1rem;
      }

      .pagination-info {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .admin-detail-panel {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
      }

      .detail-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
      }

      .detail-placeholder svg {
        margin-bottom: 1rem;
        opacity: 0.5;
      }

      .detail-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--border-color);
      }

      .detail-avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--primary-color);
      }

      .detail-name {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .detail-section {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
        margin-bottom: 1rem;
        box-shadow: var(--shadow-sm);
      }

      .detail-section h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: var(--text-primary);
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
      }

      .detail-row:last-child {
        border-bottom: none;
      }

      .detail-label {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .detail-value {
        font-weight: 500;
      }

      .detail-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .action-group {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-color);
      }

      .action-group:last-child {
        border-bottom: none;
      }

      .action-group label {
        min-width: 100px;
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .btn-impersonate {
        background: var(--primary-color);
        color: white;
      }

      .btn-suspend {
        background: #f59e0b;
        color: white;
      }

      .btn-ban {
        background: #dc2626;
        color: white;
      }

      .btn-reactivate {
        background: #059669;
        color: white;
      }

      .loading-spinner {
        display: flex;
        justify-content: center;
        padding: 2rem;
        color: var(--text-muted);
      }

      .phone-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .phone-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .stat-item {
        text-align: center;
        padding: 1rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      /* Mobile Responsive */
      @media (max-width: 768px) {
        .admin-content {
          flex-direction: column;
        }

        .admin-list-panel {
          width: 100%;
          height: 50vh;
          border-right: none;
          border-bottom: 1px solid var(--border-color);
        }

        .admin-detail-panel {
          height: 50vh;
        }

        .filter-row {
          flex-wrap: wrap;
        }

        .filter-row select {
          min-width: calc(50% - 0.25rem);
        }
      }
    `;
    document.head.appendChild(style);
  }

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
    document.getElementById('filter-plan').addEventListener('change', (e) => {
      this.filters.plan = e.target.value;
      this.pagination.page = 1;
      this.loadUsers();
    });

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
  }

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
        ...(this.filters.plan !== 'all' && { plan: this.filters.plan }),
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
  }

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
          <span class="badge badge-${user.plan}">${user.plan}</span>
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
  }

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
  }

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
  }

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
            <span class="badge badge-${user.plan}">${user.plan}</span>
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
        <div class="detail-row">
          <span class="detail-label">Phone Number</span>
          <span class="detail-value">${user.phone_number || 'Not set'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Phone Verified</span>
          <span class="detail-value">${user.phone_verified ? 'Yes' : 'No'}</span>
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

        <!-- Plan -->
        <div class="action-group">
          <label>Plan</label>
          <select id="select-plan" class="form-input form-select" style="width: auto;">
            <option value="free" ${user.plan === 'free' ? 'selected' : ''}>Free</option>
            <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Pro</option>
          </select>
          <button class="btn btn-sm btn-primary" id="btn-save-plan">Save</button>
        </div>

        <!-- Role -->
        <div class="action-group">
          <label>Role</label>
          <select id="select-role" class="form-input form-select" style="width: auto;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
            <option value="support" ${user.role === 'support' ? 'selected' : ''}>Support</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
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
  }

  attachDetailEventListeners(user) {
    // Impersonate
    document.getElementById('btn-impersonate')?.addEventListener('click', () => {
      this.impersonateUser(user.id);
    });

    // Save Plan
    document.getElementById('btn-save-plan')?.addEventListener('click', async () => {
      const plan = document.getElementById('select-plan').value;
      await this.updateUser(user.id, { plan });
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
  }

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

      alert(data.message || 'User updated successfully');
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error: ' + error.message);
    }
  }

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
          body: JSON.stringify({ userId })
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
      alert('Error: ' + error.message);
    }
  }
}
