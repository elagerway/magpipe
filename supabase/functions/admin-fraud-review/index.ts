/**
 * admin-fraud-review — the queue where a person decides what the automation
 * couldn't.
 *
 * Three things land here:
 *   disputes  a verified owner says their number shouldn't be listed
 *   flagged   evidence exists but wasn't enough to block on its own
 *   stale     blocked long ago, nothing has tried to get through since
 *
 * Every decision is written to fraud_reviews with the admin who made it. A
 * global blocklist that anyone can edit without a trace is a liability; this is
 * the audit trail for "why is this number blocked".
 *
 * GET                        the queue
 * POST { e164, action, note }  promote | clear | keep | uphold_dispute | reject_dispute
 *
 * Deploy: ./scripts/deploy-functions.sh admin-fraud-review
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/admin-auth.ts';
import { normalizeE164 } from '../_shared/phone-e164.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let admin;
  try {
    admin = await requireAdmin(supabase, (req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 403);
  }

  try {
    if (req.method === 'GET') {
      const [{ data: disputes }, { data: pending }, { data: recentDecisions }] = await Promise.all([
        supabase.from('fraud_disputes')
          .select('id, e164, reason, contact_email, created_at')
          .eq('status', 'open').eq('verified', true)
          .order('created_at', { ascending: true }),
        supabase.from('fraud_numbers')
          .select('e164, status, categories, risk_score, first_party_reports, workspaces_reporting, workspaces_blocking, external, lookup, disputed, blocked_at, first_seen_at, last_evidence_at')
          .eq('review_state', 'pending')
          .order('risk_score', { ascending: false })
          .limit(200),
        supabase.from('fraud_reviews')
          .select('e164, action, note, created_at, admin_user_id')
          .order('created_at', { ascending: false }).limit(25),
      ]);

      const disputedNumbers = new Set((disputes || []).map((d: any) => d.e164));

      // The evidence behind each queued number, so a decision doesn't need a
      // second round trip per row.
      const numbers = (pending || []).map((p: any) => p.e164);
      const { data: reports } = numbers.length
        ? await supabase.from('fraud_reports')
            .select('e164, source, category, confidence, evidence, created_at')
            .in('e164', numbers).order('created_at', { ascending: false }).limit(500)
        : { data: [] };
      const reportsBy = new Map<string, any[]>();
      for (const r of reports || []) {
        if (!reportsBy.has(r.e164)) reportsBy.set(r.e164, []);
        reportsBy.get(r.e164)!.push(r);
      }

      return json({
        disputes: disputes || [],
        queue: (pending || []).map((p: any) => ({
          ...p,
          has_dispute: disputedNumbers.has(p.e164),
          // Admins see the evidence across every workspace — that is the job.
          reports: reportsBy.get(p.e164) ?? [],
        })),
        recent_decisions: recentDecisions || [],
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const e164 = normalizeE164(body.e164 ?? body.number);
      const action = body.action;
      const note = String(body.note || '').slice(0, 500) || null;
      if (!e164) return json({ error: 'A valid phone number is required.' }, 400);

      const VALID = ['promote', 'clear', 'keep', 'uphold_dispute', 'reject_dispute'];
      if (!VALID.includes(action)) return json({ error: `Unknown action: "${action ?? ''}"` }, 400);

      const now = new Date().toISOString();
      const reviewed = { review_state: 'reviewed', reviewed_at: now, reviewed_by: admin.id };

      if (action === 'promote') {
        await supabase.from('fraud_numbers')
          .update({ ...reviewed, status: 'blocked', blocked_at: now }).eq('e164', e164);
      } else if (action === 'clear' || action === 'uphold_dispute') {
        // Upholding a dispute is the only path that unblocks a number, and it
        // takes a person: nothing automatic ever reaches this branch.
        await supabase.from('fraud_numbers').update({
          ...reviewed,
          status: 'cleared',
          cleared_at: now,
          cleared_reason: note || (action === 'uphold_dispute' ? 'Dispute upheld' : 'Cleared on review'),
          disputed: false,
        }).eq('e164', e164);
      } else if (action === 'reject_dispute') {
        await supabase.from('fraud_numbers').update({ ...reviewed, disputed: false }).eq('e164', e164);
      } else {
        await supabase.from('fraud_numbers').update(reviewed).eq('e164', e164);
      }

      if (action === 'uphold_dispute' || action === 'reject_dispute') {
        await supabase.from('fraud_disputes').update({
          status: action === 'uphold_dispute' ? 'upheld' : 'rejected',
          resolved_at: now,
          resolved_by: admin.id,
          resolution_note: note,
        }).eq('e164', e164).eq('status', 'open');
      }

      await supabase.from('fraud_reviews').insert({ e164, admin_user_id: admin.id, action, note });
      console.log(`[admin-fraud-review] ${admin.email} → ${action} on ${e164}${note ? ` (${note})` : ''}`);

      return json({ success: true, e164, action });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('admin-fraud-review error:', e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
