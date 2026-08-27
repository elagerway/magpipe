/**
 * Public page — dispute a fraud listing.
 *
 * Written for someone who does not use Magpipe and has just found out their
 * number is being rejected. Usually a spoofing victim: a scammer put their
 * number on the caller ID, the calls got reported, and now their real calls
 * bounce. They are frustrated and they have no account here.
 *
 * So: no jargon, no login, and it says plainly what will and won't happen.
 * Control of the number is proved by a code texted to it, which is what stops
 * this being a form for un-blocking anyone else's number.
 */

import { normalizeE164 } from '../lib/phone-e164.js';
import { escapeHtml, formatPhoneNumber } from '../lib/formatters.js';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fraud-dispute`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const FIELD = 'width: 100%; padding: 0.7rem 0.85rem; border: 1px solid var(--border-color, #d1d5db); border-radius: 8px; font-size: 1rem; font-family: inherit; box-sizing: border-box;';

export default class FraudDisputePage {
  constructor() {
    this.step = 'start';
    this.number = '';
  }

  async render() {
    document.getElementById('app').innerHTML = `
      <div style="max-width: 34rem; margin: 0 auto; padding: 3rem 1.5rem 4rem;">
        <h1 style="font-size: 1.6rem; margin: 0 0 0.5rem;">Dispute a blocked number</h1>
        <p style="color: var(--text-secondary, #6b7280); line-height: 1.6; margin: 0 0 1.5rem;">
          If calls from your number are being rejected by businesses that use Magpipe, you can ask us
          to review it. This often happens to people whose number a scammer has faked on caller ID.
        </p>

        <div id="dispute-body"></div>

        <p style="color: var(--text-secondary, #6b7280); font-size: 0.8125rem; line-height: 1.6; margin-top: 2rem;">
          We only ever text the number being disputed, and only when someone asks us to.
          Questions: <a href="mailto:support@magpipe.ai">support@magpipe.ai</a>.
        </p>
      </div>`;

    this.renderStep();
    document.getElementById('app').addEventListener('submit', (ev) => this.onSubmit(ev));
  }

  renderStep(error = '') {
    const body = document.getElementById('dispute-body');
    if (!body) return;

    const err = error
      ? `<div style="color: #b91c1c; font-size: 0.875rem; margin-bottom: 0.75rem;">${escapeHtml(error)}</div>`
      : '';

    if (this.step === 'start') {
      body.innerHTML = `
        ${err}
        <form id="dispute-start" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <label style="display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9375rem;">
            <span>Your phone number</span>
            <input id="dispute-number" type="tel" required autocomplete="tel"
              placeholder="(604) 555-1234" style="${FIELD}">
            <span style="color: var(--text-secondary, #6b7280); font-size: 0.8125rem;">
              We'll text this number a six-digit code, so we know it's yours.
            </span>
          </label>
          <button type="submit" class="btn btn-primary" style="padding: 0.7rem;">Send me a code</button>
        </form>`;
      return;
    }

    if (this.step === 'verify') {
      body.innerHTML = `
        ${err}
        <p style="font-size: 0.9375rem; margin: 0 0 1rem;">
          If ${escapeHtml(formatPhoneNumber(this.number) || this.number)} is on our list, a code is on its way to it.
        </p>
        <form id="dispute-verify" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <label style="display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9375rem;">
            <span>Six-digit code</span>
            <input id="dispute-code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
              required autocomplete="one-time-code" placeholder="123456" style="${FIELD} letter-spacing: 0.2em;">
          </label>
          <label style="display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9375rem;">
            <span>Why should this number be unblocked?</span>
            <textarea id="dispute-reason" rows="4" required maxlength="1000"
              placeholder="e.g. This is my business line. Someone has been faking it on caller ID — I've been getting angry callbacks about calls I never made."
              style="${FIELD} resize: vertical;"></textarea>
          </label>
          <label style="display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9375rem;">
            <span>Email (optional)</span>
            <input id="dispute-email" type="email" autocomplete="email" placeholder="you@example.com" style="${FIELD}">
            <span style="color: var(--text-secondary, #6b7280); font-size: 0.8125rem;">
              So we can tell you what we decide. Leave it blank if you'd rather not.
            </span>
          </label>
          <button type="submit" class="btn btn-primary" style="padding: 0.7rem;">Submit dispute</button>
          <button type="button" id="dispute-restart" class="btn btn-secondary">Use a different number</button>
        </form>`;
      document.getElementById('dispute-restart')?.addEventListener('click', () => {
        this.step = 'start';
        this.renderStep();
      });
      return;
    }

    body.innerHTML = `
      <div style="padding: 1.25rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
        <h2 style="margin: 0 0 0.5rem; font-size: 1.1rem;">Dispute received</h2>
        <p style="margin: 0; line-height: 1.6; font-size: 0.9375rem;">
          Someone will look at it. Calls from your number stay blocked until they do — we don't
          unblock automatically, because the same form would otherwise let a scammer unblock
          themselves. If you left an email address, we'll tell you what we decide.
        </p>
      </div>`;
  }

  async post(payload) {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  }

  async onSubmit(ev) {
    const form = ev.target;
    if (form.id !== 'dispute-start' && form.id !== 'dispute-verify') return;
    ev.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Working…'; }

    try {
      if (form.id === 'dispute-start') {
        const raw = document.getElementById('dispute-number')?.value || '';
        const e164 = normalizeE164(raw);
        if (!e164) { this.renderStep(`That doesn't look like a phone number. Try a format like (604) 555-1234.`); return; }

        const { ok, json } = await this.post({ action: 'start', number: e164 });
        if (!ok) { this.number = e164; this.step = 'start'; this.renderStep(json?.error || 'Something went wrong. Try again shortly.'); return; }

        this.number = e164;
        this.step = 'verify';
        this.renderStep();
        return;
      }

      const code = document.getElementById('dispute-code')?.value.trim() || '';
      const reason = document.getElementById('dispute-reason')?.value.trim() || '';
      const email = document.getElementById('dispute-email')?.value.trim() || '';

      const { ok, json } = await this.post({
        action: 'verify', number: this.number, code, reason, contact_email: email,
      });
      if (!ok) { this.renderStep(json?.error || 'Something went wrong. Try again shortly.'); return; }

      this.step = 'done';
      this.renderStep();
    } catch (err) {
      console.error('dispute submit failed:', err);
      this.renderStep('Could not reach us just now. Check your connection and try again.');
    } finally {
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }
}
