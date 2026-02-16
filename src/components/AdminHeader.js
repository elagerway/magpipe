/**
 * AdminHeader Component
 * Reusable admin portal header with back button, title, status indicator, role badge, and tab bar.
 */

export default class AdminHeader {
  /**
   * @param {Object} options
   * @param {string} options.title - Header title (e.g. 'Admin Portal')
   * @param {string} options.backPath - Navigation path for back button
   * @param {string} options.role - User role for badge display
   * @param {Array<{id: string, label: string, icon: string}>} options.tabs - Tab definitions
   * @param {string} options.activeTab - Currently active tab id
   * @param {Function} options.onTabChange - Callback when tab is clicked
   * @param {Object} options.session - Supabase session for API calls
   */
  constructor({ title, backPath, role, tabs, activeTab, onTabChange, session }) {
    this.title = title;
    this.backPath = backPath;
    this.role = role;
    this.tabs = tabs;
    this.activeTab = activeTab;
    this.onTabChange = onTabChange;
    this.session = session;
    this._outsideClickHandler = null;
  }

  render() {
    return `
      <header class="admin-header">
        <div class="admin-header-left">
          <button class="btn btn-icon" onclick="navigateTo('${this.backPath}')" title="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1>${this.title}</h1>
        </div>
        <div class="admin-header-right">
          <div class="status-indicator" id="status-indicator">
            <button class="status-btn" id="status-btn" title="System Status">
              <span class="status-dot status-loading"></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </button>
            <div class="status-dropdown" id="status-dropdown">
              <div class="status-dropdown-header">
                <span>System Status</span>
                <button class="status-refresh" id="status-refresh" title="Refresh">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              </div>
              <div class="status-dropdown-content" id="status-content">
                <div class="status-loading-msg">Checking services...</div>
              </div>
              <div class="status-dropdown-footer" id="status-footer"></div>
            </div>
          </div>
          <span class="badge badge-${this.role}">${this.role}</span>
        </div>
      </header>
      <div class="admin-tabs">
        ${this.tabs.map(tab => `
          <button class="admin-tab ${tab.id === this.activeTab ? 'active' : ''}" data-tab="${tab.id}">
            ${tab.icon}
            ${tab.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  attachListeners() {
    // Tab clicks
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this.setActiveTab(tabId);
        if (this.onTabChange) this.onTabChange(tabId);
      });
    });

    // Status indicator
    const statusBtn = document.getElementById('status-btn');
    const statusDropdown = document.getElementById('status-dropdown');
    const statusRefresh = document.getElementById('status-refresh');

    if (statusBtn && statusDropdown) {
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        statusDropdown.classList.toggle('open');
      });

      if (statusRefresh) {
        statusRefresh.addEventListener('click', (e) => {
          e.stopPropagation();
          this.loadStatus();
        });
      }

      this._outsideClickHandler = (e) => {
        if (!e.target.closest('.status-indicator')) {
          statusDropdown.classList.remove('open');
        }
      };
      document.addEventListener('click', this._outsideClickHandler);
    }

    this.loadStatus();
  }

  setActiveTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
  }

  async loadStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusContent = document.getElementById('status-content');
    const statusFooter = document.getElementById('status-footer');

    if (!statusDot || !statusContent) return;

    statusDot.className = 'status-dot status-loading';
    statusContent.innerHTML = '<div class="status-loading-msg">Checking services...</div>';

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-status`,
        {
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check status');
      }

      const data = await response.json();
      this.renderStatus(data);
    } catch (error) {
      console.error('Error loading status:', error);
      statusDot.className = 'status-dot status-down';
      statusContent.innerHTML = `
        <div class="status-error">
          <p>Failed to check status</p>
        </div>
      `;
      if (statusFooter) statusFooter.innerHTML = '';
    }
  }

  renderStatus(data) {
    const statusDot = document.querySelector('.status-dot');
    const statusContent = document.getElementById('status-content');
    const statusFooter = document.getElementById('status-footer');

    if (!statusDot || !statusContent) return;

    statusDot.className = `status-dot status-${data.overall}`;

    statusContent.innerHTML = data.services.map(service => `
      <a href="${service.statusUrl || '#'}" target="_blank" rel="noopener noreferrer" class="status-service" title="View ${service.name} status page">
        <div class="status-service-info">
          <span class="status-service-dot status-${service.status}"></span>
          <span class="status-service-name">${service.name}</span>
        </div>
        <div class="status-service-meta">
          ${service.latency ? `<span class="status-latency">${service.latency}ms</span>` : ''}
          ${service.message ? `<span class="status-message">${service.message}</span>` : ''}
          <svg class="status-external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </div>
      </a>
    `).join('');

    const checkedAt = new Date(data.checkedAt);
    if (statusFooter) {
      statusFooter.innerHTML = `Last checked: ${checkedAt.toLocaleTimeString()}`;
    }

    const firecrawl = data.services.find(s => s.name === 'Firecrawl');
    this.updateFirecrawlWarning(firecrawl);
  }

  updateFirecrawlWarning(firecrawl) {
    const existingWarning = document.querySelector('.firecrawl-warning-banner');
    if (existingWarning) {
      existingWarning.remove();
    }

    if (firecrawl && (firecrawl.status === 'down' || firecrawl.status === 'degraded')) {
      const warningBanner = document.createElement('div');
      warningBanner.className = `firecrawl-warning-banner ${firecrawl.status === 'down' ? 'error' : 'warning'}`;
      warningBanner.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>
          ${firecrawl.status === 'down'
            ? `<strong>KB Scraping Disabled:</strong> ${firecrawl.message || 'Firecrawl is unavailable'}. JS-rendered sites cannot be crawled.`
            : `<strong>KB Scraping Limited:</strong> ${firecrawl.message || 'Low credits'}. Consider upgrading at firecrawl.dev.`
          }
        </span>
        <button class="warning-dismiss" onclick="this.parentElement.remove()">×</button>
      `;

      const header = document.querySelector('.admin-header');
      if (header) {
        header.insertAdjacentElement('afterend', warningBanner);
      }
    }
  }

  destroy() {
    if (this._outsideClickHandler) {
      document.removeEventListener('click', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
  }

  static getStyles() {
    return `
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

      .admin-header-right {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      /* Status Indicator */
      .status-indicator {
        position: relative;
      }

      .status-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.625rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .status-btn:hover {
        background: var(--bg-primary);
        border-color: var(--text-muted);
      }

      .status-btn svg {
        color: var(--text-muted);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .status-dot.status-operational {
        background: #10b981;
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
      }

      .status-dot.status-degraded {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
      }

      .status-dot.status-down {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
      }

      .status-dot.status-loading {
        background: var(--text-muted);
        animation: pulse 1.5s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }

      .status-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 260px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px);
        transition: all 0.2s;
        z-index: 1000;
      }

      .status-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      .status-dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--border-color);
        font-weight: 600;
        font-size: 0.8rem;
      }

      .status-refresh {
        background: none;
        border: none;
        padding: 0.25rem;
        cursor: pointer;
        color: var(--text-muted);
        border-radius: 4px;
        transition: all 0.2s;
      }

      .status-refresh:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      .status-dropdown-content {
        padding: 0.25rem 0;
        max-height: 400px;
        overflow-y: auto;
      }

      .status-loading-msg {
        padding: 1rem;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .status-error {
        padding: 1rem;
        text-align: center;
        color: var(--error-color);
        font-size: 0.875rem;
      }

      .status-service {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.3rem 0.75rem;
        text-decoration: none;
        color: inherit;
      }

      .status-service:hover {
        background: var(--bg-secondary);
      }

      .status-service-info {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .status-service-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .status-service-dot.status-operational {
        background: #10b981;
      }

      .status-service-dot.status-degraded {
        background: #f59e0b;
      }

      .status-service-dot.status-down {
        background: #ef4444;
      }

      .status-service-name {
        font-size: 0.775rem;
        font-weight: 500;
      }

      .status-service-meta {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .status-latency {
        font-size: 0.675rem;
        color: var(--text-muted);
      }

      .status-message {
        font-size: 0.675rem;
        color: var(--text-muted);
        font-style: italic;
      }

      .status-external-icon {
        opacity: 0.5;
        flex-shrink: 0;
        transition: opacity 0.2s;
      }

      .status-service:hover .status-external-icon {
        opacity: 1;
      }

      .status-dropdown-footer {
        padding: 0.35rem 0.75rem;
        border-top: 1px solid var(--border-color);
        font-size: 0.675rem;
        color: var(--text-muted);
        text-align: center;
      }

      /* Firecrawl Warning Banner */
      .firecrawl-warning-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: #fef3c7;
        border-bottom: 1px solid #f59e0b;
        color: #92400e;
        font-size: 0.875rem;
        position: relative;
        z-index: 10;
      }

      .firecrawl-warning-banner.error {
        background: #fee2e2;
        border-bottom-color: #ef4444;
        color: #991b1b;
      }

      .firecrawl-warning-banner svg {
        flex-shrink: 0;
      }

      .firecrawl-warning-banner span {
        flex: 1;
      }

      .firecrawl-warning-banner strong {
        font-weight: 600;
      }

      .warning-dismiss {
        background: none;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        opacity: 0.6;
        padding: 0 0.25rem;
        color: inherit;
      }

      .warning-dismiss:hover {
        opacity: 1;
      }

      @media (max-width: 480px) {
        .firecrawl-warning-banner {
          font-size: 0.8125rem;
          padding: 0.625rem 0.75rem;
        }
      }

      /* Tab Navigation */
      .admin-tabs {
        display: flex;
        gap: 0;
        padding: 0 1rem;
        background: var(--bg-primary);
        border-bottom: 1px solid var(--border-color);
      }

      .admin-tab {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.875rem 1.25rem;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .admin-tab:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }

      .admin-tab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .admin-tab svg {
        flex-shrink: 0;
      }

      .admin-tab-content {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
    `;
  }
}
