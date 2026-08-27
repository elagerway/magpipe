/**
 * Phone Page — Fraud tab.
 *
 * The fraud list is GLOBAL: a number caught defrauding one workspace is
 * blocked for every workspace. What is shared is the number and its carrier
 * facts; the transcript evidence behind a report stays with the workspace
 * whose call it was, so this page only ever shows your own quotes.
 *
 * Public complaint counts (FTC / FCC) are shown as corroboration. They never
 * block on their own — consumer reports are unverified and caller ID is
 * spoofable, so a listing is an allegation about a displayed number, not proof
 * about the line that called.
 */

import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';
import { normalizeE164 } from '../../lib/phone-e164.js';
import { formatPhoneNumber, escapeHtml } from '../../lib/formatters.js';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-fraud-numbers`;
const REPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-fraud-number`;

const CATEGORY_LABELS = {
  gift_card: 'Gift card scam',
  wire_transfer: 'Wire transfer scam',
  bank_impersonation: 'Bank impersonation',
  government_impersonation: 'Government impersonation',
  tech_support: 'Tech support scam',
  crypto: 'Crypto scam',
  credential_phishing: 'Credential phishing',
  extortion: 'Extortion / threats',
  invoice_fraud: 'Invoice fraud',
  other: 'Other fraud',
};

/**
 * Risk bands. The legend below is generated from this same table, so the
 * thresholds a reader is told about are the ones the chips actually use.
 */
const RISK_BANDS = [
  {
    min: 70, label: 'High', bg: '#fee2e2', fg: '#b91c1c',
    meaning: 'Fraud confirmed in a call, often corroborated by other workspaces or public complaints.',
  },
  {
    min: 40, label: 'Elevated', bg: '#fef3c7', fg: '#92400e',
    meaning: 'Real evidence, but thinner — a single detection, or several workspaces blocking the number.',
  },
  {
    min: 0, label: 'Low', bg: '#e5e7eb', fg: '#4b5563',
    meaning: 'One weak signal. Usually a workspace muting a caller, or consumer complaints on their own.',
  },
];

/**
 * What this row means FOR THE VIEWER, not just globally.
 *
 * The global status alone was misleading: a number the workspace had blocked
 * itself showed as FLAGGED, which reads as "nothing is happening" when in fact
 * its calls are already being rejected for this workspace. The chip has to
 * answer "what happens when this number calls me".
 */
function effectiveStatus(e) {
  if (e.allowed_here) {
    return { label: 'ALLOWED HERE', bg: '#dbeafe', fg: '#1e40af',
      title: 'Blocked for other workspaces, but you let it through for yours.' };
  }
  if (e.status === 'blocked') {
    return { label: 'BLOCKED EVERYWHERE', bg: '#fee2e2', fg: '#b91c1c',
      title: 'Rejected for every workspace: calls get a busy signal, texts and WhatsApp are dropped.' };
  }
  if (e.blocked_here) {
    return { label: 'BLOCKED HERE', bg: '#fed7aa', fg: '#9a3412',
      title: 'On your own blocklist, so its calls already get a busy signal here. Not blocked for other workspaces.' };
  }
  if (e.origin === 'public_complaints') {
    return { label: 'PUBLIC COMPLAINTS', bg: '#e0e7ff', fg: '#3730a3',
      title: 'Reported to the FTC or FCC by consumers, not by anyone here. Never blocked on that alone.' };
  }
  if (e.status === 'cleared') {
    return { label: 'CLEARED', bg: '#e5e7eb', fg: '#4b5563',
      title: 'Reviewed and judged not fraud.' };
  }
  return { label: 'FLAGGED', bg: '#fef3c7', fg: '#92400e',
    title: 'On the list and watched, but calls still come through.' };
}

function riskColor(score) {
  return RISK_BANDS.find(b => score >= b.min) ?? RISK_BANDS[RISK_BANDS.length - 1];
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : shortDate(iso);
}

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * What is actually known about this number, in one line. Blocklist-seeded rows
 * used to read "0 reports across 0 workspaces", which is true and useless —
 * nobody reported them as fraud, a workspace just muted them.
 */
