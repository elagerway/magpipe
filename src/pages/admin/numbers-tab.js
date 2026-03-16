import { showToast } from '../../lib/toast.js';
import { escapeHtml } from '../../lib/formatters.js';

export const numbersTabMethods = {
  _swNumbers: null,
  _swNumbersFilter: 'all',
  _swNumbersSearch: '',
  _provisionPhoneNumber: null,
  _provisionPhoneSid: null,

  async renderNumbersTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="numbers-tab support-section">
        <div class="loading-spinner">Loading numbers...</div>
      </div>
    `;
    await this._loadSwNumbers();
  },

  async _loadSwNumbers() {
    const container = document.querySelector('.numbers-tab');
    if (!container) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-signalwire-numbers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'list' }),
          signal: AbortSignal.timeout(5000),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load numbers');
      this._swNumbers = data.numbers;
      this._renderSwNumbersList(container);
    } catch (e) {
      container.innerHTML = `
        <p style="color:var(--error-color); padding:1rem;">Failed to load: ${escapeHtml(e.message)}</p>
        <button class="btn btn-secondary" onclick="window.adminPage._loadSwNumbers()" style="margin-left:1rem;">Retry</button>
      `;
    }
  },

  _renderSwNumbersList(container) {
    if (!container) container = document.querySelector('.numbers-tab');
    if (!container) return;

    const numbers = this._swNumbers || [];
    const filter = this._swNumbersFilter || 'all';
    const search = (this._swNumbersSearch || '').toLowerCase();

    const provisionedCount = numbers.filter((n) => n.provisioned).length;
    const unprovisionedCount = numbers.filter((n) => !n.provisioned).length;

    const filtered = numbers.filter((n) => {
      if (filter === 'provisioned' && !n.provisioned) return false;
      if (filter === 'unprovisioned' && n.provisioned) return false;
      if (search) {
        return (
          n.phoneNumber.includes(search) ||
          (n.friendlyName || '').toLowerCase().includes(search) ||
          (n.provisionedTo || '').toLowerCase().includes(search)
        );
      }
      return true;
    });

    container.innerHTML = `
      <div class="tl-toolbar">
        <input type="text" class="form-input" id="sw-numbers-search"
          placeholder="Search by number, name, or email…"
          value="${escapeHtml(this._swNumbersSearch)}"
          style="flex:1; max-width:300px; font-size:0.85rem;">
        <div class="tl-filter-group">
          <button class="kpi-filter-btn ${filter === 'all' ? 'active' : ''}" data-sw-filter="all">
            All (${numbers.length})
          </button>
          <button class="kpi-filter-btn ${filter === 'unprovisioned' ? 'active' : ''}" data-sw-filter="unprovisioned">
            Unprovisioned (${unprovisionedCount})
          </button>
          <button class="kpi-filter-btn ${filter === 'provisioned' ? 'active' : ''}" data-sw-filter="provisioned">
            Provisioned (${provisionedCount})
          </button>
        </div>
        <button class="btn btn-secondary" id="sw-numbers-refresh" style="font-size:0.8rem; padding:0.35rem 0.75rem;">
          ↻ Refresh
        </button>
      </div>

      ${
        filtered.length === 0
          ? `<div class="tl-empty"><p>No numbers found</p></div>`
          : `
        <div class="tl-list">
          <div class="tl-item numbers-header" style="cursor:default; background:var(--bg-secondary); font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">
            <div style="flex:0 0 150px;">Number</div>
            <div style="flex:1;">Friendly Name</div>
            <div style="flex:0 0 230px;">Status</div>
            <div style="flex:0 0 110px;"></div>
          </div>
          ${filtered
            .map(
              (n) => `
            <div class="tl-item" style="cursor:default;">
              <div style="flex:0 0 150px;">
                <span style="font-family:monospace; font-size:0.875rem; font-weight:600; color:var(--text-primary);">
                  ${escapeHtml(n.phoneNumber)}
                </span>
              </div>
              <div style="flex:1; min-width:0;">
                <span style="font-size:0.85rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                  ${escapeHtml(n.friendlyName || '—')}
                </span>
              </div>
              <div style="flex:0 0 230px;">
                ${
                  n.provisioned
                    ? `<span style="display:inline-flex; align-items:center; gap:0.3rem; font-size:0.8rem; color:#16a34a; background:#dcfce7; padding:0.2rem 0.6rem; border-radius:20px; font-weight:500; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                        ${escapeHtml(n.provisionedTo || 'provisioned')}
                       </span>`
                    : `<span style="color:var(--text-muted); font-size:0.85rem;">—</span>`
                }
              </div>
              <div style="flex:0 0 110px; text-align:right;">
                ${
                  !n.provisioned
                    ? `<button class="btn btn-primary provision-btn"
                         data-phone="${escapeHtml(n.phoneNumber)}"
                         data-sid="${escapeHtml(n.sid)}"
                         style="font-size:0.75rem; padding:0.3rem 0.75rem;">
                         Provision
                       </button>`
                    : ''
                }
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }

      <!-- Provision modal -->
      <div class="contact-modal-overlay" id="provision-modal-overlay" style="display:none;"
           onclick="document.getElementById('provision-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3>Provision Number</h3>
            <button class="close-modal-btn"
              onclick="document.getElementById('provision-modal-overlay').style.display='none'">&times;</button>
          </div>
          <div class="contact-modal-body">
            <p style="margin-bottom:1rem; color:var(--text-secondary); font-size:0.9rem;">
              Assign <strong id="provision-modal-number"></strong> to a Magpipe user account.
              This will add the number to their account and register it on the LiveKit SIP trunk.
            </p>
            <div class="form-group">
              <label class="form-label">Search User by Email</label>
              <input type="text" class="form-input" id="provision-user-search"
                placeholder="Type to search…" autocomplete="off">
              <div id="provision-user-results" style="margin-top:0.375rem;"></div>
              <input type="hidden" id="provision-selected-user-id">
              <div id="provision-selected-user"
                style="display:none; margin-top:0.5rem; padding:0.5rem 0.75rem; background:var(--bg-secondary); border-radius:6px; font-size:0.85rem; color:var(--text-primary);">
              </div>
            </div>
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary"
              onclick="document.getElementById('provision-modal-overlay').style.display='none'">Cancel</button>
            <button type="button" class="btn btn-primary" id="provision-confirm-btn" disabled>Provision</button>
          </div>
        </div>
      </div>
    `;

    // Search input
    const searchInput = container.querySelector('#sw-numbers-search');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this._swNumbersSearch = searchInput.value;
          this._renderSwNumbersList(container);
        }, 200);
      });
    }

    // Filter buttons
    container.querySelectorAll('[data-sw-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._swNumbersFilter = btn.dataset.swFilter;
        this._renderSwNumbersList(container);
      });
    });

    // Refresh
    container.querySelector('#sw-numbers-refresh')?.addEventListener('click', async () => {
      this._swNumbers = null;
      container.innerHTML = '<div class="loading-spinner">Refreshing…</div>';
      await this._loadSwNumbers();
    });

    // Provision buttons
    container.querySelectorAll('.provision-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._openProvisionModal(btn.dataset.phone, btn.dataset.sid);
      });
    });

    // Provision confirm
    container.querySelector('#provision-confirm-btn')?.addEventListener('click', () => {
      this._doProvisionNumber();
    });

    // User search in modal
    container.querySelector('#provision-user-search')?.addEventListener('input', (e) => {
      clearTimeout(this._userSearchTimer);
      this._userSearchTimer = setTimeout(() => this._searchUsersForProvision(e.target.value), 300);
    });
  },

  _openProvisionModal(phoneNumber, phoneSid) {
    this._provisionPhoneNumber = phoneNumber;
    this._provisionPhoneSid = phoneSid;

    document.getElementById('provision-modal-number').textContent = phoneNumber;
    document.getElementById('provision-selected-user-id').value = '';
    const sel = document.getElementById('provision-selected-user');
    if (sel) { sel.style.display = 'none'; sel.textContent = ''; }
    const confirmBtn = document.getElementById('provision-confirm-btn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Provision'; }
    const userSearch = document.getElementById('provision-user-search');
    if (userSearch) userSearch.value = '';
    const results = document.getElementById('provision-user-results');
    if (results) results.innerHTML = '';

    document.getElementById('provision-modal-overlay').style.display = 'flex';
    setTimeout(() => userSearch?.focus(), 50);
  },

  async _searchUsersForProvision(query) {
    const results = document.getElementById('provision-user-results');
    if (!results) return;
    if (!query || query.length < 2) { results.innerHTML = ''; return; }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-users?search=${encodeURIComponent(query)}&limit=5`,
        { headers: { Authorization: `Bearer ${this.session.access_token}` } }
      );
      const data = await res.json();
      const users = data.users || [];

      if (users.length === 0) {
        results.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted); padding:0.25rem 0;">No users found</p>';
        return;
      }

      results.innerHTML = `
        <div class="tl-list" style="max-height:180px; overflow-y:auto;">
          ${users
            .map(
              (u) => `
            <div class="tl-item provision-user-result"
              data-user-id="${escapeHtml(u.id)}"
              data-user-email="${escapeHtml(u.email)}"
              style="padding:0.5rem 0.75rem; cursor:pointer; font-size:0.85rem; gap:0.5rem;">
              <span style="font-weight:500;">${escapeHtml(u.email)}</span>
              ${u.full_name ? `<span style="color:var(--text-muted);">${escapeHtml(u.full_name)}</span>` : ''}
            </div>
          `
            )
            .join('')}
        </div>
      `;

      results.querySelectorAll('.provision-user-result').forEach((row) => {
        row.addEventListener('click', () => {
          const userId = row.dataset.userId;
          const userEmail = row.dataset.userEmail;
          document.getElementById('provision-selected-user-id').value = userId;
          const sel = document.getElementById('provision-selected-user');
          sel.textContent = `✓ ${userEmail}`;
          sel.style.display = 'block';
          document.getElementById('provision-confirm-btn').disabled = false;
          results.innerHTML = '';
          document.getElementById('provision-user-search').value = userEmail;
        });
      });
    } catch (_e) {
      // silent
    }
  },

  async _doProvisionNumber() {
    const userId = document.getElementById('provision-selected-user-id')?.value;
    const phoneNumber = this._provisionPhoneNumber;
    const phoneSid = this._provisionPhoneSid;
    if (!userId || !phoneNumber || !phoneSid) return;

    const confirmBtn = document.getElementById('provision-confirm-btn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Provisioning…'; }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-signalwire-numbers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'provision', phoneNumber, phoneSid, userId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to provision');

      document.getElementById('provision-modal-overlay').style.display = 'none';
      showToast(data.message || 'Number provisioned!', 'success');

      // Reload the list
      this._swNumbers = null;
      const container = document.querySelector('.numbers-tab');
      if (container) container.innerHTML = '<div class="loading-spinner">Refreshing…</div>';
      await this._loadSwNumbers();
    } catch (e) {
      showToast(e.message, 'error');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Provision'; }
    }
  },
};
