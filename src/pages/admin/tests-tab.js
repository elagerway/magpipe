/**
 * Admin Tests Tab — Test framework configuration and run monitoring.
 */

import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { escapeHtml } from '../../lib/formatters.js';

const STATUS_COLORS = { passed: '#22c55e', failed: '#ef4444', running: '#f59e0b', error: '#ef4444', pending: '#94a3b8' };
const STATUS_LABELS = { passed: 'Passed', failed: 'Failed', running: 'Running', error: 'Error', pending: 'Pending' };

function statusBadge(status) {
  const color = STATUS_COLORS[status] || '#94a3b8';
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;background:${color}22;color:${color};">
    <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>${STATUS_LABELS[status] || status}
  </span>`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

export const testsTabMethods = {
  async renderTestsTab() {
    const pane = document.getElementById('admin-tab-content');
    pane.innerHTML = `
      <div style="padding:1.5rem;max-width:900px">
        <h2 style="margin:0 0 1.5rem;font-size:1.25rem;font-weight:700">Test Framework</h2>

        <!-- Config card -->
        <div style="background:var(--bg-primary,white);border:1px solid rgba(128,128,128,0.12);border-radius:12px;padding:1.25rem;margin-bottom:1.5rem">
          <h3 style="margin:0 0 1rem;font-size:0.95rem;font-weight:600">Configuration</h3>
          <div style="display:grid;grid-template-columns:1fr auto;gap:0.75rem;align-items:end">
            <div>
              <label style="display:block;font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.35rem">Test Phone Number</label>
              <input type="text" id="test-phone-number" class="batch-input" placeholder="+1 604 555 0100" style="width:100%;box-sizing:border-box">
              <p style="font-size:0.75rem;color:var(--text-secondary);margin:0.25rem 0 0">SignalWire number used as the test caller. Must be provisioned in your SignalWire account.</p>
            </div>
            <button class="btn btn-primary" id="save-test-config-btn" style="white-space:nowrap">Save</button>
          </div>
        </div>

        <!-- Recent runs -->
        <div style="background:var(--bg-primary,white);border:1px solid rgba(128,128,128,0.12);border-radius:12px;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid rgba(128,128,128,0.1)">
            <h3 style="margin:0;font-size:0.95rem;font-weight:600">Recent Test Runs</h3>
            <button class="btn btn-secondary btn-sm" id="refresh-runs-btn">Refresh</button>
          </div>
          <div id="admin-test-runs-list">
            <div style="padding:1.5rem;color:var(--text-secondary);font-size:0.875rem">Loading...</div>
          </div>
        </div>
      </div>
    `;

    // Load config
    const { data: config } = await supabase
      .from('test_framework_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (config?.test_phone_number) {
      document.getElementById('test-phone-number').value = config.test_phone_number;
    }

    document.getElementById('save-test-config-btn').addEventListener('click', async () => {
      const btn = document.getElementById('save-test-config-btn');
      const phoneNumber = document.getElementById('test-phone-number').value.trim();
      btn.disabled = true;
      btn.textContent = 'Saving…';
      const { error } = await supabase.from('test_framework_config').upsert({
        id: 1,
        test_phone_number: phoneNumber || null,
        updated_at: new Date().toISOString(),
      });
      btn.disabled = false;
      btn.textContent = 'Save';
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Test phone number saved');
    });

    document.getElementById('refresh-runs-btn').addEventListener('click', () => this._loadAdminTestRuns());

    await this._loadAdminTestRuns();
  },

  async _loadAdminTestRuns() {
    const container = document.getElementById('admin-test-runs-list');
    if (!container) return;

    const { data: runs, error } = await supabase
      .from('test_runs')
      .select('id, status, started_at, completed_at, assertions, error_message, user_id, test_case_id, test_cases(name, type)')
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) {
      container.innerHTML = `<div style="padding:1rem 1.25rem;color:#ef4444;font-size:0.875rem">${escapeHtml(error.message)}</div>`;
      return;
    }

    if (!runs || runs.length === 0) {
      container.innerHTML = `<div style="padding:1.5rem;color:var(--text-secondary);font-size:0.875rem;text-align:center">No test runs yet. Users can create and run tests from the /tests page.</div>`;
      return;
    }

    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
        <thead>
          <tr style="background:rgba(128,128,128,0.04)">
            <th style="text-align:left;padding:0.625rem 1.25rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Test Case</th>
            <th style="text-align:left;padding:0.625rem 1.25rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Status</th>
            <th style="text-align:left;padding:0.625rem 1.25rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Assertions</th>
            <th style="text-align:left;padding:0.625rem 1.25rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary)">User</th>
            <th style="text-align:left;padding:0.625rem 1.25rem;font-size:0.75rem;font-weight:600;color:var(--text-secondary)">Time</th>
          </tr>
        </thead>
        <tbody>
          ${runs.map(run => {
            const assertions = run.assertions || [];
            const passed = assertions.filter(a => a.passed).length;
            return `<tr style="border-top:1px solid rgba(128,128,128,0.06)">
              <td style="padding:0.75rem 1.25rem;color:var(--text-primary)">${escapeHtml(run.test_cases?.name || '—')}</td>
              <td style="padding:0.75rem 1.25rem">${statusBadge(run.status)}</td>
              <td style="padding:0.75rem 1.25rem;color:var(--text-secondary)">${assertions.length ? `${passed}/${assertions.length}` : '—'}</td>
              <td style="padding:0.75rem 1.25rem;color:var(--text-secondary);font-size:0.75rem;font-family:monospace">${run.user_id?.substring(0, 8)}…</td>
              <td style="padding:0.75rem 1.25rem;color:var(--text-secondary)">${timeAgo(run.started_at)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  },
};
