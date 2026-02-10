/**
 * Admin Portal Page
 * Manage users, phone numbers, and chat with agents
 */

import { getCurrentUser, getCurrentSession, supabase } from '../lib/supabase.js';

export default class AdminPage {
  constructor() {
    this.users = [];
    this.selectedUser = null;
    this.pagination = { page: 1, limit: 20, total: 0, totalPages: 0 };
    this.filters = { search: '', status: 'all', role: 'all' };
    this.loading = false;
    this.activeTab = 'analytics';  // Default to analytics tab
    this.omniChat = null;
    this.analyticsData = null;
    this.chartJsLoaded = false;
    this.charts = {};
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

    if (!profile || (profile.role !== 'admin' && profile.role !== 'support' && profile.role !== 'god')) {
      navigateTo('/agent');
      return;
    }

    // Get session for API calls
    const { session } = await getCurrentSession();
    this.session = session;

    // Expose for retry buttons
    window.adminPage = this;

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
            <!-- Status Indicator -->
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
            <span class="badge badge-${profile.role}">${profile.role}</span>
          </div>
        </header>

        <!-- Tabs -->
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="analytics">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18"/>
              <path d="M18 17V9"/>
              <path d="M13 17V5"/>
              <path d="M8 17v-3"/>
            </svg>
            Analytics
          </button>
          <button class="admin-tab" data-tab="users">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Users
          </button>
          <button class="admin-tab" data-tab="global-agent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            Global Agent
          </button>
          <button class="admin-tab" data-tab="chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat
          </button>
        </div>

        <!-- Tab Content -->
        <div id="admin-tab-content" class="admin-tab-content">
          <!-- Content rendered by switchTab() -->
        </div>
      </div>
    `;

    this.addStyles();
    this.attachTabListeners();
    this.attachStatusListeners();
    this.loadStatus();
    await this.switchTab('analytics');
  }

  attachTabListeners() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  attachStatusListeners() {
    const statusBtn = document.getElementById('status-btn');
    const statusDropdown = document.getElementById('status-dropdown');
    const statusRefresh = document.getElementById('status-refresh');

    // Toggle dropdown on click
    statusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      statusDropdown.classList.toggle('open');
    });

    // Refresh status
    statusRefresh.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loadStatus();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.status-indicator')) {
        statusDropdown.classList.remove('open');
      }
    });
  }

  async loadStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusContent = document.getElementById('status-content');
    const statusFooter = document.getElementById('status-footer');

    // Show loading state
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
      statusFooter.innerHTML = '';
    }
  }

  renderStatus(data) {
    const statusDot = document.querySelector('.status-dot');
    const statusContent = document.getElementById('status-content');
    const statusFooter = document.getElementById('status-footer');

    // Update main indicator
    statusDot.className = `status-dot status-${data.overall}`;

    // Render service list
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

    // Update footer with timestamp
    const checkedAt = new Date(data.checkedAt);
    statusFooter.innerHTML = `Last checked: ${checkedAt.toLocaleTimeString()}`;

    // Check for Firecrawl credit issues and show warning banner
    const firecrawl = data.services.find(s => s.name === 'Firecrawl');
    this.updateFirecrawlWarning(firecrawl);
  }

  updateFirecrawlWarning(firecrawl) {
    // Remove existing warning if any
    const existingWarning = document.querySelector('.firecrawl-warning-banner');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Show warning if Firecrawl is down or degraded
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

      // Insert after header
      const header = document.querySelector('.admin-header');
      if (header) {
        header.insertAdjacentElement('afterend', warningBanner);
      }
    }
  }

  async switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab button active states
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Destroy previous omniChat if switching away
    if (tabName !== 'chat' && this.omniChat) {
      this.omniChat.destroy();
      this.omniChat = null;
    }

    // Render appropriate content
    if (tabName === 'analytics') {
      await this.renderAnalyticsTab();
    } else if (tabName === 'users') {
      await this.renderUsersTab();
    } else if (tabName === 'global-agent') {
      await this.renderGlobalAgentTab();
    } else if (tabName === 'chat') {
      await this.renderChatTab();
    }
  }

  async renderAnalyticsTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-analytics">
        <div class="analytics-loading">
          <div class="loading-spinner">Loading analytics...</div>
        </div>
      </div>
    `;

    await this.loadAnalyticsData();
  }

