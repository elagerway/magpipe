/**
 * Fraud list — shared helpers.
 *
 * Two kinds of evidence live behind this module and they are deliberately not
 * interchangeable:
 *
 *   fraud_numbers           First-party. Our own call transcripts, classified
 *                           post-call. High-confidence hits BLOCK, globally.
 *   fraud_external_numbers  Third-party. FTC Do Not Call + FCC Unwanted Calls
 *                           consumer complaints, bulk-ingested. ADVISORY ONLY —
 *                           these are unverified consumer reports about a
 *                           caller ID, and caller ID is trivially spoofed, so a
 *                           listing is an allegation about a number that was
 *                           displayed, not proof about the line placing the
 *                           call. Blocking on one would strand real callers
 *                           whose number a spammer had spoofed.
 *
 * Coverage caveat worth remembering: both public sources are US regulators.
 * Canada publishes no per-number equivalent (CRTC and the Anti-Fraud Centre
 * release aggregates only), so Canadian numbers appear only when a US consumer
 * happened to report them. Thin Canadian coverage is expected, not a bug.
 */

export interface ExternalSignal {
  ftc_complaints: number;
  fcc_complaints: number;
  total_complaints: number;
  ftc_last_at: string | null;
  fcc_last_at: string | null;
  ftc_subjects: string[];
  fcc_call_types: string[];
}

/**
 * NANP number → E.164. Both public feeds publish bare 10-digit US numbers
 * (FTC: `2627776451`, FCC: `262-777-6451`), so they need the +1 our records use.
 * Returns null for anything that isn't a plausible NANP number.
 */
export function nanpToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    // NANP area codes and exchanges both start 2–9. Rejects placeholder junk
    // like 0000000000 and 1111111111, which both feeds contain.
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) return nanpToE164(digits.slice(1));
  return null;
}

/**
 * Is this caller blocked for this workspace?
 *
 * Global block, with a per-workspace override: a workspace that decides an
 * entry is a false positive can allow the number for itself without touching
 * the global list. Both queries are single indexed lookups on the inbound path.
 *
 * Fails OPEN. A caller who can't be checked rings through — better than
 * stranding a legitimate caller because a query timed out.
 */
export async function isFraudBlocked(
  supabase: any,
  e164: string | null | undefined,
  userId: string,
  channel: 'call' | 'sms' | 'whatsapp' = 'call',
): Promise<{ blocked: boolean; entry?: any }> {
  if (!e164) return { blocked: false };
  try {
    const [{ data: entry }, { data: allowed }] = await Promise.all([
      supabase.from('fraud_numbers').select('e164, status, categories, risk_score').eq('e164', e164).maybeSingle(),
      supabase.from('fraud_allowlist').select('e164').eq('user_id', userId).eq('e164', e164).maybeSingle(),
    ]);
    if (!entry || entry.status !== 'blocked') return { blocked: false };
    if (allowed) return { blocked: false, entry };

    // Fire-and-forget: an audit insert must never add latency to a ringing
    // call, and a failed insert must never turn into a call that rings through.
    supabase.from('fraud_block_events').insert({ e164, user_id: userId, channel })
      .then(({ error }: any) => { if (error) console.warn('[fraud] block event insert failed:', error.message); })
      .catch(() => {});

    return { blocked: true, entry };
  } catch (e) {
    console.warn('[fraud] block check failed (failing open):', e);
    return { blocked: false };
  }
}

/** Public-complaint counts for a number, from the locally ingested index. */
export async function getExternalSignal(supabase: any, e164: string): Promise<ExternalSignal | null> {
  try {
    const { data } = await supabase
      .from('fraud_external_numbers')
      .select('ftc_complaints, fcc_complaints, total_complaints, ftc_last_at, fcc_last_at, ftc_subjects, fcc_call_types')
      .eq('e164', e164)
      .maybeSingle();
    return (data as ExternalSignal) ?? null;
  } catch (e) {
    console.warn('[fraud] external lookup failed:', e);
    return null;
  }
}

/**
 * 0–100. First-party evidence dominates; public complaints can only corroborate.
 * The weighting is the whole policy in one function: even a number with
 * hundreds of FTC complaints tops out below the threshold that blocks, because
 * complaints alone never block.
 */
export function riskScore(input: {
  firstPartyReports: number;
  workspacesReporting: number;
  workspacesBlocking?: number;
  external: ExternalSignal | null;
  confidence?: number;
}): number {
  let score = 0;

  // First-party: one confident detection is already most of the way there.
  if (input.firstPartyReports > 0) {
    score += 50;
    score += Math.min(20, (input.firstPartyReports - 1) * 5);
    score += Math.min(15, Math.max(0, input.workspacesReporting - 1) * 8);
    if (typeof input.confidence === 'number') score += Math.round((input.confidence - 0.85) * 40);
  }

  // Workspaces that put the number on their own blocklist. Weaker than a fraud
  // report — a blocklist entry means "I don't want this caller" — so a single
  // one barely registers, but independent workspaces agreeing is real signal.
  const blocking = input.workspacesBlocking ?? 0;
  if (blocking > 0) score += Math.min(30, blocking * 12);

  // Public complaints: corroboration, capped so they can't reach a blocking
  // score on their own.
  const total = input.external?.total_complaints ?? 0;
  if (total > 0) score += Math.min(25, 5 + Math.floor(Math.log10(total) * 10));

  return Math.max(0, Math.min(100, score));
}

/**
 * How much a score should be discounted for age.
 *
 * Numbers get reassigned — a line that ran a scam two years ago may belong to
 * someone's dentist now — so evidence that nothing has refreshed should stop
 * reading as current. Applied to the displayed score only: blocking is decided
 * by `status`, never by a number, so ageing can't silently let a caller
 * through.
 */
export function ageMultiplier(ageDays: number): number {
  if (ageDays < 90) return 1;
  if (ageDays < 180) return 0.9;
  if (ageDays < 365) return 0.75;
  if (ageDays < 730) return 0.6;
  return 0.5;
}

/** Fraud categories the transcript classifier may return. */
export const FRAUD_CATEGORIES = [
  'gift_card',
  'wire_transfer',
  'bank_impersonation',
  'government_impersonation',
  'tech_support',
  'crypto',
  'credential_phishing',
  'extortion',
  'invoice_fraud',
  'other',
] as const;

export type FraudCategory = typeof FRAUD_CATEGORIES[number];

export const FRAUD_CATEGORY_LABELS: Record<string, string> = {
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
