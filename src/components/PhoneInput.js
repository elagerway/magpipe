/**
 * Reusable international phone input: country-code picker (flag + dial code
 * overlaying a native <select>) with local-number formatting. Extracted from
 * the verify-phone page so Settings/admin reuse the exact same UX.
 */

import { isValidE164, normalizeE164 } from '../lib/phone-e164.js';

// Country codes for the dropdown — US/CA first, then alphabetical
export const COUNTRY_CODES = [
  { code: '+1', flag: '\u{1F1FA}\u{1F1F8}', name: 'United States' },
  { code: '+1', flag: '\u{1F1E8}\u{1F1E6}', name: 'Canada' },
  { code: '+93', flag: '\u{1F1E6}\u{1F1EB}', name: 'Afghanistan' },
  { code: '+355', flag: '\u{1F1E6}\u{1F1F1}', name: 'Albania' },
  { code: '+213', flag: '\u{1F1E9}\u{1F1FF}', name: 'Algeria' },
  { code: '+54', flag: '\u{1F1E6}\u{1F1F7}', name: 'Argentina' },
  { code: '+61', flag: '\u{1F1E6}\u{1F1FA}', name: 'Australia' },
  { code: '+43', flag: '\u{1F1E6}\u{1F1F9}', name: 'Austria' },
  { code: '+973', flag: '\u{1F1E7}\u{1F1ED}', name: 'Bahrain' },
  { code: '+880', flag: '\u{1F1E7}\u{1F1E9}', name: 'Bangladesh' },
  { code: '+32', flag: '\u{1F1E7}\u{1F1EA}', name: 'Belgium' },
  { code: '+55', flag: '\u{1F1E7}\u{1F1F7}', name: 'Brazil' },
  { code: '+359', flag: '\u{1F1E7}\u{1F1EC}', name: 'Bulgaria' },
  { code: '+855', flag: '\u{1F1F0}\u{1F1ED}', name: 'Cambodia' },
  { code: '+56', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile' },
  { code: '+86', flag: '\u{1F1E8}\u{1F1F3}', name: 'China' },
  { code: '+57', flag: '\u{1F1E8}\u{1F1F4}', name: 'Colombia' },
  { code: '+506', flag: '\u{1F1E8}\u{1F1F7}', name: 'Costa Rica' },
  { code: '+385', flag: '\u{1F1ED}\u{1F1F7}', name: 'Croatia' },
  { code: '+357', flag: '\u{1F1E8}\u{1F1FE}', name: 'Cyprus' },
  { code: '+420', flag: '\u{1F1E8}\u{1F1FF}', name: 'Czech Republic' },
  { code: '+45', flag: '\u{1F1E9}\u{1F1F0}', name: 'Denmark' },
  { code: '+593', flag: '\u{1F1EA}\u{1F1E8}', name: 'Ecuador' },
  { code: '+20', flag: '\u{1F1EA}\u{1F1EC}', name: 'Egypt' },
  { code: '+503', flag: '\u{1F1F8}\u{1F1FB}', name: 'El Salvador' },
  { code: '+372', flag: '\u{1F1EA}\u{1F1EA}', name: 'Estonia' },
  { code: '+251', flag: '\u{1F1EA}\u{1F1F9}', name: 'Ethiopia' },
  { code: '+358', flag: '\u{1F1EB}\u{1F1EE}', name: 'Finland' },
  { code: '+33', flag: '\u{1F1EB}\u{1F1F7}', name: 'France' },
  { code: '+49', flag: '\u{1F1E9}\u{1F1EA}', name: 'Germany' },
  { code: '+233', flag: '\u{1F1EC}\u{1F1ED}', name: 'Ghana' },
  { code: '+30', flag: '\u{1F1EC}\u{1F1F7}', name: 'Greece' },
  { code: '+502', flag: '\u{1F1EC}\u{1F1F9}', name: 'Guatemala' },
  { code: '+504', flag: '\u{1F1ED}\u{1F1F3}', name: 'Honduras' },
  { code: '+852', flag: '\u{1F1ED}\u{1F1F0}', name: 'Hong Kong' },
  { code: '+36', flag: '\u{1F1ED}\u{1F1FA}', name: 'Hungary' },
  { code: '+354', flag: '\u{1F1EE}\u{1F1F8}', name: 'Iceland' },
  { code: '+91', flag: '\u{1F1EE}\u{1F1F3}', name: 'India' },
  { code: '+62', flag: '\u{1F1EE}\u{1F1E9}', name: 'Indonesia' },
  { code: '+98', flag: '\u{1F1EE}\u{1F1F7}', name: 'Iran' },
  { code: '+964', flag: '\u{1F1EE}\u{1F1F6}', name: 'Iraq' },
  { code: '+353', flag: '\u{1F1EE}\u{1F1EA}', name: 'Ireland' },
  { code: '+972', flag: '\u{1F1EE}\u{1F1F1}', name: 'Israel' },
  { code: '+39', flag: '\u{1F1EE}\u{1F1F9}', name: 'Italy' },
  { code: '+81', flag: '\u{1F1EF}\u{1F1F5}', name: 'Japan' },
  { code: '+962', flag: '\u{1F1EF}\u{1F1F4}', name: 'Jordan' },
  { code: '+7', flag: '\u{1F1F0}\u{1F1FF}', name: 'Kazakhstan' },
  { code: '+254', flag: '\u{1F1F0}\u{1F1EA}', name: 'Kenya' },
  { code: '+82', flag: '\u{1F1F0}\u{1F1F7}', name: 'South Korea' },
  { code: '+965', flag: '\u{1F1F0}\u{1F1FC}', name: 'Kuwait' },
  { code: '+371', flag: '\u{1F1F1}\u{1F1FB}', name: 'Latvia' },
  { code: '+961', flag: '\u{1F1F1}\u{1F1E7}', name: 'Lebanon' },
  { code: '+370', flag: '\u{1F1F1}\u{1F1F9}', name: 'Lithuania' },
  { code: '+352', flag: '\u{1F1F1}\u{1F1FA}', name: 'Luxembourg' },
  { code: '+60', flag: '\u{1F1F2}\u{1F1FE}', name: 'Malaysia' },
  { code: '+356', flag: '\u{1F1F2}\u{1F1F9}', name: 'Malta' },
  { code: '+52', flag: '\u{1F1F2}\u{1F1FD}', name: 'Mexico' },
  { code: '+212', flag: '\u{1F1F2}\u{1F1E6}', name: 'Morocco' },
  { code: '+31', flag: '\u{1F1F3}\u{1F1F1}', name: 'Netherlands' },
  { code: '+64', flag: '\u{1F1F3}\u{1F1FF}', name: 'New Zealand' },
  { code: '+234', flag: '\u{1F1F3}\u{1F1EC}', name: 'Nigeria' },
  { code: '+47', flag: '\u{1F1F3}\u{1F1F4}', name: 'Norway' },
  { code: '+968', flag: '\u{1F1F4}\u{1F1F2}', name: 'Oman' },
  { code: '+92', flag: '\u{1F1F5}\u{1F1F0}', name: 'Pakistan' },
  { code: '+507', flag: '\u{1F1F5}\u{1F1E6}', name: 'Panama' },
  { code: '+595', flag: '\u{1F1F5}\u{1F1FE}', name: 'Paraguay' },
  { code: '+51', flag: '\u{1F1F5}\u{1F1EA}', name: 'Peru' },
  { code: '+63', flag: '\u{1F1F5}\u{1F1ED}', name: 'Philippines' },
  { code: '+48', flag: '\u{1F1F5}\u{1F1F1}', name: 'Poland' },
  { code: '+351', flag: '\u{1F1F5}\u{1F1F9}', name: 'Portugal' },
  { code: '+974', flag: '\u{1F1F6}\u{1F1E6}', name: 'Qatar' },
  { code: '+40', flag: '\u{1F1F7}\u{1F1F4}', name: 'Romania' },
  { code: '+7', flag: '\u{1F1F7}\u{1F1FA}', name: 'Russia' },
  { code: '+966', flag: '\u{1F1F8}\u{1F1E6}', name: 'Saudi Arabia' },
  { code: '+65', flag: '\u{1F1F8}\u{1F1EC}', name: 'Singapore' },
  { code: '+421', flag: '\u{1F1F8}\u{1F1F0}', name: 'Slovakia' },
  { code: '+386', flag: '\u{1F1F8}\u{1F1EE}', name: 'Slovenia' },
  { code: '+27', flag: '\u{1F1FF}\u{1F1E6}', name: 'South Africa' },
  { code: '+34', flag: '\u{1F1EA}\u{1F1F8}', name: 'Spain' },
  { code: '+94', flag: '\u{1F1F1}\u{1F1F0}', name: 'Sri Lanka' },
  { code: '+46', flag: '\u{1F1F8}\u{1F1EA}', name: 'Sweden' },
  { code: '+41', flag: '\u{1F1E8}\u{1F1ED}', name: 'Switzerland' },
  { code: '+886', flag: '\u{1F1F9}\u{1F1FC}', name: 'Taiwan' },
  { code: '+66', flag: '\u{1F1F9}\u{1F1ED}', name: 'Thailand' },
  { code: '+90', flag: '\u{1F1F9}\u{1F1F7}', name: 'Turkey' },
  { code: '+256', flag: '\u{1F1FA}\u{1F1EC}', name: 'Uganda' },
  { code: '+380', flag: '\u{1F1FA}\u{1F1E6}', name: 'Ukraine' },
  { code: '+971', flag: '\u{1F1E6}\u{1F1EA}', name: 'United Arab Emirates' },
  { code: '+44', flag: '\u{1F1EC}\u{1F1E7}', name: 'United Kingdom' },
  { code: '+598', flag: '\u{1F1FA}\u{1F1FE}', name: 'Uruguay' },
  { code: '+58', flag: '\u{1F1FB}\u{1F1EA}', name: 'Venezuela' },
  { code: '+84', flag: '\u{1F1FB}\u{1F1F3}', name: 'Vietnam' },
  { code: '+260', flag: '\u{1F1FF}\u{1F1F2}', name: 'Zambia' },
  { code: '+263', flag: '\u{1F1FF}\u{1F1FC}', name: 'Zimbabwe' },
  // Supplementary codes (kept out of the alpha block above to minimize churn);
  // the getE164 pristine fallback still preserves any number whose code is absent.
  { code: '+230', flag: '\u{1F1F2}\u{1F1FA}', name: 'Mauritius' },
  { code: '+352', flag: '\u{1F1F1}\u{1F1FA}', name: 'Luxembourg' },
  { code: '+354', flag: '\u{1F1EE}\u{1F1F8}', name: 'Iceland' },
  { code: '+356', flag: '\u{1F1F2}\u{1F1F9}', name: 'Malta' },
  { code: '+590', flag: '\u{1F1EC}\u{1F1F5}', name: 'Guadeloupe' },
  { code: '+591', flag: '\u{1F1E7}\u{1F1F4}', name: 'Bolivia' },
  { code: '+592', flag: '\u{1F1EC}\u{1F1FE}', name: 'Guyana' },
  { code: '+595', flag: '\u{1F1F5}\u{1F1FE}', name: 'Paraguay' },
  { code: '+598', flag: '\u{1F1FA}\u{1F1FE}', name: 'Uruguay' },
  { code: '+675', flag: '\u{1F1F5}\u{1F1EC}', name: 'Papua New Guinea' },
  { code: '+676', flag: '\u{1F1F9}\u{1F1F4}', name: 'Tonga' },
  { code: '+679', flag: '\u{1F1EB}\u{1F1EF}', name: 'Fiji' },
  { code: '+960', flag: '\u{1F1F2}\u{1F1FB}', name: 'Maldives' },
  { code: '+961', flag: '\u{1F1F1}\u{1F1E7}', name: 'Lebanon' },
  { code: '+962', flag: '\u{1F1EF}\u{1F1F4}', name: 'Jordan' },
  { code: '+965', flag: '\u{1F1F0}\u{1F1FC}', name: 'Kuwait' },
  { code: '+968', flag: '\u{1F1F4}\u{1F1F2}', name: 'Oman' },
  { code: '+974', flag: '\u{1F1F6}\u{1F1E6}', name: 'Qatar' },
  { code: '+976', flag: '\u{1F1F2}\u{1F1F3}', name: 'Mongolia' },
];

/**
 * Render a phone input with country picker into a container element.
 * @param {HTMLElement} container
 * @param {{ initialValue?: string, idPrefix?: string }} opts
 *   initialValue: E.164 string to pre-fill (country pre-selected, rest formatted)
 * @returns {{ getE164: () => string|null, focus: () => void }}
 */
export function createPhoneInput(container, { initialValue = '', idPrefix = 'phone-input' } = {}) {
  let selectedIndex = 0;
  let localDigits = '';
  let dirty = false;
  // If the caller pre-filled a valid number whose country code isn't in the list,
  // the picker can't reconstruct it — preserve the original so an untouched edit
  // never silently overwrites a stored number with a wrong-country one.
  const pristine = initialValue && isValidE164(initialValue) ? normalizeE164(initialValue) : null;

  // Pre-select country + local part from an existing E.164 value
  if (initialValue && initialValue.startsWith('+')) {
    const digits = initialValue.replace(/\D/g, '');
    let best = -1;
    let bestLen = 0;
    COUNTRY_CODES.forEach((c, i) => {
      const cc = c.code.replace('+', '');
      if (digits.startsWith(cc) && cc.length > bestLen) {
        best = i;
        bestLen = cc.length;
      }
    });
    if (best >= 0) {
      selectedIndex = best;
      localDigits = digits.slice(bestLen);
    }
  }

  const formatLocal = (digits, dialCode) => {
    if (dialCode === '+1') {
      if (digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
      digits = digits.slice(0, 10);
      if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return digits;
    }
    const maxDigits = 15 - dialCode.replace('+', '').length;
    return digits.slice(0, maxDigits);
  };

  const initial = COUNTRY_CODES[selectedIndex];
  container.innerHTML = `
    <div style="display: flex; gap: 0.5rem; align-items: center;">
      <div style="position: relative; flex-shrink: 0;">
        <select id="${idPrefix}-country" style="position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 1rem;">
          ${COUNTRY_CODES.map((c, i) =>
            `<option value="${c.code}" data-index="${i}"${i === selectedIndex ? ' selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`
          ).join('')}
        </select>
        <span id="${idPrefix}-country-display" style="display: inline-flex; align-items: center; padding: 0.5rem 0.75rem; background: var(--bg-secondary, #f3f4f6); border: 1px solid var(--border-color, #d1d5db); border-radius: 0.375rem; font-weight: 500; color: var(--text-primary, #374151); font-size: 0.95rem; white-space: nowrap; pointer-events: none;">${initial.flag} ${initial.code} ▾</span>
      </div>
      <input
        type="tel"
        id="${idPrefix}-number"
        class="form-input"
        placeholder="${initial.code === '+1' ? '555-123-4567' : 'Phone number'}"
        autocomplete="tel"
        maxlength="${initial.code === '+1' ? 12 : 15}"
        style="flex: 1;"
        value="${formatLocal(localDigits, initial.code)}"
      />
    </div>
  `;

  const select = container.querySelector(`#${idPrefix}-country`);
  const display = container.querySelector(`#${idPrefix}-country-display`);
  const input = container.querySelector(`#${idPrefix}-number`);

  select.addEventListener('change', (e) => {
    dirty = true;
    selectedIndex = e.target.selectedIndex;
    const country = COUNTRY_CODES[selectedIndex];
    display.textContent = `${country.flag} ${country.code} ▾`;
    input.placeholder = country.code === '+1' ? '555-123-4567' : 'Phone number';
    input.maxLength = country.code === '+1' ? 12 : 15;
    input.value = '';
    input.focus();
  });

  input.addEventListener('input', (e) => {
    dirty = true;
    const dialCode = COUNTRY_CODES[selectedIndex].code;
    e.target.value = formatLocal(e.target.value.replace(/\D/g, ''), dialCode);
  });

  return {
    // Combined E.164 value, or null when empty/invalid
    getE164() {
      // Untouched pre-filled value: return it verbatim (covers numbers whose
      // country isn't in the list, which the picker can't re-emit)
      if (!dirty && pristine) return pristine;
      const dialCode = COUNTRY_CODES[selectedIndex].code;
      const digits = input.value.replace(/\D/g, '');
      if (!digits) return null;
      // NANP (+1) requires exactly 10 national digits — the generic E.164 length
      // rule alone would accept a too-short number like +15551234
      if (dialCode === '+1' && digits.length !== 10) return null;
      const candidate = dialCode + digits;
      return isValidE164(candidate) ? normalizeE164(candidate) : null;
    },
    focus() { input.focus(); },
  };
}