  async loadAnalyticsData() {
    const container = document.querySelector('.admin-analytics');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-analytics`,
        {
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }

      this.analyticsData = await response.json();
      this.renderAnalyticsContent();

      // Render sparklines (SVG-based, no library needed)
      this.renderSparklines();

      // Attach click listeners for users
      this.attachAnalyticsClickListeners();

      // Load Chart.js and render charts
      await this.loadChartJs();
      this.renderCharts();

      // Load Leaflet and render map
      await this.loadLeaflet();
      this.renderSignupMap();
    } catch (error) {
      console.error('Error loading analytics:', error);
      container.innerHTML = `
        <div class="analytics-error">
          <p>Failed to load analytics: ${error.message}</p>
          <button class="btn btn-primary" onclick="window.adminPage.loadAnalyticsData()">Retry</button>
        </div>
      `;
    }
  }

  renderAnalyticsContent() {
    const container = document.querySelector('.admin-analytics');
    const data = this.analyticsData;

    container.innerHTML = `
      <!-- Overview Metrics -->
      <div class="analytics-section">
        <h2>Overview</h2>
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">${data.users.total.toLocaleString()}</div>
              <div class="sparkline" id="sparkline-users"></div>
            </div>
            <div class="analytics-card-label">Total Users</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">${data.users.active7d.toLocaleString()}</div>
              <div class="sparkline" id="sparkline-active7d"></div>
            </div>
            <div class="analytics-card-label">Active (7d)</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">${data.users.active30d.toLocaleString()}</div>
              <div class="sparkline" id="sparkline-active30d"></div>
            </div>
            <div class="analytics-card-label">Active (30d)</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">${data.users.newWeek.toLocaleString()}</div>
              <div class="sparkline" id="sparkline-newweek"></div>
            </div>
            <div class="analytics-card-label">New This Week</div>
          </div>
        </div>
      </div>

      <!-- Call & Message Metrics -->
      <div class="analytics-section">
        <div class="analytics-grid analytics-grid-2">
          <div class="analytics-panel">
            <div class="panel-header">
              <h3>Calls</h3>
              <div class="sparkline sparkline-panel" id="sparkline-calls"></div>
            </div>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.calls.total.toLocaleString()}</span>
                <span class="analytics-stat-label">Total Calls</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.calls.successRate}%</span>
                <span class="analytics-stat-label">Success Rate</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${this.formatDuration(data.calls.avgDuration)}</span>
                <span class="analytics-stat-label">Avg Duration</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.calls.thisMonth.toLocaleString()}</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
            </div>
            <div class="analytics-breakdown">
              <div class="breakdown-item">
                <span class="breakdown-label">Inbound</span>
                <span class="breakdown-value">${data.calls.inbound.toLocaleString()}</span>
              </div>
              <div class="breakdown-item">
                <span class="breakdown-label">Outbound</span>
                <span class="breakdown-value">${data.calls.outbound.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div class="analytics-panel">
            <div class="panel-header">
              <h3>Messages</h3>
              <div class="sparkline sparkline-panel" id="sparkline-messages"></div>
            </div>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.messages.total.toLocaleString()}</span>
                <span class="analytics-stat-label">Total Messages</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.messages.deliveryRate}%</span>
                <span class="analytics-stat-label">Delivery Rate</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.messages.thisMonth.toLocaleString()}</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
            </div>
            <div class="analytics-breakdown">
              <div class="breakdown-item">
                <span class="breakdown-label">Inbound</span>
                <span class="breakdown-value">${data.messages.inbound.toLocaleString()}</span>
              </div>
              <div class="breakdown-item">
                <span class="breakdown-label">Outbound</span>
                <span class="breakdown-value">${data.messages.outbound.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Credits Overview -->
      <div class="analytics-section">
        <h2>Credits</h2>
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${data.credits.totalBalance}</div>
              <div class="sparkline" id="sparkline-balance"></div>
            </div>
            <div class="analytics-card-label">Total Balance</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${data.credits.totalSpent}</div>
              <div class="sparkline" id="sparkline-spent"></div>
            </div>
            <div class="analytics-card-label">Total Spent</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${data.credits.totalAdded}</div>
              <div class="sparkline" id="sparkline-added"></div>
            </div>
            <div class="analytics-card-label">Total Added</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${data.credits.avgBalance}</div>
              <div class="sparkline" id="sparkline-avgbalance"></div>
            </div>
            <div class="analytics-card-label">Avg Balance</div>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="analytics-section">
        <h2>Activity (Last 30 Days)</h2>
        <div class="analytics-grid analytics-grid-2">
          <div class="analytics-panel">
            <h3>Calls Over Time</h3>
            <div class="chart-container">
              <canvas id="calls-chart"></canvas>
            </div>
          </div>
          <div class="analytics-panel">
            <h3>User Signups</h3>
            <div class="chart-container">
              <canvas id="signups-chart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Leaderboards -->
      <div class="analytics-section">
        <h2>Leaderboards (This Month)</h2>
        <div class="analytics-grid analytics-grid-3">
          <div class="analytics-panel leaderboard">
            <h3>Top Callers</h3>
            ${this.renderLeaderboard(data.leaderboards.topCallers, 'call_count', 'calls')}
          </div>
          <div class="analytics-panel leaderboard">
            <h3>Top Messagers</h3>
            ${this.renderLeaderboard(data.leaderboards.topMessagers, 'message_count', 'messages')}
          </div>
          <div class="analytics-panel leaderboard">
            <h3>Top Spenders</h3>
            ${this.renderLeaderboard(data.leaderboards.topSpenders, 'credits_spent', 'credits', true)}
          </div>
        </div>
      </div>

      <!-- Activity Map -->
      <div class="analytics-section">
        <h2>Activity Map</h2>
        <div class="analytics-panel">
          <div class="map-legend">
            <span class="map-legend-item"><span class="map-legend-dot" style="background:#6366f1;"></span>Signups</span>
            <span class="map-legend-item"><span class="map-legend-dot" style="background:#10b981;"></span>Calls</span>
            <span class="map-legend-item"><span class="map-legend-dot" style="background:#f59e0b;"></span>Messages</span>
            <span class="map-legend-item"><span class="map-legend-dot" style="background:#ef4444;"></span>Web Chats</span>
          </div>
          <div id="signup-map" class="signup-map"></div>
        </div>
      </div>

      <!-- Recent Signups -->
      <div class="analytics-section">
        <h2>Recent Signups (Last 50)</h2>
        <div class="analytics-panel signups-panel">
          ${this.renderRecentSignups(data.recentSignups)}
        </div>
      </div>
    `;
  }

  renderRecentSignups(signups) {
    if (!signups || signups.length === 0) {
      return '<p class="signups-empty">No signups yet</p>';
    }

    return `
      <div class="signups-table-wrapper">
        <table class="signups-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Location</th>
              <th>Status</th>
              <th>Signed Up</th>
            </tr>
          </thead>
          <tbody>
            ${signups.map(user => `
              <tr class="clickable-user" data-user-id="${user.id}" data-user-email="${user.email}">
                <td>
                  <div class="signup-user">
                    <span class="signup-name">${user.name || user.email.split('@')[0]}</span>
                    <span class="signup-email">${user.email}</span>
                  </div>
                </td>
                <td>
                  <div class="signup-location">
                    ${user.city && user.country ? `
                      <span class="signup-city">${user.city}, ${user.country}</span>
                    ` : user.ip ? `
                      <span class="signup-ip">${user.ip}</span>
                    ` : `
                      <span class="signup-no-location">Unknown</span>
                    `}
                  </div>
                </td>
                <td>
                  <div class="signup-status">
                    ${user.phoneVerified ?
                      '<span class="badge badge-active">Verified</span>' :
                      '<span class="badge">Unverified</span>'}
                  </div>
                </td>
                <td>
                  <span class="signup-date">${this.formatRelativeTime(user.createdAt)}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  renderLeaderboard(items, valueKey, unit, isCurrency = false) {
    if (!items || items.length === 0) {
      return '<p class="leaderboard-empty">No data yet</p>';
    }

    return `
      <ol class="leaderboard-list">
        ${items.map((item, index) => `
          <li class="leaderboard-item clickable-user" data-user-id="${item.id}" data-user-email="${item.email}">
            <span class="leaderboard-rank">${index + 1}</span>
            <div class="leaderboard-user">
              <span class="leaderboard-name">${item.name || item.email.split('@')[0]}</span>
              <span class="leaderboard-email">${item.email}</span>
            </div>
            <span class="leaderboard-value">${isCurrency ? '$' : ''}${parseFloat(item[valueKey]).toLocaleString()} ${unit}</span>
          </li>
        `).join('')}
      </ol>
    `;
  }

  formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  renderSparkline(containerId, data, color = '#6366f1', title = '') {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) return;

    const width = container.offsetWidth || 80;
    const height = container.offsetHeight || 32;
    const padding = 2;

    // Store chart data for modal
    this.sparklineData = this.sparklineData || {};
    this.sparklineData[containerId] = { data, color, title };

    // Normalize data
    const values = data.map(d => typeof d === 'object' ? d.count : d);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    // Calculate points
    const points = values.map((val, i) => {
      const x = padding + (i / (values.length - 1 || 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    });

    // Create SVG path
    const pathD = points.length > 0 ? `M ${points.join(' L ')}` : '';

    // Create fill path (closed shape)
    const fillPoints = [...points, `${width - padding},${height - padding}`, `${padding},${height - padding}`];
    const fillD = points.length > 0 ? `M ${points.join(' L ')} L ${width - padding},${height - padding} L ${padding},${height - padding} Z` : '';

    container.innerHTML = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg" data-chart-id="${containerId}">
        <defs>
          <linearGradient id="grad-${containerId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.05" />
          </linearGradient>
        </defs>
        <path d="${fillD}" fill="url(#grad-${containerId})" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  renderSparklines() {
    if (!this.analyticsData) return;

    const data = this.analyticsData;
    const ts = data.timeSeries;

    // Get last 14/30 days for sparklines
    const last30Signups = ts.signups.slice(-30);
    const last30Calls = ts.calls.slice(-30);
    const last30Messages = ts.messages.slice(-30);
    const last14Signups = ts.signups.slice(-14);
    const last14Calls = ts.calls.slice(-14);
    const last14Messages = ts.messages.slice(-14);
    const last7Signups = ts.signups.slice(-7);

    // Overview sparklines
    this.renderSparkline('sparkline-users', last14Signups, '#10b981', 'User Signups');
    this.renderSparkline('sparkline-active7d', last7Signups.length > 0 ? last7Signups : last14Calls.slice(-7), '#6366f1', 'Activity (7 Days)');
    this.renderSparkline('sparkline-active30d', last14Calls, '#8b5cf6', 'Activity (30 Days)');
    this.renderSparkline('sparkline-newweek', last7Signups, '#f59e0b', 'New Users This Week');

    // Panel sparklines (calls and messages) - use full 30 days
    this.renderSparkline('sparkline-calls', last30Calls, '#6366f1', 'Calls Over Time');
    this.renderSparkline('sparkline-messages', last30Messages, '#06b6d4', 'Messages Over Time');

    // Credits sparklines - use placeholder data for now (could be enhanced with credit transactions time series)
    // Generate synthetic trend based on total values
    const creditTrend = this.generateTrendData(parseFloat(data.credits.totalBalance) || 0, 30);
    const spentTrend = this.generateTrendData(parseFloat(data.credits.totalSpent) || 0, 30, true);
    const addedTrend = this.generateTrendData(parseFloat(data.credits.totalAdded) || 0, 30);

    this.renderSparkline('sparkline-balance', creditTrend, '#10b981', 'Total Balance');
    this.renderSparkline('sparkline-spent', spentTrend, '#f97316', 'Total Spent');
    this.renderSparkline('sparkline-added', addedTrend, '#3b82f6', 'Credits Added');
    this.renderSparkline('sparkline-avgbalance', creditTrend.map(v => v * 0.8 + Math.random() * v * 0.1), '#8b5cf6', 'Average Balance');

    // Attach click listeners to sparklines
    this.attachSparklineListeners();
  }

  generateTrendData(endValue, points, isSpending = false) {
    // Generate a plausible upward trend ending at the current value
    const data = [];
    const baseVariation = endValue * 0.1;

    for (let i = 0; i < points; i++) {
      const progress = i / (points - 1);
      const trend = isSpending
        ? endValue * (0.3 + progress * 0.7) // spending grows over time
        : endValue * (0.5 + progress * 0.5); // balance grows
      const noise = (Math.random() - 0.5) * baseVariation;
      data.push(Math.max(0, trend + noise));
    }

    // Ensure last point matches actual value
    data[data.length - 1] = endValue;
    return data;
  }

  attachSparklineListeners() {
    document.querySelectorAll('.sparkline').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        const svg = el.querySelector('.sparkline-svg');
        if (svg) {
          const chartId = svg.dataset.chartId;
          this.openChartModal(chartId);
        }
      });
    });
  }

  attachAnalyticsClickListeners() {
    // Attach listeners for clickable users in leaderboards and signups
    document.querySelectorAll('.clickable-user').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const userId = el.dataset.userId;
        const email = el.dataset.userEmail;
        this.navigateToUser(userId, email);
      });
    });
  }

  navigateToUser(userId, email) {
    // Switch to users tab
    this.activeTab = 'users';
    this.render();

    // Set search filter to user email and reload
    setTimeout(() => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = email;
        this.filters.search = email;
        this.pagination.page = 1;
        this.loadUsers();
      }
    }, 100);
  }

  openChartModal(chartId) {
    const chartData = this.sparklineData?.[chartId];
    if (!chartData) return;

    // Create modal if it doesn't exist
    let modal = document.getElementById('chart-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chart-modal';
      modal.className = 'chart-modal';
      modal.innerHTML = `
        <div class="chart-modal-backdrop"></div>
        <div class="chart-modal-content">
          <div class="chart-modal-header">
            <h3 id="chart-modal-title"></h3>
            <button class="chart-modal-close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="chart-modal-body">
            <canvas id="modal-chart"></canvas>
          </div>
          <div class="chart-modal-stats" id="chart-modal-stats"></div>
        </div>
      `;
      document.body.appendChild(modal);

      // Close handlers
      modal.querySelector('.chart-modal-backdrop').addEventListener('click', () => this.closeChartModal());
      modal.querySelector('.chart-modal-close').addEventListener('click', () => this.closeChartModal());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
          this.closeChartModal();
        }
      });
    }

    // Update modal content
    document.getElementById('chart-modal-title').textContent = chartData.title || 'Chart Details';

    // Calculate stats
    const values = chartData.data.map(d => typeof d === 'object' ? d.count : d);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = values.length > 0 ? sum / values.length : 0;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const latest = values[values.length - 1] || 0;

    document.getElementById('chart-modal-stats').innerHTML = `
      <div class="modal-stat">
        <span class="modal-stat-value">${latest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span class="modal-stat-label">Latest</span>
      </div>
      <div class="modal-stat">
        <span class="modal-stat-value">${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span class="modal-stat-label">Average</span>
      </div>
      <div class="modal-stat">
        <span class="modal-stat-value">${max.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span class="modal-stat-label">Peak</span>
      </div>
      <div class="modal-stat">
        <span class="modal-stat-value">${sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span class="modal-stat-label">Total</span>
      </div>
    `;

    // Show modal
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Render chart
    this.renderModalChart(chartData);
  }

  renderModalChart(chartData) {
    if (!window.Chart) return;

    // Destroy existing modal chart
    if (this.modalChart) {
      this.modalChart.destroy();
    }

    const ctx = document.getElementById('modal-chart');
    if (!ctx) return;

    const data = chartData.data;
    const values = data.map(d => typeof d === 'object' ? d.count : d);
    const labels = data.map((d, i) => {
      if (typeof d === 'object' && d.date) {
        return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return `Day ${i + 1}`;
    });

    this.modalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: chartData.title || 'Value',
          data: values,
          borderColor: chartData.color,
          backgroundColor: chartData.color + '20',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: { size: 14 },
            bodyFont: { size: 13 }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  }

  closeChartModal() {
    const modal = document.getElementById('chart-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
    if (this.modalChart) {
      this.modalChart.destroy();
      this.modalChart = null;
    }
  }

  async loadChartJs() {
    if (this.chartJsLoaded || window.Chart) {
      this.chartJsLoaded = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      script.onload = () => {
        this.chartJsLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  renderCharts() {
    if (!window.Chart || !this.analyticsData) return;

    // Destroy existing charts
    Object.values(this.charts).forEach(chart => chart.destroy());
    this.charts = {};

    const data = this.analyticsData;

    // Calls chart
    const callsCtx = document.getElementById('calls-chart');
    if (callsCtx) {
      const callsData = this.prepareTimeSeriesData(data.timeSeries.calls);
      this.charts.calls = new Chart(callsCtx, {
        type: 'line',
        data: {
          labels: callsData.labels,
          datasets: [{
            label: 'Calls',
            data: callsData.values,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: this.getChartOptions()
      });
    }

    // Signups chart
    const signupsCtx = document.getElementById('signups-chart');
    if (signupsCtx) {
      const signupsData = this.prepareTimeSeriesData(data.timeSeries.signups);
      this.charts.signups = new Chart(signupsCtx, {
        type: 'line',
        data: {
          labels: signupsData.labels,
          datasets: [{
            label: 'Signups',
            data: signupsData.values,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: this.getChartOptions()
      });
    }
  }

  prepareTimeSeriesData(rawData) {
    // Fill in missing dates for the last 30 days
    const dates = [];
    const values = [];
    const dataMap = new Map(rawData.map(d => [d.date, parseInt(d.count)]));

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      values.push(dataMap.get(dateStr) || 0);
    }

    return { labels: dates, values };
  }

  getChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxTicksLimit: 7
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    };
  }

  async loadLeaflet() {
    if (this.leafletLoaded || window.L) {
      this.leafletLoaded = true;
      return;
    }

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        this.leafletLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  renderSignupMap() {
    if (!window.L || !this.analyticsData) return;

    const mapContainer = document.getElementById('signup-map');
    if (!mapContainer) return;

    // Destroy existing map
    if (this.signupMap) {
      this.signupMap.remove();
    }

    // Create map centered on world view
    this.signupMap = L.map('signup-map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 10
    });

    // Add tile layer (using CartoDB Positron for clean look)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.signupMap);

    const locations = this.analyticsData.activityLocations;
    if (!locations || (
      (!locations.signups || locations.signups.length === 0) &&
      (!locations.calls || locations.calls.length === 0) &&
      (!locations.messages || locations.messages.length === 0) &&
      (!locations.chats || locations.chats.length === 0)
    )) {
      mapContainer.innerHTML = `
        <div class="map-no-data">
          <p>No location data available yet</p>
          <p class="text-muted">Location will be captured for new signups</p>
        </div>
      `;
      return;
    }

    this.addActivityMarkers(locations);
  }

  addActivityMarkers(locations) {
    const cityCoords = this.getCityCoordinates();
    const types = [
      { key: 'signups', label: 'signup', color: '#6366f1', border: '#4f46e5' },
      { key: 'calls', label: 'call', color: '#10b981', border: '#059669' },
      { key: 'messages', label: 'message', color: '#f59e0b', border: '#d97706' },
      { key: 'chats', label: 'web chat', color: '#ef4444', border: '#dc2626' }
    ];

    for (const type of types) {
      const items = locations[type.key] || [];
      for (const item of items) {
        const cityKey = item.city?.toLowerCase();
        const coords = cityKey ? cityCoords[cityKey] : null;
        if (!coords) continue;

        // Offset overlapping markers slightly by type
        const offset = types.indexOf(type) * 0.15;
        const marker = L.circleMarker([coords.lat + offset, coords.lng + offset], {
          radius: Math.min(6 + item.count * 1.5, 18),
          fillColor: type.color,
          color: type.border,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.7
        }).addTo(this.signupMap);

        const label = `${item.count} ${type.label}${item.count > 1 ? 's' : ''}`;
        const popupContent = `
          <div class="map-popup">
            <strong>${item.city}, ${item.country}</strong><br>
            <span>${label}</span>
            <ul class="map-popup-users">
              ${item.users.slice(0, 5).map(u => `<li>${u}</li>`).join('')}
              ${item.users.length > 5 ? `<li>+${item.users.length - 5} more</li>` : ''}
            </ul>
          </div>
        `;
        marker.bindPopup(popupContent);
      }
    }
  }

  getCityCoordinates() {
    // Predefined coordinates for common cities
    // In production, you'd use a geocoding service or store coords in the database
    return {
      'vancouver': { lat: 49.2827, lng: -123.1207 },
      'toronto': { lat: 43.6532, lng: -79.3832 },
      'montreal': { lat: 45.5017, lng: -73.5673 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'los angeles': { lat: 34.0522, lng: -118.2437 },
      'san francisco': { lat: 37.7749, lng: -122.4194 },
      'chicago': { lat: 41.8781, lng: -87.6298 },
      'london': { lat: 51.5074, lng: -0.1278 },
      'paris': { lat: 48.8566, lng: 2.3522 },
      'berlin': { lat: 52.5200, lng: 13.4050 },
      'tokyo': { lat: 35.6762, lng: 139.6503 },
      'sydney': { lat: -33.8688, lng: 151.2093 },
      'singapore': { lat: 1.3521, lng: 103.8198 },
      'hong kong': { lat: 22.3193, lng: 114.1694 },
      'mumbai': { lat: 19.0760, lng: 72.8777 },
      'dubai': { lat: 25.2048, lng: 55.2708 },
      'seattle': { lat: 47.6062, lng: -122.3321 },
      'austin': { lat: 30.2672, lng: -97.7431 },
      'miami': { lat: 25.7617, lng: -80.1918 },
      'boston': { lat: 42.3601, lng: -71.0589 },
      'denver': { lat: 39.7392, lng: -104.9903 },
      'atlanta': { lat: 33.7490, lng: -84.3880 },
      'phoenix': { lat: 33.4484, lng: -112.0740 },
      'dallas': { lat: 32.7767, lng: -96.7970 },
      'houston': { lat: 29.7604, lng: -95.3698 }
    };
  }

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
              <input type="text" id="search-input" placeholder="Search users..." class="form-input" />
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  async renderChatTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-chat-tab">
        <div id="omni-chat-container" class="omni-chat-container">
          <div class="loading-spinner">Loading chat interface...</div>
        </div>
      </div>
    `;

    try {
      const { createOmniChatInterface, addOmniChatStyles } = await import('../components/OmniChatInterface.js');
      addOmniChatStyles();

      const container = document.getElementById('omni-chat-container');
      container.innerHTML = '';
      this.omniChat = createOmniChatInterface(container, this.session);
    } catch (error) {
      console.error('Failed to load OmniChatInterface:', error);
      const container = document.getElementById('omni-chat-container');
      container.innerHTML = `
        <div class="detail-placeholder">
          <p style="color: var(--error-color);">Failed to load chat interface: ${error.message}</p>
        </div>
      `;
    }
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
        width: 280px;
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
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
        font-weight: 600;
        font-size: 0.875rem;
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
        padding: 0.5rem 0;
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
        padding: 0.625rem 1rem;
        text-decoration: none;
        color: inherit;
      }

      .status-service:hover {
        background: var(--bg-secondary);
      }

      .status-service-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
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
        font-size: 0.875rem;
        font-weight: 500;
      }

      .status-service-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .status-latency {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .status-message {
        font-size: 0.75rem;
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
        padding: 0.5rem 1rem;
        border-top: 1px solid var(--border-color);
        font-size: 0.75rem;
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
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Global Agent Tab */
      .admin-global-agent {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
        max-width: 800px;
      }

      .global-agent-header {
        margin-bottom: 2rem;
      }

      .global-agent-header h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.5rem;
      }

      .global-agent-form {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid var(--border-color);
      }

      .config-form .form-group {
        margin-bottom: 1.5rem;
      }

      .config-form label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
      }

      .config-form .form-textarea {
        resize: vertical;
        min-height: 200px;
        font-family: monospace;
        font-size: 0.9rem;
        line-height: 1.5;
      }

      .config-form .form-actions {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border-color);
      }

      .config-form .form-actions .btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .form-status {
        margin-top: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
      }

      .form-status.success {
        background: #dcfce7;
        color: #166534;
        border: 1px solid #bbf7d0;
      }

      .form-status.error {
        background: #fee;
        color: #c00;
        border: 1px solid #fcc;
      }

      /* Global Agent Permissions List */
      .global-agent-users-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .global-agent-user-item {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        transition: background 0.15s;
      }

      .global-agent-user-item:hover {
        background: var(--bg-secondary);
      }

      .global-agent-user-label {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        margin: 0;
      }

      .global-agent-user-label input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        flex-shrink: 0;
      }

      .global-agent-user-label input[type="checkbox"]:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }

      .global-agent-user-info {
        flex: 1;
        min-width: 0;
      }

      .global-agent-user-name {
        display: block;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-agent-user-email {
        display: block;
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-agent-always-access {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-style: italic;
        white-space: nowrap;
      }

      /* Chat Tab */
      .admin-chat-tab {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .omni-chat-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-primary);
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

      .badge-active { background: #d1fae5; color: #059669; }
      .badge-suspended { background: #fef3c7; color: #d97706; }
      .badge-banned { background: #fee2e2; color: #dc2626; }
      .badge-admin { background: #ede9fe; color: #7c3aed; }
      .badge-support { background: #fce7f3; color: #db2777; }
      .badge-user { background: #e5e7eb; color: #374151; }
      .badge-viewer { background: #e0f2fe; color: #0284c7; }
      .badge-editor { background: #dcfce7; color: #16a34a; }
      .badge-god { background: #fef3c7; color: #b45309; }

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

      /* Analytics Tab Styles */
      .admin-analytics {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
        background: var(--bg-secondary);
      }

      .analytics-loading,
      .analytics-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 1rem;
        color: var(--text-muted);
      }

      .analytics-section {
        margin-bottom: 2rem;
      }

      .analytics-section h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .analytics-grid {
        display: grid;
        gap: 1rem;
      }

      .analytics-grid-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      .analytics-grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }

      .analytics-grid-4 {
        grid-template-columns: repeat(4, 1fr);
      }

      .analytics-card {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.25rem;
        text-align: center;
        border: 1px solid var(--border-color);
      }

      .analytics-card-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--primary-color);
        line-height: 1.2;
      }

      .analytics-card-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      .analytics-card-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
      }

      .sparkline {
        width: 60px;
        height: 28px;
        flex-shrink: 0;
      }

      .sparkline svg {
        display: block;
      }

      .sparkline-panel {
        width: 100px;
        height: 32px;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .analytics-panel .panel-header h3 {
        margin: 0;
      }

      .analytics-panel {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.25rem;
        border: 1px solid var(--border-color);
      }

      .analytics-panel h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .analytics-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .analytics-stat {
        text-align: center;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: 8px;
      }

      .analytics-stat-value {
        display: block;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .analytics-stat-label {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.125rem;
      }

      .analytics-breakdown {
        display: flex;
        gap: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .breakdown-item {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        background: var(--bg-secondary);
        border-radius: 6px;
      }

      .breakdown-label {
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .breakdown-value {
        font-weight: 600;
        color: var(--text-primary);
      }

      .chart-container {
        height: 200px;
        position: relative;
      }

      /* Leaderboard Styles */
      .leaderboard {
        min-height: 300px;
      }

      .leaderboard-empty {
        color: var(--text-muted);
        text-align: center;
        padding: 2rem;
      }

      .leaderboard-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .leaderboard-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
      }

      .leaderboard-item:last-child {
        border-bottom: none;
      }

      .leaderboard-rank {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-secondary);
        border-radius: 50%;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
      }

      .leaderboard-item:nth-child(1) .leaderboard-rank {
        background: #fef3c7;
        color: #b45309;
      }

      .leaderboard-item:nth-child(2) .leaderboard-rank {
        background: #e5e7eb;
        color: #374151;
      }

      .leaderboard-item:nth-child(3) .leaderboard-rank {
        background: #fed7aa;
        color: #c2410c;
      }

      .leaderboard-user {
        flex: 1;
        min-width: 0;
      }

      .leaderboard-name {
        display: block;
        font-weight: 500;
        font-size: 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .leaderboard-email {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .leaderboard-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--primary-color);
        white-space: nowrap;
      }

      /* Clickable users */
      .clickable-user {
        cursor: pointer;
        transition: background-color 0.15s;
      }

      .clickable-user:hover {
        background-color: var(--bg-secondary);
      }

      .leaderboard-item.clickable-user:hover {
        background-color: var(--bg-secondary);
        border-radius: 8px;
      }

      tr.clickable-user:hover td {
        background-color: var(--bg-secondary);
      }

      /* Chart Modal */
      .chart-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 1000;
      }

      .chart-modal.open {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chart-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }

      .chart-modal-content {
        position: relative;
        background: var(--bg-primary);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      .chart-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
      }

      .chart-modal-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      .chart-modal-close {
        background: none;
        border: none;
        padding: 0.5rem;
        cursor: pointer;
        color: var(--text-muted);
        border-radius: 8px;
        transition: all 0.15s;
      }

      .chart-modal-close:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      .chart-modal-body {
        padding: 1.5rem;
        height: 350px;
      }

      .chart-modal-body canvas {
        width: 100% !important;
        height: 100% !important;
      }

      .chart-modal-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
        padding: 1rem 1.5rem 1.5rem;
        border-top: 1px solid var(--border-color);
        background: var(--bg-secondary);
      }

      .modal-stat {
        text-align: center;
      }

      .modal-stat-value {
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .modal-stat-label {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      /* Sparkline clickable */
      .sparkline {
        cursor: pointer;
        transition: transform 0.15s;
      }

      .sparkline:hover {
        transform: scale(1.1);
      }

      /* Signup Map */
      .signup-map {
        height: 300px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--bg-secondary);
      }

      .map-no-data {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        text-align: center;
      }

      .map-no-data p {
        margin: 0.25rem 0;
      }

      .map-legend {
        display: flex;
        gap: 1rem;
        margin-top: 0.5rem;
        flex-wrap: wrap;
      }

      .map-legend-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .map-legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        display: inline-block;
      }

      .map-popup {
        font-size: 0.875rem;
      }

      .map-popup strong {
        display: block;
        margin-bottom: 0.25rem;
      }

      .map-popup-users {
        margin: 0.5rem 0 0 0;
        padding-left: 1rem;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .map-popup-users li {
        margin: 0.125rem 0;
      }

      /* Recent Signups Table */
      .signups-panel {
        padding: 0;
        overflow: hidden;
      }

      .signups-table-wrapper {
        overflow-x: auto;
      }

      .signups-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .signups-table th,
      .signups-table td {
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
      }

      .signups-table th {
        background: var(--bg-secondary);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .signups-table tbody tr:hover {
        background: var(--bg-secondary);
      }

      .signup-user {
        display: flex;
        flex-direction: column;
      }

      .signup-name {
        font-weight: 500;
      }

      .signup-email {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .signup-location {
        font-size: 0.875rem;
      }

      .signup-city {
        color: var(--text-primary);
      }

      .signup-ip {
        font-family: monospace;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .signup-no-location {
        color: var(--text-muted);
        font-style: italic;
      }

      .signup-date {
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .signups-empty {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
      }

      /* Analytics Mobile Responsive */
      @media (max-width: 1200px) {
        .analytics-grid-4 {
          grid-template-columns: repeat(2, 1fr);
        }

        .analytics-grid-3 {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 768px) {
        .admin-analytics {
          padding: 1rem;
        }

        .analytics-grid-4,
        .analytics-grid-3,
        .analytics-grid-2 {
          grid-template-columns: 1fr;
        }

        .analytics-card-value {
          font-size: 1.5rem;
        }

        .analytics-card-header {
          flex-direction: column;
          gap: 0.5rem;
        }

        .sparkline {
          width: 80px;
          height: 24px;
        }

        .sparkline-panel {
          width: 80px;
          height: 28px;
        }

        .panel-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .chart-container {
          height: 180px;
        }

        .chart-modal-content {
          width: 95%;
          max-height: 95vh;
          border-radius: 12px;
        }

        .chart-modal-header {
          padding: 1rem;
        }

        .chart-modal-header h3 {
          font-size: 1rem;
        }

        .chart-modal-body {
          padding: 1rem;
          height: 250px;
        }

        .chart-modal-stats {
          grid-template-columns: repeat(2, 1fr);
          padding: 1rem;
        }

        .modal-stat-value {
          font-size: 1.25rem;
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
  }

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
      alert('Error: ' + error.message);
    }
  }
}
