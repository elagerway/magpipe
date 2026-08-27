/**
 * Shared formatting and sanitization utilities.
 * Consolidates functions that were previously duplicated across 10+ files.
 */

/**
 * Escape HTML special characters to prevent XSS and attribute injection.
 * Escapes &, <, >, ", ' so the result is safe BOTH inside element text
 * content AND inside double-/single-quoted HTML attributes.
 *
 * Note: the previous implementation used `div.textContent + innerHTML`
 * which only escaped &, <, > — interpolating a value containing `"`
 * inside `attr="${escapeHtml(value)}"` would break the attribute.
 * Switched to a regex-based pass that covers all five characters.
 *
 * @param {*} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined || text === '') return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a phone number for display: +1 (XXX) XXX-XXXX
 * Handles 10-digit and 11-digit (with leading 1) US/CA numbers.
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneNumber(phone) {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
  }
  return phone;
}

/**
 * Get 1-2 letter initials from a name or email.
 * @param {string} [name]
 * @param {string} [email]
 * @returns {string}
 */
export function getInitials(name, email) {
  if (name) {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
  return email ? email.substring(0, 2).toUpperCase() : 'U';
}
