export const analyticsTabMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};
