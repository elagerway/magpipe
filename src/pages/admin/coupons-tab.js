/**
 * Admin Coupons Tab (Marketing > Coupon codes)
 * Create and manage coupon codes that grant account credits.
 */

import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';
import { escapeHtml } from '../../lib/formatters.js';

function generateCouponCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  bytes.forEach(b => { code += chars[b % chars.length]; });
  return `MAGP-${code}`;
}

export const couponsTabMethods = {
  async renderCouponsTab() {
    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
      <div class="support-tab coupons-tab">
        <div class="blog-list-header">
          <h2 style="margin:0;">Coupon Codes</h2>
          <button class="btn btn-primary btn-sm" id="coupon-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Create Coupon
          </button>
        </div>
        <p class="text-muted" style="margin: 0 0 1rem 0; font-size: 0.875rem;">
          Coupons grant account credits when redeemed on the Billing page. Each user can redeem a given code once.
        </p>
        <div id="coupon-table-container">
          <div class="loading-spinner">Loading coupons...</div>
        </div>
      </div>
    `;

    document.getElementById('coupon-add-btn').addEventListener('click', () => {
      this.showCouponModal();
    });

    await this.loadCoupons();
  },

  async couponApiCall(action, data = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-coupons-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...data }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'API error');
    return result;
  },

  async loadCoupons() {
    try {
      const result = await this.couponApiCall('list_coupons');
      this.coupons = result.coupons || [];
      this.renderCouponsTable();
    } catch (err) {
      document.getElementById('coupon-table-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load coupons: ${escapeHtml(err.message)}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadCoupons()">Retry</button>
        </div>
      `;
    }
  },

  couponStatus(c) {
    if (!c.active) return { label: 'Inactive', class: 'badge-warning' };
    if (c.expires_at && new Date(c.expires_at) < new Date()) return { label: 'Expired', class: 'badge-danger' };
    if (c.max_redemptions && c.times_redeemed >= c.max_redemptions) return { label: 'Exhausted', class: 'badge-danger' };
    return { label: 'Active', class: 'badge-success' };
  },

  renderCouponsTable() {
    const container = document.getElementById('coupon-table-container');
    if (!this.coupons || this.coupons.length === 0) {
      container.innerHTML = `<div class="tl-empty"><p>No coupons yet. Create one to get started.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Credits</th>
              <th>Redeemed</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Description</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.coupons.map(c => this.renderCouponRow(c)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Copy code
    container.querySelectorAll('.coupon-code-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.code)
          .then(() => showToast(`Code ${btn.dataset.code} copied!`, 'success'))
          .catch(() => showToast('Failed to copy', 'error'));
      });
    });

    // View redemptions
    container.querySelectorAll('.coupon-redemptions-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const coupon = this.coupons.find(c => c.id === btn.dataset.id);
        if (coupon) this.showCouponRedemptions(coupon);
      });
    });

    // Edit
    container.querySelectorAll('.coupon-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const coupon = this.coupons.find(c => c.id === btn.dataset.id);
        if (coupon) this.showCouponModal(coupon);
      });
    });

    // Toggle active
    container.querySelectorAll('.coupon-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const coupon = this.coupons.find(c => c.id === btn.dataset.id);
        if (!coupon) return;
        try {
          await this.couponApiCall('update_coupon', { id: coupon.id, active: !coupon.active });
          showToast(coupon.active ? 'Coupon deactivated' : 'Coupon activated', 'success');
          await this.loadCoupons();
        } catch (err) {
          showToast('Failed to update: ' + err.message, 'error');
        }
      });
    });

    // Delete
    container.querySelectorAll('.coupon-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const coupon = this.coupons.find(c => c.id === btn.dataset.id);
        if (coupon) this.deleteCoupon(coupon);
      });
    });
  },

  renderCouponRow(c) {
    const status = this.couponStatus(c);
    const redeemed = `${c.times_redeemed}${c.max_redemptions ? ` / ${c.max_redemptions}` : ''}`;
    const expires = c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—';
    const created = c.created_at ? new Date(c.created_at).toLocaleDateString() : '—';
    const desc = c.description || '';

    return `
      <tr>
        <td>
          <button class="btn btn-sm btn-ghost coupon-code-copy" data-code="${c.code}" title="Copy code" style="font-family: monospace; font-weight: 600;">
            ${c.code}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </td>
        <td style="font-weight: 600;">$${Number(c.credit_amount).toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-ghost coupon-redemptions-btn" data-id="${c.id}" title="View redemptions" ${c.times_redeemed === 0 ? 'disabled' : ''}>
            ${redeemed}
          </button>
        </td>
        <td>${expires}</td>
        <td>
          <span class="badge ${status.class}">${status.label}</span>
          ${c.requires_payment_method === false ? '<span class="badge badge-warning" title="Redeemable without a card on file" style="margin-left:0.25rem;">No card</span>' : ''}
        </td>
        <td>${desc ? `<span title="${escapeHtml(desc)}">${escapeHtml(desc.length > 40 ? desc.slice(0, 40) + '...' : desc)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>${created}</td>
        <td>
          <div class="blog-actions">
            <button class="btn btn-sm btn-ghost coupon-edit-btn" data-id="${c.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-ghost coupon-toggle-btn" data-id="${c.id}" title="${c.active ? 'Deactivate' : 'Activate'}">
              ${c.active
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 11-12.73 0"/><path d="M12 2v10"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>'}
            </button>
            <button class="btn btn-sm btn-ghost coupon-delete-btn" data-id="${c.id}" title="Delete" style="color:#dc2626;" ${c.times_redeemed > 0 ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  showCouponModal(existing = null) {
    const isEdit = !!existing;
    const title = isEdit ? `Edit Coupon — ${existing.code}` : 'Create Coupon';

    const old = document.getElementById('coupon-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'coupon-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // datetime-local wants "YYYY-MM-DDTHH:MM" in LOCAL wall-clock time. Build it
    // from the local getters (which apply the offset in effect at the expiry date)
    // so it round-trips symmetrically with `new Date(value).toISOString()` on save —
    // subtracting getTimezoneOffset() of *today* drifts by 1h across a DST boundary.
    let expiresValue = '';
    if (existing?.expires_at) {
      const d = new Date(existing.expires_at);
      const pad = (n) => String(n).padStart(2, '0');
      expiresValue = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width:500px;">
        <div class="contact-modal-header">
          <h3>${title}</h3>
          <button class="close-modal-btn" id="coupon-modal-close">&times;</button>
        </div>
        <form id="coupon-modal-form">
          <div class="contact-modal-body">
            ${isEdit ? '' : `
            <div class="form-group">
              <label>Code *</label>
              <div style="display:flex; gap:0.5rem;">
                <input type="text" class="form-input" name="code" required maxlength="32" placeholder="e.g. CONVEYOR53" style="flex:1; text-transform: uppercase; font-family: monospace;">
                <button type="button" class="btn btn-secondary btn-sm" id="coupon-generate-btn">Generate</button>
              </div>
              <p class="text-muted" style="margin:0.25rem 0 0 0; font-size:0.7rem;">3-32 characters: letters, numbers, hyphens. Users type this in, so keep it memorable.</p>
            </div>
            `}
            <div class="form-group">
              <label>Credit Amount (USD) *</label>
              <input type="number" class="form-input" name="credit_amount" required min="0.01" max="1000" step="0.01" value="${existing ? Number(existing.credit_amount) : ''}" placeholder="53.00">
            </div>
            <div class="form-group">
              <label>Description</label>
              <input type="text" class="form-input" name="description" value="${escapeHtml(existing?.description || '')}" placeholder="e.g. Conveyor migration credit">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
              <div class="form-group">
                <label>Max Redemptions</label>
                <input type="number" class="form-input" name="max_redemptions" min="1" step="1" value="${existing?.max_redemptions ?? ''}" placeholder="Unlimited">
              </div>
              <div class="form-group">
                <label>Expires</label>
                <input type="datetime-local" class="form-input" name="expires_at" value="${expiresValue}">
              </div>
            </div>
            <div class="form-group">
              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
                <input type="checkbox" name="requires_payment_method" ${(existing ? existing.requires_payment_method !== false : true) ? 'checked' : ''} style="width:auto;">
                Require a payment method to redeem
              </label>
              <p class="text-muted" style="margin:0.25rem 0 0 0; font-size:0.7rem;">Recommended — prevents fraud. Uncheck only for trusted / card-optional promos.</p>
            </div>
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary" id="coupon-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Coupon'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('coupon-modal-close').onclick = () => overlay.remove();
    document.getElementById('coupon-modal-cancel').onclick = () => overlay.remove();

    const generateBtn = document.getElementById('coupon-generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        overlay.querySelector('input[name="code"]').value = generateCouponCode();
      });
    }

    document.getElementById('coupon-modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = {
        credit_amount: parseFloat(form.credit_amount.value),
        description: form.description.value.trim() || null,
        max_redemptions: form.max_redemptions.value ? parseInt(form.max_redemptions.value, 10) : null,
        expires_at: form.expires_at.value ? new Date(form.expires_at.value).toISOString() : null,
        requires_payment_method: form.requires_payment_method.checked,
      };
      if (!isEdit) data.code = form.code.value.trim().toUpperCase();

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? 'Saving...' : 'Creating...';

      try {
        if (isEdit) {
          await this.couponApiCall('update_coupon', { id: existing.id, ...data });
          showToast('Coupon updated', 'success');
        } else {
          await this.couponApiCall('create_coupon', data);
          showToast(`Coupon ${data.code} created`, 'success');
        }
        overlay.remove();
        await this.loadCoupons();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Create Coupon';
      }
    });
  },

  async showCouponRedemptions(coupon) {
    const old = document.getElementById('coupon-redemptions-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'coupon-redemptions-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width:550px;">
        <div class="contact-modal-header">
          <h3>Redemptions — ${coupon.code}</h3>
          <button class="close-modal-btn" id="coupon-redemptions-close">&times;</button>
        </div>
        <div class="contact-modal-body" id="coupon-redemptions-body">
          <div class="loading-spinner">Loading...</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('coupon-redemptions-close').onclick = () => overlay.remove();

    const bodyEl = document.getElementById('coupon-redemptions-body');
    try {
      const result = await this.couponApiCall('list_redemptions', { coupon_id: coupon.id });
      const redemptions = result.redemptions || [];
      if (redemptions.length === 0) {
        bodyEl.innerHTML = '<p class="text-muted">No redemptions yet.</p>';
        return;
      }
      bodyEl.innerHTML = `
        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr><th>User</th><th>Amount</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${redemptions.map(r => `
                <tr>
                  <td>${escapeHtml(r.users?.email || r.user_id)}</td>
                  <td>$${Number(r.amount).toFixed(2)}</td>
                  <td>${new Date(r.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = `<p>Failed to load redemptions: ${escapeHtml(err.message)}</p>`;
    }
  },

  async deleteCoupon(coupon) {
    showConfirmModal(
      'Delete Coupon',
      `Are you sure you want to delete "${coupon.code}"?`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.couponApiCall('delete_coupon', { id: coupon.id });
            showToast('Coupon deleted', 'success');
            await this.loadCoupons();
          } catch (err) {
            showToast('Failed to delete: ' + err.message, 'error');
          }
        },
      }
    );
  },
};
