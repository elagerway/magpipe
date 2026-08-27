/**
 * manage-fraud-numbers — the Phone → Fraud tab's API.
 *
 * GET                      list the global fraud list (+ this workspace's own
 *                          evidence and allowlist state)
 * POST { action: 'allow' } allow a globally blocked number for this workspace
 * POST { action: 'unallow' } drop that override
 *
 * Cross-tenant boundary: the global list is shared, the evidence is not. A
 * workspace sees the number, its LERG/CNAM, categories, how many workspaces
 * reported it and the public complaint counts — but transcript quotes only from
 * its OWN calls, and never which other workspace reported anything.
 *
 * Reporting a number by hand goes through report-fraud-number, which owns the
 * guards and the blocking decision.
 *
 * Deploy: ./scripts/deploy-functions.sh manage-fraud-numbers
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from '../_shared/api-auth.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeE164 } from '../_shared/phone-e164.ts';
import { riskScore } from '../_shared/fraud.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const user = await resolveUser(req, anonClient);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const uid = user.id;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      // Fixed page sizes — the UI offers 20/50/100 and anything else is a
      // typo or a scraper.
      const ALLOWED_PAGE_SIZES = [20, 50, 100];
      const requested = Number(url.searchParams.get('limit'));
      const pageSize = ALLOWED_PAGE_SIZES.includes(requested) ? requested : 20;
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const offset = (page - 1) * pageSize;
      const limit = pageSize;

      // Search reaches the WHOLE database — every number ever reported to us or
      // to the FTC/FCC, not the 7-day window the default view shows. Digits are
      // matched anywhere in the number so a partial works: an area code, the
      // last four, or a full number in any format. Trigram GIN indexes on both
      // e164 columns keep that an index scan over 310k+ rows.
      const rawQuery = (url.searchParams.get('q') || '').trim();
      const digits = rawQuery.replace(/\D/g, '');
      const isNumberSearch = digits.length >= 3;
      const isTextSearch = !isNumberSearch && rawQuery.length >= 3;
      const searching = isNumberSearch || isTextSearch;

      const FRAUD_COLS = 'e164, status, categories, first_party_reports, workspaces_reporting, workspaces_blocking, risk_score, lookup, external, first_seen_at, last_seen_at, blocked_at';

      // The two sources are paged as ONE virtual list — our own entries first,
      // then public-complaint rows — so a page boundary behaves like a single
      // list rather than interleaving two independently-paged tables.
      const applyFraudFilter = (q: any) => {
        if (isNumberSearch) return q.like('e164', `%${digits}%`);
        if (isTextSearch) return q.ilike('lookup->>cnam', `%${rawQuery}%`);
        return q;
      };
      const fraudOrder = (q: any) => searching
        ? q.order('risk_score', { ascending: false })
        : q.order('last_seen_at', { ascending: false });

      const { count: fraudTotal } = await applyFraudFilter(
        supabase.from('fraud_numbers').select('e164', { count: 'exact', head: true }),
      );
      const fraudCount = fraudTotal ?? 0;

      // Slots this page takes from each source.
      const fraudSkip = Math.min(offset, fraudCount);
      const fraudTake = Math.max(0, Math.min(limit, fraudCount - fraudSkip));
      const publicSkip = Math.max(0, offset - fraudCount);
      const publicTake = limit - fraudTake;

      const query = fraudTake > 0
        ? fraudOrder(applyFraudFilter(supabase.from('fraud_numbers').select(FRAUD_COLS)))
            .range(fraudSkip, fraudSkip + fraudTake - 1)
        : supabase.from('fraud_numbers').select(FRAUD_COLS).limit(0);

      const [{ data: entries, error }, { data: allowed }, { data: ownReports }] = await Promise.all([
        query,
        supabase.from('fraud_allowlist').select('e164, reason').eq('user_id', uid),
        supabase.from('fraud_reports')
          .select('e164, category, confidence, evidence, created_at, call_record_id')
          .eq('user_id', uid)
          .order('created_at', { ascending: false }),
      ]);
      if (error) return json({ error: error.message }, 500);

      const numbers = (entries || []).map((e: any) => e.e164);
      const weekAgoIso = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

      // Numbers the public feeds heard about in the last 7 days that aren't
      // already on our list. They belong in the same list, not a second table —
      // the difference is where the evidence came from, not what the row is.
      // Everything shown for them comes out of the feeds themselves: complaint
      // counts, what the complaints were about, when the last one landed.
      // Two plain filters merged in JS rather than one .or() — an ISO timestamp
      // carries the dots and colons PostgREST uses as its own delimiters, and a
      // mis-parsed or() fails by returning nothing rather than erroring, which
      // would look like "the feeds found nobody this week".
      const publicCols = 'e164, ftc_complaints, fcc_complaints, total_complaints, ftc_last_at, fcc_last_at, ftc_subjects, fcc_call_types';

      let publicRecent: any[] = [];
      let publicMatches = 0;

      if (isNumberSearch) {
        // Whole table, no date bound.
        const base = () => supabase.from('fraud_external_numbers');
        const [{ count }, { data: hits }] = await Promise.all([
          base().select('e164', { count: 'exact', head: true }).like('e164', `%${digits}%`),
          publicTake > 0
            ? base().select(publicCols).like('e164', `%${digits}%`)
                .order('total_complaints', { ascending: false })
                .range(publicSkip, publicSkip + publicTake - 1)
            : Promise.resolve({ data: [] }),
        ]);
        publicMatches = count ?? 0;
        publicRecent = hits || [];
      } else if (!isTextSearch) {
        // Default view: what the public feeds heard in the last 7 days. Two
        // plain filters merged in JS rather than one .or() — an ISO timestamp
        // carries the dots and colons PostgREST uses as delimiters, and a
        // mis-parsed or() returns nothing rather than erroring.
        const window = () => supabase.from('fraud_external_numbers');
        const [{ count: ftcCount }, { count: fccCount }, { data: ftcRows }, { data: fccRows }] = await Promise.all([
          window().select('e164', { count: 'exact', head: true }).gte('ftc_last_at', weekAgoIso),
          window().select('e164', { count: 'exact', head: true }).gte('fcc_last_at', weekAgoIso),
          window().select(publicCols).gte('ftc_last_at', weekAgoIso)
            .order('total_complaints', { ascending: false }).limit(publicSkip + publicTake),
          window().select(publicCols).gte('fcc_last_at', weekAgoIso)
            .order('total_complaints', { ascending: false }).limit(publicSkip + publicTake),
        ]);
        // The two windows overlap, so the total is the larger of them rather
        // than the sum — better to under-promise than to page past the end.
        publicMatches = Math.max(ftcCount ?? 0, fccCount ?? 0);
        publicRecent = [...(ftcRows || []), ...(fccRows || [])]
          .filter((p, i, arr) => arr.findIndex(q => q.e164 === p.e164) === i)
          .sort((a, b) => (b.total_complaints || 0) - (a.total_complaints || 0))
          .slice(publicSkip, publicSkip + publicTake);
      }

      // Everything below is batched across the whole page — a per-row query
      // would be a request per number on a list that can run to hundreds.
      const [
        { data: blockEvents },
        { data: allReports },
        { data: myBlocklist },
        { data: myCalls },
      ] = await Promise.all([
        numbers.length
          ? supabase.from('fraud_block_events').select('e164, channel, created_at, user_id')
              .in('e164', numbers).order('created_at', { ascending: false }).limit(2000)
          : Promise.resolve({ data: [] }),
        // Cross-workspace reports: counts and category/date only. Evidence and
        // user_id are stripped before anything leaves this function.
        numbers.length
          ? supabase.from('fraud_reports').select('e164, source, category, created_at, user_id')
              .in('e164', numbers).order('created_at', { ascending: false }).limit(2000)
          : Promise.resolve({ data: [] }),
        numbers.length
          ? supabase.from('blocked_callers').select('caller_number, label, blocked_at')
              .eq('user_id', uid).in('caller_number', numbers)
          : Promise.resolve({ data: [] }),
        numbers.length
          ? supabase.from('call_records').select('caller_number, created_at, duration_seconds')
              .eq('user_id', uid).in('caller_number', numbers)
              .order('created_at', { ascending: false }).limit(1000)
          : Promise.resolve({ data: [] }),
      ]);

      const allowedSet = new Set((allowed || []).map((a: any) => a.e164));
      const blockedHere = new Map((myBlocklist || []).map((b: any) => [b.caller_number, b]));

      const ownByNumber = new Map<string, any[]>();
      for (const r of ownReports || []) {
        if (!ownByNumber.has(r.e164)) ownByNumber.set(r.e164, []);
        ownByNumber.get(r.e164)!.push(r);
      }

      const eventsByNumber = new Map<string, any[]>();
      for (const ev of blockEvents || []) {
        if (!eventsByNumber.has(ev.e164)) eventsByNumber.set(ev.e164, []);
        eventsByNumber.get(ev.e164)!.push(ev);
      }

      const reportsByNumber = new Map<string, any[]>();
      for (const r of allReports || []) {
        if (!reportsByNumber.has(r.e164)) reportsByNumber.set(r.e164, []);
        reportsByNumber.get(r.e164)!.push(r);
      }

      const callsByNumber = new Map<string, any[]>();
      for (const c of myCalls || []) {
        if (!callsByNumber.has(c.caller_number)) callsByNumber.set(c.caller_number, []);
        callsByNumber.get(c.caller_number)!.push(c);
      }

      const dayAgo = Date.now() - 24 * 3600_000;
      const weekAgo = Date.now() - 7 * 24 * 3600_000;

      const listed = new Set(numbers);
      const publicEntries = (publicRecent || [])
        .filter((p: any) => !listed.has(p.e164))
        .map((p: any) => ({
          e164: p.e164,
          origin: 'public_complaints',
          // Not blocked and not our finding — it's what the FTC and FCC were
          // told. Blocking on it would strand callers whose number was spoofed.
          status: 'reported',
          categories: [],
          first_party_reports: 0,
          workspaces_reporting: 0,
          workspaces_blocking: 0,
          risk_score: riskScore({ firstPartyReports: 0, workspacesReporting: 0, external: p }),
          lookup: null,
          external: p,
          last_seen_at: [p.ftc_last_at, p.fcc_last_at].filter(Boolean).sort().pop() ?? null,
          allowed_here: false,
          reported_here: false,
          blocked_here: false,
          my_reports: [],
          activity: [],
          stats: {},
        }));

      const total = fraudCount + publicMatches;
      return json({
        searching,
        query: rawQuery || null,
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
        entries: [...(entries || []).map((e: any) => {
          const events = eventsByNumber.get(e.e164) ?? [];
          const reports = reportsByNumber.get(e.e164) ?? [];
          const calls = callsByNumber.get(e.e164) ?? [];

          // Merged activity feed. Cross-workspace rows are anonymised to
          // "another workspace" — who reported what is not shared, only that
          // an independent workspace did.
          const activity = [
            ...reports.map((r: any) => ({
              type: 'report',
              at: r.created_at,
              source: r.source,
              category: r.category,
              mine: r.user_id === uid,
            })),
            ...events.slice(0, 20).map((ev: any) => ({
              type: 'blocked',
              at: ev.created_at,
              channel: ev.channel,
              mine: ev.user_id === uid,
            })),
          ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);

          return {
            ...e,
            allowed_here: allowedSet.has(e.e164),
            reported_here: ownByNumber.has(e.e164),
            blocked_here: blockedHere.has(e.e164),
            blocked_here_label: blockedHere.get(e.e164)?.label ?? null,
            // Own-workspace evidence only. Another workspace's transcript quote
            // is their customer data, not ours to show.
            my_reports: ownByNumber.get(e.e164) ?? [],
            activity,
            stats: {
              blocks_total: events.length,
              blocks_24h: events.filter((ev: any) => new Date(ev.at ?? ev.created_at).getTime() > dayAgo).length,
              blocks_7d: events.filter((ev: any) => new Date(ev.created_at).getTime() > weekAgo).length,
              last_blocked_at: events[0]?.created_at ?? null,
              reports_total: reports.length,
              // What this workspace itself saw before the number was listed.
              my_calls: calls.length,
              my_last_call_at: calls[0]?.created_at ?? null,
            },
            origin: 'magpipe',
          };
        }), ...publicEntries],
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const e164 = normalizeE164(body.e164 ?? body.number);
      if (!e164) return json({ error: `Invalid phone number: "${body.e164 ?? body.number ?? ''}"` }, 400);

      if (body.action === 'allow') {
        const { error } = await supabase.from('fraud_allowlist')
          .upsert({ user_id: uid, e164, reason: (body.reason || '').slice(0, 200) || null }, { onConflict: 'user_id,e164' });
        if (error) return json({ error: error.message }, 500);
        console.log(`[manage-fraud-numbers] ${uid} allowed ${e164} in their workspace`);
        return json({ success: true, e164, allowed_here: true });
      }

      if (body.action === 'unallow') {
        const { error } = await supabase.from('fraud_allowlist').delete().eq('user_id', uid).eq('e164', e164);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, e164, allowed_here: false });
      }

      return json({ error: `Unknown action: "${body.action ?? ''}"` }, 400);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('manage-fraud-numbers error:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
