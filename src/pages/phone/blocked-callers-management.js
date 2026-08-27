/**
 * Globally Blocked Numbers — UI logic for the Phone page section.
 *
 * Mirrors number-management.js / forwarding-numbers in skills-tab.js:
 * load + list + add + edit-label + unblock, all through the
 * manage-blocked-callers edge function.
 *
 * The blocklist is per-user (workspace-wide), not per-agent — see the
 * 20260512_blocked_callers.sql migration header for the reasoning.
 */

import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';
import { normalizeE164 } from '../../lib/phone-e164.js';
import { formatPhoneNumber, escapeHtml } from '../../lib/formatters.js';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-blocked-callers`;

export const blockedCallersMethods = {
  async loadBlockedCallersList() {
    const container = document.getElementById('blocked-callers-list-container');
    if (!container) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        container.innerHTML = `<div class="text-muted" style="font-size: 0.875rem;">Session expired — please refresh.</div>`;
        return;
      }
      const res = await fetch(FN_URL, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      const entries = json.entries || [];
      this._blockedCallers = entries;

      if (entries.length === 0) {
        container.innerHTML = `
          <div class="text-muted" style="font-size: 0.875rem; padding: 0.5rem 0;">
            No blocked numbers. Use the inbox's "Mark as Spam" action on a call/SMS/WhatsApp
            thread to add one, or use the + Block button above.
          </div>`;
        return;
      }

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${entries.map(e => `
            <div data-id="${e.id}" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; background: var(--bg-secondary, #f9fafb); border-radius: 8px; font-size: 0.875rem;">
              <span style="font-family: monospace; font-weight: 500;">${escapeHtml(formatPhoneNumber(e.caller_number) || e.caller_number)}</span>
              ${e.label ? `<span style="color: var(--text-secondary); font-size: 0.8rem;">${escapeHtml(e.label)}</span>` : ''}
              ${e.source === 'inbox_mark_spam' ? `<span style="font-size: 0.7rem; font-weight: 600; background: #fee2e2; color: #b91c1c; padding: 0.15rem 0.5rem; border-radius: 4px;">FROM INBOX</span>` : ''}
              <div style="margin-left: auto; display: flex; gap: 0.25rem;">
                <button class="btn btn-sm bc-edit-btn" data-id="${e.id}">Edit</button>
                <button class="btn btn-sm bc-unblock-btn" data-id="${e.id}" data-number="${escapeHtml(e.caller_number)}">Unblock</button>
              </div>
            </div>
          `).join('')}
        </div>`;

      container.querySelectorAll('.bc-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => this.openBlockedCallerModal(btn.dataset.id));
      });
      container.querySelectorAll('.bc-unblock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const confirmed = await showConfirmModal({
            title: 'Unblock this number?',
            message: `Future calls, SMS, and WhatsApp messages from ${formatPhoneNumber(btn.dataset.number) || btn.dataset.number} will reach you again.`,
            confirmText: 'Unblock',
          });
          if (confirmed) await this.unblockCaller(btn.dataset.id);
        });
      });
    } catch (err) {
      console.error('loadBlockedCallersList error:', err);
      container.innerHTML = `<div style="color: var(--danger); font-size: 0.875rem;">Failed to load blocked numbers.</div>`;
    }
  },

  // Open the add/edit modal. Pass an id to edit, null/undefined to add.
  // Number is immutable on edit (matches manage-blocked-callers PATCH semantics:
  // only label can change; to change the number, unblock + re-block).
  openBlockedCallerModal(id) {
    const overlay = document.getElementById('bc-modal-overlay');
    const numberInput = document.getElementById('bc-number');
    const labelInput = document.getElementById('bc-label');
    const title = document.getElementById('bc-modal-title');
    const saveBtn = document.getElementById('bc-save-btn');
    if (!overlay) return;

    if (id) {
      const entry = (this._blockedCallers || []).find(e => e.id === id);
      if (!entry) return;
      title.textContent = 'Edit blocked number';
      numberInput.value = entry.caller_number;
      numberInput.disabled = true;
      labelInput.value = entry.label || '';
      saveBtn.dataset.id = id;
    } else {
      title.textContent = 'Block a number';
      numberInput.value = '';
      numberInput.disabled = false;
      labelInput.value = '';
      delete saveBtn.dataset.id;
    }
    overlay.style.display = 'flex';
    setTimeout(() => (id ? labelInput : numberInput).focus(), 50);
  },

  async submitBlockedCallerForm() {
    const numberInput = document.getElementById('bc-number');
    const labelInput = document.getElementById('bc-label');
    const saveBtn = document.getElementById('bc-save-btn');
    const id = saveBtn.dataset.id;

    saveBtn.disabled = true;
    saveBtn.textContent = id ? 'Saving…' : 'Blocking…';
    this._bcIsSaving = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Session expired — please refresh', 'error'); return; }

      let res;
      if (id) {
        res = await fetch(FN_URL, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, label: labelInput.value.trim() || null }),
        });
      } else {
        const normalized = normalizeE164(numberInput.value);
        if (!normalized) {
          showToast('Enter a valid phone number, e.g. (604) 555-1234', 'error');
          return;
        }
        res = await fetch(FN_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ caller_number: normalized, label: labelInput.value.trim() || null, source: 'manual' }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error?.message || 'Failed to save', 'error');
        return;
      }
      document.getElementById('bc-modal-overlay').style.display = 'none';
      // POST returns { entry, already_blocked? }; success copy reflects that.
      if (!id && json.already_blocked) {
        showToast('That number is already on your blocklist', 'info');
      } else {
        showToast(id ? 'Label updated' : 'Number blocked', 'success');
      }
      await this.loadBlockedCallersList();
    } catch (err) {
      console.error('submitBlockedCallerForm error:', err);
      showToast('Failed to save', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      this._bcIsSaving = false;
    }
  },

  async unblockCaller(id) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Session expired — please refresh', 'error'); return; }
      const res = await fetch(`${FN_URL}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast(j.error?.message || 'Failed to unblock', 'error');
        return;
      }
      showToast('Number unblocked', 'success');
      await this.loadBlockedCallersList();
    } catch (err) {
      console.error('unblockCaller error:', err);
      showToast('Failed to unblock', 'error');
    }
  },

  // Wire the modal's submit + dismiss handlers. Idempotent — safe to call on
  // every render (early-returns if already bound). All dismiss paths gate
  // on _bcIsSaving so the modal can't be closed mid-POST.
  _bindBlockedCallerModal() {
    const overlay = document.getElementById('bc-modal-overlay');
    const inner = document.getElementById('bc-modal-inner');
    const form = document.getElementById('bc-form');
    const closeBtn = document.getElementById('bc-modal-close');
    const cancelBtn = document.getElementById('bc-modal-cancel');
    if (!form || form._bcBound) return;
    form._bcBound = true;

    const dismiss = () => { if (!this._bcIsSaving) overlay.style.display = 'none'; };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitBlockedCallerForm();
    });
    inner.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    closeBtn.addEventListener('click', dismiss);
    cancelBtn.addEventListener('click', dismiss);

    // Add button on the section header.
    const addBtn = document.getElementById('bc-add-btn');
    if (addBtn && !addBtn._bcBound) {
      addBtn._bcBound = true;
      addBtn.addEventListener('click', () => this.openBlockedCallerModal(null));
    }
  },
};
