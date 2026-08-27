/**
 * Phone Page — Lookup tab
 *
 * Look up a phone number via the lookup-phone-number edge function
 * (SignalWire CNAM/line-type + cross-reference against the user's own
 * Magpipe data) and render the result. Lookup runs only on explicit
 * submit — SignalWire bills per query.
 */

import { supabase } from '../../lib/supabase.js';
import { escapeHtml, formatPhoneNumber } from '../../lib/formatters.js';
import { normalizeE164 } from '../../lib/phone-e164.js';

export const lookupMethods = {
  renderLookupContent() {
    return `
      <div class="card" style="max-width: 560px;">
        <h2 style="margin: 0 0 0.25rem;">Number Lookup</h2>
        <p class="text-muted" style="margin: 0 0 1rem; font-size: 0.875rem;">
          Look up caller name and line type for a number, and see your history with it.
        </p>
        <form id="lookup-form" style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <input id="lookup-input" type="tel" inputmode="tel" placeholder="(604) 555-1234"
            autocomplete="off"
            style="flex: 1; min-width: 0; padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.9375rem;">
          <button type="submit" id="lookup-btn" class="btn btn-primary" style="white-space: nowrap;">Look up</button>
        </form>
        <div id="lookup-results"></div>
      </div>
    `;
  },

  attachLookupListeners() {
    const form = document.getElementById('lookup-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('lookup-input');
      this.performLookup(input?.value || '');
    });
  },

  async performLookup(rawNumber) {
    const resultsEl = document.getElementById('lookup-results');
    const btn = document.getElementById('lookup-btn');
    if (!resultsEl) return;

    const number = (rawNumber || '').trim();
    if (!number) {
      resultsEl.innerHTML = `<div class="text-muted" style="font-size: 0.875rem;">Enter a number to look up.</div>`;
      return;
    }

    // Validate locally before spending a (billed) SignalWire lookup.
    if (!normalizeE164(number)) {
      resultsEl.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">That doesn't look like a valid phone number. Try a format like (604) 555-1234.</div>`;
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Looking up…'; }
    resultsEl.innerHTML = `<div class="text-muted" style="text-align: center; padding: 1.5rem; font-size: 0.875rem;">Looking up…</div>`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        resultsEl.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">Your session expired. Please sign in again.</div>`;
        return;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lookup-phone-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ number }),
      });
      const data = await resp.json();

      if (!resp.ok || data?.error) {
        const msg = data?.error?.message || `Lookup failed (${resp.status})`;
        resultsEl.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">${escapeHtml(msg)}</div>`;
        return;
      }

      resultsEl.innerHTML = this.renderLookupResults(data);
    } catch (err) {
      console.error('Lookup error:', err);
      resultsEl.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">Lookup failed. Please try again.</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Look up'; }
    }
  },

  renderLookupResults(d) {
    const m = d.magpipe || {};
    const row = (label, value) => `
      <div style="display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border-color);">
        <span class="text-muted" style="font-size: 0.8125rem;">${escapeHtml(label)}</span>
        <span style="font-size: 0.875rem; text-align: right;">${value}</span>
      </div>`;
    const yesNo = (v, extra) => v
      ? `<span style="color: #16a34a;">Yes</span>${extra ? ` <span class="text-muted">(${escapeHtml(extra)})</span>` : ''}`
      : `<span class="text-muted">No</span>`;

    const title = escapeHtml(d.national_format || formatPhoneNumber(d.e164) || d.e164 || '');
    const loc = [d.location, d.country].filter(Boolean).map(escapeHtml).join(', ');

    let historyText = 'None';
    if ((m.call_count || 0) > 0 || (m.sms_count || 0) > 0) {
      const parts = [];
      if (m.call_count) parts.push(`${m.call_count} call${m.call_count === 1 ? '' : 's'}`);
      if (m.sms_count) parts.push(`${m.sms_count} SMS`);
      if (m.last_interaction) parts.push(`last ${escapeHtml(new Date(m.last_interaction).toLocaleDateString())}`);
      historyText = parts.join(', ');
    }

    return `
      <div style="border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem 1.25rem;">
        <div style="font-size: 1.0625rem; font-weight: 600; margin-bottom: 0.75rem;">${title}</div>
        ${d.cnam ? row('Caller name (CNAM)', `<strong>${escapeHtml(d.cnam)}</strong>`) : ''}
        ${d.line_type ? row('Line type', escapeHtml(d.line_type)) : ''}
        ${d.carrier?.name ? row('Carrier', escapeHtml(d.carrier.name)) : ''}
        ${loc ? row('Location', loc) : ''}
        <div style="height: 0.75rem;"></div>
        <div class="text-muted" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Your history</div>
        ${row('In contacts', yesNo(m.in_contacts, m.contact_name))}
        ${row('Blocked', yesNo(m.blocked, m.blocked_label))}
        ${row('Whitelisted', yesNo(m.whitelisted, m.whitelist_label))}
        ${row('History', historyText)}
        ${d.signalwire_error ? `<div class="text-muted" style="font-size: 0.75rem; margin-top: 0.75rem;">Carrier/CNAM data unavailable: ${escapeHtml(d.signalwire_error)}</div>` : ''}
      </div>
    `;
  },
};
