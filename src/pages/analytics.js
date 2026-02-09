/**
 * Analytics Page
 * Shows organization-wide analytics for calls, messages, and usage
 */

import { supabase, getCurrentUser } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

export default class AnalyticsPage {
  constructor() {
    this.analyticsData = null;
  }

  async render() {
    const { user } = await getCurrentUser();
    if (!user) {
      navigateTo('/login');
      return;
    }

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="container with-bottom-nav analytics-page">
        <div class="page-header">
          <h1>Analytics</h1>
        </div>
        <div class="analytics-content">
          <div class="analytics-loading">
            <div class="spinner"></div>
            <p>Loading analytics...</p>
          </div>
        </div>
      </div>
      <style>
        .analytics-page {
          padding: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .analytics-page .page-header {
          margin-bottom: 1.5rem;
        }

        .analytics-page .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
        }

        .analytics-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          color: var(--text-secondary);
        }

        .analytics-error {
          text-align: center;
          padding: 2rem;
          color: var(--error-color);
        }

        .analytics-section {
          margin-bottom: 2rem;
        }

        .analytics-section h2 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
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
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
        }

        .analytics-card-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .analytics-card-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .analytics-panel {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
        }

        .analytics-panel h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .analytics-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }

        .analytics-stat {
          display: flex;
          flex-direction: column;
        }

        .analytics-stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .analytics-stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .analytics-breakdown {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
        }

        .breakdown-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .breakdown-value {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .chart-container {
          height: 200px;
          margin-top: 1rem;
        }

        .transactions-list {
          margin-top: 1rem;
        }

        .transaction-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        }

        .transaction-item:last-child {
          border-bottom: none;
        }

        .transaction-desc {
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .transaction-date {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .transaction-amount {
          font-size: 0.875rem;
          font-weight: 600;
        }

        .transaction-amount.positive {
          color: var(--success-color);
        }

        .transaction-amount.negative {
          color: var(--error-color);
        }

        @media (max-width: 768px) {
          .analytics-page {
            padding: 1rem;
          }

          .analytics-grid-4,
          .analytics-grid-3 {
            grid-template-columns: repeat(2, 1fr);
          }

          .analytics-grid-2 {
            grid-template-columns: 1fr;
          }

          .analytics-card-value {
            font-size: 1.5rem;
          }
        }
      </style>
    `;

    // Render bottom nav
    renderBottomNav('/analytics');
    attachBottomNav('/analytics');

    // Store reference for data loading
    this.container = appElement.querySelector('.analytics-page');
    window.analyticsPage = this;

    await this.loadAnalyticsData();
  }

  async loadAnalyticsData() {
    const contentContainer = document.querySelector('.analytics-content');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/org-analytics`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }

      this.analyticsData = await response.json();
      this.renderAnalyticsContent();

      // Load Chart.js if not already loaded
      if (!window.Chart) {
        await this.loadChartJs();
      }
      this.renderCharts();

    } catch (error) {
      console.error('Error loading analytics:', error);
      contentContainer.innerHTML = `
        <div class="analytics-error">
          <p>Failed to load analytics: ${error.message}</p>
          <button class="btn btn-primary" onclick="window.analyticsPage.loadAnalyticsData()">Retry</button>
        </div>
      `;
    }
  }

  async loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  renderAnalyticsContent() {
    const contentContainer = document.querySelector('.analytics-content');
    const data = this.analyticsData;

    contentContainer.innerHTML = `
      <!-- Overview Cards -->
      <div class="analytics-section">
        <h2>Overview</h2>
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-value">${data.calls.total.toLocaleString()}</div>
            <div class="analytics-card-label">Total Calls</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value">${data.messages.total.toLocaleString()}</div>
            <div class="analytics-card-label">Total Messages</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value">$${data.credits.balance}</div>
            <div class="analytics-card-label">Credit Balance</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value">$${data.credits.spentThisPeriod}</div>
            <div class="analytics-card-label">Spent This Period</div>
          </div>
        </div>
      </div>

      <!-- Calls & Messages -->
      <div class="analytics-section">
        <div class="analytics-grid analytics-grid-2">
          <div class="analytics-panel">
            <h3>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              Calls
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.calls.thisMonth.toLocaleString()}</span>
                <span class="analytics-stat-label">This Month</span>
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
                <span class="analytics-stat-value">${data.calls.minutesThisMonth}</span>
                <span class="analytics-stat-label">Minutes This Month</span>
              </div>
            </div>
            <div class="analytics-breakdown">
              <div class="breakdown-row">
                <span class="breakdown-label">Inbound</span>
                <span class="breakdown-value">${data.calls.inbound.toLocaleString()}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Outbound</span>
                <span class="breakdown-value">${data.calls.outbound.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div class="analytics-panel">
            <h3>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              Messages
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.messages.thisMonth.toLocaleString()}</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value">${data.messages.deliveryRate}%</span>
                <span class="analytics-stat-label">Delivery Rate</span>
              </div>
            </div>
            <div class="analytics-breakdown">
              <div class="breakdown-row">
                <span class="breakdown-label">Inbound</span>
                <span class="breakdown-value">${data.messages.inbound.toLocaleString()}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Outbound</span>
                <span class="breakdown-value">${data.messages.outbound.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Activity Charts -->
      <div class="analytics-section">
        <h2>Activity (Last 30 Days)</h2>
        <div class="analytics-grid analytics-grid-2">
          <div class="analytics-panel">
            <h3>Calls per Day</h3>
            <div class="chart-container">
              <canvas id="calls-chart"></canvas>
            </div>
          </div>
          <div class="analytics-panel">
            <h3>Messages per Day</h3>
            <div class="chart-container">
              <canvas id="messages-chart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Transactions -->
      ${data.credits.recentTransactions && data.credits.recentTransactions.length > 0 ? `
        <div class="analytics-section">
          <h2>Recent Activity</h2>
          <div class="analytics-panel">
            <div class="transactions-list">
              ${data.credits.recentTransactions.map(t => `
                <div class="transaction-item">
                  <div>
                    <div class="transaction-desc">${t.description || 'Credit transaction'}</div>
                    <div class="transaction-date">${new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                  <div class="transaction-amount ${parseFloat(t.amount) >= 0 ? 'positive' : 'negative'}">
                    ${parseFloat(t.amount) >= 0 ? '+' : '-'}$${this.formatAmount(t.amount)}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  formatAmount(amount) {
    const absAmount = Math.abs(parseFloat(amount));
    // Show up to 4 decimal places for small amounts, 2 for larger
    if (absAmount < 0.01 && absAmount > 0) {
      return absAmount.toFixed(4).replace(/\.?0+$/, '');
    }
    return absAmount.toFixed(2);
  }

  renderCharts() {
    if (!window.Chart || !this.analyticsData) return;

    const data = this.analyticsData;

    // Generate last 30 days labels
    const labels = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().split('T')[0]);
    }

    // Map data to labels
    const callsMap = new Map((data.timeSeries.calls || []).map(d => [d.date, d.count]));
    const messagesMap = new Map((data.timeSeries.messages || []).map(d => [d.date, d.count]));

    const callsData = labels.map(date => callsMap.get(date) || 0);
    const messagesData = labels.map(date => messagesMap.get(date) || 0);

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            maxTicksLimit: 7,
            callback: function(val, index) {
              const date = new Date(labels[index]);
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { stepSize: 1 }
        }
      }
    };

    // Calls chart
    const callsCtx = document.getElementById('calls-chart');
    if (callsCtx) {
      new Chart(callsCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: callsData,
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            borderRadius: 4
          }]
        },
        options: chartOptions
      });
    }

    // Messages chart
    const messagesCtx = document.getElementById('messages-chart');
    if (messagesCtx) {
      new Chart(messagesCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: messagesData,
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderRadius: 4
          }]
        },
        options: chartOptions
      });
    }
  }
}
