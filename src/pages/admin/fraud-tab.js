/**
 * Admin — Fraud review queue.
 *
 * Where a person decides what the automation deliberately would not: disputes
 * from verified number owners, entries flagged but never blocked, and blocks
 * old enough that nothing has tried to get through in months.
 *
 * Every decision is audited with the admin who made it. A global blocklist
 * anyone can edit without a trace is a liability.
 */

import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { escapeHtml, formatPhoneNumber } from '../../lib/formatters.js';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-fraud-review`;

const CATEGORY_LABELS = {
  gift_card: 'Gift card scam',
  wire_transfer: 'Wire transfer scam',
  bank_impersonation: 'Bank impersonation',
  government_impersonation: 'Government impersonation',
  tech_support: 'Tech support scam',
  crypto: 'Crypto scam',
  credential_phishing: 'Credential phishing',
  extortion: 'Extortion or threats',
  invoice_fraud: 'Invoice fraud',
  other: 'Other fraud',
};

const SOURCE_LABELS = {
  transcript_llm: 'Detected in a call',
  manual: 'Reported by hand',
  inbox_report: 'Reported from inbox',
  workspace_block: 'Added to a blocklist',
};

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function renderFraudTab() {
  return `
    <div class="admin-card">
      <h2 style="margin: 0 0 0.25rem;">Fraud review</h2>
      <p class="text-muted" style="margin: 0 0 1rem; font-size: 0.875rem;">
        Decisions the automation won't make on its own. Disputes come from people who proved they
        control the number; flagged entries have evidence that wasn't enough to block; stale blocks
        haven't stopped a call in six months.
      </p>
      <div id="fraud-review-content">
        <div class="text-muted" style="text-align: center; padding: 2rem; font-size: 0.875rem;">Loading…</div>
      </div>
    </div>
  `;
}

export async function loadFraudReview() {
  const host = document.getElementById('fraud-review-content');
  if (!host) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { host.innerHTML = `<div class="text-muted">Session expired — please refresh.</div>`; return; }

    const res = await fetch(FN_URL, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      host.innerHTML = `<div style="color: #b91c1c; font-size: 0.875rem;">${escapeHtml(json?.error || `Could not load the queue (${res.status})`)}</div>`;
      return;
    }

    const disputes = json.disputes || [];
    const queue = json.queue || [];
    const decisions = json.recent_decisions || [];

    host.innerHTML = `
      ${disputes.length ? `
        <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Disputes — ${disputes.length}</h3>
        <p class="text-muted" style="margin: 0 0 0.75rem; font-size: 0.8125rem;">
          Each of these proved control of the number by reading back a code we texted to it.
          Upholding a dispute unblocks the number everywhere.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem;">
          ${disputes.map(d => `
            <div style="padding: 0.75rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 0.875rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <span style="font-family: monospace; font-weight: 600;">${escapeHtml(formatPhoneNumber(d.e164) || d.e164)}</span>
                <span class="text-muted" style="font-size: 0.8125rem;">filed ${escapeHtml(when(d.created_at))}</span>
                ${d.contact_email ? `<span class="text-muted" style="font-size: 0.8125rem;">${escapeHtml(d.contact_email)}</span>` : ''}
                <div style="margin-left: auto; display: flex; gap: 0.25rem;">
                  <button class="btn btn-sm fraud-act" data-e164="${escapeHtml(d.e164)}" data-action="uphold_dispute">Uphold &amp; unblock</button>
                  <button class="btn btn-sm fraud-act" data-e164="${escapeHtml(d.e164)}" data-action="reject_dispute">Reject</button>
                </div>
              </div>
              <div style="margin-top: 0.5rem; padding: 0.5rem 0.625rem; background: #fff; border-radius: 4px; color: #4b5563;">
                “${escapeHtml(d.reason || '')}”
              </div>
            </div>`).join('')}
        </div>` : ''}

      <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Queue — ${queue.length}</h3>
      ${queue.length === 0
        ? `<div class="text-muted" style="font-size: 0.875rem; padding: 0.5rem 0;">Nothing waiting on a decision.</div>`
        : `<div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${queue.map(q => renderQueueRow(q)).join('')}
          </div>`}

      ${decisions.length ? `
        <h3 style="margin: 2rem 0 0.5rem; font-size: 1rem;">Recent decisions</h3>
        <div style="display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; color: #4b5563;">
          ${decisions.map(d => `
            <div style="display: flex; gap: 0.6rem; padding: 0.3rem 0; border-bottom: 1px solid #e5e7eb;">
              <span style="font-family: monospace;">${escapeHtml(formatPhoneNumber(d.e164) || d.e164)}</span>
              <span><strong>${escapeHtml(d.action.replace(/_/g, ' '))}</strong></span>
              ${d.note ? `<span>${escapeHtml(d.note)}</span>` : ''}
              <span style="margin-left: auto;">${escapeHtml(when(d.created_at))}</span>
            </div>`).join('')}
        </div>` : ''}
    `;
  } catch (err) {
    console.error('loadFraudReview failed:', err);
    host.innerHTML = `<div style="color: #b91c1c; font-size: 0.875rem;">Could not load the queue. Check your connection and try again.</div>`;
  }
}

function renderQueueRow(q) {
  const ext = q.external || {};
  const carrier = q.lookup?.carrier || {};
  const place = [carrier.city, carrier.state || q.lookup?.location].filter(Boolean).join(', ');
  const cats = (q.categories || []).map(c => CATEGORY_LABELS[c] || c).join(', ');
  const blocked = q.status === 'blocked';

  return `
    <div style="padding: 0.75rem; background: #f9fafb; border-radius: 8px; font-size: 0.875rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span style="font-family: monospace; font-weight: 600;">${escapeHtml(formatPhoneNumber(q.e164) || q.e164)}</span>
        <span style="font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 4px; background: ${blocked ? '#fee2e2' : '#fef3c7'}; color: ${blocked ? '#b91c1c' : '#92400e'};">
          ${blocked ? 'BLOCKED' : 'FLAGGED'}
        </span>
        <span style="font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 4px; background: #e5e7eb; color: #4b5563;">RISK ${q.risk_score}</span>
        ${q.has_dispute ? `<span style="font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 4px; background: #fee2e2; color: #b91c1c;">DISPUTED</span>` : ''}
        <div style="margin-left: auto; display: flex; gap: 0.25rem;">
          ${blocked
            ? `<button class="btn btn-sm fraud-act" data-e164="${escapeHtml(q.e164)}" data-action="keep">Keep blocked</button>
               <button class="btn btn-sm fraud-act" data-e164="${escapeHtml(q.e164)}" data-action="clear">Unblock</button>`
            : `<button class="btn btn-sm fraud-act" data-e164="${escapeHtml(q.e164)}" data-action="promote">Block everywhere</button>
               <button class="btn btn-sm fraud-act" data-e164="${escapeHtml(q.e164)}" data-action="clear">Clear</button>
               <button class="btn btn-sm fraud-act" data-e164="${escapeHtml(q.e164)}" data-action="keep">Leave flagged</button>`}
        </div>
      </div>

      <div style="color: #6b7280; font-size: 0.8125rem; margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.1rem;">
        ${cats ? `<div>${escapeHtml(cats)}</div>` : ''}
        ${place || q.lookup?.line_type || carrier.lec
          ? `<div>${escapeHtml([place, q.lookup?.line_type, carrier.lec].filter(Boolean).join(' · '))}</div>` : ''}
        <div>
          ${q.first_party_reports} fraud report${q.first_party_reports === 1 ? '' : 's'} ·
          ${q.workspaces_blocking} blocklist${q.workspaces_blocking === 1 ? '' : 's'} ·
          ${(ext.total_complaints || 0).toLocaleString()} public complaint${ext.total_complaints === 1 ? '' : 's'} ·
          last evidence ${escapeHtml(when(q.last_evidence_at))}
        </div>
      </div>

      ${(q.reports || []).slice(0, 3).filter(r => r.evidence).map(r => `
        <div style="margin-top: 0.5rem; padding: 0.5rem 0.625rem; background: #fff; border-left: 3px solid #b91c1c; border-radius: 4px; font-size: 0.8125rem; color: #4b5563;">
          <span style="font-weight: 600;">${escapeHtml(SOURCE_LABELS[r.source] || r.source)}${r.confidence ? ` (${Math.round(r.confidence * 100)}%)` : ''}:</span>
          “${escapeHtml(r.evidence)}”
        </div>`).join('')}
    </div>`;
}

export function attachFraudReviewListeners() {
  const pane = document.getElementById('admin-pane-fraud');
  if (!pane || pane.dataset.bound) return;
  pane.dataset.bound = '1';

  pane.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.fraud-act');
    if (!btn) return;

    const { e164, action } = btn.dataset;
    const unblocks = action === 'clear' || action === 'uphold_dispute';
    // A note is required for anything that changes who gets through — this is
    // the answer to "why is this number blocked" six months from now.
    const note = window.prompt(
      unblocks
        ? `Unblocking ${formatPhoneNumber(e164) || e164} for every workspace. Why?`
        : action === 'promote'
          ? `Blocking ${formatPhoneNumber(e164) || e164} for every workspace. Why?`
          : `Note for ${formatPhoneNumber(e164) || e164} (optional):`,
      '',
    );
    if (note === null) return;
    if ((unblocks || action === 'promote') && note.trim().length < 5) {
      showToast('Add a short reason — this is the audit trail.', 'error');
      return;
    }

    btn.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ e164, action, note: note.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(json?.error || 'That did not save.', 'error'); return; }
      showToast(`${formatPhoneNumber(e164) || e164}: ${action.replace(/_/g, ' ')}`, 'success');
      await loadFraudReview();
    } catch (err) {
      console.error('fraud review action failed:', err);
      showToast('That did not save. Check your connection and try again.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
