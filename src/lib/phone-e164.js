/**
 * Phone number normalization to E.164. Mirror of
 * supabase/functions/_shared/phone-e164.ts — keep these two in sync
 * (same heuristics, same edge cases). Frontend uses this for instant
 * validation feedback; the edge function re-normalizes on save as the
 * source of truth, so a mismatch here only hurts UX (not correctness).
 *
 * Accepts "(604) 562-8647", "604.562.8647", "1 604 562 8647",
 * "+1 604-562-8647", "+16045628647" — outputs "+16045628647".
 * Returns null when the input is too short / has no recoverable shape.
 */

const E164_VALID_RX = /^\+[1-9]\d{7,14}$/;

export function normalizeE164(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  const hadPlus = s.startsWith('+');
  const digits = s.replace(/\D+/g, '');
  if (!digits) return null;

  let candidate;

  if (hadPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    if (digits.startsWith('0')) return null;
    candidate = '+' + digits;
  } else if (digits.length === 10) {
    candidate = '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    candidate = '+' + digits;
  } else if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) {
    candidate = '+' + digits;
  } else {
    return null;
  }

  return E164_VALID_RX.test(candidate) ? candidate : null;
}

export function isValidE164(input) {
  return normalizeE164(input) !== null;
}

export { E164_VALID_RX };
