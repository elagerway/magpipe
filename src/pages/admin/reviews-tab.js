/**
 * Admin Reviews Tab
 * Manage automated review collection for G2, Capterra, Product Hunt
 */

import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

const PLATFORM_LABELS = {
  g2: 'G2',
  capterra: 'Capterra',
  producthunt: 'Product Hunt',
};

const STATUS_OPTIONS = ['pending', 'sent', 'clicked', 'completed', 'declined', 'failed'];

export const reviewsTabMethods = {
  async renderReviewsTab() {
    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
      <div class="support-tab reviews-tab">
        <div class="blog-list-header">
          <h2 style="margin:0;">Review Collection</h2>
          <button class="btn btn-primary btn-sm" id="review-send-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Send Review Request
          </button>
        </div>

        <!-- Stats Cards -->
        <div id="review-stats-container">
          <div class="loading-spinner">Loading stats...</div>
        </div>

        <!-- Table -->
        <div id="review-table-container">
          <div class="loading-spinner">Loading reviews...</div>
        </div>
      </div>
    `;

    document.getElementById('review-send-btn').addEventListener('click', () => {
      this.showSendReviewModal();
    });

    await Promise.all([this.loadReviewStats(), this.loadReviews()]);
  },

  async reviewApiCall(action, data = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reviews-api`,
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

  async loadReviewStats() {
    try {
      const result = await this.reviewApiCall('get_stats');
      const stats = result.stats || { total: 0, byPlatform: {}, byStatus: {}, completionRate: 0 };
      this.renderReviewStats(stats);
    } catch (err) {
      document.getElementById('review-stats-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load stats: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadReviewStats()">Retry</button>
        </div>
      `;
    }
  },

  renderReviewStats(stats) {
    const container = document.getElementById('review-stats-container');
    container.innerHTML = `
      <div class="review-stats-grid">
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.total}</div>
          <div class="review-stat-label">Total Sent</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.byPlatform?.g2 || 0}</div>
          <div class="review-stat-label">G2</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.byPlatform?.capterra || 0}</div>
          <div class="review-stat-label">Capterra</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.byPlatform?.producthunt || 0}</div>
          <div class="review-stat-label">Product Hunt</div>
        </div>
        <div class="review-stat-card">
          <div class="review-stat-value">${stats.completionRate}%</div>
          <div class="review-stat-label">Completion Rate</div>
        </div>
      </div>
    `;
  },

  async loadReviews() {
    try {
      const result = await this.reviewApiCall('list_reviews');
      this.reviews = result.reviews || [];
      this.renderReviewsTable();
    } catch (err) {
      document.getElementById('review-table-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load reviews: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadReviews()">Retry</button>
        </div>
      `;
    }
  },

  renderReviewsTable() {
    const container = document.getElementById('review-table-container');
    if (!this.reviews || this.reviews.length === 0) {
      container.innerHTML = `<div class="tl-empty"><p>No review requests yet. Use "Send Review Request" to get started.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table dir-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Platform</th>
              <th>Calls</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.reviews.map(r => this.renderReviewRow(r)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Status dropdown listeners
    container.querySelectorAll('.review-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const status = e.target.value;
        try {
          await this.reviewApiCall('update_review', { id, status });
          const review = this.reviews.find(r => r.id === id);
          if (review) review.status = status;
          showToast(`Status updated to ${status}`, 'success');
        } catch (err) {
          showToast('Failed to update status: ' + err.message, 'error');
          await this.loadReviews();
        }
      });
    });

    // Delete buttons
    container.querySelectorAll('.review-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const review = this.reviews.find(r => r.id === btn.dataset.id);
        if (review) this.deleteReview(review);
      });
    });
  },

  renderReviewRow(r) {
    const statusColors = {
      pending: 'dir-status-pending',
      sent: 'dir-status-submitted',
      clicked: 'dir-status-submitted',
      completed: 'dir-status-approved',
      declined: 'dir-status-rejected',
      failed: 'dir-status-rejected',
    };

    const sentDate = r.sent_at
      ? new Date(r.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';

    return `
      <tr>
        <td>
          <div style="line-height:1.3;">
            <div style="font-weight:500;">${r.user_name || '—'}</div>
            <div style="font-size:0.8rem; color:#6b7280;">${r.user_email}</div>
          </div>
        </td>
        <td><span class="dir-priority-badge dir-priority-${r.platform === 'g2' ? 'high' : r.platform === 'capterra' ? 'medium' : 'low'}">${PLATFORM_LABELS[r.platform] || r.platform}</span></td>
        <td>${r.call_count_at_send}</td>
        <td>
          <select class="dir-status-select ${statusColors[r.status] || ''}" data-id="${r.id}">
            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </td>
        <td style="font-size:0.85rem; white-space:nowrap;">${sentDate}</td>
        <td class="dir-notes-cell">${r.notes ? `<span class="dir-notes-text" title="${r.notes.replace(/"/g, '&quot;')}">${r.notes.length > 30 ? r.notes.slice(0, 30) + '...' : r.notes}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>
          <div class="blog-actions">
            <button class="btn btn-sm btn-ghost review-delete-btn" data-id="${r.id}" title="Delete" style="color:#dc2626;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  async showSendReviewModal() {
    // Load users via admin API (service_role bypasses RLS)
    let users = [];
    try {
      const result = await this.reviewApiCall('list_users');
      users = result.users || [];
    } catch (err) {
      showToast('Failed to load users', 'error');
      return;
    }

    const old = document.getElementById('review-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'review-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width:500px;">
        <div class="contact-modal-header">
          <h3>Send Review Request</h3>
          <button class="close-modal-btn" id="review-modal-close">&times;</button>
        </div>
        <form id="review-modal-form">
          <div class="contact-modal-body">
            <div class="form-group">
              <label>User *</label>
              <select class="form-input" name="user_id" required>
                <option value="">Select a user...</option>
                ${users.map(u => `<option value="${u.id}">${u.name || u.email} (${u.usage_calls_count || 0} calls)</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Platform *</label>
              <select class="form-input" name="platform" required>
                <option value="g2">G2</option>
                <option value="capterra">Capterra</option>
                <option value="producthunt">Product Hunt</option>
              </select>
            </div>
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary" id="review-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Send Email</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('review-modal-close').onclick = () => overlay.remove();
    document.getElementById('review-modal-cancel').onclick = () => overlay.remove();

    document.getElementById('review-modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const user_id = form.user_id.value;
      const platform = form.platform.value;

      if (!user_id) {
        showToast('Please select a user', 'error');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        await this.reviewApiCall('send_review', { user_id, platform });
        showToast(`Review request sent via ${PLATFORM_LABELS[platform]}`, 'success');
        overlay.remove();
        await Promise.all([this.loadReviewStats(), this.loadReviews()]);
      } catch (err) {
        showToast('Failed to send: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Email';
      }
    });
  },

  async deleteReview(review) {
    showConfirmModal(
      'Delete Review Request',
      `Delete the ${PLATFORM_LABELS[review.platform] || review.platform} review request for ${review.user_name || review.user_email}?`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.reviewApiCall('delete_review', { id: review.id });
            showToast('Review request deleted', 'success');
            await Promise.all([this.loadReviewStats(), this.loadReviews()]);
          } catch (err) {
            showToast('Failed to delete: ' + err.message, 'error');
          }
        },
      }
    );
  },
};
