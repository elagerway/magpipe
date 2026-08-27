/**
 * sync-ftc-complaints — ingest the FTC "Do Not Call — Reported Calls" daily CSV
 * into fraud_external_numbers, so the inbound path can cross-reference a caller
 * with one indexed lookup instead of a live API call.
 *
 * Why the CSV and not the API: api.ftc.gov/v0/dnc-complaints has no
 * per-caller-number filter (it filters by date/state/city/consumer area code
 * only), so there is no way to ask it about one number. The daily CSV is the
 * whole feed — ~11k complaints/day, ~1.1 MB.
 *
 * The FTC blocks non-browser user agents on the file host: without a browser
 * UA the download 403s.
 *
 * Cron: daily. Cursor is the last CSV date ingested; a run advances one day at
 * a time up to yesterday, so a gap self-heals over subsequent runs. The merge
 * is additive, which is why a date is never re-ingested.
 *
 * POST {} — normal run (catch up to yesterday, bounded)
 * POST { "backfill_days": 30 } — pull further history in one run
 * POST { "date": "2026-08-19" } — force one specific day
 *
 * Deploy: ./scripts/deploy-functions.sh sync-ftc-complaints
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { nanpToE164 } from '../_shared/fraud.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// The FTC keeps roughly a 5-week trailing window of daily files.
const MAX_DAYS_PER_RUN = 7;

function csvDateUrl(date: string): string {
  return `https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_${date}.csv`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Minimal RFC4180 line splitter — the FTC file quotes subjects containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

interface Agg { count: number; last_at: string | null; tags: Set<string> }

async function ingestDay(supabase: any, date: string): Promise<{ rows: number; numbers: number }> {
  const resp = await fetch(csvDateUrl(date), { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/csv' } });
  if (!resp.ok) throw new Error(`FTC CSV ${date} → HTTP ${resp.status}`);
  const text = await resp.text();

  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0] || '').map(h => h.trim());
  const iNumber = header.indexOf('Company_Phone_Number');
  const iViolation = header.indexOf('Violation_Date');
  const iCreated = header.indexOf('Created_Date');
  const iSubject = header.indexOf('Subject');
  if (iNumber === -1) throw new Error(`FTC CSV ${date}: no Company_Phone_Number column (header: ${header.join('|')})`);

  const agg = new Map<string, Agg>();
  let rows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    const e164 = nanpToE164(cols[iNumber]);
    if (!e164) continue; // blank or malformed — the feed carries both
    rows++;

    const rawDate = (cols[iViolation] || cols[iCreated] || '').trim();
    const stamp = rawDate ? new Date(rawDate.replace(' ', 'T') + 'Z') : null;
    const iso = stamp && !isNaN(stamp.getTime()) ? stamp.toISOString() : null;

    const entry = agg.get(e164) ?? { count: 0, last_at: null, tags: new Set<string>() };
    entry.count++;
    if (iso && (!entry.last_at || iso > entry.last_at)) entry.last_at = iso;
    const subject = (cols[iSubject] || '').trim();
    if (subject && subject !== 'Other' && entry.tags.size < 5) entry.tags.add(subject);
    agg.set(e164, entry);
  }

  const payload = [...agg.entries()].map(([e164, a]) => ({
    e164, count: a.count, last_at: a.last_at, tags: [...a.tags],
  }));

  // Chunked so a busy day can't blow the statement size.
  for (let i = 0; i < payload.length; i += 2000) {
    const { error } = await supabase.rpc('merge_fraud_external', {
      p_source: 'ftc',
      p_rows: payload.slice(i, i + 2000),
    });
    if (error) throw new Error(`merge_fraud_external: ${error.message}`);
  }

  return { rows, numbers: payload.length };
}

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
      .from('fraud_external_sync').select('cursor_value, rows_ingested').eq('source', 'ftc').maybeSingle();

    // The feed is published next-day, so "yesterday" is the newest complete file.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let days: string[];
    if (body.date) {
      days = [body.date];
    } else {
      const backfill = Math.min(Number(body.backfill_days) || 0, 35);
      const start = sync?.cursor_value
        ? new Date(new Date(sync.cursor_value + 'T00:00:00Z').getTime() + 24 * 60 * 60 * 1000)
        : new Date(yesterday.getTime() - (backfill || 1) * 24 * 60 * 60 * 1000);

      days = [];
      const limit = backfill || MAX_DAYS_PER_RUN;
      for (let d = new Date(start); d <= yesterday && days.length < limit; d = new Date(d.getTime() + 86400000)) {
        days.push(isoDay(d));
      }
    }

    const results: Record<string, unknown>[] = [];
    let lastOk: string | null = null;
    let totalRows = 0;

    for (const day of days) {
      try {
        const r = await ingestDay(supabase, day);
        totalRows += r.rows;
        lastOk = day;
        results.push({ date: day, ...r });
        console.log(`[sync-ftc] ${day}: ${r.rows} complaints → ${r.numbers} numbers`);
      } catch (e) {
        // A missing day (holiday, publishing gap) must not wedge the cursor —
        // record it and keep going; the next run resumes after the last success.
        console.warn(`[sync-ftc] ${day} skipped: ${(e as Error).message}`);
        results.push({ date: day, error: (e as Error).message });
      }
    }

    if (lastOk && !body.date) {
      await supabase.from('fraud_external_sync').update({
        cursor_value: lastOk,
        last_run_at: new Date().toISOString(),
        last_status: 'ok',
        rows_ingested: (sync?.rows_ingested ?? 0) + totalRows,
      }).eq('source', 'ftc');
    } else {
      await supabase.from('fraud_external_sync').update({
        last_run_at: new Date().toISOString(),
        last_status: lastOk ? 'ok' : 'no_new_data',
      }).eq('source', 'ftc');
    }

    return new Response(JSON.stringify({ success: true, days: results, complaints: totalRows }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[sync-ftc] failed:', e);
    await supabase.from('fraud_external_sync')
      .update({ last_run_at: new Date().toISOString(), last_status: `error: ${(e as Error).message}`.slice(0, 200) })
      .eq('source', 'ftc');
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
