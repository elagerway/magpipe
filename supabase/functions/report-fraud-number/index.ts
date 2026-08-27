/**
 * report-fraud-number — record a fraud report against a number and, when the
 * evidence is first-party and confident, block it globally.
 *
 * Called by agent.py after a call whose transcript was classified as fraud, and
 * by the Phone → Fraud UI when someone reports a number by hand.
 *
 * What blocks and what does not:
 *   transcript_llm at high confidence → status 'blocked' (global, immediate)
 *   manual report by a workspace      → status 'blocked' (a human looked at it)
 *   public complaint data alone       → never. It corroborates and raises the
 *                                       risk score; it cannot create an entry.
 *
 * Guards run before any block, because a global block is the highest-blast-
 * radius action in the product — one bad classification would give every
 * workspace a busy signal for a legitimate caller:
 *   · the caller is a known contact of the reporting workspace
 *   · the caller is on that workspace's call whitelist
 *   · the number is one of our own service numbers
 *   · more than MAX_AUTO_BLOCKS_PER_HOUR automatic blocks already happened
 * A tripped guard still records the report — it just leaves status 'flagged'
 * so a human can look, rather than blocking on a suspect signal.
 *
 * Auth: service role (agent.py), or a signed-in user for manual reports.
 * Deploy: ./scripts/deploy-functions.sh report-fraud-number
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { resolveUser } from '../_shared/api-auth.ts';
import { normalizeE164 } from '../_shared/phone-e164.ts';
import { lookupWithCache } from '../_shared/phone-lookup.ts';
import { FRAUD_CATEGORIES, getExternalSignal, riskScore } from '../_shared/fraud.ts';

const MIN_AUTO_CONFIDENCE = 0.85;
const MAX_AUTO_BLOCKS_PER_HOUR = 25;
/**
 * How many independent workspaces must have blocked a number before their
 * blocks alone promote it to a global block. A workspace blocklist entry means
 * "I don't want this caller" — an ex, a landlord, a persistent but legitimate
 * salesperson — not "this is a scam", so one is not evidence of fraud. Two
 * unrelated workspaces blocking the same number is.
 */
