// Deterministic, stable conversation id for the public API/MCP.
//
// A "thread" is one human ↔ one of our service numbers. Inbound rows store
// (sender=contact, recipient=service); outbound store the reverse — and the
// contact number is sometimes +E164, sometimes bare digits. So we key on the
// UNORDERED pair of digit-only numbers, namespaced by user_id, hashed into a
// UUIDv5. Same thread → same id regardless of direction or +/format, with no
// stored column and no backfill. SiteSuper (or any consumer) can recompute it
// from the same inputs.
const NAMESPACE = "magpipe:thread:v1";
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export async function computeThreadId(userId: string, a: unknown, b: unknown): Promise<string> {
  const da = digits(a), db = digits(b);
  const [lo, hi] = da <= db ? [da, db] : [db, da];
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(`${NAMESPACE}|${userId}|${lo}|${hi}`),
  );
  const bytes = new Uint8Array(buf).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122 variant
  const h = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
