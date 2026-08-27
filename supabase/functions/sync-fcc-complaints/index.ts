/**
 * sync-fcc-complaints — ingest FCC "Consumer Complaints — Unwanted Calls"
 * (Socrata dataset vakf-fz8e) into fraud_external_numbers.
 *
 * Unlike the FTC feed this one IS queryable per number, but we bulk-ingest
 * anyway: the inbound call path can then answer "has this caller been reported"
 * from a local primary-key lookup instead of a cross-internet request while a
 * caller waits on the line.
 *
 * Only rows with a populated caller_id_number are useful. The field is empty on
 * most recent complaints (the FCC does not require it), so a large page of
 * complaints yields a small number of usable rows — expected, not a failure.
 *
 * Cursor is the last issue_date processed, paged forward. No API key needed; a
 * Socrata app token in FCC_APP_TOKEN lifts the anonymous rate limit if set.
 *
 * POST {}                      — resume from the cursor
 * POST { "since": "2024-01-01" } — restart the cursor at a date
 * POST { "pages": 20 }         — pull more pages in one run (backfill)
 *
 * Deploy: ./scripts/deploy-functions.sh sync-fcc-complaints
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { nanpToE164 } from '../_shared/fraud.ts';

const DATASET = 'https://opendata.fcc.gov/resource/vakf-fz8e.json';
const PAGE_SIZE = 5000;
const DEFAULT_PAGES = 6;
// The dataset starts 2014-10-31; this is the default backfill floor.
const EPOCH = '2014-10-31T00:00:00.000';

interface Agg { count: number; last_at: string | null; tags: Set<string> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Cron-only: these ingest jobs are invoked by pg_cron with the service role
    // key. verify_jwt alone would let any anon-key caller trigger a full
    // backfill, so check the key itself.
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json().catch(() => ({}));
    const { data: sync } = await supabase
      .from('fraud_external_sync').select('cursor_value, rows_ingested').eq('source', 'fcc').maybeSingle();

    let cursor = body.since
      ? `${String(body.since).slice(0, 10)}T00:00:00.000`
      : (sync?.cursor_value || EPOCH);
    const maxPages = Math.min(Number(body.pages) || DEFAULT_PAGES, 60);

    const token = Deno.env.get('FCC_APP_TOKEN');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['X-App-Token'] = token;

    // The dataset contains rows with absurd issue_dates (year 9999). They are
    // excluded server-side AND ignored when advancing the cursor: one of them
    // set the cursor to 9999-12-15, after which `issue_date > cursor` matched
    // nothing and the daily job would have silently ingested nothing forever.
    const horizon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 23);

    let pages = 0;
    let scanned = 0;
    let usable = 0;
    let newestSeen = cursor;

    while (pages < maxPages) {
      // Ordered by issue_date so the cursor can move forward monotonically.
      // caller_id_number IS NOT NULL is pushed down — no point paging through
      // complaints that carry no number.
      const url =
        `${DATASET}?$where=${encodeURIComponent(
          `issue_date > '${cursor}' AND issue_date < '${horizon}' AND caller_id_number IS NOT NULL`,
        )}` +
        `&$order=${encodeURIComponent('issue_date ASC')}&$limit=${PAGE_SIZE}`;

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`FCC SODA HTTP ${resp.status}: ${detail.slice(0, 200)}`);
      }
      const rows: any[] = await resp.json();
      pages++;
      if (rows.length === 0) break;

      const agg = new Map<string, Agg>();
      for (const r of rows) {
        scanned++;
        if (r.issue_date && r.issue_date > newestSeen && r.issue_date < horizon) newestSeen = r.issue_date;
        const e164 = nanpToE164(r.caller_id_number);
        if (!e164) continue;
        usable++;

        const iso = r.issue_date ? new Date(r.issue_date + 'Z').toISOString() : null;
        const entry = agg.get(e164) ?? { count: 0, last_at: null, tags: new Set<string>() };
        entry.count++;
        if (iso && (!entry.last_at || iso > entry.last_at)) entry.last_at = iso;
        const kind = (r.type_of_call_or_messge || '').trim();
        if (kind && entry.tags.size < 5) entry.tags.add(kind);
        agg.set(e164, entry);
      }

      if (agg.size > 0) {
        const payload = [...agg.entries()].map(([e164, a]) => ({
          e164, count: a.count, last_at: a.last_at, tags: [...a.tags],
        }));
        for (let i = 0; i < payload.length; i += 2000) {
          const { error } = await supabase.rpc('merge_fraud_external', {
            p_source: 'fcc',
            p_rows: payload.slice(i, i + 2000),
          });
          if (error) throw new Error(`merge_fraud_external: ${error.message}`);
        }
      }

      // Advance past this page. If a page didn't move the date at all, every
      // row shares one timestamp and paging by date would loop forever — stop
      // rather than spin.
      if (newestSeen === cursor) {
        console.warn(`[sync-fcc] page ${pages} did not advance the cursor (${cursor}) — stopping`);
        break;
      }
      cursor = newestSeen;
      if (rows.length < PAGE_SIZE) break; // caught up
    }

    await supabase.from('fraud_external_sync').update({
      cursor_value: cursor,
      last_run_at: new Date().toISOString(),
      last_status: 'ok',
      rows_ingested: (sync?.rows_ingested ?? 0) + usable,
    }).eq('source', 'fcc');

    console.log(`[sync-fcc] ${pages} pages, ${scanned} complaints scanned, ${usable} with a number → cursor ${cursor}`);
    return new Response(JSON.stringify({ success: true, pages, scanned, usable, cursor }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[sync-fcc] failed:', e);
    await supabase.from('fraud_external_sync')
      .update({ last_run_at: new Date().toISOString(), last_status: `error: ${(e as Error).message}`.slice(0, 200) })
      .eq('source', 'fcc');
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
