export const globalAgentTabMethods = {
  async renderGlobalAgentTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-global-agent">
        <div class="global-agent-header">
          <h2>Global Agent Access</h2>
          <p class="text-muted">Control which users can view and edit the platform's global agent configuration.</p>
        </div>
        <div class="global-agent-search" style="margin-bottom: 1rem;">
          <input type="text" id="global-agent-search" class="form-input" placeholder="Search users..." style="width: 100%;" />
        </div>
        <div class="global-agent-permissions" id="global-agent-permissions">
          <div class="loading-spinner">Loading users...</div>
        </div>
        <div id="global-agent-status" class="form-status" style="display: none; margin-top: 1rem;"></div>
      </div>
    `;

    // Add search listener
    document.getElementById('global-agent-search').addEventListener('input', (e) => {
      this.filterGlobalAgentUsers(e.target.value);
    });

    await this.loadGlobalAgentPermissions();
  },

  async loadGlobalAgentPermissions() {
    const container = document.getElementById('global-agent-permissions');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-global-agent`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const { users } = await response.json();
      this.globalAgentUsers = users;
      this.renderGlobalAgentUsersList(users);

    } catch (error) {
      console.error('Failed to load global agent permissions:', error);
      container.innerHTML = `
        <div class="error-message">
          <p>Failed to load users: ${error.message}</p>
          <button class="btn btn-secondary" onclick="window.adminPage.loadGlobalAgentPermissions()">Retry</button>
        </div>
      `;
    }
  },

  renderGlobalAgentUsersList(users) {
    const container = document.getElementById('global-agent-permissions');

    if (!users || users.length === 0) {
      container.innerHTML = '<p class="text-muted">No users found.</p>';
      return;
    }

    container.innerHTML = `
      <div class="global-agent-users-list">
        ${users.map(user => {
          const isGod = user.role === 'god';
          const hasAccess = isGod || user.can_edit_global_agent;
          return `
            <div class="global-agent-user-item" data-user-id="${user.id}" data-email="${user.email?.toLowerCase() || ''}" data-name="${user.name?.toLowerCase() || ''}">
              <label class="global-agent-user-label">
                <input type="checkbox"
                  class="global-agent-checkbox"
                  data-user-id="${user.id}"
                  ${hasAccess ? 'checked' : ''}
                  ${isGod ? 'disabled' : ''}
                />
                <div class="global-agent-user-info">
                  <span class="global-agent-user-name">${user.name || 'Unknown'}</span>
                  <span class="global-agent-user-email">${user.email || ''}</span>
                </div>
                <span class="badge badge-${user.role}">${user.role}</span>
                ${isGod ? '<span class="global-agent-always-access">always has access</span>' : ''}
              </label>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach change listeners to checkboxes
    container.querySelectorAll('.global-agent-checkbox:not([disabled])').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const userId = e.target.dataset.userId;
        const grant = e.target.checked;
        await this.updateGlobalAgentPermission(userId, grant);
      });
    });
  },

  filterGlobalAgentUsers(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const items = document.querySelectorAll('.global-agent-user-item');

    items.forEach(item => {
      const email = item.dataset.email || '';
      const name = item.dataset.name || '';
      const userId = (item.dataset.userId || '').toLowerCase();
      const matches = !term || email.includes(term) || name.includes(term) || userId.includes(term);
      item.style.display = matches ? '' : 'none';
    });
  },

  async updateGlobalAgentPermission(userId, grant) {
    const statusEl = document.getElementById('global-agent-status');
    const checkbox = document.querySelector(`.global-agent-checkbox[data-user-id="${userId}"]`);

    try {
      checkbox.disabled = true;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-global-agent`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, grant }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update permission');
      }

      const result = await response.json();

      statusEl.style.display = 'block';
      statusEl.className = 'form-status success';
      statusEl.textContent = result.message;

      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 2000);

    } catch (error) {
      console.error('Failed to update permission:', error);
      // Revert checkbox state
      checkbox.checked = !grant;
      statusEl.style.display = 'block';
      statusEl.className = 'form-status error';
      statusEl.textContent = 'Failed to update: ' + error.message;
    } finally {
      checkbox.disabled = false;
    }
  },
};
