import { supabase } from '../../lib/supabase.js';

/* global navigateTo */

export const analyticsTabMethods = {
  renderAnalyticsTab() {
    return `
      <div class="config-section agent-analytics">
        <h3>Analytics</h3>
        <p class="section-desc">View performance metrics for this agent.</p>

        <!-- Row 1: Summary Cards -->
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-calls">--</div>
            <div class="analytics-card-label">Total Calls</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-messages">--</div>
            <div class="analytics-card-label">Total Messages</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-duration">--</div>
            <div class="analytics-card-label">Avg. Call Duration</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-success">--</div>
            <div class="analytics-card-label">Success Rate</div>
          </div>
        </div>

        <!-- Row 2: Calls & Messages Panels -->
        <div class="analytics-grid analytics-grid-2" style="margin-top: 1.5rem;">
          <div class="analytics-panel">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              Calls
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-inbound">--</span>
                <span class="analytics-stat-label">Inbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-outbound">--</span>
                <span class="analytics-stat-label">Outbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-month">--</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-minutes">--</span>
                <span class="analytics-stat-label">Total Minutes</span>
              </div>
            </div>
          </div>

          <div class="analytics-panel">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              Messages
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-inbound">--</span>
                <span class="analytics-stat-label">Inbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-outbound">--</span>
                <span class="analytics-stat-label">Outbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-month">--</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-delivery">--</span>
                <span class="analytics-stat-label">Delivery Rate</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Row 3: Call Volume Chart -->
        <div class="analytics-panel" style="margin-top: 1.5rem;">
          <h3>Call Volume (Last 30 Days)</h3>
          <div class="aa-chart-container">
            <canvas id="agent-calls-chart"></canvas>
          </div>
        </div>

        <!-- Row 4: Disposition & Sentiment -->
        <div class="analytics-grid analytics-grid-2" style="margin-top: 1.5rem;">
          <div class="analytics-panel">
            <h3>Disposition</h3>
            <div id="disposition-breakdown" class="aa-breakdown-list">
              <div class="aa-breakdown-empty">Loading...</div>
            </div>
          </div>
          <div class="analytics-panel">
            <h3>Sentiment</h3>
            <div id="sentiment-breakdown" class="aa-breakdown-list">
              <div class="aa-breakdown-empty">Loading...</div>
            </div>
          </div>
        </div>

        <!-- Row 5: Recent Sessions -->
        <div class="analytics-panel aa-recent-calls-panel" style="margin-top: 1.5rem;">
          <h3>Recent Sessions</h3>
          <div id="recent-calls-container">
            <div class="aa-breakdown-empty">Loading...</div>
          </div>
        </div>
      </div>
    `;
  },

  async loadAnalytics() {
    try {
      // Fetch call records and SMS messages in parallel
      const [callsResult, msgsResult] = await Promise.all([
        supabase
          .from('call_records')
          .select('id, direction, duration_seconds, call_successful, status, disposition, user_sentiment, started_at, caller_number, service_number, contact_phone')
          .eq('agent_id', this.agent.id)
          .order('started_at', { ascending: false })
          .limit(500),
        supabase
          .from('sms_messages')
          .select('id, direction, status, sentiment, sent_at, sender_number, recipient_number')
          .eq('agent_id', this.agent.id)
          .order('sent_at', { ascending: false })
          .limit(500)
      ]);

      const calls = callsResult.data || [];
      const messages = msgsResult.data || [];

      // --- Summary Cards ---
      const totalCalls = calls.length;
      const totalMessages = messages.length;

      const durationsWithValues = calls.filter(c => c.duration_seconds && c.duration_seconds > 0);
      const avgDuration = durationsWithValues.length > 0
        ? durationsWithValues.reduce((sum, c) => sum + c.duration_seconds, 0) / durationsWithValues.length
        : 0;

      const successfulCalls = calls.filter(c => c.call_successful === true || (c.status && c.status !== 'failed'));
      const successRate = totalCalls > 0 ? Math.round((successfulCalls.length / totalCalls) * 100) : 0;

      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      setText('stat-calls', totalCalls.toLocaleString());
      setText('stat-messages', totalMessages.toLocaleString());
      setText('stat-duration', this.formatAgentDuration(avgDuration));
      setText('stat-success', totalCalls > 0 ? `${successRate}%` : '--');

      // --- Calls Panel ---
      const callsInbound = calls.filter(c => c.direction === 'inbound').length;
      const callsOutbound = calls.filter(c => c.direction === 'outbound').length;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const callsThisMonth = calls.filter(c => new Date(c.started_at) >= monthStart).length;
      const totalMinutes = Math.round(calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60);

      setText('stat-calls-inbound', callsInbound.toLocaleString());
      setText('stat-calls-outbound', callsOutbound.toLocaleString());
      setText('stat-calls-month', callsThisMonth.toLocaleString());
      setText('stat-calls-minutes', totalMinutes.toLocaleString());

      // --- Messages Panel ---
      const msgsInbound = messages.filter(m => m.direction === 'inbound').length;
      const msgsOutbound = messages.filter(m => m.direction === 'outbound').length;
      const msgsThisMonth = messages.filter(m => new Date(m.sent_at) >= monthStart).length;
      const deliveredMsgs = messages.filter(m => m.status === 'delivered' || m.status === 'sent');
      const deliveryRate = messages.length > 0 ? Math.round((deliveredMsgs.length / messages.length) * 100) : 0;

      setText('stat-msgs-inbound', msgsInbound.toLocaleString());
      setText('stat-msgs-outbound', msgsOutbound.toLocaleString());
      setText('stat-msgs-month', msgsThisMonth.toLocaleString());
      setText('stat-msgs-delivery', messages.length > 0 ? `${deliveryRate}%` : '--');

      // --- Disposition Breakdown ---
      const dispositionCounts = {};
      calls.forEach(c => {
        const d = c.disposition || 'unknown';
        dispositionCounts[d] = (dispositionCounts[d] || 0) + 1;
      });
      this.renderBreakdownBars('disposition-breakdown', dispositionCounts, totalCalls, {
        'answered_by_pat': { label: 'Answered', color: '#10b981' },
        'transferred': { label: 'Transferred', color: '#6366f1' },
        'voicemail': { label: 'Voicemail', color: '#f59e0b' },
        'user_hung_up': { label: 'User Hung Up', color: '#8b5cf6' },
        'agent_hung_up': { label: 'Agent Hung Up', color: '#64748b' },
        'failed': { label: 'Failed', color: '#ef4444' },
        'no_answer': { label: 'No Answer', color: '#94a3b8' },
        'completed': { label: 'Completed', color: '#10b981' },
        'unknown': { label: 'Unknown', color: '#94a3b8' }
      });

      // --- Sentiment Breakdown ---
      const sentimentCounts = {};
      calls.forEach(c => {
        const s = (c.user_sentiment || 'unknown').toLowerCase();
        sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
      });
      this.renderBreakdownBars('sentiment-breakdown', sentimentCounts, totalCalls, {
        'positive': { label: 'Positive', color: '#10b981' },
        'neutral': { label: 'Neutral', color: '#64748b' },
        'negative': { label: 'Negative', color: '#ef4444' },
        'unknown': { label: 'Unknown', color: '#94a3b8' }
      });

      // --- Call Volume Chart ---
      await this.renderAgentCallChart(calls);

      // --- Recent Sessions Table (calls + SMS merged) ---
      const callSessions = calls.slice(0, 50).map(c => ({
        type: 'Phone',
        id: c.id,
        time: c.started_at,
        phone: c.direction === 'inbound' ? (c.caller_number || '--') : (c.contact_phone || '--'),
        direction: c.direction || '--',
        duration: c.duration_seconds ? this.formatAgentDuration(c.duration_seconds) : '--',
        disposition: c.disposition,
        sentiment: c.user_sentiment,
        navigable: true
      }));
      const smsSessions = messages.slice(0, 50).map(m => ({
        type: 'SMS',
        id: m.id,
        time: m.sent_at,
        phone: m.direction === 'inbound' ? (m.sender_number || '--') : (m.recipient_number || '--'),
        direction: m.direction || '--',
        duration: '-',
        disposition: m.status || 'sent',
        sentiment: m.sentiment,
        navigable: false
      }));
      const allSessions = [...callSessions, ...smsSessions]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 20);
      this.renderRecentSessionsTable(allSessions);

    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  },

  formatAgentDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  },

  renderBreakdownBars(containerId, counts, total, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0 || total === 0) {
      container.innerHTML = '<div class="aa-breakdown-empty">No data yet</div>';
      return;
    }

    container.innerHTML = sorted.map(([key, count]) => {
      const cfg = config[key] || { label: key, color: '#94a3b8' };
      const pct = Math.round((count / total) * 100);
      return `
        <div class="aa-bar-row">
          <div class="aa-bar-header">
            <span class="aa-bar-label">${cfg.label}</span>
            <span class="aa-bar-value">${count} (${pct}%)</span>
          </div>
          <div class="aa-bar-track">
            <div class="aa-bar-fill" style="width: ${pct}%; background: ${cfg.color};"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  async renderAgentCallChart(calls) {
    // Load Chart.js if needed
    if (!window.Chart) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      } catch (e) {
        console.error('Failed to load Chart.js:', e);
        return;
      }
    }

    const canvas = document.getElementById('agent-calls-chart');
    if (!canvas) return;

    // Build daily counts for last 30 days
    const labels = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().split('T')[0]);
    }

    const dailyCounts = {};
    calls.forEach(c => {
      if (!c.started_at) return;
      const day = new Date(c.started_at).toISOString().split('T')[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const chartData = labels.map(d => dailyCounts[d] || 0);

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: chartData,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
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
      }
    });
  },

  renderRecentSessionsTable(sessions) {
    const container = document.getElementById('recent-calls-container');
    if (!container) return;

    if (sessions.length === 0) {
      container.innerHTML = '<div class="aa-breakdown-empty">No sessions recorded yet</div>';
      return;
    }

    const formatDisp = (d) => {
      const map = {
        'user_hung_up': 'User Hung Up',
        'agent_hung_up': 'Agent Hung Up',
        'completed': 'Completed',
        'failed': 'Failed',
        'no_answer': 'No Answer',
        'voicemail': 'Voicemail',
        'transferred': 'Transferred',
        'answered_by_pat': 'Answered',
        'sent': 'Sent',
        'delivered': 'Delivered'
      };
      return map[d?.toLowerCase()] || d || '--';
    };

    const formatSentiment = (s) => {
      if (!s || s === 'unknown') return '--';
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };

    const sentimentClass = (s) => {
      if (!s) return '';
      const lower = s.toLowerCase();
      if (lower === 'positive') return 'positive';
      if (lower === 'negative') return 'negative';
      if (lower === 'neutral') return 'neutral';
      return '';
    };

    container.innerHTML = `
      <div class="aa-table-wrapper">
        <table class="aa-calls-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Time</th>
              <th>From / To</th>
              <th>Dir</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Sentiment</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map(s => {
              const typeClass = s.type === 'SMS' ? 'sms' : 'phone';
              const time = s.time ? new Date(s.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
              return `
                <tr class="aa-call-row${s.navigable ? '' : ' aa-no-nav'}" ${s.navigable ? `data-call-id="${s.id}"` : ''}>
                  <td><span class="type-badge ${typeClass}">${s.type}</span></td>
                  <td>${time}</td>
                  <td>${s.phone}</td>
                  <td><span class="direction-badge ${s.direction}">${s.direction}</span></td>
                  <td>${s.duration}</td>
                  <td>${formatDisp(s.disposition)}</td>
                  <td><span class="sentiment-badge ${sentimentClass(s.sentiment)}">${formatSentiment(s.sentiment)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach click handlers for navigable rows -> navigate to inbox
    container.querySelectorAll('.aa-call-row:not(.aa-no-nav)').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const callId = row.dataset.callId;
        if (callId) navigateTo(`/inbox?call=${callId}`);
      });
    });
  }
};
