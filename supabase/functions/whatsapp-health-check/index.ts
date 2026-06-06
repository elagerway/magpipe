/**
 * whatsapp-health-check
 *
 * Proactive monitor for every active WhatsApp number. Runs on a cron (every
 * 30 min). For each account it:
 *   1. Validates the access token (catches a dead/expired/revoked token —
 *      Graph error 190 — instead of waiting for a customer send to fail).
 *   2. Checks the number's Cloud API status. If it's not CONNECTED
 *      (deregistered / PENDING), it AUTO-RE-REGISTERS using the stored 2-step
 *      PIN, so a dropped registration self-heals.
 *   3. Pages via SMS (through log-error) on token death, on a registration it
 *      couldn't auto-heal, and on a successful self-heal (so we know it happened).
 *
 * This is the guardrail for the 2026-05-29 incident, where a number silently
 * went NOT VERIFIED / "Account not registered" (133010) and nothing caught it.
 *
 * Auth: cron (x-cron-invoke: true) or service-role key — same as
 * refresh-whatsapp-tokens.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { reportError } from '../_shared/error-reporter.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GRAPH = 'https://graph.facebook.com/v21.0'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || ''
  const isCron = req.headers.get('x-cron-invoke') === 'true'
  const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)
  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: accounts, error } = await supabase
    .from('whatsapp_accounts')
    .select('id, user_id, phone_number_id, access_token, phone_number, two_step_pin, registered')
    .eq('is_active', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  if (!accounts?.length) {
    return new Response(JSON.stringify({ checked: 0 }))
  }

  const results: any[] = []

  for (const acct of accounts) {
    const label = acct.phone_number || acct.phone_number_id
    try {
      const statusRes = await fetch(
        `${GRAPH}/${acct.phone_number_id}?fields=display_phone_number,code_verification_status,status`,
        { headers: { 'Authorization': `Bearer ${acct.access_token}` } }
      )
      const data = await statusRes.json()

      // ── Token dead / invalid (190) ──────────────────────────────────────
      if (data.error) {
        const code = data.error.code
        if (code === 190) {
          await reportError(supabase, {
            error_type: 'whatsapp_token_invalid',
            error_message: `WhatsApp token for ${label} is invalid (${data.error.message}). Number can't send or receive until a new token is set. Generate a System User token and update META_ACCESS_TOKEN.`,
            error_code: String(code),
            source: 'whatsapp-health-check', severity: 'error',
            metadata: { phone_number_id: acct.phone_number_id }, user_id: acct.user_id,
          }).catch(() => {})
          results.push({ number: label, ok: false, issue: 'token_invalid' })
          continue
        }
        // Other Graph error — surface but don't assume it's fatal.
        await reportError(supabase, {
          error_type: 'whatsapp_connect_failure',
          error_message: `Health check for ${label} failed: ${data.error.message}`,
          error_code: String(code), source: 'whatsapp-health-check', severity: 'error',
          metadata: { phone_number_id: acct.phone_number_id }, user_id: acct.user_id,
        }).catch(() => {})
        results.push({ number: label, ok: false, issue: 'graph_error', code })
        continue
      }

      // ── Number healthy ──────────────────────────────────────────────────
      if (data.status === 'CONNECTED') {
        if (acct.registered !== true) {
          await supabase.from('whatsapp_accounts').update({ registered: true, updated_at: new Date().toISOString() }).eq('id', acct.id)
        }
        results.push({ number: label, ok: true, status: 'CONNECTED' })
        continue
      }

      // ── Not CONNECTED → try to self-heal by re-registering ──────────────
      if (acct.two_step_pin) {
        const regRes = await fetch(`${GRAPH}/${acct.phone_number_id}/register`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${acct.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin: acct.two_step_pin }),
        })
        const regData = await regRes.json().catch(() => ({}))
        if (regRes.ok && regData.success) {
          await supabase.from('whatsapp_accounts').update({ registered: true, updated_at: new Date().toISOString() }).eq('id', acct.id)
          // Self-heal succeeded — page so we know it happened and can root-cause.
          await reportError(supabase, {
            error_type: 'whatsapp_account_reregistered',
            error_message: `Auto-healed: ${label} was ${data.status}, re-registered on the Cloud API and is back online. Root-cause why it dropped.`,
            source: 'whatsapp-health-check', severity: 'error',
            metadata: { phone_number_id: acct.phone_number_id, prior_status: data.status }, user_id: acct.user_id,
          }).catch(() => {})
          results.push({ number: label, ok: true, issue: 'reregistered', prior: data.status })
          continue
        }
        // Re-register failed — can't self-heal.
        await supabase.from('whatsapp_accounts').update({ registered: false, updated_at: new Date().toISOString() }).eq('id', acct.id)
        await reportError(supabase, {
          error_type: 'whatsapp_account_deregistered',
          error_message: `${label} is ${data.status} and auto-re-registration FAILED: ${regData.error?.message || 'unknown'}. Manual intervention needed.`,
          error_code: regData.error?.code ? String(regData.error.code) : undefined,
          source: 'whatsapp-health-check', severity: 'error',
          metadata: { phone_number_id: acct.phone_number_id, status: data.status }, user_id: acct.user_id,
        }).catch(() => {})
        results.push({ number: label, ok: false, issue: 'reregister_failed', status: data.status })
        continue
      }

      // Not CONNECTED and no PIN to re-register with — page for manual fix.
      await supabase.from('whatsapp_accounts').update({ registered: false, updated_at: new Date().toISOString() }).eq('id', acct.id)
      await reportError(supabase, {
        error_type: 'whatsapp_account_deregistered',
        error_message: `${label} is ${data.status} (not registered) and has no stored PIN to auto-re-register. Reconnect it from the agent's Deploy tab.`,
        source: 'whatsapp-health-check', severity: 'error',
        metadata: { phone_number_id: acct.phone_number_id, status: data.status }, user_id: acct.user_id,
      }).catch(() => {})
      results.push({ number: label, ok: false, issue: 'not_registered_no_pin', status: data.status })
    } catch (err) {
      console.error(`Health check error for ${label}:`, err)
      results.push({ number: label, ok: false, issue: 'exception' })
    }
  }

  console.log('WhatsApp health check:', JSON.stringify(results))
  return new Response(JSON.stringify({ checked: accounts.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
