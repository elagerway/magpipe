/**
 * Admin Batch Management Page
 * View and cancel any user's running batches. Admin/god only.
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from '../components/ConfirmModal.js';

export default class AdminBatchesPage {
  constructor() {
    this.batches = [];
    this.statusFilter = 'active'; // 'active' | 'running' | 'scheduled' | 'recurring' | 'completed' | 'cancelled' | ''
    this.loading = false;
  }

  async render() {
    const { user } = await getCurrentUser();
    if (!user) { window.navigateTo('/login'); return; }

    // Check admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'god')) {
      window.navigateTo('/inbox');
      return;
    }

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <style>
        .admin-batches-page { padding: 1.5rem; flex: 1; min-width: 0; box-sizing: border-box; max-width: 1000px; }
        .admin-batches-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem; }
        .admin-batches-header h1 { margin: 0; font-size: 1.5rem; font-weight: 600; color: var(--text-primary); }
        .admin-batches-header-left { display: flex; align-items: center; gap: 1rem; }
        .admin-batches-back { background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 0.25rem; display: flex; align-items: center; }
        .admin-batches-back:hover { color: var(--text-primary); }
        .admin-batches-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .admin-filter-btn { padding: 0.4rem 0.85rem; border: 1px solid rgba(128,128,128,0.2); border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.8rem; transition: all 0.15s; }
        .admin-filter-btn.active { background: var(--primary-color, #6366f1); color: white; border-color: var(--primary-color, #6366f1); }
        .admin-batches-card { background: var(--bg-primary, white); border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; overflow: hidden; }
        .admin-batch-row { display: grid; grid-template-columns: 1fr 150px auto auto auto auto; gap: 0.75rem; align-items: center; padding: 0.85rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.08); font-size: 0.85rem; }
        .admin-batch-row:last-child { border-bottom: none; }
        .admin-batch-row:hover { background: rgba(128,128,128,0.04); }
        .admin-batch-name { font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .admin-batch-email { color: var(--text-secondary); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .admin-batch-date { font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; }
        .admin-batch-counts { font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; }
        .admin-cancel-btn { padding: 0.3rem 0.65rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: transparent; color: #ef4444; cursor: pointer; font-size: 0.75rem; font-weight: 500; transition: all 0.15s; white-space: nowrap; }
        .admin-cancel-btn:hover { background: rgba(239,68,68,0.08); }
        .admin-cancel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .batch-status-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
        .batch-status-draft { background: rgba(128,128,128,0.1); color: var(--text-secondary); }
        .batch-status-scheduled { background: rgba(59,130,246,0.1); color: #3b82f6; }
        .batch-status-running { background: rgba(245,158,11,0.1); color: #f59e0b; }
        .batch-status-completed { background: rgba(16,185,129,0.1); color: #10b981; }
        .batch-status-cancelled, .batch-status-failed { background: rgba(239,68,68,0.1); color: #ef4444; }
        .batch-status-paused { background: rgba(168,85,247,0.1); color: #a855f7; }
        .batch-status-recurring { background: rgba(99,102,241,0.1); color: #6366f1; }
        .admin-batches-empty { display: flex; align-items: center; justify-content: center; min-height: 200px; color: var(--text-secondary); font-size: 0.9rem; }
        .admin-batch-header-row { display: grid; grid-template-columns: 1fr 150px auto auto auto auto; gap: 0.75rem; padding: 0.6rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.12); font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
        @media (max-width: 768px) {
          .admin-batch-row, .admin-batch-header-row { grid-template-columns: 1fr auto auto; }
          .admin-batch-email, .admin-batch-date, .admin-batch-counts { display: none; }
          .admin-batches-page { padding: 1rem; }
        }
      </style>

      <div class="admin-batches-page container with-bottom-nav">
        <div class="admin-batches-header">
          <div class="admin-batches-header-left">
            <button class="admin-batches-back" onclick="navigateTo('/admin')" title="Back to Admin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <h1>Batch Management</h1>
          </div>
          <div class="admin-batches-filters">
            <button class="admin-filter-btn ${this.statusFilter === 'active' ? 'active' : ''}" data-filter="active">Active</button>
            <button class="admin-filter-btn ${this.statusFilter === 'running' ? 'active' : ''}" data-filter="running">Running</button>
            <button class="admin-filter-btn ${this.statusFilter === 'scheduled' ? 'active' : ''}" data-filter="scheduled">Scheduled</button>
            <button class="admin-filter-btn ${this.statusFilter === 'recurring' ? 'active' : ''}" data-filter="recurring">Recurring</button>
            <button class="admin-filter-btn ${this.statusFilter === '' ? 'active' : ''}" data-filter="">All</button>
          </div>
        </div>

        <div class="admin-batches-card">
          <div class="admin-batch-header-row">
            <span>Batch</span>
            <span>User</span>
            <span>Status</span>
            <span>Progress</span>
            <span>Started</span>
            <span></span>
          </div>
          <div id="admin-batches-content">
            <div class="admin-batches-empty">Loading...</div>
          </div>
        </div>
      </div>
      ${renderBottomNav('/admin/batches')}
    `;

    this.attachListeners();
    await this.loadBatches();
  }

  attachListeners() {
    document.querySelectorAll('.admin-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.statusFilter = btn.dataset.filter;
        document.querySelectorAll('.admin-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === this.statusFilter));
        this.loadBatches();
      });
    });
  }

  async loadBatches() {
    const content = document.getElementById('admin-batches-content');
    if (!content) return;

    this.loading = true;
    content.innerHTML = '<div class="admin-batches-empty">Loading...</div>';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'admin_list', status: this.statusFilter || undefined, limit: 100 })
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to load batches');

      this.batches = result.batches || [];
      this.renderBatches(content);
    } catch (err) {
      content.innerHTML = `<div class="admin-batches-empty">Error: ${err.message}</div>`;
    } finally {
      this.loading = false;
    }
  }

  renderBatches(content) {
    if (this.batches.length === 0) {
      content.innerHTML = '<div class="admin-batches-empty">No batches found</div>';
      return;
    }

    content.innerHTML = this.batches.map(b => {
      const canCancel = ['running', 'scheduled', 'recurring', 'paused', 'draft'].includes(b.status);
      const startedAt = b.started_at ? new Date(b.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      return `
        <div class="admin-batch-row">
          <div>
            <div class="admin-batch-name">${this.escapeHtml(b.name)}</div>
          </div>
          <div class="admin-batch-email" title="${this.escapeHtml(b.user_email)}">${this.escapeHtml(b.user_email)}</div>
          <span class="batch-status-badge batch-status-${b.status}">${b.status}</span>
          <span class="admin-batch-counts">${b.completed_count || 0}/${b.total_recipients || 0} done, ${b.failed_count || 0} failed</span>
          <span class="admin-batch-date">${startedAt}</span>
          <div>
            ${canCancel ? `<button class="admin-cancel-btn" data-batch-id="${b.id}" data-batch-name="${this.escapeHtml(b.name)}">Cancel</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Cancel button handlers
    content.querySelectorAll('.admin-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const batchId = btn.dataset.batchId;
        const batchName = btn.dataset.batchName;
        await this.cancelBatch(batchId, batchName, btn);
      });
    });
  }

  async cancelBatch(batchId, batchName, btn) {
    const confirmed = await showConfirmModal({
      title: 'Cancel Batch (Admin)',
      message: `Cancel "${batchName}"? Pending recipients will be skipped.`,
      confirmText: 'Cancel Batch',
      confirmStyle: 'danger'
    });
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = 'Cancelling...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'cancel', batch_id: batchId })
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to cancel');

      showToast('Batch cancelled', 'info');
      await this.loadBatches();
    } catch (err) {
      showToast('Failed to cancel batch: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Cancel';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  cleanup() {}
}