function evidenceLine(e) {
  const parts = [];
  if (e.origin === 'public_complaints') {
    const ext = e.external || {};
    const bits = [];
    if (ext.ftc_complaints) bits.push(`FTC ${ext.ftc_complaints.toLocaleString()}`);
    if (ext.fcc_complaints) bits.push(`FCC ${ext.fcc_complaints.toLocaleString()}`);
    parts.push(`${(ext.total_complaints || 0).toLocaleString()} consumer complaint${ext.total_complaints === 1 ? '' : 's'}${bits.length ? ` (${bits.join(' · ')})` : ''}`);
    if (e.last_seen_at) parts.push(`last reported ${relativeTime(e.last_seen_at)}`);
    return parts.join(' · ');
  }

  if (e.first_party_reports > 0) {
    parts.push(`${e.first_party_reports} fraud report${e.first_party_reports === 1 ? '' : 's'} from ${e.workspaces_reporting} workspace${e.workspaces_reporting === 1 ? '' : 's'}`);
  }
  if (e.workspaces_blocking > 0) {
    const others = e.workspaces_blocking - (e.blocked_here ? 1 : 0);
    if (e.blocked_here && others === 0) parts.push('on your blocklist');
    else if (e.blocked_here) parts.push(`on your blocklist and ${others} other${others === 1 ? '' : 's'}`);
    else parts.push(`on ${e.workspaces_blocking} workspace${e.workspaces_blocking === 1 ? '' : 's'}' blocklist${e.workspaces_blocking === 1 ? '' : 's'}`);
  }
  const complaints = e.external?.total_complaints || 0;
  if (complaints) parts.push(`${complaints.toLocaleString()} public complaint${complaints === 1 ? '' : 's'}`);
  if (parts.length === 0) parts.push('No corroborating evidence yet');
  if (e.last_seen_at) parts.push(`last seen ${shortDate(e.last_seen_at)}`);
  return parts.join(' · ');
}

/** Complaint subjects worth showing — the feeds pad with placeholder text. */
function complaintSubjects(ext) {
  return [...(ext.ftc_subjects || []), ...(ext.fcc_call_types || [])]
    .filter(x => x && x !== 'No Subject Provided' && x !== 'Other')
    .slice(0, 3);
}

/** City/State · line type · LEC — the carrier facts, on one line. */
function lookupLine(lookup) {
  if (!lookup) return '';
  const c = lookup.carrier || {};
  const place = [c.city, c.state || lookup.location].filter(Boolean).join(', ');
  return [place, lookup.line_type, c.lec].filter(Boolean).join(' · ');
}

