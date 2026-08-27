/**
 * manage-blocked-callers — CRUD for the per-user (workspace-wide)
 * blocklist of caller phone numbers that should be auto-rejected with
 * a fast-busy by webhook-inbound-call before reaching any agent.
 *
 * GET                                              → list user's blocked callers, most-recent first
 * POST   { caller_number, label?, source? }        → create (normalizes input to E.164)
 * PATCH  { id, label? }                            → update the label only (number is immutable; remove + re-add to change)
 * DELETE ?id=<uuid>                                → unblock
 *
 * `caller_number` accepts any common format ("(604) 562-8647", etc.)
 * and is normalized via _shared/phone-e164.ts before insert. The DB
 * CHECK constraint on the column is the final gate.
 *
 * Auth: deployed with verify_jwt=false (listed in jwt-policy.json).
 * resolveUser does the gating and supports both Supabase JWT (frontend)
 * and mgp_ API keys (MCP / external).
 *
 * Deploy: ./scripts/deploy-functions.sh manage-blocked-callers
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { normalizeE164 } from '../_shared/phone-e164.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_SOURCES = new Set(['manual', 'inbox_mark_spam'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })

    const user = await resolveUser(req, anonClient)
    if (!user) return err('unauthorized', 'Unauthorized', 401)

    // Service role for writes so tenant scoping is enforced by explicit
    // .eq('user_id', user.id) on every mutation (same pattern as the
    // forwarding-numbers / call-whitelist functions).
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const url = new URL(req.url)

    // ── GET: list this user's blocked callers ─────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('blocked_callers')
        .select('id, caller_number, label, source, blocked_at, created_at')
        .eq('user_id', user.id)
        .order('blocked_at', { ascending: false })
      if (error) throw error
      return json({ entries: data ?? [] })
    }

    // ── POST: block a new caller ──────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const raw = body?.caller_number
      const label = typeof body?.label === 'string' ? body.label.slice(0, 200) : null
      const source = typeof body?.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'manual'

      const normalized = normalizeE164(raw)
      if (!normalized) {
        return err(
          'invalid_number',
          'Invalid phone number — provide a number like (604) 562-8647 or +16045628647',
        )
      }

      const { data, error } = await supabase
        .from('blocked_callers')
        .insert({ user_id: user.id, caller_number: normalized, label, source })
        .select('id, caller_number, label, source, blocked_at, created_at')
        .single()

      if (error) {
        if (error.code === '23505') {
          // Already blocked. Idempotent from the caller's POV — fetch and return.
          const { data: existing } = await supabase
            .from('blocked_callers')
            .select('id, caller_number, label, source, blocked_at, created_at')
            .eq('user_id', user.id)
            .eq('caller_number', normalized)
            .maybeSingle()
          if (existing) return json({ entry: existing, already_blocked: true }, 200)
          return err('duplicate', 'Caller is already on your blocklist', 409)
        }
        throw error
      }

      // Feed the global fraud list. A single workspace block only FLAGS the
      // number — it means "I don't want this caller", which is not evidence of
      // fraud. report-fraud-number promotes it to a global block once
      // independent workspaces agree. Fire-and-forget: blocking a caller must
      // not wait on, or fail because of, the fraud list.
      const notifyFraud = fetch(`${supabaseUrl}/functions/v1/report-fraud-number`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          e164: normalized,
          user_id: user.id,
          source: 'workspace_block',
          category: 'other',
          evidence: label || null,
        }),
      }).catch(e => console.warn('[manage-blocked-callers] fraud list notify failed:', e))

      // @ts-ignore — EdgeRuntime is available in the Supabase edge runtime
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(notifyFraud)

      return json({ entry: data }, 201)
    }

    // ── PATCH: update label only (number is immutable) ────────────────
    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))
      const id = body?.id
      if (!id || !UUID_RE.test(id)) return err('missing_param', 'id is required and must be a UUID')

      if (!('label' in body)) return err('missing_param', 'Nothing to update')
      const label = typeof body.label === 'string' ? body.label.slice(0, 200) : null

      const { data, error } = await supabase
        .from('blocked_callers')
        .update({ label })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id, caller_number, label, source, blocked_at, created_at')
        .maybeSingle()
      if (error) throw error
      if (!data) return err('not_found', 'Blocked caller not found', 404)
      return json({ entry: data })
    }

    // ── DELETE: unblock ───────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id || !UUID_RE.test(id)) return err('missing_param', 'id query param is required and must be a UUID')

      const { data: deleted, error } = await supabase
        .from('blocked_callers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id')
      if (error) throw error
      if (!deleted || deleted.length === 0) return err('not_found', 'Blocked caller not found', 404)
      return json({ ok: true })
    }

    return err('method_not_allowed', `${req.method} not supported`, 405)
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    console.error('[manage-blocked-callers]', msg)
    return err('internal_error', msg, 500)
  }
})
