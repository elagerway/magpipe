/**
 * manage-forwarding-numbers — CRUD for the per-user pick list of phone
 * numbers that can be used as call_whitelist.forward_to destinations.
 *
 * GET                                       → list user's saved numbers, default first
 * POST   { number, label?, is_default? }    → create (normalizes input to E.164)
 * PATCH  { id, label?, is_default? }        → update label and/or promote to default
 * DELETE ?id=<uuid>                         → delete
 *
 * `number` accepts any common format: "(555) 555-1234", "555-555-1234",
 * "+15555551234", etc. Normalization is via _shared/phone-e164.ts.
 *
 * Setting is_default=true auto-demotes any existing default for the
 * same user (partial unique index forbids multiple defaults). DELETE
 * of a default row promotes the most-recently-created remaining row,
 * if any.
 *
 * Auth: deployed with verify_jwt=false (listed in _shared/jwt-policy.json).
 * resolveUser does the auth gating internally and supports both Supabase
 * JWT (frontend) and mgp_ API keys (MCP / external).
 *
 * Deploy: ./scripts/deploy-functions.sh manage-forwarding-numbers
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { normalizeE164 } from '../_shared/phone-e164.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    // Use service role for writes so the demote-current-default step
    // (which the model-of-trust would otherwise need a SECURITY DEFINER
    // helper for) runs cleanly under one transaction.
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const url = new URL(req.url)

    // ── GET: list this user's saved forwarding numbers ────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('forwarding_numbers')
        .select('id, number, label, is_default, created_at')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return json({ numbers: data ?? [] })
    }

    // ── POST: create ──────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const raw = body?.number

      const normalized = normalizeE164(raw)
      if (!normalized) {
        return err(
          'invalid_number',
          'Invalid phone number — provide a number like (555) 555-1234 or +15555551234',
        )
      }

      // Track which fields the caller explicitly provided. Critical:
      // a POST that omits `is_default` must NOT clobber the existing
      // default flag on an already-saved number. Same for label.
      // Without this, the manage-call-whitelist auto-grow path or a
      // re-add from the UI would silently demote a user's default.
      const hadLabel = 'label' in body
      const hadIsDefault = 'is_default' in body
      const label = hadLabel
        ? (typeof body.label === 'string' ? body.label.slice(0, 100) : null)
        : null
      const isDefault = hadIsDefault && body.is_default === true

      // Demote any existing default for this user ONLY if the caller
      // explicitly asked for this row to become the default.
      if (isDefault) {
        const { error: demoteErr } = await supabase
          .from('forwarding_numbers')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true)
        if (demoteErr) throw demoteErr
      }

      // Look up an existing row so we can decide INSERT vs UPDATE
      // ourselves. supabase-js's upsert(onConflict) overwrites every
      // field in the payload — that's the bug this dodges. The
      // alternative (raw SQL with COALESCE) would work but is harder
      // to read.
      const { data: existing, error: existErr } = await supabase
        .from('forwarding_numbers')
        .select('id, number, label, is_default')
        .eq('user_id', user.id)
        .eq('number', normalized)
        .maybeSingle()
      if (existErr) throw existErr

      try {
        if (existing) {
          // UPDATE only the fields the caller actually sent.
          const updates: Record<string, unknown> = {}
          if (hadLabel) updates.label = label
          if (hadIsDefault) updates.is_default = isDefault
          if (Object.keys(updates).length === 0) {
            // Nothing to change — return the existing row unchanged.
            return json({ number: existing }, 200)
          }
          const { data, error } = await supabase
            .from('forwarding_numbers')
            .update(updates)
            .eq('id', existing.id)
            .select('id, number, label, is_default, created_at')
            .single()
          if (error) throw error
          return json({ number: data }, 200)
        }

        // INSERT a brand-new row.
        const { data, error } = await supabase
          .from('forwarding_numbers')
          .insert({ user_id: user.id, number: normalized, label, is_default: isDefault })
          .select('id, number, label, is_default, created_at')
          .single()
        if (error) throw error
        return json({ number: data }, 201)
      } catch (e) {
        // Concurrent default-toggle: two POSTs with is_default=true at
        // the same instant can both clear the existing flag, then both
        // try to set is_default=true and the second loses on the
        // `forwarding_numbers_one_default_per_user` partial unique
        // index. Surface a retryable conflict rather than a raw 500.
        const msg = (e as { message?: string })?.message || ''
        if (msg.includes('forwarding_numbers_one_default_per_user') || (e as { code?: string })?.code === '23505') {
          return err('conflict', 'Another default change is in progress — please refresh and try again.', 409)
        }
        throw e
      }
    }

    // ── PATCH: update label and/or promote/demote default ─────────────
    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))
      const id = body?.id
      if (!id || !UUID_RE.test(id)) return err('missing_param', 'id is required and must be a UUID')

      const updates: Record<string, unknown> = {}
      if ('label' in body) updates.label = typeof body.label === 'string' ? body.label.slice(0, 100) : null
      if ('is_default' in body) updates.is_default = body.is_default === true

      if (Object.keys(updates).length === 0) return err('missing_param', 'Nothing to update')

      if (updates.is_default === true) {
        const { error: demoteErr } = await supabase
          .from('forwarding_numbers')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true)
          .neq('id', id)
        if (demoteErr) throw demoteErr
      }

      const { data, error } = await supabase
        .from('forwarding_numbers')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id, number, label, is_default, created_at')
        .maybeSingle()
      if (error) throw error
      if (!data) return err('not_found', 'Forwarding number not found', 404)
      return json({ number: data })
    }

    // ── DELETE: remove + promote a replacement default if needed ──────
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id || !UUID_RE.test(id)) return err('missing_param', 'id query param is required and must be a UUID')

      // Find the row to know whether it was the default. maybeSingle
      // returns null if no match (e.g. wrong user) — caller gets 404.
      const { data: existing, error: getErr } = await supabase
        .from('forwarding_numbers')
        .select('id, is_default')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (getErr) throw getErr
      if (!existing) return err('not_found', 'Forwarding number not found', 404)

      // Belt + suspenders: scope DELETE by user_id as well as id. The
      // preceding SELECT already filtered by user_id, but if that gate
      // is ever refactored away the bare .eq('id', id) becomes a
      // cross-tenant hole. Same pattern manage-call-whitelist uses.
      const { error: delErr } = await supabase
        .from('forwarding_numbers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      if (delErr) throw delErr

      // If we just deleted the default, promote the most-recent
      // remaining row (best guess at what the user wants). If the user
      // has no other rows, that's fine — they'll have no default until
      // they add another.
      if (existing.is_default) {
        const { data: candidate, error: pickErr } = await supabase
          .from('forwarding_numbers')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (pickErr) throw pickErr
        if (candidate) {
          await supabase.from('forwarding_numbers').update({ is_default: true }).eq('id', candidate.id)
        }
      }

      return json({ ok: true })
    }

    return err('method_not_allowed', `${req.method} not supported`, 405)
  } catch (e) {
    const msg = (e as Error)?.message || String(e)
    console.error('[manage-forwarding-numbers]', msg)
    return err('internal_error', msg, 500)
  }
})
