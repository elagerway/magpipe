/**
 * Tests Page — Create and manage test suites, cases, and view run history.
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from '../components/ConfirmModal.js';
import { escapeHtml } from '../lib/formatters.js';

const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function apiFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const resp = await fetch(`${API}/${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return resp.json();
}

const STATUS_COLORS = {
  passed: '#22c55e',
  failed: '#ef4444',
  running: '#f59e0b',
  error: '#ef4444',
  pending: '#94a3b8',
};

const STATUS_LABELS = { passed: 'Passed', failed: 'Failed', running: 'Running', error: 'Error', pending: 'Pending' };

function statusBadge(status) {
  const color = STATUS_COLORS[status] || '#94a3b8';
  const label = STATUS_LABELS[status] || status;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;background:${color}22;color:${color};">
    <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>${label}
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

export default class TestsPage {
  constructor() {
    this.userId = null;
    this.suites = [];
    this.agents = [];
    this.activeSuite = null;
    this.activeCases = [];
    this.activeCaseId = null;
    this.activeRuns = [];
    this.view = 'suites'; // 'suites' | 'runs'
    this.pollTimer = null;
  }

  async render() {
    const { user } = await getCurrentUser();
    if (!user) { window.navigateTo('/login'); return; }
    this.userId = user.id;

    document.getElementById('app').innerHTML = `
      <style>
        .tests-wrap { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg-secondary, #f8fafc); }
        .tests-content { flex: 1; padding: 1.5rem; max-width: 1100px; margin: 0 auto; width: 100%; box-sizing: border-box; padding-top: 1.5rem; }
        .tests-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
        .tests-header h1 { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
        .tests-header-actions { display: flex; gap: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
        .btn-primary { background: var(--primary-color, #6366f1); color: white; }
        .btn-primary:hover { opacity: 0.9; }
        .btn-secondary { background: transparent; color: var(--text-secondary); border: 1px solid rgba(128,128,128,0.25); }
        .btn-secondary:hover { background: var(--bg-secondary, #f8fafc); }
        .btn-danger { background: transparent; color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .btn-danger:hover { background: rgba(239,68,68,0.08); }
        .btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
        .btn-run { background: #22c55e22; color: #16a34a; border: 1px solid #22c55e44; }
        .btn-run:hover { background: #22c55e33; }

        .suite-card { background: var(--bg-primary, white); border: 1px solid rgba(128,128,128,0.12); border-radius: 12px; margin-bottom: 1rem; overflow: hidden; }
        .suite-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; cursor: pointer; }
        .suite-header:hover { background: rgba(128,128,128,0.03); }
        .suite-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
        .suite-meta { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }
        .suite-actions { display: flex; gap: 0.5rem; align-items: center; }
        .suite-chevron { transition: transform 0.2s; color: var(--text-secondary); }
        .suite-chevron.open { transform: rotate(90deg); }
        .suite-cases { border-top: 1px solid rgba(128,128,128,0.08); display: none; }
        .suite-cases.open { display: block; }
        .suite-cases-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: rgba(128,128,128,0.03); }
        .suite-cases-header span { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }

        .case-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; border-top: 1px solid rgba(128,128,128,0.06); }
        .case-row:hover { background: rgba(128,128,128,0.02); }
        .case-info { flex: 1; min-width: 0; }
        .case-name { font-size: 0.9rem; font-weight: 500; color: var(--text-primary); }
        .case-type { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
        .case-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }

        .empty-state { text-align: center; padding: 3rem 1.5rem; color: var(--text-secondary); }
        .empty-state h3 { margin: 0.5rem 0; font-size: 1.1rem; color: var(--text-primary); }
        .empty-state p { margin: 0; font-size: 0.875rem; }

        /* Runs drawer */
        .runs-view { background: var(--bg-primary, white); border: 1px solid rgba(128,128,128,0.12); border-radius: 12px; overflow: hidden; }
        .runs-view-header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.1); }
        .runs-view-back { background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 1.25rem; padding: 0; display: flex; align-items: center; }
        .runs-view-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); flex: 1; }
        .run-row { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.06); display: flex; align-items: center; gap: 1rem; cursor: pointer; }
        .run-row:hover { background: rgba(128,128,128,0.02); }
        .run-time { font-size: 0.8rem; color: var(--text-secondary); min-width: 80px; }
        .run-stats { font-size: 0.8rem; color: var(--text-secondary); }

        /* Run detail modal */
        .run-detail-modal { background: var(--bg-primary, white); border-radius: 12px; max-width: 640px; width: 100%; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
        .run-detail-header { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.1); display: flex; align-items: center; justify-content: space-between; }
        .run-detail-body { overflow-y: auto; padding: 1.25rem; flex: 1; }
        .assertion-row { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(128,128,128,0.06); }
        .assertion-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
        .assertion-name { font-size: 0.85rem; font-weight: 500; color: var(--text-primary); }
        .assertion-detail { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }
        .ai-box { background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; padding: 0.875rem 1rem; margin-top: 1rem; }
        .ai-box h4 { margin: 0 0 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--primary-color, #6366f1); }
        .ai-box p { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--text-primary); line-height: 1.5; }
        .fix-item { padding: 0.5rem 0; border-top: 1px solid rgba(99,102,241,0.1); }
        .fix-title { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); }
        .fix-desc { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }
      </style>
      <div class="tests-wrap with-bottom-nav">
        <div class="tests-content">
          <div class="tests-header">
            <div>
              <h1>Tests</h1>
            </div>
            <div class="tests-header-actions">
              <button class="btn btn-primary" id="new-suite-btn">+ New Suite</button>
            </div>
          </div>
          <div id="tests-main"></div>
        </div>
        <div id="bottom-nav-container"></div>
      </div>

      <!-- Suite Modal -->
      <div class="contact-modal-overlay" id="suite-modal-overlay" style="display:none" onclick="document.getElementById('suite-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3 id="suite-modal-title">New Suite</h3>
            <button class="close-modal-btn" onclick="document.getElementById('suite-modal-overlay').style.display='none'">&times;</button>
          </div>
          <form id="suite-form">
            <div class="contact-modal-body">
              <label class="batch-label">Suite Name *</label>
              <input class="batch-input" type="text" id="suite-name" placeholder="e.g. Booking Agent Regression" required>
              <label class="batch-label" style="margin-top:0.75rem">Description</label>
              <textarea class="batch-input" id="suite-desc" rows="2" placeholder="What does this suite test?" style="resize:vertical"></textarea>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('suite-modal-overlay').style.display='none'">Cancel</button>
              <button type="submit" class="btn btn-primary" id="suite-save-btn">Create Suite</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Case Modal -->
      <div class="contact-modal-overlay" id="case-modal-overlay" style="display:none" onclick="document.getElementById('case-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width:600px">
          <div class="contact-modal-header">
            <h3 id="case-modal-title">New Test Case</h3>
            <button class="close-modal-btn" onclick="document.getElementById('case-modal-overlay').style.display='none'">&times;</button>
          </div>
          <form id="case-form">
            <div class="contact-modal-body" style="max-height:70vh;overflow-y:auto">
              <label class="batch-label">Name *</label>
              <input class="batch-input" type="text" id="case-name" placeholder="e.g. Greets caller and asks for name" required>
              <label class="batch-label" style="margin-top:0.75rem">Description</label>
              <textarea class="batch-input" id="case-desc" rows="2" placeholder="What should this test verify?" style="resize:vertical"></textarea>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.75rem">
                <div>
                  <label class="batch-label">Call Type</label>
                  <select class="batch-input" id="case-type">
                    <option value="inbound_call">Inbound (caller → agent)</option>
                    <option value="outbound_call">Outbound (agent → caller)</option>
                  </select>
                </div>
                <div>
                  <label class="batch-label">Caller Behaviour</label>
                  <select class="batch-input" id="case-caller-mode">
                    <option value="silent">Silent</option>
                    <option value="scripted">Scripted</option>
                  </select>
                </div>
              </div>

              <div style="margin-top:0.75rem">
                <label class="batch-label">Agent</label>
                <select class="batch-input" id="case-agent">
                  <option value="">— Select agent —</option>
                </select>
              </div>

              <div id="caller-script-section" style="display:none;margin-top:0.75rem">
                <label class="batch-label">Caller Script</label>
                <textarea class="batch-input" id="case-script" rows="4" placeholder="One phrase per line. The test caller will speak these in order." style="resize:vertical"></textarea>
                <p style="font-size:0.75rem;color:var(--text-secondary);margin:0.25rem 0 0">Each line = one utterance. Pauses of ~5-8s are added between turns.</p>
              </div>

              <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid rgba(128,128,128,0.1)">
                <label class="batch-label">Assertions</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                  <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary)">Expected phrases (one per line)</label>
                    <textarea class="batch-input" id="case-expected-phrases" rows="3" placeholder="e.g. How can I help you" style="resize:vertical"></textarea>
                  </div>
                  <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary)">Prohibited phrases (one per line)</label>
                    <textarea class="batch-input" id="case-prohibited-phrases" rows="3" placeholder="e.g. I don't know" style="resize:vertical"></textarea>
                  </div>
                  <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary)">Min duration (seconds)</label>
                    <input class="batch-input" type="number" id="case-min-dur" min="0" placeholder="e.g. 10">
                  </div>
                  <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary)">Max duration (seconds)</label>
                    <input class="batch-input" type="number" id="case-max-dur" min="0" placeholder="e.g. 120">
                  </div>
                </div>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('case-modal-overlay').style.display='none'">Cancel</button>
              <button type="submit" class="btn btn-primary" id="case-save-btn">Create Test Case</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Run Detail Modal -->
      <div class="contact-modal-overlay" id="run-detail-overlay" style="display:none" onclick="document.getElementById('run-detail-overlay').style.display='none'">
        <div class="run-detail-modal" onclick="event.stopPropagation()">
          <div class="run-detail-header">
            <div>
              <div id="run-detail-status" style="margin-bottom:4px"></div>
              <div id="run-detail-time" style="font-size:0.8rem;color:var(--text-secondary)"></div>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center">
              <button class="btn btn-secondary btn-sm" id="run-analyze-btn">Analyze</button>
              <button class="close-modal-btn" onclick="document.getElementById('run-detail-overlay').style.display='none'">&times;</button>
            </div>
          </div>
          <div class="run-detail-body" id="run-detail-body"></div>
        </div>
      </div>
    `;

    await renderBottomNav();
    this._bindEvents();
    await this._loadAgents();
    await this._loadSuites();
    this._renderMain();
  }

  _bindEvents() {
    document.getElementById('new-suite-btn').addEventListener('click', () => this._openSuiteModal());

    document.getElementById('suite-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._saveSuite();
    });

    document.getElementById('case-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._saveCase();
    });

    document.getElementById('case-caller-mode').addEventListener('change', (e) => {
      document.getElementById('caller-script-section').style.display = e.target.value === 'scripted' ? 'block' : 'none';
    });
  }

  async _loadAgents() {
    try {
      const data = await apiFetch('list-agents?limit=100');
      this.agents = data.agents || data || [];
    } catch { this.agents = []; }
  }

  async _loadSuites() {
    const data = await apiFetch('test-cases?action=list_suites');
    this.suites = data.suites || [];
  }

  async _loadCases(suiteId) {
    const data = await apiFetch(`test-cases?action=list_cases&suite_id=${suiteId}`);
    return data.cases || [];
  }

  async _loadRuns(caseId) {
    const data = await apiFetch(`test-runs?test_case_id=${caseId}`);
    return data.runs || [];
  }

  _renderMain() {
    const el = document.getElementById('tests-main');

    if (this.view === 'runs' && this.activeCaseId) {
      this._renderRunsView(el);
      return;
    }

    if (this.suites.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2.5rem;margin-bottom:0.5rem">🧪</div>
          <h3>No test suites yet</h3>
          <p>Create a suite to start testing your agents with real calls.</p>
        </div>`;
      return;
    }

    el.innerHTML = this.suites.map(suite => `
      <div class="suite-card" data-suite-id="${suite.id}">
        <div class="suite-header" data-toggle="${suite.id}">
          <div>
            <div class="suite-title">${escapeHtml(suite.name)}</div>
            <div class="suite-meta">${suite.test_cases?.[0]?.count ?? '0'} cases</div>
          </div>
          <div class="suite-actions">
            <button class="btn btn-secondary btn-sm" data-edit-suite="${suite.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-suite="${suite.id}">Delete</button>
            <svg class="suite-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div class="suite-cases" id="cases-${suite.id}">
          <div class="suite-cases-header">
            <span>Test Cases</span>
            <button class="btn btn-secondary btn-sm" data-new-case="${suite.id}">+ Add Case</button>
          </div>
          <div class="cases-list-${suite.id}">
            <div style="padding:1rem 1.25rem;color:var(--text-secondary);font-size:0.85rem">Loading cases...</div>
          </div>
        </div>
      </div>
    `).join('');

    // Wire events
    el.querySelectorAll('[data-toggle]').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = header.dataset.toggle;
        this._toggleSuite(id);
      });
    });

    el.querySelectorAll('[data-new-case]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openCaseModal(null, btn.dataset.newCase);
      });
    });

    el.querySelectorAll('[data-edit-suite]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const suite = this.suites.find(s => s.id === btn.dataset.editSuite);
        if (suite) this._openSuiteModal(suite);
      });
    });

    el.querySelectorAll('[data-delete-suite]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        showConfirmModal({
          title: 'Delete Suite',
          message: 'This will delete the suite and all its test cases and run history. This cannot be undone.',
          confirmText: 'Delete',
          confirmStyle: 'danger',
          onConfirm: async () => {
            const data = await apiFetch('test-cases', {
              method: 'POST',
              body: JSON.stringify({ action: 'delete_suite', suite_id: btn.dataset.deleteSuite }),
            });
            if (data.error) { showToast(data.error, 'error'); return; }
            await this._loadSuites();
            this._renderMain();
            showToast('Suite deleted');
          },
        });
      });
    });
  }

  async _toggleSuite(suiteId) {
    const casesEl = document.getElementById(`cases-${suiteId}`);
    const chevron = document.querySelector(`[data-toggle="${suiteId}"] .suite-chevron`);
    const isOpen = casesEl.classList.contains('open');

    if (isOpen) {
      casesEl.classList.remove('open');
      chevron.classList.remove('open');
      return;
    }

    casesEl.classList.add('open');
    chevron.classList.add('open');

    // Load cases
    const cases = await this._loadCases(suiteId);
    this._renderCases(suiteId, cases);
  }

  _renderCases(suiteId, cases) {
    const container = document.querySelector(`.cases-list-${suiteId}`);
    if (!container) return;

    if (cases.length === 0) {
      container.innerHTML = `<div style="padding:1rem 1.25rem;color:var(--text-secondary);font-size:0.85rem">No test cases yet. Click "+ Add Case" to create one.</div>`;
      return;
    }

    container.innerHTML = cases.map(tc => {
      const typeLabel = tc.type === 'inbound_call' ? 'Inbound' : tc.type === 'outbound_call' ? 'Outbound' : 'Agent-to-Agent';
      const modeLabel = tc.caller_mode === 'scripted' ? 'Scripted caller' : tc.caller_mode === 'agent' ? 'Agent caller' : 'Silent caller';
      return `
        <div class="case-row" data-case-id="${tc.id}" data-suite-id="${suiteId}">
          <div class="case-info">
            <div class="case-name">${escapeHtml(tc.name)}</div>
            <div class="case-type">${typeLabel} · ${modeLabel}</div>
          </div>
          <div class="case-actions">
            <button class="btn btn-run btn-sm" data-run-case="${tc.id}" data-case-name="${escapeHtml(tc.name)}">▶ Run</button>
            <button class="btn btn-secondary btn-sm" data-view-runs="${tc.id}" data-case-name="${escapeHtml(tc.name)}" data-suite-id="${suiteId}">History</button>
            <button class="btn btn-secondary btn-sm" data-edit-case="${tc.id}" data-suite-id="${suiteId}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-case="${tc.id}" data-suite-id="${suiteId}">✕</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-run-case]').forEach(btn => {
      btn.addEventListener('click', () => this._runTest(btn.dataset.runCase, btn.dataset.caseName, btn));
    });

    container.querySelectorAll('[data-view-runs]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.activeCaseId = btn.dataset.viewRuns;
        this.activeCaseName = btn.dataset.caseName;
        this.view = 'runs';
        this.activeRuns = await this._loadRuns(btn.dataset.viewRuns);
        this._renderMain();
      });
    });

    container.querySelectorAll('[data-edit-case]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cases = await this._loadCases(btn.dataset.suiteId);
        const tc = cases.find(c => c.id === btn.dataset.editCase);
        if (tc) this._openCaseModal(tc, btn.dataset.suiteId);
      });
    });

    container.querySelectorAll('[data-delete-case]').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal({
          title: 'Delete Test Case',
          message: 'This will also delete all run history for this case.',
          confirmText: 'Delete',
          confirmStyle: 'danger',
          onConfirm: async () => {
            const data = await apiFetch('test-cases', {
              method: 'POST',
              body: JSON.stringify({ action: 'delete_case', case_id: btn.dataset.deleteCase }),
            });
            if (data.error) { showToast(data.error, 'error'); return; }
            const refreshedCases = await this._loadCases(btn.dataset.suiteId);
            this._renderCases(btn.dataset.suiteId, refreshedCases);
            showToast('Test case deleted');
          },
        });
      });
    });
  }

  _renderRunsView(el) {
    const runs = this.activeRuns;
    el.innerHTML = `
      <div class="runs-view">
        <div class="runs-view-header">
          <button class="runs-view-back" id="runs-back-btn">&#8592;</button>
          <span class="runs-view-title">${escapeHtml(this.activeCaseName || 'Runs')}</span>
          <button class="btn btn-run btn-sm" id="runs-run-btn">▶ Run Now</button>
        </div>
        ${runs.length === 0 ? `
          <div class="empty-state">
            <p>No runs yet. Click "Run Now" to fire your first test.</p>
          </div>` : runs.map(run => `
          <div class="run-row" data-run-id="${run.id}">
            <div style="flex-shrink:0">${statusBadge(run.status)}</div>
            <div class="run-stats">
              ${run.assertions ? `${run.assertions.filter(a => a.passed).length}/${run.assertions.length} assertions` : '—'}
            </div>
            <div class="run-time">${timeAgo(run.started_at)}</div>
            <div style="color:var(--text-secondary);font-size:0.8rem;flex-shrink:0">›</div>
          </div>`).join('')}
      </div>`;

    document.getElementById('runs-back-btn').addEventListener('click', () => {
      this.view = 'suites';
      this._renderMain();
    });

    document.getElementById('runs-run-btn').addEventListener('click', async () => {
      const btn = document.getElementById('runs-run-btn');
      await this._runTest(this.activeCaseId, this.activeCaseName, btn);
      // Refresh runs
      this.activeRuns = await this._loadRuns(this.activeCaseId);
      this._renderMain();
    });

    el.querySelectorAll('[data-run-id]').forEach(row => {
      row.addEventListener('click', () => {
        const run = runs.find(r => r.id === row.dataset.runId);
        if (run) this._openRunDetail(run);
      });
    });
  }

  async _runTest(caseId, caseName, btn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Starting…';
    const data = await apiFetch('run-test', {
      method: 'POST',
      body: JSON.stringify({ test_case_id: caseId }),
    });
    btn.disabled = false;
    btn.textContent = original;
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast(`Test run started for "${caseName}"`);
    }
  }

  _openRunDetail(run) {
    document.getElementById('run-detail-status').innerHTML = statusBadge(run.status);
    document.getElementById('run-detail-time').textContent = run.started_at ? new Date(run.started_at).toLocaleString() : '';

    const assertions = run.assertions || [];
    const assertionsHtml = assertions.length === 0
      ? '<p style="color:var(--text-secondary);font-size:0.85rem">No assertions recorded yet.</p>'
      : assertions.map(a => `
          <div class="assertion-row">
            <span class="assertion-icon">${a.passed ? '✅' : '❌'}</span>
            <div>
              <div class="assertion-name">${escapeHtml(a.name)}</div>
              <div class="assertion-detail">${escapeHtml(a.detail)}</div>
            </div>
          </div>`).join('');

    const aiHtml = run.ai_analysis ? `
      <div class="ai-box">
        <h4>AI Analysis</h4>
        <p>${escapeHtml(run.ai_analysis)}</p>
        ${(run.ai_proposed_fixes || []).map(fix => `
          <div class="fix-item">
            <div class="fix-title">${escapeHtml(fix.title)}</div>
            <div class="fix-desc">${escapeHtml(fix.description)}</div>
            ${fix.file ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;font-family:monospace">${escapeHtml(fix.file)}</div>` : ''}
          </div>`).join('')}
      </div>` : (run.status === 'failed' || run.status === 'error')
        ? `<p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.5rem">AI analysis is being generated…</p>` : '';

    const errorHtml = run.error_message ? `<div style="margin-bottom:1rem;padding:0.75rem;background:rgba(239,68,68,0.08);border-radius:8px;font-size:0.85rem;color:#ef4444">${escapeHtml(run.error_message)}</div>` : '';

    document.getElementById('run-detail-body').innerHTML = `
      ${errorHtml}
      <h4 style="margin:0 0 0.5rem;font-size:0.85rem;font-weight:600;color:var(--text-primary)">Assertions</h4>
      ${assertionsHtml}
      ${aiHtml}
    `;

    document.getElementById('run-analyze-btn').onclick = async () => {
      const btn = document.getElementById('run-analyze-btn');
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      const data = await apiFetch('test-ai-analyze', {
        method: 'POST',
        body: JSON.stringify({ test_run_id: run.id }),
      });
      btn.disabled = false;
      btn.textContent = 'Analyze';
      if (data.error) {
        showToast(data.error, 'error');
      } else {
        run.ai_analysis = data.ai_analysis;
        run.ai_proposed_fixes = data.ai_proposed_fixes;
        this._openRunDetail(run);
      }
    };

    document.getElementById('run-detail-overlay').style.display = 'flex';
  }

  _openSuiteModal(suite = null) {
    const isEdit = !!suite;
    document.getElementById('suite-modal-title').textContent = isEdit ? 'Edit Suite' : 'New Suite';
    document.getElementById('suite-name').value = suite?.name || '';
    document.getElementById('suite-desc').value = suite?.description || '';
    document.getElementById('suite-save-btn').textContent = isEdit ? 'Save Changes' : 'Create Suite';
    document.getElementById('suite-form').dataset.editId = suite?.id || '';
    document.getElementById('suite-modal-overlay').style.display = 'flex';
  }

  async _saveSuite() {
    const name = document.getElementById('suite-name').value.trim();
    const description = document.getElementById('suite-desc').value.trim();
    const editId = document.getElementById('suite-form').dataset.editId;
    const btn = document.getElementById('suite-save-btn');
    btn.disabled = true;

    const payload = editId
      ? { action: 'update_suite', suite_id: editId, name, description }
      : { action: 'create_suite', name, description };

    const data = await apiFetch('test-cases', { method: 'POST', body: JSON.stringify(payload) });
    btn.disabled = false;

    if (data.error) { showToast(data.error, 'error'); return; }
    document.getElementById('suite-modal-overlay').style.display = 'none';
    await this._loadSuites();
    this._renderMain();
    showToast(editId ? 'Suite updated' : 'Suite created');
  }

  _openCaseModal(tc = null, suiteId = null) {
    const isEdit = !!tc;
    document.getElementById('case-modal-title').textContent = isEdit ? 'Edit Test Case' : 'New Test Case';
    document.getElementById('case-name').value = tc?.name || '';
    document.getElementById('case-desc').value = tc?.description || '';
    document.getElementById('case-type').value = tc?.type || 'inbound_call';
    document.getElementById('case-caller-mode').value = tc?.caller_mode || 'silent';
    document.getElementById('case-script').value = (tc?.caller_script || []).join('\n');
    document.getElementById('case-expected-phrases').value = (tc?.expected_phrases || []).join('\n');
    document.getElementById('case-prohibited-phrases').value = (tc?.prohibited_phrases || []).join('\n');
    document.getElementById('case-min-dur').value = tc?.min_duration_seconds || '';
    document.getElementById('case-max-dur').value = tc?.max_duration_seconds || '';
    document.getElementById('caller-script-section').style.display = (tc?.caller_mode === 'scripted') ? 'block' : 'none';
    document.getElementById('case-save-btn').textContent = isEdit ? 'Save Changes' : 'Create Test Case';
    document.getElementById('case-form').dataset.editId = tc?.id || '';
    document.getElementById('case-form').dataset.suiteId = tc?.suite_id || suiteId || '';

    // Populate agents
    const agentSelect = document.getElementById('case-agent');
    agentSelect.innerHTML = '<option value="">— Select agent —</option>' +
      this.agents.map(a => `<option value="${a.id}" ${tc?.agent_id === a.id ? 'selected' : ''}>${escapeHtml(a.name || a.id)}</option>`).join('');

    document.getElementById('case-modal-overlay').style.display = 'flex';
  }

  async _saveCase() {
    const form = document.getElementById('case-form');
    const editId = form.dataset.editId;
    const suiteId = form.dataset.suiteId;
    const btn = document.getElementById('case-save-btn');
    btn.disabled = true;

    const callerMode = document.getElementById('case-caller-mode').value;
    const scriptLines = document.getElementById('case-script').value.split('\n').map(s => s.trim()).filter(Boolean);
    const expectedLines = document.getElementById('case-expected-phrases').value.split('\n').map(s => s.trim()).filter(Boolean);
    const prohibitedLines = document.getElementById('case-prohibited-phrases').value.split('\n').map(s => s.trim()).filter(Boolean);
    const minDur = document.getElementById('case-min-dur').value;
    const maxDur = document.getElementById('case-max-dur').value;

    const payload = {
      action: editId ? 'update_case' : 'create_case',
      ...(editId ? { case_id: editId } : { suite_id: suiteId }),
      name: document.getElementById('case-name').value.trim(),
      description: document.getElementById('case-desc').value.trim() || null,
      type: document.getElementById('case-type').value,
      agent_id: document.getElementById('case-agent').value || null,
      caller_mode: callerMode,
      caller_script: callerMode === 'scripted' ? scriptLines : null,
      expected_phrases: expectedLines.length > 0 ? expectedLines : null,
      prohibited_phrases: prohibitedLines.length > 0 ? prohibitedLines : null,
      min_duration_seconds: minDur ? parseInt(minDur) : null,
      max_duration_seconds: maxDur ? parseInt(maxDur) : null,
    };

    const data = await apiFetch('test-cases', { method: 'POST', body: JSON.stringify(payload) });
    btn.disabled = false;

    if (data.error) { showToast(data.error, 'error'); return; }
    document.getElementById('case-modal-overlay').style.display = 'none';
    // Refresh the suite's cases if it's open
    const casesEl = document.getElementById(`cases-${suiteId}`);
    if (casesEl?.classList.contains('open')) {
      const cases = await this._loadCases(suiteId);
      this._renderCases(suiteId, cases);
    }
    showToast(editId ? 'Test case updated' : 'Test case created');
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
}
