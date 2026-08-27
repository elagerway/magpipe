/**
 * fraud-decay — age the fraud list so it reflects the present, not everything
 * that ever happened.
 *
 * Phone numbers get reassigned, and a number that defrauded someone in 2024 may
 * belong to a dentist by 2026. An append-only blocklist quietly becomes a list
 * of innocent people.
 *
 * The one rule this job will not break: **it never silently unblocks.** A
 * blocked entry is only ever moved into the review queue for a human. What it
 * does auto-expire is `flagged` entries — numbers that were never confident
 * enough to block in the first place and have since gone quiet.
 *
 *   flagged, no evidence in 90d, no fraud report ─→ cleared (auto)
 *   blocked, no evidence and never fired in 180d ─→ review_state = pending
 *   any entry                                    ─→ risk score re-aged
 *   public complaints, >24 months old and thin   ─→ pruned from the index
 *
 * Cron: daily.
 * POST { "dry_run": true } to see what it would do.
 *
 * Deploy: ./scripts/deploy-functions.sh fraud-decay
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { ageMultiplier, riskScore } from '../_shared/fraud.ts';

const FLAGGED_EXPIRY_DAYS = 90;
const BLOCKED_REVIEW_DAYS = 180;
const EXTERNAL_PRUNE_MONTHS = 24;
const EXTERNAL_PRUNE_MAX_COMPLAINTS = 3;

const days = (n: number) => new Date(Date.now() - n * 24 * 3600_000).toISOString();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    const { data: entries } = await supabase
      .from('fraud_numbers')
      .select('e164, status, risk_score, first_party_reports, workspaces_reporting, workspaces_blocking, external, last_evidence_at, last_seen_at, blocked_at, review_state, disputed');

    const expired: string[] = [];
    const stale: string[] = [];
    const rescored: { e164: string; from: number; to: number }[] = [];

    for (const e of entries || []) {
      const evidenceAt = new Date(e.last_evidence_at || e.last_seen_at || Date.now()).getTime();
      const ageDays = Math.floor((Date.now() - evidenceAt) / 86_400_000);

      // Re-age the score for every entry. Blocking is status-based, so this
      // only changes what the list looks like, never who gets through.
      const fresh = Math.round(riskScore({
        firstPartyReports: e.first_party_reports,
        workspacesReporting: e.workspaces_reporting,
        workspacesBlocking: e.workspaces_blocking,
        external: e.external,
      }) * ageMultiplier(ageDays));

      if (fresh !== e.risk_score) {
        rescored.push({ e164: e.e164, from: e.risk_score, to: fresh });
        if (!dryRun) await supabase.from('fraud_numbers').update({ risk_score: fresh }).eq('e164', e.e164);
      }

      // Flagged and quiet: it was never confident enough to block, and nothing
      // has happened since. Let it go rather than accumulating forever.
      if (e.status === 'flagged' && e.first_party_reports === 0 && ageDays >= FLAGGED_EXPIRY_DAYS) {
        expired.push(e.e164);
        if (!dryRun) {
          await supabase.from('fraud_numbers').update({
            status: 'cleared',
            cleared_at: new Date().toISOString(),
            cleared_reason: `Expired: no activity in ${FLAGGED_EXPIRY_DAYS} days`,
          }).eq('e164', e.e164);
          await supabase.from('fraud_reviews').insert({
            e164: e.e164, action: 'decay_expired',
            note: `Flagged with no fraud report and no activity for ${ageDays} days`,
          });
        }
        continue;
      }

      // Blocked and dormant. NOT unblocked — surfaced for a person to decide,
      // because the alternative is a permanent block on a number that may have
      // changed hands.
      if (e.status === 'blocked' && ageDays >= BLOCKED_REVIEW_DAYS && e.review_state === 'reviewed') {
        const { count: recentBlocks } = await supabase
          .from('fraud_block_events').select('e164', { count: 'exact', head: true })
          .eq('e164', e.e164).gte('created_at', days(BLOCKED_REVIEW_DAYS));

        if ((recentBlocks ?? 0) === 0) {
          stale.push(e.e164);
          if (!dryRun) {
            await supabase.from('fraud_numbers')
              .update({ review_state: 'pending' }).eq('e164', e.e164);
            await supabase.from('fraud_reviews').insert({
              e164: e.e164, action: 'decay_stale',
              note: `Blocked ${ageDays} days ago; nothing has tried to get through in ${BLOCKED_REVIEW_DAYS} days`,
            });
          }
        }
      }
    }

    // Prune the public index: a single complaint from two years ago is noise
    // that costs storage and slows every search.
    let pruned = 0;
    if (!dryRun) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - EXTERNAL_PRUNE_MONTHS);
      const { count } = await supabase
        .from('fraud_external_numbers')
        .delete({ count: 'exact' })
        .lt('total_complaints', EXTERNAL_PRUNE_MAX_COMPLAINTS)
        .lt('updated_at', cutoff.toISOString());
      pruned = count ?? 0;
    }

    const summary = {
      dry_run: dryRun,
      examined: (entries || []).length,
      expired: expired.length,
      moved_to_review: stale.length,
      rescored: rescored.length,
      external_pruned: pruned,
    };
    console.log('[fraud-decay]', JSON.stringify(summary), dryRun ? { expired, stale } : '');

    return new Response(JSON.stringify({ success: true, ...summary, expired, stale }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[fraud-decay] failed:', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