export const fraudMethods = {
  /**
   * Legend for the risk score and the status chips.
   *
   * The score answers "how much do we know", the status answers "what is
   * happening to calls" — they are related but not the same, and the most
   * important thing on this page is that a high complaint count is not a
   * block. Kept collapsed so it doesn't push the list down.
   */
  renderRiskLegend() {
    const chip = (bg, fg, text, title = '') =>
      `<span${title ? ` title="${text.replace(/"/g, '&quot;')} — ${title}"` : ''} style="font-size: 0.7rem; font-weight: 600; background: ${bg}; color: ${fg}; padding: 0.15rem 0.5rem; border-radius: 4px; white-space: nowrap;">${text}</span>`;

    const band = (b, range) => `
      <div style="display: flex; align-items: baseline; gap: 0.6rem;">
        ${chip(b.bg, b.fg, `RISK ${range}`)}
        <span><strong>${b.label}.</strong> ${b.meaning}</span>
      </div>`;

    return `
      <details style="margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.6rem 0.75rem;">
        <summary style="cursor: pointer; font-size: 0.875rem; font-weight: 500; user-select: none;">What the risk scores and labels mean</summary>

        <div style="margin-top: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-secondary);">
          ${band(RISK_BANDS[0], '70–100')}
          ${band(RISK_BANDS[1], '40–69')}
          ${band(RISK_BANDS[2], '0–39')}
        </div>

        <div style="margin-top: 1rem; font-size: 0.8125rem; color: var(--text-secondary);">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">What moves the score</div>
          <ul style="margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.2rem;">
            <li><strong>Fraud found in one of your calls — 50 points</strong>, plus 5 for each repeat report and 8 for each additional workspace that saw it.</li>
            <li><strong>A workspace blocking the number — 12 points each</strong>, up to 30. Blocking a caller means “I don't want this call”, not “this is a scam”.</li>
            <li><strong>Consumer complaints to the FTC or FCC — 5 to 25 points</strong> depending on volume, and never more than 25.</li>
          </ul>
          <p style="margin: 0.6rem 0 0;">
            That cap is deliberate: complaints are unverified and caller ID is easy to fake, so a number with
            thousands of complaints and nothing else still scores below the point where anything is blocked.
            A score is what we know about a number — not what happens to its calls.
          </p>
        </div>

        <div style="margin-top: 1rem; font-size: 0.8125rem; color: var(--text-secondary);">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.4rem;">What happens to calls</div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#fee2e2', '#b91c1c', 'BLOCKED EVERYWHERE')}<span>Rejected for every workspace — calls get a busy signal, texts and WhatsApp are dropped.</span></div>
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#fed7aa', '#9a3412', 'BLOCKED HERE')}<span>On <em>your</em> blocklist, so its calls already get a busy signal here — but it still reaches other workspaces.</span></div>
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#fef3c7', '#92400e', 'FLAGGED')}<span>On the list and watched, but calls still come through.</span></div>
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#e0e7ff', '#3730a3', 'PUBLIC COMPLAINTS')}<span>Reported to the FTC or FCC by consumers, not by anyone here. Never blocked on that alone.</span></div>
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#dbeafe', '#1e40af', 'ALLOWED HERE')}<span>Blocked elsewhere, but you let it through for your workspace.</span></div>
            <div style="display: flex; align-items: baseline; gap: 0.6rem;">${chip('#e5e7eb', '#4b5563', 'CLEARED')}<span>Reviewed and judged not fraud. A new report re-flags it rather than silently re-blocking.</span></div>
          </div>
        </div>
      </details>`;
  },

  async loadFraudList(query = '', page = 1) {
    const container = document.getElementById('fraud-list-container');
    if (!container) return;
    this._fraudQuery = query;
    this._fraudPage = page;
    this._fraudPageSize = this._fraudPageSize || 20;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        container.innerHTML = `<div class="text-muted" style="font-size: 0.875rem;">Session expired — please refresh.</div>`;
        return;
      }

      const params = new URLSearchParams({ limit: String(this._fraudPageSize), page: String(page) });
      if (query) params.set('q', query);
      const url = `${FN_URL}?${params}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        container.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">${escapeHtml(json?.error || `Could not load the fraud list (${res.status})`)}</div>`;
        return;
      }

      const entries = json.entries || [];
      this._fraudEntries = entries;
      this.renderSearchStatus(json, entries.length);
      this.renderPager(json);

      if (entries.length === 0) {
        container.innerHTML = json.searching
          ? `<div class="text-muted" style="font-size: 0.875rem; padding: 0.5rem 0;">
               Nothing matches “${escapeHtml(query)}” — not on the fraud list, and not in the
               FTC or FCC complaint data either.
             </div>`
          : `<div class="text-muted" style="font-size: 0.875rem; padding: 0.5rem 0;">
               No numbers on the fraud list yet. Calls are checked automatically —
               when a transcript shows obvious fraud the caller is added here and
               blocked everywhere. You can also report a number with the button above.
             </div>`;
        return;
      }

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${entries.map(e => this.renderFraudRow(e)).join('')}
        </div>`;
    } catch (err) {
      console.error('loadFraudList failed:', err);
      container.innerHTML = `<div style="color: var(--danger-color, #b91c1c); font-size: 0.875rem;">Could not load the fraud list. Check your connection and try again.</div>`;
    }
  },

  /**
   * Says what was searched and how much of it is on screen. Search covers the
   * whole database, so a capped result set has to admit it rather than look
   * like the complete answer.
   */
  renderSearchStatus(json, shown) {
    const el = document.getElementById('fraud-search-status');
    if (!el) return;
    if (!json.searching) { el.style.display = 'none'; el.innerHTML = ''; return; }

    const total = json.total ?? shown;
    el.innerHTML = `
      ${total.toLocaleString()} match${total === 1 ? '' : 'es'} for
      “${escapeHtml(json.query || '')}” across the whole database.
      <button type="button" id="fraud-search-clear" class="btn btn-sm" style="margin-left: 0.5rem;">Clear</button>`;
    el.style.display = 'block';
  },

  /** Page controls. Hidden when everything fits on one page. */
  renderPager(json) {
    const el = document.getElementById('fraud-pager');
    if (!el) return;

    const page = json.page || 1;
    const pages = json.total_pages || 1;
    const size = json.page_size || 20;
    const total = json.total || 0;

    if (total === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }

    const from = total === 0 ? 0 : (page - 1) * size + 1;
    const to = Math.min(page * size, total);

    el.innerHTML = `
      <span style="color: var(--text-secondary);">
        ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}
      </span>
      <label style="display: flex; align-items: center; gap: 0.4rem; color: var(--text-secondary);">
        <span>Per page</span>
        <select id="fraud-page-size" style="padding: 0.3rem 0.5rem; border: 1px solid var(--border-color); border-radius: 6px; font-size: 0.8125rem; background: var(--bg-primary); color: var(--text-primary);">
          ${[20, 50, 100].map(n => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
      <div style="margin-left: auto; display: flex; align-items: center; gap: 0.4rem;">
        <button type="button" class="btn btn-sm fraud-page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span style="color: var(--text-secondary); font-variant-numeric: tabular-nums;">Page ${page} of ${pages}</span>
        <button type="button" class="btn btn-sm fraud-page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>
      </div>`;
    el.style.display = 'flex';
  },

  renderActivity(e) {
    const acts = e.activity || [];
    if (acts.length === 0) return '<div style="color: var(--text-secondary); font-size: 0.8125rem;">No activity recorded yet.</div>';

    const when = relativeTime;

    const SOURCE_LABELS = {
      transcript_llm: 'Detected in a call transcript',
      manual: 'Reported by hand',
      inbox_report: 'Reported from the inbox',
      workspace_block: 'Added to a blocklist',
    };

    return `
      <div style="display: flex; flex-direction: column; gap: 0.3rem;">
        ${acts.map(a => {
          const who = a.mine ? 'this workspace' : 'another workspace';
          const text = a.type === 'report'
            ? `${SOURCE_LABELS[a.source] || 'Reported'} — ${who}`
            : `Blocked a ${a.channel === 'call' ? 'call' : a.channel === 'sms' ? 'text' : 'WhatsApp message'} — ${who}`;
          const dot = a.type === 'report' ? '#b91c1c' : '#6b7280';
          return `
            <div style="display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.8125rem;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${dot}; flex: 0 0 auto;"></span>
              <span>${escapeHtml(text)}</span>
              <span style="margin-left: auto; color: var(--text-secondary); font-variant-numeric: tabular-nums;">${escapeHtml(when(a.at))}</span>
            </div>`;
        }).join('')}
      </div>`;
  },

  renderFraudDetail(e) {
    const l = e.lookup || {};
    const c = l.carrier || {};
    const ext = e.external || {};
    const st = e.stats || {};

    const field = (label, value) => value
      ? `<div><span style="color: var(--text-secondary);">${escapeHtml(label)}</span><br><span style="font-weight: 500;">${escapeHtml(String(value))}</span></div>`
      : '';

    const subjects = [...(ext.ftc_subjects || []), ...(ext.fcc_call_types || [])]
      .filter(x => x && x !== 'No Subject Provided').slice(0, 4);

    return `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
        <div style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.5rem;">Carrier record</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.6rem; font-size: 0.8125rem; margin-bottom: 1rem;">
          ${field('City', c.city)}
          ${field('State/Prov', c.state || l.location)}
          ${field('Line type', l.line_type)}
          ${field('LEC/CLEC', c.lec)}
          ${field('CNAM', l.cnam)}
          ${field('OCN', c.ocn)}
          ${field('LATA', c.lata)}
          ${field('LRN', c.lrn)}
        </div>

        <div style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.5rem;">Evidence</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.6rem; font-size: 0.8125rem; margin-bottom: 1rem;">
          ${field('Fraud reports', e.first_party_reports)}
          ${field('Workspaces reporting', e.workspaces_reporting)}
          ${field('Workspaces blocking', e.workspaces_blocking)}
          ${field('Public complaints', ext.total_complaints ? `${ext.total_complaints} (FTC ${ext.ftc_complaints || 0} · FCC ${ext.fcc_complaints || 0})` : null)}
          ${field('First seen', shortDate(e.first_seen_at))}
          ${field('Blocked since', shortDate(e.blocked_at))}
        </div>
        ${subjects.length ? `<div style="font-size: 0.8125rem; color: var(--text-secondary); margin: -0.5rem 0 1rem;">Complaint subjects: ${escapeHtml(subjects.join(' · '))}</div>` : ''}

        <div style="font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.5rem;">
          Recent activity${st.blocks_total ? ` — ${st.blocks_total} block${st.blocks_total === 1 ? '' : 's'}${st.blocks_24h ? `, ${st.blocks_24h} in the last 24h` : ''}` : ''}
        </div>
        ${this.renderActivity(e)}

        ${st.my_calls ? `<div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.75rem;">This workspace took ${st.my_calls} call${st.my_calls === 1 ? '' : 's'} from this number before it was listed — last ${escapeHtml(shortDate(st.my_last_call_at))}.</div>` : ''}
      </div>`;
  },

  renderFraudRow(e) {
    const risk = riskColor(e.risk_score);
    // A blocklist-seeded row has no reported category — saying "Other fraud"
    // asserts something nobody claimed.
    const cats = e.first_party_reports > 0
      ? (e.categories || []).map(c => CATEGORY_LABELS[c] || c).join(', ')
      : '';
    const ext = e.external || {};
    const stats = e.stats || {};
    const extTotal = ext.total_complaints || 0;
    const carrier = lookupLine(e.lookup);
    const cnam = e.lookup?.cnam;

    const isPublic = e.origin === 'public_complaints';
    const st = effectiveStatus(e);
    const statusChip = `<span${st.title ? ` title="${escapeHtml(st.title)}"` : ''} style="font-size: 0.7rem; font-weight: 600; background: ${st.bg}; color: ${st.fg}; padding: 0.15rem 0.5rem; border-radius: 4px;">${st.label}</span>`;

    return `
      <div data-e164="${escapeHtml(e.e164)}" style="padding: 0.75rem; background: var(--bg-secondary, #f9fafb); border-radius: 8px; font-size: 0.875rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <span style="font-family: monospace; font-weight: 600;">${escapeHtml(formatPhoneNumber(e.e164) || e.e164)}</span>
          ${statusChip}
          <span style="font-size: 0.7rem; font-weight: 600; background: ${risk.bg}; color: ${risk.fg}; padding: 0.15rem 0.5rem; border-radius: 4px;">RISK ${e.risk_score}</span>
          ${e.reported_here ? `<span style="font-size: 0.7rem; color: var(--text-secondary);">reported by you</span>` : ''}
          <div style="margin-left: auto; display: flex; gap: 0.25rem;">
            ${isPublic ? `
              <button class="btn btn-sm fraud-report-this-btn" data-e164="${escapeHtml(e.e164)}">Report &amp; block</button>
            ` : `
              <button class="btn btn-sm fraud-detail-btn" data-e164="${escapeHtml(e.e164)}">Details</button>
              <button class="btn btn-sm fraud-allow-btn" data-e164="${escapeHtml(e.e164)}" data-allowed="${e.allowed_here ? '1' : ''}">
                ${e.allowed_here ? 'Block again here' : 'Allow here'}
              </button>
            `}
          </div>
        </div>

        <div style="color: var(--text-secondary); font-size: 0.8125rem; margin-top: 0.35rem; display: flex; flex-direction: column; gap: 0.15rem;">
          ${cats ? `<div>${escapeHtml(cats)}</div>` : ''}
          ${cnam ? `<div>CNAM: ${escapeHtml(cnam)}</div>` : ''}
          ${carrier ? `<div>${escapeHtml(carrier)}</div>` : ''}
          <div>${escapeHtml(evidenceLine(e))}</div>
          ${extTotal > 0 ? `
            <div title="Public consumer complaints. Advisory only — these never block a number on their own.">
              Public complaints: ${extTotal}
              ${ext.ftc_complaints ? ` · FTC ${ext.ftc_complaints}` : ''}
              ${ext.fcc_complaints ? ` · FCC ${ext.fcc_complaints}` : ''}
            </div>` : ''}
          ${stats.blocks_total ? `
            <div>
              Stopped ${stats.blocks_total} inbound attempt${stats.blocks_total === 1 ? '' : 's'}${stats.blocks_24h ? ` · ${stats.blocks_24h} in the last 24h` : ''}${stats.last_blocked_at ? ` · last ${escapeHtml(shortDate(stats.last_blocked_at))}` : ''}
            </div>` : ''}
          ${e.blocked_here && e.blocked_here_label ? `<div>Your label: ${escapeHtml(e.blocked_here_label)}</div>` : ''}
          ${isPublic && complaintSubjects(ext).length ? `<div>${escapeHtml(complaintSubjects(ext).join(' · '))}</div>` : ''}
        </div>

        ${isPublic ? '' : `
        <div class="fraud-detail" data-for="${escapeHtml(e.e164)}" style="display: none;">
          ${this.renderFraudDetail(e)}
        </div>`}

        ${(e.my_reports || []).length > 0 && e.my_reports[0].evidence ? `
          <div style="margin-top: 0.5rem; padding: 0.5rem 0.625rem; background: var(--bg-primary, #fff); border-left: 3px solid #b91c1c; border-radius: 4px; font-size: 0.8125rem; color: var(--text-secondary);">
            “${escapeHtml(e.my_reports[0].evidence)}”
          </div>` : ''}
      </div>`;
  },

  attachFraudListeners() {
    const panel = document.getElementById('fraud-panel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';

    panel.addEventListener('submit', async (ev) => {
      if (ev.target.id !== 'fraud-search-form') return;
      ev.preventDefault();
      await this.loadFraudList(document.getElementById('fraud-search-input')?.value.trim() || '', 1);
    });

    // A search box that only works on Enter feels broken, but a request per
    // keystroke hammers a 310k-row scan — debounce instead.
    panel.addEventListener('change', async (ev) => {
      if (ev.target.id !== 'fraud-page-size') return;
      this._fraudPageSize = Number(ev.target.value) || 20;
      // A different page size makes the old page number meaningless.
      await this.loadFraudList(this._fraudQuery || '', 1);
    });

    panel.addEventListener('input', (ev) => {
      if (ev.target.id !== 'fraud-search-input') return;
      clearTimeout(this._fraudSearchTimer);
      const value = ev.target.value.trim();
      this._fraudSearchTimer = setTimeout(() => {
        // Under 3 characters isn't a search — fall back to the default view.
        this.loadFraudList(value.length >= 3 ? value : '', 1);
      }, 350);
    });

    panel.addEventListener('click', async (ev) => {
      const detailBtn = ev.target.closest('.fraud-detail-btn');
      if (detailBtn) {
        const box = panel.querySelector(`.fraud-detail[data-for="${CSS.escape(detailBtn.dataset.e164)}"]`);
        if (box) {
          const open = box.style.display !== 'none';
          box.style.display = open ? 'none' : '';
          detailBtn.textContent = open ? 'Details' : 'Hide';
        }
        return;
      }

      const allowBtn = ev.target.closest('.fraud-allow-btn');
      if (allowBtn) {
        await this.toggleFraudAllow(allowBtn.dataset.e164, !!allowBtn.dataset.allowed);
        return;
      }
      if (ev.target.closest('#fraud-report-btn')) {
        this.openFraudReportModal();
        return;
      }
      const pageBtn = ev.target.closest('.fraud-page-btn');
      if (pageBtn && !pageBtn.disabled) {
        await this.loadFraudList(this._fraudQuery || '', Number(pageBtn.dataset.page));
        document.getElementById('fraud-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (ev.target.closest('#fraud-search-clear')) {
        const input = document.getElementById('fraud-search-input');
        if (input) input.value = '';
        await this.loadFraudList('', 1);
        return;
      }
      const reportThis = ev.target.closest('.fraud-report-this-btn');
      if (reportThis) {
        this.openFraudReportModal(reportThis.dataset.e164);
        return;
      }
      if (ev.target.closest('#fraud-modal-close') || ev.target.closest('#fraud-modal-cancel')) {
        this.closeFraudReportModal();
        return;
      }
      // Click the backdrop (not the dialog) to dismiss.
      if (ev.target.id === 'fraud-modal-overlay') this.closeFraudReportModal();
    });

    panel.addEventListener('submit', async (ev) => {
      if (ev.target.id !== 'fraud-report-form') return;
      ev.preventDefault();
      await this.submitFraudReport();
    });

    // Escape closes the modal, like every other dialog on the page.
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      const overlay = document.getElementById('fraud-modal-overlay');
      if (overlay && overlay.style.display !== 'none') this.closeFraudReportModal();
    });
  },

  openFraudReportModal(prefillNumber = '') {
    const overlay = document.getElementById('fraud-modal-overlay');
    if (!overlay) return;
    document.getElementById('fraud-report-form')?.reset();
    const err = document.getElementById('fraud-modal-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    const numberInput = document.getElementById('fraud-number');
    if (numberInput) numberInput.value = prefillNumber;
    overlay.style.display = 'flex';
    (prefillNumber ? document.getElementById('fraud-category') : numberInput)?.focus();
  },

  closeFraudReportModal() {
    const overlay = document.getElementById('fraud-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  showFraudModalError(message) {
    const err = document.getElementById('fraud-modal-error');
    if (!err) { showToast(message, 'error'); return; }
    err.textContent = message;
    err.style.display = 'block';
  },

  async submitFraudReport() {
    const rawNumber = document.getElementById('fraud-number')?.value || '';
    const category = document.getElementById('fraud-category')?.value || '';
    const evidence = (document.getElementById('fraud-evidence')?.value || '').trim();
    const submitBtn = document.getElementById('fraud-submit-btn');

    const e164 = normalizeE164(rawNumber);
    if (!e164) {
      this.showFraudModalError(`That doesn't look like a valid phone number. Try a format like (604) 555-1234.`);
      return;
    }
    if (!category) { this.showFraudModalError('Choose what kind of fraud this was.'); return; }
    if (evidence.length < 10) {
      this.showFraudModalError('Add a sentence about what happened — this is the record of why the number was blocked.');
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Reporting…'; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { this.showFraudModalError('Your session expired. Sign in again and retry.'); return; }

      const res = await fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ e164, source: 'manual', category, evidence }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.showFraudModalError(json?.error || `Could not report that number (${res.status}).`);
        return;
      }

      this.closeFraudReportModal();
      const number = formatPhoneNumber(e164) || e164;
      if (json.blocked) {
        showToast(`${number} is now blocked for every workspace`, 'success');
      } else {
        // A guard fired — say which, so "nothing happened" is never the message.
        const why = {
          known_contact: "it's one of your contacts",
          whitelisted_caller: "it's on your whitelist",
          own_service_number: "it's one of your own numbers",
          rate_limited: 'too many numbers were blocked in the last hour',
          awaiting_corroboration: 'another workspace needs to report it too',
          low_confidence: 'the evidence was inconclusive',
        };
        const reasons = (json.guards || []).map(g => why[g] || g).join(', ');
        showToast(`${number} was flagged for review${reasons ? ` — not blocked because ${reasons}` : ''}`, 'success');
      }
      await this.loadFraudList(this._fraudQuery || '', this._fraudPage || 1);
    } catch (err) {
      console.error('submitFraudReport failed:', err);
      this.showFraudModalError('Could not report that number. Check your connection and try again.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Report and block'; }
    }
  },

  async toggleFraudAllow(e164, currentlyAllowed) {
    if (!currentlyAllowed) {
      const ok = await showConfirmModal({
        title: 'Allow this number here?',
        message: `Calls, texts and WhatsApp messages from ${formatPhoneNumber(e164) || e164} will reach this workspace again. It stays blocked for everyone else.`,
        confirmText: 'Allow here',
      });
      if (!ok) return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: currentlyAllowed ? 'unallow' : 'allow', e164 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(json?.error || 'That did not save. Try again.', 'error'); return; }
      showToast(currentlyAllowed ? 'Blocked here again' : 'Allowed in this workspace', 'success');
      await this.loadFraudList(this._fraudQuery || '', this._fraudPage || 1);
    } catch (err) {
      console.error('toggleFraudAllow failed:', err);
      showToast('That did not save. Check your connection and try again.', 'error');
    }
  },

};
