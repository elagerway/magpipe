// Phone number normalization to E.164. Accepts the common formats real
// humans type — "(604) 562-8647", "604.562.8647", "1 604 562 8647",
// "+1 604-562-8647", "+16045628647" — and outputs "+16045628647".
//
// Heuristic-only (no libphonenumber). Magpipe is North-America-focused;
// any input without an explicit + prefix is assumed NANP (US/Canada).
// International callers must include the + prefix in their input; the
// normalizer just strips formatting and keeps the digits.
//
// Returns the normalized E.164 string on success, or null when the
// input is too short / has no recoverable shape. Callers should reject
// nulls back to the user as "invalid phone number" rather than passing
// them downstream.

const E164_VALID_RX = /^\+[1-9]\d{7,14}$/

export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null
  let s = String(input).trim()
  if (!s) return null

  const hadPlus = s.startsWith('+')
  // Strip everything that isn't a digit. We re-attach + only if the
  // original input had one (or we're inferring NANP below).
  const digits = s.replace(/\D+/g, '')
  if (!digits) return null

  let candidate: string

  if (hadPlus) {
    // Honor the country code the user provided. Length-check against
    // the E.164 spec (8–15 digits total after +; first digit non-zero).
    if (digits.length < 8 || digits.length > 15) return null
    if (digits.startsWith('0')) return null
    candidate = '+' + digits
  } else if (digits.length === 10) {
    // Bare 10-digit NANP number → +1XXXXXXXXXX
    candidate = '+1' + digits
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // 11-digit NANP with leading 1 but no plus → +1XXXXXXXXXX
    candidate = '+' + digits
  } else if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0')) {
    // International number typed without + (e.g. "447700900000"). We
    // can't reliably know the country, so we honor the digits as-is
    // and let the E.164 regex be the final gate.
    candidate = '+' + digits
  } else {
    return null
  }

  return E164_VALID_RX.test(candidate) ? candidate : null
}

// Convenience: throw-on-invalid variant for code paths that want to
// fail loudly. Throws an Error with a stable message so edge functions
// can catch and rewrap into a 400.
export function requireE164(input: string | null | undefined, fieldName = 'phone'): string {
  const normalized = normalizeE164(input)
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: "${input}" — provide a number like (604) 562-8647 or +16045628647`)
  }
  return normalized
}

export { E164_VALID_RX }
