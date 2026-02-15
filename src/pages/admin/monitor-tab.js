/**
 * Admin Monitor Tab — Social Listening
 * Displays keyword monitoring results from Reddit, HackerNews, Google.
 * Keyword management for adding/editing/removing tracked keywords.
 */

import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

const PLATFORM_LABELS = {
  reddit: 'Reddit',
  hackernews: 'HackerNews',
  google: 'Google',
};

const PLATFORM_COLORS = {
  reddit: { bg: '#fff1f0', color: '#cf1322' },
  hackernews: { bg: '#fff7e6', color: '#d46b08' },
  google: { bg: '#e6f7ff', color: '#0958d9' },
};

const STATUS_OPTIONS = ['new', 'seen', 'responded', 'archived'];

const CATEGORY_OPTIONS = ['core', 'competitor', 'use_case', 'brand', 'general'];

export const monitorTabMethods = {

  async renderMonitorTab() {
    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
      <div class="support-tab monitor-tab">
        <div class="blog-list-header">
          <h2 style="margin:0;">Social Listening</h2>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-secondary btn-sm" id="monitor-toggle-keywords-btn">Hide Keywords</button>
            <button class="btn btn-primary btn-sm" id="monitor-scan-btn">Run Scan Now</button>
          </div>
        </div>

        <!-- Stats -->
        <div id="monitor-stats-container">
          <div class="loading-spinner">Loading stats...</div>
        </div>

        <!-- Filters -->
        <div id="monitor-filters" class="monitor-filters" style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;">
          <select id="monitor-filter-platform" class="dir-status-select" style="min-width:120px;">
            <option value="">All Platforms</option>
            <option value="reddit">Reddit</option>
            <option value="hackernews">HackerNews</option>
            <option value="google">Google</option>
          </select>
          <select id="monitor-filter-status" class="dir-status-select" style="min-width:120px;">
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="seen">Seen</option>
            <option value="responded">Responded</option>
            <option value="archived">Archived</option>
          </select>
          <select id="monitor-filter-keyword" class="dir-status-select" style="min-width:160px;">
            <option value="">All Keywords</option>
          </select>
        </div>

        <!-- Results Table -->
        <div id="monitor-results-container">
          <div class="loading-spinner">Loading results...</div>
        </div>

        <!-- Keywords Section (collapsible) -->
        <div id="monitor-keywords-section" style="margin-top:2rem;">
          <div class="blog-list-header" style="margin-bottom:1rem;">
            <h3 style="margin:0;">Tracked Keywords</h3>
            <button class="btn btn-primary btn-sm" id="monitor-add-keyword-btn">+ Add Keyword</button>
          </div>
          <div id="monitor-keywords-container">
            <div class="loading-spinner">Loading keywords...</div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('monitor-scan-btn').addEventListener('click', () => this.runMonitorScan());
    document.getElementById('monitor-toggle-keywords-btn').addEventListener('click', () => this.toggleKeywordsSection());
    document.getElementById('monitor-add-keyword-btn').addEventListener('click', () => this.showAddKeywordInput());

    document.getElementById('monitor-filter-platform').addEventListener('change', () => this.loadMonitorResults());
    document.getElementById('monitor-filter-status').addEventListener('change', () => this.loadMonitorResults());
    document.getElementById('monitor-filter-keyword').addEventListener('change', () => this.loadMonitorResults());

    // Load data
    await Promise.all([
      this.loadMonitorStats(),
      this.loadMonitorResults(),
      this.loadMonitorKeywords(),
    ]);
  },

  async monitorApiCall(action, data = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-social-listening-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...data }),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'API error');
    return result;
  },

  // --- Stats ---

  async loadMonitorStats() {
    try {
      const result = await this.monitorApiCall('get_stats');
      this.monitorStats = result.stats;
      this.renderMonitorStats();
    } catch (err) {
      document.getElementById('monitor-stats-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load stats: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadMonitorStats()">Retry</button>
        </div>
      `;
    }
  },

  renderMonitorStats() {
    const s = this.monitorStats;
    if (!s) return;

    document.getElementById('monitor-stats-container').innerHTML = `
      <div class="review-stats-grid" style="grid-template-columns: repeat(6, 1fr);">
        <div class="review-stat-card">
          <div class="review-stat-value" style="color:#dc2626;">${s.new_count}</div>
          <div class="review-stat-label">New</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${s.this_week}</div>
          <div class="review-stat-label">This Week</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${s.total}</div>
          <div class="review-stat-label">Total</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value" style="color:#cf1322;">${s.reddit_count}</div>
          <div class="review-stat-label">Reddit</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value" style="color:#d46b08;">${s.hackernews_count}</div>
          <div class="review-stat-label">HackerNews</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value" style="color:#0958d9;">${s.google_count}</div>
          <div class="review-stat-label">Google</div>
        </div>
      </div>
    `;
  },

  // --- Results ---

  async loadMonitorResults() {
    try {
      const platform = document.getElementById('monitor-filter-platform')?.value || '';
      const status = document.getElementById('monitor-filter-status')?.value || '';
      const keyword = document.getElementById('monitor-filter-keyword')?.value || '';

      const params = {};
      if (platform) params.platform = platform;
      if (status) params.status = status;
      if (keyword) params.keyword = keyword;

      const result = await this.monitorApiCall('list_results', params);
      this.monitorResults = result.results || [];
      this.renderMonitorResults();
    } catch (err) {
      document.getElementById('monitor-results-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load results: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadMonitorResults()">Retry</button>
        </div>
      `;
    }
  },

  renderMonitorResults() {
    const container = document.getElementById('monitor-results-container');
    if (!this.monitorResults || this.monitorResults.length === 0) {
      container.innerHTML = `<div class="tl-empty"><p>No results found. Try running a scan.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table dir-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th>Title</th>
              <th>Keyword</th>
              <th>Score</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.monitorResults.map(r => this.renderMonitorRow(r)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach status change listeners
    container.querySelectorAll('.monitor-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
          await this.monitorApiCall('update_result', { id, status: newStatus });
          showToast('Saved', 'success');
          await this.loadMonitorStats();
        } catch (err) {
          showToast('Failed to update: ' + err.message, 'error');
        }
      });
    });

    // Attach delete listeners
    container.querySelectorAll('.monitor-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const title = btn.dataset.title;
        this.deleteMonitorResult(id, title);
      });
    });
  },

  renderMonitorRow(r) {
    const date = new Date(r.found_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const pColor = PLATFORM_COLORS[r.platform] || { bg: '#f3f4f6', color: '#6b7280' };
    const pLabel = PLATFORM_LABELS[r.platform] || r.platform;

    return `
      <tr>
        <td style="white-space:nowrap;font-size:0.8rem;color:var(--text-muted);">${date}</td>
        <td>
          <span class="monitor-platform-badge" style="background:${pColor.bg};color:${pColor.color};">
            ${pLabel}
          </span>
        </td>
        <td style="max-width:300px;">
          <a href="${this.escapeHtmlAttr(r.url)}" target="_blank" rel="noopener" style="color:var(--primary-color);text-decoration:none;font-weight:500;font-size:0.85rem;">
            ${this.escapeHtml(r.title.length > 80 ? r.title.substring(0, 80) + '...' : r.title)}
          </a>
          ${r.subreddit ? `<div style="font-size:0.75rem;color:var(--text-muted);">${this.escapeHtml(r.subreddit)}</div>` : ''}
        </td>
        <td><span class="tag-pill">${this.escapeHtml(r.keyword_matched)}</span></td>
        <td style="text-align:center;font-size:0.85rem;">
          ${r.score !== null ? r.score : '-'}
          ${r.comment_count !== null ? `<span style="color:var(--text-muted);font-size:0.75rem;"> / ${r.comment_count}c</span>` : ''}
        </td>
        <td>
          <select class="dir-status-select monitor-status-select" data-id="${r.id}">
            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          <button class="btn btn-sm monitor-delete-btn" data-id="${r.id}" data-title="${this.escapeHtmlAttr(r.title)}" style="color:#dc2626;background:none;border:none;cursor:pointer;padding:4px;" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
    `;
  },

  async deleteMonitorResult(id, title) {
    showConfirmModal(
      'Delete Result',
      `Delete "${title?.substring(0, 60) || 'this result'}"?`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.monitorApiCall('delete_result', { id });
            showToast('Result deleted', 'success');
            await Promise.all([this.loadMonitorStats(), this.loadMonitorResults()]);
          } catch (err) {
            showToast('Failed to delete: ' + err.message, 'error');
          }
        },
      }
    );
  },

  // --- Scan ---

  async runMonitorScan() {
    const btn = document.getElementById('monitor-scan-btn');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Scanning...';

    try {
      const result = await this.monitorApiCall('run_scan');
      const scan = result.scan_result || {};
      showToast(`Scan complete: ${scan.new_results || 0} new results found`, 'success');
      await Promise.all([this.loadMonitorStats(), this.loadMonitorResults()]);
    } catch (err) {
      showToast('Scan failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run Scan Now';
    }
  },

  // --- Keywords Section ---

  toggleKeywordsSection() {
    const section = document.getElementById('monitor-keywords-section');
    if (!section) return;
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';

    const btn = document.getElementById('monitor-toggle-keywords-btn');
    if (btn) btn.textContent = isHidden ? 'Hide Keywords' : 'Keywords';
  },

  async loadMonitorKeywords() {
    try {
      const result = await this.monitorApiCall('list_keywords');
      this.monitorKeywords = result.keywords || [];
      this.renderMonitorKeywords();
      this.populateKeywordFilter();
    } catch (err) {
      const container = document.getElementById('monitor-keywords-container');
      if (container) {
        container.innerHTML = `
          <div class="analytics-error">
            <p>Failed to load keywords: ${err.message}</p>
          </div>
        `;
      }
    }
  },

  populateKeywordFilter() {
    const select = document.getElementById('monitor-filter-keyword');
    if (!select || !this.monitorKeywords) return;

    const currentValue = select.value;
    const uniqueKeywords = this.monitorKeywords.map(k => k.keyword);

    select.innerHTML = `
      <option value="">All Keywords</option>
      ${uniqueKeywords.map(k => `<option value="${k}" ${currentValue === k ? 'selected' : ''}>${k}</option>`).join('')}
    `;
  },

  renderMonitorKeywords() {
    const container = document.getElementById('monitor-keywords-container');
    if (!container) return;

    if (!this.monitorKeywords || this.monitorKeywords.length === 0) {
      container.innerHTML = `<div class="tl-empty"><p>No keywords configured.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table dir-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Category</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.monitorKeywords.map(k => `
              <tr>
                <td>
                  <span class="monitor-kw-text" data-id="${k.id}" style="font-weight:500;cursor:pointer;border-bottom:1px dashed var(--border-color);" title="Click to edit">${this.escapeHtml(k.keyword)}</span>
                </td>
                <td>
                  <select class="dir-status-select monitor-kw-category" data-id="${k.id}" style="font-size:0.8rem;">
                    ${CATEGORY_OPTIONS.map(c => `<option value="${c}" ${k.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
                </td>
                <td>
                  <label class="monitor-toggle-label">
                    <input type="checkbox" class="monitor-kw-active" data-id="${k.id}" ${k.is_active ? 'checked' : ''}>
                    <span style="font-size:0.8rem;color:var(--text-muted);">${k.is_active ? 'On' : 'Off'}</span>
                  </label>
                </td>
                <td>
                  <button class="btn btn-sm monitor-kw-delete" data-id="${k.id}" data-keyword="${this.escapeHtmlAttr(k.keyword)}" style="color:#dc2626;background:none;border:none;cursor:pointer;padding:4px;" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:0.75rem;">
        <button class="btn btn-primary btn-sm" id="monitor-add-keyword-btn-bottom">+ Add Keyword</button>
      </div>
      <div id="monitor-add-keyword-row" style="display:none;margin-top:0.75rem;">
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input type="text" id="monitor-new-keyword-input" class="form-control" placeholder="Enter keyword..." style="flex:1;padding:0.4rem 0.75rem;font-size:0.85rem;border:1px solid var(--border-color);border-radius:6px;">
          <select id="monitor-new-keyword-category" class="dir-status-select" style="font-size:0.8rem;">
            ${CATEGORY_OPTIONS.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" id="monitor-save-keyword-btn">Add</button>
          <button class="btn btn-secondary btn-sm" id="monitor-cancel-keyword-btn">Cancel</button>
        </div>
      </div>
    `;

    // Click-to-edit keyword text
    container.querySelectorAll('.monitor-kw-text').forEach(span => {
      span.addEventListener('click', (e) => {
        const id = span.dataset.id;
        const currentText = span.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'form-control';
        input.style.cssText = 'padding:0.25rem 0.5rem;font-size:0.85rem;font-weight:500;border:1px solid var(--primary-color);border-radius:4px;width:100%;';

        span.replaceWith(input);
        input.focus();
        input.select();

        const save = async () => {
          const newValue = input.value.trim();
          if (!newValue || newValue === currentText) {
            // Revert
            const newSpan = document.createElement('span');
            newSpan.className = 'monitor-kw-text';
            newSpan.dataset.id = id;
            newSpan.style.cssText = 'font-weight:500;cursor:pointer;border-bottom:1px dashed var(--border-color);';
            newSpan.title = 'Click to edit';
            newSpan.textContent = currentText;
            input.replaceWith(newSpan);
            newSpan.addEventListener('click', () => newSpan.click());
            // Re-render to rebind properly
            this.renderMonitorKeywords();
            return;
          }
          try {
            await this.monitorApiCall('update_keyword', { id, keyword: newValue });
            showToast('Saved', 'success');
            await this.loadMonitorKeywords();
          } catch (err) {
            showToast('Failed: ' + err.message, 'error');
            this.renderMonitorKeywords();
          }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.value = currentText; input.blur(); }
        });
      });
    });

    // Category change listeners
    container.querySelectorAll('.monitor-kw-category').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        try {
          await this.monitorApiCall('update_keyword', { id, category: e.target.value });
          showToast('Saved', 'success');
        } catch (err) {
          showToast('Failed: ' + err.message, 'error');
        }
      });
    });

    // Active toggle listeners
    container.querySelectorAll('.monitor-kw-active').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const label = e.target.parentElement.querySelector('span');
        try {
          await this.monitorApiCall('update_keyword', { id, is_active: e.target.checked });
          if (label) label.textContent = e.target.checked ? 'On' : 'Off';
          showToast('Saved', 'success');
        } catch (err) {
          showToast('Failed: ' + err.message, 'error');
          e.target.checked = !e.target.checked;
        }
      });
    });

    // Delete listeners
    container.querySelectorAll('.monitor-kw-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const keyword = btn.dataset.keyword;
        this.deleteMonitorKeyword(id, keyword);
      });
    });

    // Bottom add keyword button
    const bottomAddBtn = document.getElementById('monitor-add-keyword-btn-bottom');
    if (bottomAddBtn) bottomAddBtn.addEventListener('click', () => this.showAddKeywordInput());

    // Save/cancel keyword listeners
    const saveBtn = document.getElementById('monitor-save-keyword-btn');
    const cancelBtn = document.getElementById('monitor-cancel-keyword-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveNewKeyword());
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      document.getElementById('monitor-add-keyword-row').style.display = 'none';
    });

    // Enter key on input
    const input = document.getElementById('monitor-new-keyword-input');
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveNewKeyword();
    });
  },

  showAddKeywordInput() {
    const row = document.getElementById('monitor-add-keyword-row');
    if (row) {
      row.style.display = 'block';
      const input = document.getElementById('monitor-new-keyword-input');
      if (input) input.focus();
    }
  },

  async saveNewKeyword() {
    const input = document.getElementById('monitor-new-keyword-input');
    const categorySelect = document.getElementById('monitor-new-keyword-category');
    if (!input) return;

    const keyword = input.value.trim();
    if (!keyword) {
      showToast('Enter a keyword', 'error');
      return;
    }

    try {
      await this.monitorApiCall('add_keyword', {
        keyword,
        category: categorySelect?.value || 'general',
      });
      showToast('Saved', 'success');
      input.value = '';
      document.getElementById('monitor-add-keyword-row').style.display = 'none';
      await this.loadMonitorKeywords();
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
    }
  },

  async deleteMonitorKeyword(id, keyword) {
    showConfirmModal(
      'Delete Keyword',
      `Remove "${keyword}" from tracked keywords?`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.monitorApiCall('delete_keyword', { id });
            showToast('Keyword deleted', 'success');
            await this.loadMonitorKeywords();
          } catch (err) {
            showToast('Failed: ' + err.message, 'error');
          }
        },
      }
    );
  },

  // --- Helpers ---

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  escapeHtmlAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
};
