/**
 * fraud-dispute — lets the owner of a listed number contest the listing.
 *
 * Public and unauthenticated by necessity: the person whose number was blocked
 * has no account here, and often the whole problem is that a spammer spoofed
 * their number and they can't get through to anyone.
 *
 * That makes this the most abusable surface in the fraud system — a form that
 * un-lists numbers, open to the internet. Two things hold it shut:
 *
 *   1. Control of the number must be proved. A six-digit code is placed by SMS
 *      TO the disputed number; whoever files the dispute has to read it back.
 *      Blocking is inbound-only, so we can still text a blocked number.
 *   2. A verified dispute does NOT unblock anything. It marks the entry
 *      disputed and puts it in the review queue. A person decides.
 *
 * Rate limits: 3 code requests per number per day, 5 verification attempts per
 * code, codes expire in 10 minutes. Responses are deliberately uniform about
 * whether a number is listed — this endpoint must not become a way to probe the
 * blocklist.
 *
 * POST { action: 'start',  number }
 * POST { action: 'verify', number, code, reason, contact_email? }
 *
 * Deployed with --no-verify-jwt (public). See _shared/jwt-policy.json.
 * Deploy: ./scripts/deploy-functions.sh fraud-dispute
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeE164 } from '../_shared/phone-e164.ts';
import { MAGPIPE_MAIN_NUMBER } from '../_shared/sms-compliance.ts';

const CODE_TTL_MINUTES = 10;
const MAX_REQUESTS_PER_DAY = 3;
const MAX_VERIFY_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hashCode(code: string, e164: string): Promise<string> {
  // Salted with the number so a leaked hash can't be replayed elsewhere.
  const data = new TextEncoder().encode(`${e164}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendCode(e164: string, code: string): Promise<boolean> {
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN');
  const space = Deno.env.get('SIGNALWIRE_SPACE_URL');
  if (!projectId || !apiToken || !space) {
    console.error('[fraud-dispute] SignalWire not configured — cannot send verification code');
    return false;
  }

  // Always the main Magpipe line, never the country-routed notification
  // senders. This code goes to someone who is not a customer — often a
  // spoofing victim who has never heard of us — so it has to come from a
  // verified number they can look up and call back, and the same number every
  // time. Sender rotation would read exactly like the spam they're disputing.
  const from = MAGPIPE_MAIN_NUMBER;

  const resp = await fetch(
    `https://${space}/api/laml/2010-04-01/Accounts/${projectId}/Messages`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${projectId}:${apiToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To: e164,
        Body: `Magpipe (magpipe.ai): ${code} is your code to dispute a fraud listing for this number. It expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, ignore this message.`,
      }),
    },
  );
  if (!resp.ok) {
    console.error(`[fraud-dispute] code send failed: ${resp.status} ${await resp.text().catch(() => '')}`);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const e164 = normalizeE164(body.number ?? body.e164);
    if (!e164) return json({ error: 'Enter a phone number, for example (604) 555-1234.' }, 400);

    const { data: entry } = await supabase
      .from('fraud_numbers').select('e164, status').eq('e164', e164).maybeSingle();

    // ── Step 1: send a code to the number ────────────────────────────────
    if (body.action === 'start') {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count: recent } = await supabase
        .from('fraud_disputes').select('id', { count: 'exact', head: true })
        .eq('e164', e164).gte('code_sent_at', dayAgo);

      if ((recent ?? 0) >= MAX_REQUESTS_PER_DAY) {
        return json({ error: `Too many codes requested for this number today. Try again tomorrow, or email support@magpipe.ai.` }, 429);
      }

      // Uniform response whether or not the number is listed: this endpoint
      // must not double as a way to test which numbers are on the blocklist.
      if (!entry || entry.status === 'cleared') {
        console.log(`[fraud-dispute] start for unlisted number ${e164} — returning generic response`);
        return json({ sent: true, message: `If that number is on our list, we've sent it a verification code.` });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const delivered = await sendCode(e164, code);
      if (!delivered) {
        return json({ error: `We couldn't send a code to that number just now. Try again shortly, or email support@magpipe.ai.` }, 502);
      }

      await supabase.from('fraud_disputes').insert({
        e164,
        code_hash: await hashCode(code, e164),
        code_expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
        code_sent_at: new Date().toISOString(),
      });

      console.log(`[fraud-dispute] verification code sent to ${e164}`);
      return json({ sent: true, message: `If that number is on our list, we've sent it a verification code.` });
    }

    // ── Step 2: verify the code and file the dispute ─────────────────────
    if (body.action === 'verify') {
      const code = String(body.code || '').trim();
      const reason = String(body.reason || '').trim();
      if (!/^\d{6}$/.test(code)) return json({ error: 'Enter the six-digit code we sent.' }, 400);
      if (reason.length < 10) return json({ error: 'Tell us briefly why this number should not be listed.' }, 400);

      const { data: pending } = await supabase
        .from('fraud_disputes')
        .select('id, code_hash, code_expires_at, code_attempts')
        .eq('e164', e164).eq('verified', false).not('code_hash', 'is', null)
        .order('code_sent_at', { ascending: false }).limit(1).maybeSingle();

      if (!pending) return json({ error: 'Request a new code — this one is no longer valid.' }, 400);
      if (pending.code_attempts >= MAX_VERIFY_ATTEMPTS) {
        return json({ error: 'Too many incorrect attempts. Request a new code.' }, 429);
      }
      if (new Date(pending.code_expires_at).getTime() < Date.now()) {
        return json({ error: 'That code has expired. Request a new one.' }, 400);
      }

      if (await hashCode(code, e164) !== pending.code_hash) {
        await supabase.from('fraud_disputes')
          .update({ code_attempts: pending.code_attempts + 1 }).eq('id', pending.id);
        return json({ error: 'That code is not right. Check it and try again.' }, 400);
      }

      // Verified. The code is cleared so it cannot be replayed, and the entry
      // is marked disputed and pushed back into the review queue — it is NOT
      // unblocked here. A person decides that.
      await supabase.from('fraud_disputes').update({
        verified: true,
        reason: reason.slice(0, 1000),
        contact_email: (body.contact_email || '').slice(0, 200) || null,
        code_hash: null,
        code_expires_at: null,
      }).eq('id', pending.id);

      await supabase.from('fraud_numbers')
        .update({ disputed: true, review_state: 'pending' }).eq('e164', e164);

      console.warn(`[fraud-dispute] VERIFIED dispute filed for ${e164} — queued for review`);
      return json({
        filed: true,
        message: `Your dispute is filed. Someone will review it, and we'll email you if you left an address. Calls stay blocked until it's reviewed.`,
      });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('fraud-dispute error:', e);
    return json({ error: 'Something went wrong. Try again shortly.' }, 500);
  }
});
