/**
 * Deterministic, stable conversation id — MUST match the server implementation
 * in supabase/functions/_shared/thread-id.ts so the id shown in the inbox equals
 * the `thread_id` returned by the list-messages/get-message API and the MCP.
 *
 * Keyed on user_id + the UNORDERED pair of digit-only numbers, hashed to a
 * UUIDv5. Same thread → same id regardless of direction or +/format.
 */
const NAMESPACE = 'magpipe:thread:v1';
const digits = (s) => String(s ?? '').replace(/\D/g, '');

export async function computeThreadId(userId, a, b) {
  const da = digits(a), db = digits(b);
  const [lo, hi] = da <= db ? [da, db] : [db, da];
  const buf = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(`${NAMESPACE}|${userId}|${lo}|${hi}`),
  );
  const bytes = new Uint8Array(buf).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const h = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
