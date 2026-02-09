/**
 * Analytics Page
 * Shows organization-wide analytics for calls, messages, and usage
 */

import { supabase, getCurrentUser } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

export default class AnalyticsPage {
  constructor() {
    this.analyticsData = null;
    this.currentPage = 1;
    this.recordsPerPage = 50;
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
          <div class="page-header-content">
            <h1>Analytics</h1>
            <button class="btn btn-secondary export-csv-btn" id="export-csv-btn" disabled>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Export CSV
            </button>
          </div>
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

        .analytics-page .page-header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .analytics-page .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
        }

        .export-csv-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          white-space: nowrap;
        }

        .export-csv-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        /* Call Records Table */
        .call-records-panel {
          padding: 0;
          overflow: hidden;
        }

        .call-records-table-wrapper {
          overflow-x: auto;
        }

        .call-records-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .call-records-table th,
        .call-records-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          white-space: nowrap;
        }

        .call-records-table th {
          background: var(--bg-secondary);
          font-weight: 600;
          color: var(--text-secondary);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }

        .call-records-table td {
          border-bottom: 1px solid var(--border-color);
        }

        .call-records-table tbody tr:hover {
          background: var(--bg-secondary);
        }

        .call-records-table tbody tr:last-child td {
          border-bottom: none;
        }

        .direction-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .direction-badge.inbound {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success-color);
        }

        .direction-badge.outbound {
          background: rgba(99, 102, 241, 0.1);
          color: var(--primary-color);
        }

        .sentiment-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .sentiment-badge.positive {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success-color);
        }

        .sentiment-badge.neutral {
          background: rgba(107, 114, 128, 0.1);
          color: var(--text-secondary);
        }

        .sentiment-badge.negative {
          background: rgba(239, 68, 68, 0.1);
          color: var(--error-color);
        }

        .type-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .type-badge.phone {
          background: rgba(99, 102, 241, 0.1);
          color: var(--primary-color);
        }

        .type-badge.sms {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success-color);
        }

        .type-badge.web {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
        }

        .pagination-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-top: 1px solid var(--border-color);
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .pagination-info {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .pagination-btn {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: var(--bg-primary);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .pagination-btn:hover:not(:disabled) {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-pages {
          font-size: 0.875rem;
          color: var(--text-secondary);
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

        /* Export Modal */
        .export-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .export-modal {
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          max-width: 400px;
          width: 100%;
          box-shadow: var(--shadow-lg);
        }

        .export-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
        }

        .export-modal-header h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .export-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          color: var(--text-secondary);
        }

        .export-modal-close:hover {
          color: var(--text-primary);
        }

        .export-modal-body {
          padding: 1.25rem;
        }

        .export-modal-section {
          margin-bottom: 1.25rem;
        }

        .export-modal-section:last-child {
          margin-bottom: 0;
        }

        .export-modal-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
          display: block;
        }

        .date-range-options {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .date-range-option {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.15s;
        }

        .date-range-option:hover {
          border-color: var(--primary-color);
          background: var(--bg-secondary);
        }

        .date-range-option.selected {
          border-color: var(--primary-color);
          background: rgba(99, 102, 241, 0.1);
        }

        .date-range-option input[type="radio"] {
          margin: 0;
        }

        .date-range-option-label {
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .custom-date-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-color);
        }

        .custom-date-inputs.hidden {
          display: none;
        }

        .date-input-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .date-input-group label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .date-input-group input {
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
        }

        .export-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          border-top: 1px solid var(--border-color);
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
      this.currentPage = 1; // Reset to first page on data load
      this.renderAnalyticsContent();

      // Attach pagination listeners
      this.attachPaginationListeners();

      // Load Chart.js if not already loaded
      if (!window.Chart) {
        await this.loadChartJs();
      }
      this.renderCharts();

      // Enable export button
      const exportBtn = document.getElementById('export-csv-btn');
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.addEventListener('click', () => this.showExportModal());
      }

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

      <!-- Session Records Table -->
      ${data.callRecords && data.callRecords.length > 0 ? `
        <div class="analytics-section">
          <h2>Session Records</h2>
          <div class="analytics-panel call-records-panel">
            <div class="call-records-table-wrapper">
              <table class="call-records-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Time</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Direction</th>
                    <th>Assistant</th>
                    <th>Duration</th>
                    <th>End</th>
                    <th>Feel</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody id="session-records-body">
                  ${this.renderSessionRecords(data.callRecords)}
                </tbody>
              </table>
            </div>
            ${this.renderPagination(data.callRecords.length)}
          </div>
        </div>
      ` : ''}

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

  formatDisposition(disposition) {
    const dispositionMap = {
      'user_hung_up': 'User hung up',
      'agent_hung_up': 'Agent hung up',
      'completed': 'Completed',
      'failed': 'Failed',
      'no_answer': 'No answer',
      'busy': 'Busy',
      'voicemail': 'Voicemail',
      'transferred': 'Transferred',
      'answered_by_pat': 'Answered'
    };
    return dispositionMap[disposition?.toLowerCase()] || disposition || 'Unknown';
  }

  formatCost(cost) {
    const num = parseFloat(cost) || 0;
    if (num === 0) return '0.00';
    // Show 4 decimal places for small amounts, 2 for larger
    if (num < 0.01) {
      return num.toFixed(4);
    }
    return num.toFixed(2);
  }

  renderSessionRecords(records) {
    const startIndex = (this.currentPage - 1) * this.recordsPerPage;
    const endIndex = startIndex + this.recordsPerPage;
    const pageRecords = records.slice(startIndex, endIndex);

    return pageRecords.map(record => `
      <tr>
        <td><span class="type-badge ${(record.type || 'phone').toLowerCase()}">${record.type || 'Phone'}</span></td>
        <td>${new Date(record.time).toLocaleString()}</td>
        <td>${record.from || '-'}</td>
        <td>${record.to || '-'}</td>
        <td><span class="direction-badge ${record.direction?.toLowerCase()}">${record.direction || '-'}</span></td>
        <td>${record.assistant || '-'}</td>
        <td>${record.duration} min</td>
        <td>${this.formatDisposition(record.end)}</td>
        <td><span class="sentiment-badge ${record.sentiment?.toLowerCase()}">${record.sentiment || '-'}</span></td>
        <td>$${this.formatCost(record.cost)}</td>
      </tr>
    `).join('');
  }

  renderPagination(totalRecords) {
    const totalPages = Math.ceil(totalRecords / this.recordsPerPage);
    if (totalPages <= 1) return '';

    const startRecord = (this.currentPage - 1) * this.recordsPerPage + 1;
    const endRecord = Math.min(this.currentPage * this.recordsPerPage, totalRecords);

    return `
      <div class="pagination-container">
        <div class="pagination-info">
          Showing ${startRecord}-${endRecord} of ${totalRecords} records
        </div>
        <div class="pagination-controls">
          <button class="pagination-btn" id="prev-page" ${this.currentPage === 1 ? 'disabled' : ''}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Previous
          </button>
          <span class="pagination-pages">Page ${this.currentPage} of ${totalPages}</span>
          <button class="pagination-btn" id="next-page" ${this.currentPage === totalPages ? 'disabled' : ''}>
            Next
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  attachPaginationListeners() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.updateSessionRecordsTable();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.analyticsData.callRecords.length / this.recordsPerPage);
        if (this.currentPage < totalPages) {
          this.currentPage++;
          this.updateSessionRecordsTable();
        }
      });
    }
  }

  updateSessionRecordsTable() {
    const tbody = document.getElementById('session-records-body');
    if (tbody && this.analyticsData?.callRecords) {
      tbody.innerHTML = this.renderSessionRecords(this.analyticsData.callRecords);
    }

    // Update pagination
    const paginationContainer = document.querySelector('.pagination-container');
    if (paginationContainer && this.analyticsData?.callRecords) {
      paginationContainer.outerHTML = this.renderPagination(this.analyticsData.callRecords.length);
      this.attachPaginationListeners();
    }
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

  showExportModal() {
    // Create modal HTML
    const modalHtml = `
      <div class="export-modal-backdrop" id="export-modal-backdrop">
        <div class="export-modal">
          <div class="export-modal-header">
            <h3>Export Analytics</h3>
            <button class="export-modal-close" id="export-modal-close">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="export-modal-body">
            <div class="export-modal-section">
              <span class="export-modal-label">Date Range</span>
              <div class="date-range-options">
                <label class="date-range-option selected" data-range="7">
                  <input type="radio" name="date-range" value="7" checked>
                  <span class="date-range-option-label">Last 7 days</span>
                </label>
                <label class="date-range-option" data-range="30">
                  <input type="radio" name="date-range" value="30">
                  <span class="date-range-option-label">Last 30 days</span>
                </label>
                <label class="date-range-option" data-range="90">
                  <input type="radio" name="date-range" value="90">
                  <span class="date-range-option-label">Last 90 days</span>
                </label>
                <label class="date-range-option" data-range="all">
                  <input type="radio" name="date-range" value="all">
                  <span class="date-range-option-label">All time</span>
                </label>
                <label class="date-range-option" data-range="custom">
                  <input type="radio" name="date-range" value="custom">
                  <span class="date-range-option-label">Custom range</span>
                </label>
              </div>
              <div class="custom-date-inputs hidden" id="custom-date-inputs">
                <div class="date-input-group">
                  <label>Start Date</label>
                  <input type="date" id="export-start-date">
                </div>
                <div class="date-input-group">
                  <label>End Date</label>
                  <input type="date" id="export-end-date">
                </div>
              </div>
            </div>
          </div>
          <div class="export-modal-footer">
            <button class="btn btn-secondary" id="export-modal-cancel">Cancel</button>
            <button class="btn btn-primary" id="export-modal-download">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Download CSV
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Set default dates for custom range
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    document.getElementById('export-end-date').value = today.toISOString().split('T')[0];
    document.getElementById('export-start-date').value = sevenDaysAgo.toISOString().split('T')[0];

    // Attach event listeners
    const backdrop = document.getElementById('export-modal-backdrop');
    const closeModal = () => backdrop.remove();

    document.getElementById('export-modal-close').addEventListener('click', closeModal);
    document.getElementById('export-modal-cancel').addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Handle radio button changes
    const radioButtons = document.querySelectorAll('input[name="date-range"]');
    const customInputs = document.getElementById('custom-date-inputs');
    const options = document.querySelectorAll('.date-range-option');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', (e) => {
        options.forEach(opt => opt.classList.remove('selected'));
        e.target.closest('.date-range-option').classList.add('selected');

        if (e.target.value === 'custom') {
          customInputs.classList.remove('hidden');
        } else {
          customInputs.classList.add('hidden');
        }
      });
    });

    // Handle download
    document.getElementById('export-modal-download').addEventListener('click', async () => {
      const selectedRange = document.querySelector('input[name="date-range"]:checked').value;

      let startDate, endDate;
      const now = new Date();
      endDate = new Date(now);

      if (selectedRange === 'custom') {
        startDate = new Date(document.getElementById('export-start-date').value);
        endDate = new Date(document.getElementById('export-end-date').value);
      } else if (selectedRange === 'all') {
        startDate = null; // No start date filter
        endDate = null;
      } else {
        const days = parseInt(selectedRange);
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - days);
      }

      closeModal();
      await this.exportCSV(startDate, endDate);
    });
  }

  async exportCSV(startDate, endDate) {
    if (!this.analyticsData) return;

    // Fetch data for the specific date range
    const data = await this.fetchExportData(startDate, endDate);
    if (!data) return;

    const rows = [];

    // Header row matching sample format
    rows.push([
      'Session type',
      'From number',
      'Start time (date)',
      'Agent Name',
      'Agent ID',
      'Duration Minutes',
      'Session ID',
      'Call to Vmail',
      'Call Successful',
      'Summary',
      'Extracted_customer_name',
      'Extracted_customer_address',
      'Extracted_customer_call_reason',
      'Extracted_customer_email',
      'Disconnection Reason',
      'End Time',
      'Recordings_url',
      'Sentiment',
      'unique id'
    ]);

    // Add all sessions (calls, SMS, web chat)
    if (data.allSessions && data.allSessions.length > 0) {
      data.allSessions.forEach(session => {
        rows.push([
          session.sessionType || '',
          session.fromNumber || '',
          this.formatDateTime(session.startTime),
          session.agentName || '',
          session.agentId || '',
          session.durationMinutes || 'Nil',
          session.sessionId || '',
          session.callToVmail || 'Nil',
          session.callSuccessful || 'Nil',
          session.summary || '',
          session.extractedCustomerName || 'Nil',
          session.extractedCustomerAddress || 'Nil',
          session.extractedCustomerCallReason || 'Nil',
          session.extractedCustomerEmail || 'Nil',
          session.disconnectionReason || 'Nil',
          session.endTime && session.endTime !== 'Nil' ? this.formatDateTime(session.endTime) : 'Nil',
          session.recordingsUrl || '',
          session.sentiment || 'Neutral',
          session.uniqueId || ''
        ]);
      });
    }

    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = startDate && endDate
      ? `sessions-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`
      : `sessions-all-time-${new Date().toISOString().split('T')[0]}.csv`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  async fetchExportData(startDate, endDate) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate.toISOString());
      if (endDate) params.append('end_date', endDate.toISOString());

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/org-analytics?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch export data');
      return await response.json();
    } catch (error) {
      console.error('Error fetching export data:', error);
      return null;
    }
  }
}
