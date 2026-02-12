/**
 * Admin Portal Page
 * Manage users, phone numbers, and chat with agents
 */

import { getCurrentUser, getCurrentSession, supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import AdminHeader from '../components/AdminHeader.js';

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
      navigateTo('/inbox');
      return;
    }

    // Get session for API calls
    const { session } = await getCurrentSession();
    this.session = session;

    // Expose for retry buttons
    window.adminPage = this;

    this.adminHeader = new AdminHeader({
      title: 'Admin Portal',
      backPath: '/inbox',
      role: profile.role,
      tabs: [
        { id: 'analytics', label: 'Analytics', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>' },
        { id: 'users', label: 'Users', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
        { id: 'global-agent', label: 'Global Agent', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' },
        { id: 'kpi', label: 'KPI', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>' },
        { id: 'chat', label: 'Chat', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
        { id: 'support', label: 'Support', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>' },
        { id: 'notifications', label: 'Notifications', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
      ],
      activeTab: 'analytics',
      onTabChange: (tabId) => this.switchTab(tabId),
      session: this.session,
    });

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="admin-container">
        ${this.adminHeader.render()}

        <!-- Admin Reminders -->
        <div id="admin-reminders"></div>

        <!-- Tab Content -->
        <div id="admin-tab-content" class="admin-tab-content">
          <!-- Content rendered by switchTab() -->
        </div>
      </div>
    `;

    this.addStyles();
    this.renderAdminReminders();
    this.adminHeader.attachListeners();

    // Check URL params for tab auto-switch (e.g. post-OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['analytics', 'users', 'global-agent', 'kpi', 'chat', 'support', 'notifications'];
    const initialTab = validTabs.includes(tabParam) ? tabParam : 'analytics';

    if (urlParams.get('integration_connected') === 'google_email') {
      showToast('Gmail connected successfully!', 'success');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (initialTab !== 'analytics') {
      this.adminHeader.setActiveTab(initialTab);
    }
    await this.switchTab(initialTab);
  }

  renderAdminReminders() {
    const container = document.getElementById('admin-reminders');
    if (!container) return;

    const reminders = [
      {
        id: 'elevenlabs-cost-review',
        showAfter: '2026-04-09',
        title: 'ElevenLabs Cost Review',
        message: 'Review ElevenLabs TTS costs ($0.22/min vendor cost vs $0.07/min retail). Consider: switching default to OpenAI TTS ($0.015/min vendor), tiered voice pricing, or negotiating ElevenLabs Business plan.',
        type: 'warning',
      },
    ];

    const now = new Date();
    const dismissed = JSON.parse(localStorage.getItem('admin-dismissed-reminders') || '[]');

    const activeReminders = reminders.filter(r =>
      now >= new Date(r.showAfter) && !dismissed.includes(r.id)
    );

    if (activeReminders.length === 0) return;

    container.innerHTML = activeReminders.map(r => `
      <div class="admin-reminder admin-reminder-${r.type}" data-reminder-id="${r.id}">
        <div class="admin-reminder-content">
          <strong>${r.title}</strong>
          <span>${r.message}</span>
        </div>
        <button class="admin-reminder-dismiss" title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.admin-reminder-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.admin-reminder').dataset.reminderId;
        const list = JSON.parse(localStorage.getItem('admin-dismissed-reminders') || '[]');
        list.push(id);
        localStorage.setItem('admin-dismissed-reminders', JSON.stringify(list));
        btn.closest('.admin-reminder').remove();
      });
    });
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
    } else if (tabName === 'kpi') {
      await this.renderKpiTab();
    } else if (tabName === 'chat') {
      await this.renderChatTab();
    } else if (tabName === 'support') {
      await this.renderSupportTab();
    } else if (tabName === 'notifications') {
      await this.renderNotificationsTab();
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
      this.signupsPage = 1;
      this.signupsPerPage = 25;
      this.renderAnalyticsContent();

      // Render signups table with pagination
      this.renderSignupsTable();

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

      <!-- Recent Signups -->
      <div class="analytics-section">
        <h2>Recent Signups</h2>
        <div class="analytics-panel signups-panel" id="signups-panel">
        </div>
      </div>
    `;
  }

  renderSignupsTable() {
    const panel = document.getElementById('signups-panel');
    if (!panel) return;

    const signups = this.analyticsData?.recentSignups || [];
    if (signups.length === 0) {
      panel.innerHTML = '<p class="signups-empty">No signups yet</p>';
      return;
    }

    const total = signups.length;
    const totalPages = Math.ceil(total / this.signupsPerPage);
    const start = (this.signupsPage - 1) * this.signupsPerPage;
    const end = Math.min(start + this.signupsPerPage, total);
    const pageSignups = signups.slice(start, end);

    const paginationBar = `
      <div class="signups-pagination">
        <div class="signups-pagination-info">
          Showing ${start + 1}–${end} of ${total}
        </div>
        <div class="signups-pagination-controls">
          <select class="signups-per-page">
            ${[25, 50, 100].map(n => `<option value="${n}" ${n === this.signupsPerPage ? 'selected' : ''}>${n} per page</option>`).join('')}
          </select>
          <button class="signups-page-btn" data-page="prev" ${this.signupsPage <= 1 ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span class="signups-page-num">${this.signupsPage} / ${totalPages}</span>
          <button class="signups-page-btn" data-page="next" ${this.signupsPage >= totalPages ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>
    `;

    panel.innerHTML = `
      ${paginationBar}
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
            ${pageSignups.map(user => `
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
      ${paginationBar}
    `;

    // Attach pagination event listeners
    panel.querySelectorAll('.signups-per-page').forEach(select => {
      select.addEventListener('change', (e) => {
        this.signupsPerPage = parseInt(e.target.value);
        this.signupsPage = 1;
        this.renderSignupsTable();
      });
    });

    panel.querySelectorAll('.signups-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.page;
        if (action === 'prev' && this.signupsPage > 1) this.signupsPage--;
        if (action === 'next' && this.signupsPage < totalPages) this.signupsPage++;
        this.renderSignupsTable();
      });
    });

    // Re-attach user click listeners for the new rows
    this.attachAnalyticsClickListeners();
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
    const types = [
      { key: 'signups', label: 'signup', color: '#6366f1', border: '#4f46e5' },
      { key: 'calls', label: 'call', color: '#10b981', border: '#059669' },
      { key: 'messages', label: 'message', color: '#f59e0b', border: '#d97706' },
      { key: 'chats', label: 'web chat', color: '#ef4444', border: '#dc2626' }
    ];

    const bounds = [];

    for (const type of types) {
      const items = locations[type.key] || [];
      for (const item of items) {
        if (!item.lat || !item.lng) continue;

        // Offset overlapping markers slightly by type
        const offset = types.indexOf(type) * 0.15;
        const lat = item.lat + offset;
        const lng = item.lng + offset;
        const marker = L.circleMarker([lat, lng], {
          radius: Math.min(6 + item.count * 1.5, 18),
          fillColor: type.color,
          color: type.border,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.7
        }).addTo(this.signupMap);

        bounds.push([item.lat, item.lng]);

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

    // Fit map to markers if we have any
    if (bounds.length > 0) {
      this.signupMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
    }
  }

  async renderKpiTab() {
    if (!this.kpiDateFilter) this.kpiDateFilter = 'all';

    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-analytics kpi-tab">
        <div class="kpi-filter-bar">
          <span class="kpi-filter-label">Period:</span>
          <div class="kpi-filter-buttons">
            <button class="kpi-filter-btn ${this.kpiDateFilter === 'today' ? 'active' : ''}" data-filter="today">Today</button>
            <button class="kpi-filter-btn ${this.kpiDateFilter === '7d' ? 'active' : ''}" data-filter="7d">7 days</button>
            <button class="kpi-filter-btn ${this.kpiDateFilter === '30d' ? 'active' : ''}" data-filter="30d">30 days</button>
            <button class="kpi-filter-btn ${this.kpiDateFilter === 'month' ? 'active' : ''}" data-filter="month">This month</button>
            <button class="kpi-filter-btn ${this.kpiDateFilter === 'all' ? 'active' : ''}" data-filter="all">All time</button>
            <input type="date" class="kpi-date-input ${this.kpiDateFilter === 'custom' ? 'active' : ''}" id="kpi-custom-date" title="Custom start date" ${this.kpiCustomDate ? `value="${this.kpiCustomDate}"` : ''}>
          </div>
        </div>
        <div class="analytics-loading">
          <div class="loading-spinner">Loading KPI data...</div>
        </div>
      </div>
    `;

    // Attach filter listeners
    document.querySelectorAll('.kpi-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.kpiDateFilter = btn.dataset.filter;
        this.renderKpiTab();
      });
    });

    // Custom date picker
    const customDateInput = document.getElementById('kpi-custom-date');
    if (customDateInput) {
      customDateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          this.kpiDateFilter = 'custom';
          this.kpiCustomDate = e.target.value;
          this.renderKpiTab();
        }
      });
    }

    try {
      // Build since parameter
      let since = '';
      if (this.kpiDateFilter === 'today') {
        const now = new Date();
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (this.kpiDateFilter === '7d') {
        since = new Date(Date.now() - 7 * 86400000).toISOString();
      } else if (this.kpiDateFilter === '30d') {
        since = new Date(Date.now() - 30 * 86400000).toISOString();
      } else if (this.kpiDateFilter === 'month') {
        const now = new Date();
        since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (this.kpiDateFilter === 'custom' && this.kpiCustomDate) {
        since = new Date(this.kpiCustomDate + 'T00:00:00').toISOString();
      }

      const params = new URLSearchParams({ type: 'kpi' });
      if (since) params.set('since', since);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-analytics?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to load KPI data');

      this.kpiData = await response.json();
      this.renderKpiContent();

      // Render KPI charts
      await this.loadChartJs();
      this.renderVendorDonut();
      this.renderPerCallWaterfall();
      this.renderKpiChart();
    } catch (error) {
      console.error('Error loading KPI data:', error);
      const loading = document.querySelector('.kpi-tab .analytics-loading');
      if (loading) {
        loading.innerHTML = `
          <div class="analytics-error">
            <p>Failed to load KPI data: ${error.message}</p>
            <button class="btn btn-primary" onclick="window.adminPage.renderKpiTab()">Retry</button>
          </div>
        `;
      }
    }
  }

  renderKpiContent() {
    const container = document.querySelector('.kpi-tab');
    const data = this.kpiData;
    const s = data.summary;

    const profitColor = s.grossProfit >= 0 ? '#10b981' : '#ef4444';
    const marginColor = s.grossMargin >= 50 ? '#10b981' : s.grossMargin >= 20 ? '#f59e0b' : '#ef4444';

    // Remove loading spinner, keep filter bar
    const loading = container.querySelector('.analytics-loading');
    if (loading) loading.remove();

    // Remove old kpi-content if re-rendering
    const old = container.querySelector('.kpi-content');
    if (old) old.remove();

    const content = document.createElement('div');
    content.className = 'kpi-content';
    content.innerHTML = `
      <!-- Revenue & Cost Trend -->
      <div class="analytics-section">
        <h2>Revenue & Cost Trend</h2>
        <div class="analytics-panel">
          <div class="chart-container" style="height: 250px;">
            <canvas id="kpi-trend-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="analytics-section">
        <h2>Profitability Overview</h2>
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${s.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              <div class="sparkline" id="sparkline-kpi-revenue"></div>
            </div>
            <div class="analytics-card-label">Total Revenue</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: #ef4444;">$${s.totalVendorCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              <div class="sparkline" id="sparkline-kpi-cost"></div>
            </div>
            <div class="analytics-card-label">Vendor Costs</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: ${profitColor};">$${s.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              <div class="sparkline" id="sparkline-kpi-profit"></div>
            </div>
            <div class="analytics-card-label">Gross Profit</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: ${marginColor};">${s.grossMargin.toFixed(1)}%</div>
              <div class="sparkline" id="sparkline-kpi-margin"></div>
            </div>
            <div class="analytics-card-label">Gross Margin</div>
          </div>
        </div>
      </div>

      <!-- MRR (Monthly Recurring Revenue) -->
      ${data.mrr ? `
      <div class="analytics-section">
        <h2>Monthly Recurring Revenue (MRR)</h2>
        <div class="analytics-grid analytics-grid-3">
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: #6366f1;">$${data.mrr.totalCollected.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
              <div class="sparkline" id="sparkline-kpi-mrr"></div>
            </div>
            <div class="analytics-card-label">MRR Collected</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" style="color: #6366f1;">$${data.mrr.projectedMonthly.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            <div class="analytics-card-label">Projected Monthly</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-label" style="margin-bottom: 0.5rem; font-weight: 600;">Billable Items</div>
            <div style="font-size: 0.85rem; line-height: 1.8;">
              <div style="display: flex; justify-content: space-between;">
                <span>Numbers</span>
                <span style="font-weight: 600;">${data.mrr.activeNumbers || 0}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Knowledge Bases</span>
                <span style="font-weight: 600;">${data.mrr.totalKbs || 0} <span style="color: var(--text-muted); font-weight: 400;">(${data.mrr.includedKbsPerOrg || 20} incl)</span></span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Voice Channels</span>
                <span style="font-weight: 600;">${data.mrr.totalConcurrency || 20} <span style="color: var(--text-muted); font-weight: 400;">(${data.mrr.includedConcurrency || 20} incl)</span></span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Memory</span>
                <span style="font-weight: 600;">${data.mrr.memoryEnabled || 0} <span style="color: var(--text-muted); font-weight: 400;">($0.005/min)</span></span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Semantic Memory</span>
                <span style="font-weight: 600;">${data.mrr.semanticMemoryEnabled || 0} <span style="color: var(--text-muted); font-weight: 400;">($0.005/min)</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Overall P&L (Usage + MRR) -->
      ${data.overall ? (() => {
        const o = data.overall;
        const oColor = o.profit >= 0 ? '#10b981' : '#ef4444';
        const oMarginColor = o.margin >= 50 ? '#10b981' : o.margin >= 20 ? '#f59e0b' : '#ef4444';
        const fmt = (v) => v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const plColor = (v) => v >= 0 ? '#10b981' : '#ef4444';
        return `
      <div class="analytics-section">
        <h2>Overall P&L</h2>
        <div class="analytics-grid analytics-grid-3">
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value">$${fmt(o.totalRevenue)}</div>
              <div class="sparkline" id="sparkline-kpi-pl-revenue"></div>
            </div>
            <div class="analytics-card-label">Total Revenue</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: ${oColor};">$${fmt(o.profit)}</div>
              <div class="sparkline" id="sparkline-kpi-pl-profit"></div>
            </div>
            <div class="analytics-card-label">Net Profit</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-header">
              <div class="analytics-card-value" style="color: ${oMarginColor};">${o.margin.toFixed(1)}%</div>
              <div class="sparkline" id="sparkline-kpi-pl-margin"></div>
            </div>
            <div class="analytics-card-label">Net Margin</div>
          </div>
        </div>
        <div class="analytics-panel" style="margin-top: 1rem;">
          <table class="kpi-table kpi-pl-table">
            <thead>
              <tr>
                <th>Line Item</th>
                <th>Revenue</th>
                <th>Vendor Cost</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Voice Calls</strong><span class="kpi-pl-sub">${data.perCall.totalMinutes.toFixed(1)} min — per-component pricing</span></td>
                <td>$${fmt(o.voiceRevenue)}</td>
                <td class="kpi-cost">$${fmt(o.voiceVendorCost)}</td>
                <td style="color: ${plColor(o.voiceProfit)}; font-weight: 600;">$${fmt(o.voiceProfit)}</td>
              </tr>
              <tr>
                <td><strong>SMS</strong><span class="kpi-pl-sub">${data.smsBreakdown.reduce((s,r) => s + r.quantity, 0)} msgs @ $0.01/msg</span></td>
                <td>$${fmt(o.smsRevenue)}</td>
                <td class="kpi-cost">$${fmt(o.smsVendorCost)}</td>
                <td style="color: ${plColor(o.smsProfit)}; font-weight: 600;">$${fmt(o.smsProfit)}</td>
              </tr>
              <tr class="kpi-pl-subtotal">
                <td><strong>Usage Subtotal</strong></td>
                <td>$${fmt(o.usageRevenue)}</td>
                <td class="kpi-cost">$${fmt(o.totalVendorCost)}</td>
                <td style="color: ${plColor(o.usageRevenue - o.totalVendorCost)}; font-weight: 600;">$${fmt(o.usageRevenue - o.totalVendorCost)}</td>
              </tr>
              <tr>
                <td><strong>Numbers</strong><span class="kpi-pl-sub">${data.mrr.activeNumbers} @ $2/mo</span></td>
                <td>$${fmt(data.mrr.projectedPhoneNumberMrr || o.mrrRevenue)}</td>
                <td class="kpi-cost">$0.00</td>
                <td style="color: #10b981; font-weight: 600;">$${fmt(data.mrr.projectedPhoneNumberMrr || o.mrrRevenue)}</td>
              </tr>
              <tr>
                <td><strong>Knowledge Bases</strong><span class="kpi-pl-sub">${data.mrr.totalKbs || 0} total — ${data.mrr.includedKbsPerOrg || 20} included${(data.mrr.extraKbs || 0) > 0 ? `, ${data.mrr.extraKbs} extra @ $5/mo` : ''}</span></td>
                <td>$${fmt(data.mrr.projectedKbMrr || 0)}</td>
                <td class="kpi-cost">$0.00</td>
                <td style="color: #10b981; font-weight: 600;">$${fmt(data.mrr.projectedKbMrr || 0)}</td>
              </tr>
              <tr>
                <td><strong>Voice Channels</strong><span class="kpi-pl-sub">${data.mrr.totalConcurrency || 20} total — ${data.mrr.includedConcurrency || 20} included${(data.mrr.extraSlots || 0) > 0 ? `, ${data.mrr.extraSlots} extra @ $5/mo` : ''}</span></td>
                <td>$${fmt(data.mrr.projectedConcurrencyMrr || 0)}</td>
                <td class="kpi-cost">$0.00</td>
                <td style="color: #10b981; font-weight: 600;">$${fmt(data.mrr.projectedConcurrencyMrr || 0)}</td>
              </tr>
              <tr>
                <td><strong>Memory</strong><span class="kpi-pl-sub">${data.mrr.memoryEnabled || 0} agents enabled @ $0.005/min</span></td>
                <td>$${fmt(data.mrr.memoryRevenue || 0)}</td>
                <td class="kpi-cost">$0.00</td>
                <td style="color: #10b981; font-weight: 600;">$${fmt(data.mrr.memoryRevenue || 0)}</td>
              </tr>
              <tr>
                <td><strong>Semantic Memory</strong><span class="kpi-pl-sub">${data.mrr.semanticMemoryEnabled || 0} agents enabled @ $0.005/min</span></td>
                <td>$${fmt(data.mrr.semanticMemoryRevenue || 0)}</td>
                <td class="kpi-cost">$0.00</td>
                <td style="color: #10b981; font-weight: 600;">$${fmt(data.mrr.semanticMemoryRevenue || 0)}</td>
              </tr>
              <tr class="kpi-pl-total">
                <td><strong>Total</strong></td>
                <td><strong>$${fmt(o.totalRevenue)}</strong></td>
                <td class="kpi-cost"><strong>$${fmt(o.totalVendorCost)}</strong></td>
                <td style="color: ${plColor(o.profit)}; font-weight: 700; font-size: 1.1em;">$${fmt(o.profit)}</td>
              </tr>
            </tbody>
          </table>
          ${o.breakEvenMinutes > 0 ? `
          <div class="kpi-pl-note">
            MRR covers usage losses up to <strong>${o.breakEvenMinutes.toLocaleString()} minutes/month</strong>. Beyond that, per-call losses exceed MRR.
          </div>` : ''}
        </div>
      </div>
      `})() : ''}

      <!-- Per-Call Economics -->
      <div class="analytics-section">
        <h2>Per-Call Economics</h2>
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-value">${data.perCall.totalCalls.toLocaleString()}</div>
            <div class="analytics-card-label">Total Calls</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value">${data.perCall.totalMinutes.toLocaleString()}</div>
            <div class="analytics-card-label">Total Minutes</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value">$${data.perCall.avgRevenuePerMin.toFixed(4)}</div>
            <div class="analytics-card-label">Avg Revenue/Min</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" style="color: #ef4444;">$${data.perCall.avgCostPerMin.toFixed(4)}</div>
            <div class="analytics-card-label">Avg Cost/Min</div>
          </div>
        </div>
        <div class="analytics-panel" style="margin-top: 1rem;">
          <div class="kpi-waterfall-container">
            <canvas id="kpi-percall-waterfall"></canvas>
          </div>
        </div>
      </div>

      <!-- Voice Cost Breakdown -->
      <div class="analytics-section">
        <h2>Voice Cost Breakdown</h2>
        <div class="kpi-chart-row">
          <div class="analytics-panel">
            <table class="kpi-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Quantity</th>
                  <th>Vendor Cost</th>
                  <th>Retail Revenue</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                ${data.voiceBreakdown.map(row => {
                  const marginClass = row.margin >= 50 ? 'kpi-margin-good' : row.margin >= 0 ? 'kpi-margin-ok' : 'kpi-margin-bad';
                  return `
                    <tr>
                      <td>${row.component}</td>
                      <td>${row.quantity.toFixed(1)} ${row.unit}</td>
                      <td class="kpi-cost">$${row.vendorCost.toFixed(2)}</td>
                      <td>${row.retailRevenue > 0 ? '$' + row.retailRevenue.toFixed(2) : '<span class="kpi-bundled">bundled</span>'}</td>
                      <td class="${marginClass}">${row.retailRevenue > 0 ? row.margin.toFixed(1) + '%' : '—'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="kpi-donut-container">
            <div class="kpi-donut-wrap">
              <canvas id="kpi-vendor-donut"></canvas>
              <div class="kpi-donut-center">
                <div class="kpi-donut-total">$${s.totalVendorCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                <div class="kpi-donut-total-label">Total Vendor Cost</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SMS Economics -->
      <div class="analytics-section">
        <h2>SMS Economics</h2>
        <div class="analytics-panel">
          <table class="kpi-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Quantity</th>
                <th>Vendor Cost</th>
                <th>Retail Revenue</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              ${data.smsBreakdown.map(row => {
                const marginClass = row.margin >= 50 ? 'kpi-margin-good' : row.margin >= 0 ? 'kpi-margin-ok' : 'kpi-margin-bad';
                return `
                  <tr>
                    <td>${row.component}</td>
                    <td>${row.quantity.toLocaleString()} ${row.unit}</td>
                    <td class="kpi-cost">$${row.vendorCost.toFixed(2)}</td>
                    <td>${row.retailRevenue > 0 ? '$' + row.retailRevenue.toFixed(2) : '<span class="kpi-bundled">bundled</span>'}</td>
                    <td class="${marginClass}">${row.retailRevenue > 0 ? row.margin.toFixed(1) + '%' : '—'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Vendor Rate Card -->
      <div class="analytics-section">
        <h2>Vendor Rate Card</h2>
        ${data.rateCard ? `
        <div class="analytics-grid analytics-grid-2">
          <div class="analytics-panel">
            <h3>Voice — Per-Component Pricing</h3>
            <table class="kpi-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Retail</th>
                  <th>Vendor Cost</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                ${(data.rateCard.voice.retailComponents || []).map(row => `
                  <tr>
                    <td>${row.component}</td>
                    <td>${row.retailRate > 0 ? '$' + row.retailRate.toFixed(4) : '—'}</td>
                    <td class="kpi-cost">$${row.vendorRate.toFixed(4)}</td>
                    <td>${row.retailRate > 0 ? ((1 - row.vendorRate / row.retailRate) * 100).toFixed(0) + '%' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <h4 style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.85rem;">LLM Rates</h4>
            <table class="kpi-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Retail/min</th>
                  <th>Vendor/min</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                ${(data.rateCard.voice.llmRates || []).map(row => `
                  <tr>
                    <td>${row.model}</td>
                    <td>$${row.retailRate.toFixed(4)}</td>
                    <td class="kpi-cost">$${row.vendorRate.toFixed(4)}</td>
                    <td>${((1 - row.vendorRate / row.retailRate) * 100).toFixed(0)}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="analytics-panel">
            <h3>SMS — $${data.rateCard.sms.retailRate.toFixed(3)}/msg</h3>
            <table class="kpi-table">
              <thead>
                <tr>
                  <th>Vendor Component</th>
                  <th>Cost${data.rateCard.sms.vendorComponents[0]?.unit || ''}</th>
                </tr>
              </thead>
              <tbody>
                ${data.rateCard.sms.vendorComponents.map(row => `
                  <tr>
                    <td>${row.component}</td>
                    <td class="kpi-cost">$${row.rate.toFixed(4)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}
      </div>

    `;
    container.appendChild(content);

    // Render KPI sparklines — pick granularity based on filter
    const sparkData = this.getKpiSparklineData();
    if (sparkData.length) {
      this.renderSparkline('sparkline-kpi-revenue', sparkData.map(d => ({ date: d.label, count: d.revenue })), '#6366f1', 'Revenue Trend');
      this.renderSparkline('sparkline-kpi-cost', sparkData.map(d => ({ date: d.label, count: d.cost })), '#ef4444', 'Vendor Cost Trend');
      this.renderSparkline('sparkline-kpi-profit', sparkData.map(d => ({ date: d.label, count: d.profit })), '#10b981', 'Profit Trend');
      this.renderSparkline('sparkline-kpi-margin', sparkData.map(d => ({ date: d.label, count: d.revenue > 0 ? ((d.profit / d.revenue) * 100) : 0 })), '#f59e0b', 'Margin % Trend');

      // P&L sparklines — same usage data since P&L includes usage + MRR
      this.renderSparkline('sparkline-kpi-pl-revenue', sparkData.map(d => ({ date: d.label, count: d.revenue })), '#6366f1', 'P&L Revenue Trend');
      this.renderSparkline('sparkline-kpi-pl-profit', sparkData.map(d => ({ date: d.label, count: d.profit })), '#10b981', 'P&L Profit Trend');
      this.renderSparkline('sparkline-kpi-pl-margin', sparkData.map(d => ({ date: d.label, count: d.revenue > 0 ? ((d.profit / d.revenue) * 100) : 0 })), '#f59e0b', 'P&L Margin Trend');
    }

    // MRR sparkline — use dedicated MRR trend data
    const mrrSparkData = this.getMrrSparklineData();
    if (mrrSparkData.length) {
      this.renderSparkline('sparkline-kpi-mrr', mrrSparkData, '#6366f1', 'MRR Trend');
    }

    this.attachSparklineListeners();
  }

  // Return sparkline data at the right granularity for the active filter
  getKpiSparklineData() {
    const data = this.kpiData;
    if (!data) return [];
    const filter = this.kpiDateFilter || 'all';

    if (filter === 'today' && data.hourlyTrend?.length) {
      // Hourly — pad all 24 hours of today
      const today = new Date().toISOString().substring(0, 10);
      const lookup = {};
      data.hourlyTrend.forEach(h => { lookup[h.hour] = h; });
      const result = [];
      for (let i = 0; i < 24; i++) {
        const key = `${today}T${String(i).padStart(2, '0')}`;
        const h = lookup[key] || { revenue: 0, cost: 0, profit: 0 };
        result.push({ label: `${today}T${String(i).padStart(2, '0')}:00`, revenue: h.revenue, cost: h.cost, profit: h.profit });
      }
      return result;
    }

    if (filter === '7d' || filter === '30d' || filter === 'month' || filter === 'custom') {
      // Daily — pad every day in the range
      const lookup = {};
      (data.dailyTrend || []).forEach(d => { lookup[d.date] = d; });
      let numDays;
      if (filter === '7d') numDays = 7;
      else if (filter === '30d') numDays = 30;
      else if (filter === 'month') {
        const now = new Date();
        numDays = now.getDate(); // days elapsed this month
      } else if (filter === 'custom' && this.kpiCustomDate) {
        numDays = Math.ceil((Date.now() - new Date(this.kpiCustomDate + 'T00:00:00').getTime()) / 86400000);
      } else {
        numDays = 30;
      }
      const result = [];
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().substring(0, 10);
        const entry = lookup[key] || { revenue: 0, cost: 0, profit: 0 };
        result.push({ label: key, revenue: entry.revenue, cost: entry.cost, profit: entry.profit });
      }
      return result;
    }

    // All time — monthly, padded to last 6 months
    if (data.monthlyTrend?.length) {
      const lookup = {};
      data.monthlyTrend.forEach(m => { lookup[m.month] = m; });
      const result = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const m = lookup[key] || { revenue: 0, cost: 0, profit: 0 };
        result.push({ label: key + '-01', revenue: m.revenue, cost: m.cost, profit: m.profit });
      }
      return result;
    }

    return [];
  }

  getMrrSparklineData() {
    const data = this.kpiData;
    if (!data) return [];
    const filter = this.kpiDateFilter || 'all';

    if (filter === 'today') {
      // MRR doesn't change hourly — return empty for today filter
      return [];
    }

    if (filter === '7d' || filter === '30d' || filter === 'month' || filter === 'custom') {
      const lookup = {};
      (data.mrrDailyTrend || []).forEach(d => { lookup[d.date] = d; });
      let numDays;
      if (filter === '7d') numDays = 7;
      else if (filter === '30d') numDays = 30;
      else if (filter === 'month') numDays = new Date().getDate();
      else if (filter === 'custom' && this.kpiCustomDate) numDays = Math.ceil((Date.now() - new Date(this.kpiCustomDate + 'T00:00:00').getTime()) / 86400000);
      else numDays = 30;
      const result = [];
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().substring(0, 10);
        const entry = lookup[key] || { revenue: 0 };
        result.push({ date: key, count: entry.revenue });
      }
      return result;
    }

    // All time — monthly, padded to last 6 months
    const lookup = {};
    (data.mrrMonthlyTrend || []).forEach(m => { lookup[m.month] = m; });
    const result = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = lookup[key] || { revenue: 0 };
      result.push({ date: key + '-01', count: m.revenue });
    }
    return result;
  }

  renderVendorDonut() {
    const data = this.kpiData;
    if (!data?.voiceBreakdown?.length) return;

    const canvas = document.getElementById('kpi-vendor-donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (this.charts.kpiVendorDonut) this.charts.kpiVendorDonut.destroy();

    const colors = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
    const items = data.voiceBreakdown.filter(r => r.vendorCost > 0);

    this.charts.kpiVendorDonut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: items.map(r => r.component),
        datasets: [{
          data: items.map(r => r.vendorCost),
          backgroundColor: items.map((_, i) => colors[i % colors.length]),
          borderWidth: 2,
          borderColor: getComputedStyle(document.body).getPropertyValue('--bg-primary').trim() || '#1e293b',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#e2e8f0',
              boxWidth: 10,
              padding: 8,
              font: { size: 11 },
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const val = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((val / total) * 100).toFixed(1);
                return `${context.label}: $${val.toFixed(2)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  renderPerCallWaterfall() {
    const data = this.kpiData;
    if (!data?.voiceBreakdown?.length || !data?.perCall) return;

    const canvas = document.getElementById('kpi-percall-waterfall');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (this.charts.kpiWaterfall) this.charts.kpiWaterfall.destroy();

    const totalMin = data.perCall.totalMinutes || 1;
    const revenuePerMin = data.perCall.avgRevenuePerMin;
    const costItems = data.voiceBreakdown
      .filter(r => r.vendorCost > 0)
      .map(r => ({ label: r.component, value: r.vendorCost / totalMin }));
    const totalCostPerMin = costItems.reduce((s, c) => s + c.value, 0);
    const profitPerMin = revenuePerMin - totalCostPerMin;

    const colors = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#94a3b8';

    this.charts.kpiWaterfall = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Revenue/Min', ...costItems.map(c => c.label), 'Profit/Min'],
        datasets: [{
          data: [revenuePerMin, ...costItems.map(c => c.value), Math.max(0, profitPerMin)],
          backgroundColor: [
            'rgba(99, 102, 241, 0.8)',
            ...costItems.map((_, i) => {
              const baseColors = ['rgba(239, 68, 68, 0.7)', 'rgba(245, 158, 11, 0.7)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.7)', 'rgba(6, 182, 212, 0.7)'];
              return baseColors[i % baseColors.length];
            }),
            profitPerMin >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)',
          ],
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `$${context.parsed.x.toFixed(4)}/min`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            ticks: { color: textColor, callback: (v) => '$' + v.toFixed(3) }
          },
          y: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } }
          }
        }
      }
    });
  }

  renderKpiChart() {
    const trend = this.getKpiSparklineData();
    if (!trend.length) return;

    const canvas = document.getElementById('kpi-trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destroy existing chart if any
    if (this.charts.kpiTrend) {
      this.charts.kpiTrend.destroy();
    }

    const filter = this.kpiDateFilter || 'all';
    const labels = trend.map(d => {
      if (filter === 'today') {
        // Hourly: show "12pm", "1pm" etc.
        const h = parseInt(d.label.substring(11, 13));
        return h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm';
      }
      if (filter === 'all') {
        // Monthly
        return new Date(d.label).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
      // Daily
      return new Date(d.label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    this.charts.kpiTrend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: trend.map(m => m.revenue),
            backgroundColor: 'rgba(99, 102, 241, 0.7)',
            borderRadius: 4,
          },
          {
            label: 'Vendor Cost',
            data: trend.map(m => m.cost),
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderRadius: 4,
          },
          {
            label: 'Profit',
            data: trend.map(m => m.profit),
            type: 'line',
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
          },
          {
            label: 'Margin %',
            data: trend.map(m => m.revenue > 0 ? ((m.profit / m.revenue) * 100) : 0),
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderDash: [5, 3],
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b',
            yAxisID: 'yMargin',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#e2e8f0',
              boxWidth: 12,
              padding: 16,
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                if (context.dataset.yAxisID === 'yMargin') {
                  return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                }
                return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#94a3b8' }
          },
          y: {
            grid: {
              color: (context) => context.tick.value === 0 ? (getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#94a3b8') : 'rgba(148, 163, 184, 0.1)',
              borderDash: (context) => context.tick.value === 0 ? [4, 4] : [],
            },
            ticks: {
              color: getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || '#94a3b8',
              callback: (value) => '$' + value
            }
          },
          yMargin: {
            position: 'right',
            grid: { display: false },
            ticks: {
              color: '#f59e0b',
              callback: (value) => value + '%'
            },
            min: 0,
            max: 100,
          }
        }
      }
    });
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

  // ── Support Tab ────────────────────────────────────────────────

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── End Support Tab ───────────────────────────────────────────

  // ── Notifications Tab ──────────────────────────────────────────

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
  }

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
  }

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
  }

  // ── End Notifications Tab ──────────────────────────────────────

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
      ${AdminHeader.getStyles()}

      .admin-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--bg-secondary);
      }

      /* Admin Reminders */
      .admin-reminder {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.5rem;
        font-size: 0.85rem;
        border-bottom: 1px solid var(--border-color);
      }
      .admin-reminder-warning {
        background: #fef3c7;
        color: #92400e;
        border-bottom-color: #f59e0b;
      }
      .admin-reminder-content {
        flex: 1;
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .admin-reminder-content strong {
        white-space: nowrap;
      }
      .admin-reminder-dismiss {
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        padding: 4px;
        flex-shrink: 0;
      }
      .admin-reminder-dismiss:hover { opacity: 1; }

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

      .analytics-card-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
        opacity: 0.7;
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
        height: 500px;
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

      .signups-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid var(--border-color);
        font-size: 0.8rem;
      }

      .signups-table-wrapper + .signups-pagination {
        border-bottom: none;
        border-top: 1px solid var(--border-color);
      }

      .signups-pagination-info {
        color: var(--text-muted);
      }

      .signups-pagination-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .signups-per-page {
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.8rem;
        cursor: pointer;
      }

      .signups-page-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        cursor: pointer;
      }

      .signups-page-btn:hover:not(:disabled) {
        background: var(--bg-secondary);
      }

      .signups-page-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .signups-page-num {
        font-size: 0.8rem;
        color: var(--text-muted);
        min-width: 3rem;
        text-align: center;
      }

      /* KPI Filter Bar */
      .kpi-filter-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .kpi-filter-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        font-weight: 500;
      }

      .kpi-filter-buttons {
        display: flex;
        gap: 0.25rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.25rem;
      }

      .kpi-filter-btn {
        padding: 0.375rem 0.75rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.15s;
      }

      .kpi-filter-btn:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }

      .kpi-filter-btn.active {
        background: var(--primary-color);
        color: white;
      }

      .kpi-date-input {
        padding: 0.375rem 0.5rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }

      .kpi-date-input:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }

      .kpi-date-input.active {
        background: var(--primary-color);
        color: white;
      }

      /* KPI Table Styles */
      .kpi-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .kpi-table th {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 2px solid var(--border-color);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .kpi-table td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
      }

      .kpi-table tr:last-child td {
        border-bottom: none;
      }

      .kpi-table tr:hover td {
        background: var(--bg-secondary);
      }

      .kpi-cost {
        color: #ef4444;
      }

      .kpi-bundled {
        color: var(--text-muted);
        font-style: italic;
        font-size: 0.8rem;
      }

      .kpi-margin-good {
        color: #10b981;
        font-weight: 600;
      }

      .kpi-margin-ok {
        color: #f59e0b;
        font-weight: 600;
      }

      .kpi-margin-bad {
        color: #ef4444;
        font-weight: 600;
      }

      .kpi-pl-table td:not(:first-child),
      .kpi-pl-table th:not(:first-child) {
        text-align: right;
        min-width: 90px;
      }
      .kpi-pl-sub {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 400;
        margin-top: 2px;
      }
      .kpi-pl-subtotal td {
        border-top: 2px solid var(--border-color);
        font-style: italic;
      }
      .kpi-pl-total td {
        border-top: 3px double var(--border-color);
        font-size: 1.05em;
      }
      .kpi-pl-note {
        margin-top: 0.75rem;
        padding: 0.625rem 1rem;
        background: #fef3c7;
        color: #92400e;
        border-radius: 0.5rem;
        font-size: 0.85rem;
      }

      /* KPI Chart Layouts */
      .kpi-chart-row {
        display: flex;
        gap: 1.5rem;
        align-items: flex-start;
      }
      .kpi-chart-row .analytics-panel {
        flex: 1;
        min-width: 0;
      }
      .kpi-chart-row .kpi-donut-container {
        flex: 0 0 280px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .kpi-donut-wrap {
        position: relative;
        width: 260px;
        height: 260px;
      }
      .kpi-donut-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }
      .kpi-donut-total {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      .kpi-donut-total-label {
        font-size: 0.7rem;
        color: var(--text-muted);
      }
      .kpi-waterfall-container {
        height: 200px;
        margin-top: 1rem;
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

        .kpi-chart-row {
          flex-direction: column;
        }
        .kpi-chart-row .kpi-donut-container {
          flex: none;
          width: 100%;
        }
        .kpi-waterfall-container {
          height: 160px;
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

        .kpi-table {
          font-size: 0.75rem;
        }

        .kpi-table th,
        .kpi-table td {
          padding: 0.5rem 0.375rem;
        }
      }

      /* ── Support Tab ── */
      .support-tab {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        max-width: 900px;
      }

      .support-subtabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 1.5rem;
      }

      .support-subtab {
        padding: 0.625rem 1.25rem;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .support-subtab:hover {
        color: var(--text-primary);
      }

      .support-subtab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .support-section {
        margin-bottom: 1.5rem;
      }

      .support-section h3 {
        margin: 0 0 0.75rem 0;
        font-size: 1.1rem;
      }

      .support-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
      }

      .support-filter-bar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }

      .support-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .support-table th {
        text-align: left;
        padding: 0.625rem 0.75rem;
        border-bottom: 2px solid var(--border-color);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .support-table td {
        padding: 0.625rem 0.75rem;
        border-bottom: 1px solid var(--border-color);
      }

      .ticket-row {
        cursor: pointer;
        transition: background 0.15s;
      }

      .ticket-row:hover {
        background: var(--bg-secondary);
      }

      .ticket-status-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .ticket-status-open {
        background: #dbeafe;
        color: #1e40af;
      }

      .ticket-status-closed {
        background: #f3f4f6;
        color: #6b7280;
      }

      .ticket-status-archived {
        background: #fef3c7;
        color: #92400e;
      }

      .ai-draft-indicator {
        display: inline-block;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
        background: #ede9fe;
        color: #7c3aed;
      }

      /* Priority Badges */
      .priority-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
      }
      .priority-low { background: #f3f4f6; color: #6b7280; }
      .priority-medium { background: #dbeafe; color: #1e40af; }
      .priority-high { background: #ffedd5; color: #c2410c; }
      .priority-urgent { background: #fee2e2; color: #dc2626; }

      /* Tag Pills */
      .tag-pill {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 500;
        background: #e0e7ff;
        color: #4338ca;
      }

      /* Ticket Meta Bar (Submitted By / Ref) */
      .ticket-meta-bar {
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
        padding: 0.5rem 0;
        margin-bottom: 0.75rem;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      .ticket-meta-item strong {
        color: var(--text-primary);
        font-weight: 500;
      }

      /* Ticket Detail Fields */
      .ticket-detail-fields {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      .ticket-detail-row {
        display: flex;
        gap: 0.75rem;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .ticket-detail-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 120px;
        flex: 1;
      }
      .ticket-detail-field label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .ticket-detail-field .form-input {
        font-size: 0.85rem;
        padding: 0.35rem 0.5rem;
      }

      /* Internal Notes */
      .ticket-notes-section {
        margin-bottom: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }
      .ticket-note {
        background: #fefce8;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .ticket-note-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.25rem;
        font-size: 0.8rem;
      }
      .ticket-note-header span {
        color: var(--text-muted);
        font-size: 0.75rem;
      }
      .ticket-note-body {
        font-size: 0.85rem;
        line-height: 1.4;
      }
      .ticket-note-input {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .ticket-note-input textarea {
        resize: vertical;
        min-height: 50px;
        font-size: 0.85rem;
      }

      /* New Ticket Form */
      .new-ticket-form {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1rem;
      }

      /* Thread View */
      .thread-view {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        max-width: 900px;
      }

      .thread-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);
      }

      .thread-back-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-shrink: 0;
      }

      .thread-messages {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .thread-message {
        padding: 1rem;
        border-radius: 10px;
        border: 1px solid var(--border-color);
      }

      .thread-message-inbound {
        background: var(--bg-secondary);
      }

      .thread-message-outbound {
        background: #f5f3ff;
        border-color: #c4b5fd;
      }

      .thread-message-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5rem;
      }

      .thread-message-body {
        font-size: 0.9rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* AI Draft Card */
      .ai-draft-card {
        background: #faf5ff;
        border: 2px solid #c4b5fd;
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1.5rem;
      }

      .ai-draft-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        color: #7c3aed;
        margin-bottom: 0.75rem;
      }

      .ai-draft-body {
        font-size: 0.9rem;
        line-height: 1.5;
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: white;
        border-radius: 6px;
        border: 1px solid #e9d5ff;
      }

      .ai-draft-actions {
        display: flex;
        gap: 0.5rem;
      }

      /* Reply Area */
      .reply-area {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .reply-area textarea {
        resize: vertical;
        min-height: 80px;
      }

      .reply-area .btn {
        align-self: flex-end;
      }

      @media (max-width: 768px) {
        .support-tab,
        .thread-view {
          padding: 1rem;
        }

        .support-table {
          font-size: 0.8rem;
        }

        .support-table th,
        .support-table td {
          padding: 0.5rem;
        }

        .thread-header {
          flex-wrap: wrap;
        }

        .support-filter-bar {
          flex-wrap: wrap;
        }

        .ticket-detail-row {
          flex-direction: column;
        }

        .ticket-detail-field {
          min-width: 100%;
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

      showToast(data.message || 'User updated successfully', 'success');
    } catch (error) {
      console.error('Error updating user:', error);
      showToast('Error: ' + error.message, 'error');
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
      showToast('Error: ' + error.message, 'error');
    }
  }
}