const BLOCK_PROMOTION_WORKSPACES = 2;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('Authorization') ?? '';
    const isService = authHeader === `Bearer ${serviceKey}`;

    let userId: string | null = body.user_id ?? null;
    if (!isService) {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const user = await resolveUser(req, anonClient);
      if (!user) return json({ error: 'Unauthorized' }, 401);
      userId = user.id; // never trust a client-supplied workspace
    }
    if (!userId) return json({ error: 'user_id required' }, 400);

    const e164 = normalizeE164(body.e164 ?? body.number ?? body.caller_number);
    if (!e164) return json({ error: `Invalid phone number: "${body.e164 ?? body.number ?? ''}"` }, 400);

    const source: string = body.source === 'transcript_llm' ? 'transcript_llm'
      : body.source === 'inbox_report' ? 'inbox_report'
      : body.source === 'workspace_block' ? 'workspace_block' : 'manual';
    const category = FRAUD_CATEGORIES.includes(body.category) ? body.category : 'other';
    const confidence = typeof body.confidence === 'number' ? Math.max(0, Math.min(1, body.confidence)) : null;
    const evidence = typeof body.evidence === 'string' ? body.evidence.slice(0, 500) : null;

    // A hand-filed report blocks the number for every workspace, so it has to
    // say why. That note is the record another workspace's operator reads when
    // they ask why one of their callers is getting a busy signal. Enforced
    // here, not just in the form, since this endpoint takes API-key callers too.
    if (source === 'manual' && (!evidence || evidence.trim().length < 10)) {
      return json({ error: 'Describe what happened — a report that blocks a number everywhere needs a reason.' }, 400);
    }

    // ── Guards ──────────────────────────────────────────────────────────
    const [contactRes, whitelistRes, serviceNumRes, recentBlocks] = await Promise.all([
      supabase.from('contacts').select('id').eq('user_id', userId).eq('phone_number', e164).maybeSingle(),
      supabase.from('call_whitelist').select('id').eq('user_id', userId).eq('caller_number', e164).limit(1).maybeSingle(),
      supabase.from('service_numbers').select('id').eq('phone_number', e164).maybeSingle(),
      supabase.from('fraud_numbers').select('e164', { count: 'exact', head: true })
        .eq('status', 'blocked').gte('blocked_at', new Date(Date.now() - 3600_000).toISOString()),
    ]);

    const guards: string[] = [];
    if (contactRes.data) guards.push('known_contact');
    if (whitelistRes.data) guards.push('whitelisted_caller');
    if (serviceNumRes.data) guards.push('own_service_number');
    if ((recentBlocks.count ?? 0) >= MAX_AUTO_BLOCKS_PER_HOUR) guards.push('rate_limited');
    if (source === 'transcript_llm' && (confidence ?? 0) < MIN_AUTO_CONFIDENCE) guards.push('low_confidence');

    // How many distinct workspaces have this number on their own blocklist.
    // Counted from blocked_callers rather than fraud_reports so the number is
    // right even for entries seeded by the backfill.
    const { data: blockers } = await supabase
      .from('blocked_callers').select('user_id').eq('caller_number', e164);
    const blockingWorkspaces = new Set((blockers || []).map((b: any) => b.user_id));
    if (source === 'workspace_block') blockingWorkspaces.add(userId);

    if (source === 'workspace_block' && blockingWorkspaces.size < BLOCK_PROMOTION_WORKSPACES) {
      guards.push('awaiting_corroboration');
    }

    const shouldBlock = guards.length === 0;

    // ── Enrich: LERG/CNAM + public complaint corroboration ──────────────
    const [lookup, external] = await Promise.all([
      lookupWithCache(supabase, e164).catch(() => null),
      getExternalSignal(supabase, e164),
    ]);

    // ── Upsert the global entry ─────────────────────────────────────────
    const { data: existing } = await supabase
      .from('fraud_numbers')
      .select('e164, status, categories, first_party_reports, workspaces_reporting, lookup')
      .eq('e164', e164)
      .maybeSingle();

    // Distinct workspaces that have reported this number, including this one.
    const { data: reporters } = await supabase
      .from('fraud_reports').select('user_id').eq('e164', e164).neq('source', 'workspace_block');
    const workspaces = new Set((reporters || []).map((r: any) => r.user_id));
    if (source !== 'workspace_block') workspaces.add(userId);

    // A workspace blocklist entry is not a fraud report and must not inflate
    // the count that drives the risk score — it's tracked by
    // workspaces_blocking instead. Re-running a backfill would otherwise walk
    // the score up every pass.
    const firstPartyReports = (existing?.first_party_reports ?? 0) + (source === 'workspace_block' ? 0 : 1);
    const categories = [...new Set([...(existing?.categories ?? []), category])];
    const score = riskScore({
      firstPartyReports,
      workspacesReporting: workspaces.size,
      workspacesBlocking: blockingWorkspaces.size,
      external,
      confidence: confidence ?? undefined,
    });

    // A cleared entry stays cleared — someone decided this number is fine, and
    // a fresh detection shouldn't silently undo that. It re-flags for review.
    const nextStatus = existing?.status === 'cleared' ? 'flagged'
      : shouldBlock ? 'blocked' : (existing?.status ?? 'flagged');

    const row: Record<string, unknown> = {
      e164,
      status: nextStatus,
      categories,
      first_party_reports: firstPartyReports,
      workspaces_reporting: workspaces.size,
      workspaces_blocking: blockingWorkspaces.size,
      risk_score: score,
      lookup: lookup ?? existing?.lookup ?? null,
      external: external ?? null,
      last_seen_at: new Date().toISOString(),
    };
    if (nextStatus === 'blocked' && existing?.status !== 'blocked') row.blocked_at = new Date().toISOString();

    const { error: upsertErr } = await supabase.from('fraud_numbers').upsert(row, { onConflict: 'e164' });
    if (upsertErr) return json({ error: `Could not record the report: ${upsertErr.message}` }, 500);

    const { error: reportErr } = await supabase.from('fraud_reports').insert({
      e164, user_id: userId, call_record_id: body.call_record_id ?? null,
      source, category, confidence, evidence,
    });
    if (reportErr) console.warn('[report-fraud-number] report insert failed:', reportErr.message);

    console.log(
      `[report-fraud-number] ${e164} source=${source} category=${category} ` +
      `confidence=${confidence ?? 'n/a'} status=${nextStatus} risk=${score} ` +
      `external=${external?.total_complaints ?? 0}` +
      (guards.length ? ` guards=${guards.join(',')}` : ''),
    );

    return json({
      success: true,
      e164,
      status: nextStatus,
      blocked: nextStatus === 'blocked',
      risk_score: score,
      guards,
      external_complaints: external?.total_complaints ?? 0,
    });
  } catch (e) {
    console.error('report-fraud-number error:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
