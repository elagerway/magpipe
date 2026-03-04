export const kpiTabMethods = {
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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },
};
