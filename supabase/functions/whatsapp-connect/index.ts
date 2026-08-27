/**
 * WhatsApp Connect — stores a WhatsApp Business number against the user and
 * subscribes our app to the WABA's webhooks.
 *
 * Embedded Signup grants our Meta app's system user access to the customer's
 * WABA, so we authenticate to the Graph API with META_ACCESS_TOKEN (the system
 * user token) rather than exchanging the OAuth code for a per-user token. The
 * client supplies waba_id + phone_number_id (from the FB.login session info).
 *
 * Also handles GET (list accounts), PATCH (assign agent), DELETE (disconnect).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { reportError } from '../_shared/error-reporter.ts'

const META_ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Random 6-digit 2-step-verification PIN for Cloud API registration. */
function generatePin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

/** Current Cloud API status of a number ('CONNECTED' once registered). */
async function getNumberStatus(phoneNumberId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?fields=status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    return data.status || null
  } catch {
    return null
  }
}

/** Deregister a number from the Cloud API — clears a stuck 2-step PIN so it can
 *  be re-registered with one we control. */
async function deregisterNumber(phoneNumberId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/deregister`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    return res.ok && data.success === true
  } catch {
    return false
  }
}

/**
 * Register the number on the WhatsApp Cloud API, idempotently.
 *
 * A number from Embedded Signup is NOT usable until registered (sends otherwise
 * fail with 133010 "Account not registered"). But re-registering a number that
 * is ALREADY registered under a different 2-step PIN fails with 133005 ("PIN
 * mismatch") — which is exactly what happens on reconnect: disconnect only drops
 * our local row + stored PIN and never deregisters at Meta, so the number stays
 * registered with a PIN we no longer hold. To make reconnect safe:
 *   1. If Meta already reports the number CONNECTED, it's registered — skip
 *      (avoids a spurious 133005 + failure alert).
 *   2. Otherwise register with our PIN.
 *   3. On 133005 (stuck with an old PIN), deregister then re-register with our
 *      PIN so Meta's PIN matches what we store (keeps health-check auto-heal able
 *      to re-register later).
 */
async function registerNumber(phoneNumberId: string, token: string, pin: string): Promise<{ registered: boolean; error?: string; code?: number }> {
  // 1. Already connected → already registered; nothing to do.
  if ((await getNumberStatus(phoneNumberId, token)) === 'CONNECTED') return { registered: true }

  const attempt = async () => {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/register`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.success === true, code: data.error?.code as number | undefined, msg: String(data.error?.message || 'registration failed') }
  }

  let r = await attempt()
  if (r.ok || /already.*registered/i.test(r.msg)) return { registered: true }

  // 3. Stuck under an old PIN we don't have → clear it and re-register with ours.
  if (r.code === 133005) {
    await deregisterNumber(phoneNumberId, token)
    r = await attempt()
    if (r.ok || /already.*registered/i.test(r.msg)) return { registered: true }
  }

  return { registered: false, error: r.msg, code: r.code }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const user = await resolveUser(req, supabase)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const url = new URL(req.url)

  // ── POST /whatsapp-connect — subscribe webhooks, store account ────────────
  if (req.method === 'POST') {
    let body: any
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
    }

    const { waba_id, phone_number_id, access_token: directToken } = body

    if (!waba_id || !phone_number_id) {
      return new Response(JSON.stringify({ error: 'waba_id and phone_number_id are required' }), {
        status: 400, headers: corsHeaders
      })
    }

    // Manual flow supplies its own token; Embedded Signup uses our app's system
    // user token, which already has access to the customer's WABA.
    const accessToken = directToken || META_ACCESS_TOKEN

    if (!accessToken) {
      console.error('No access token available (META_ACCESS_TOKEN unset and no token supplied)')
      await reportError(supabase, {
        error_type: 'whatsapp_connect_failure',
        error_message: 'META_ACCESS_TOKEN unset and no token supplied — cannot connect WhatsApp number',
        source: 'whatsapp-connect', severity: 'error',
        metadata: { waba_id, phone_number_id, stage: 'access_token' }, user_id: user.id,
      }).catch(() => {})
      return new Response(JSON.stringify({ error: 'WhatsApp connection is not configured. Please contact support.' }), {
        status: 500, headers: corsHeaders
      })
    }

    // Fetch phone number details
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${phone_number_id}?fields=verified_name,display_phone_number,code_verification_status`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    const phoneData = await phoneRes.json()

    const displayName = phoneData.verified_name || 'WhatsApp Business'
    const phoneNumber = phoneData.display_phone_number || ''

    // Subscribe our app to this WABA's webhooks
    const subscribeRes = await fetch(
      `https://graph.facebook.com/v21.0/${waba_id}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }
    )
    const subscribeData = await subscribeRes.json()
    const webhookSubscribed = subscribeData.success === true
    console.log('Webhook subscription:', subscribeData)

    // Register the number on the Cloud API — without this, sends fail with
    // 133010 "Account not registered". Reuse a stored PIN if we have one (manual
    // re-connect), otherwise mint a fresh one.
    const { data: existing } = await supabase
      .from('whatsapp_accounts')
      .select('two_step_pin')
      .eq('phone_number_id', phone_number_id)
      .maybeSingle()
    const pin = existing?.two_step_pin || generatePin()

    const reg = await registerNumber(phone_number_id, accessToken, pin)
    if (!reg.registered) {
      console.error('WhatsApp registration failed:', reg.code, reg.error)
      await reportError(supabase, {
        error_type: 'whatsapp_connect_failure',
        error_message: `Number connected but registration failed: ${reg.error}`,
        error_code: reg.code ? String(reg.code) : undefined,
        source: 'whatsapp-connect', severity: 'error',
        metadata: { waba_id, phone_number_id, stage: 'register' }, user_id: user.id,
      }).catch(() => {})
    }

    // Upsert the account
    const { data: account, error: upsertError } = await supabase
      .from('whatsapp_accounts')
      .upsert({
        user_id: user.id,
        waba_id,
        phone_number_id,
        access_token: accessToken,
        phone_number: phoneNumber,
        display_name: displayName,
        is_active: true,
        webhook_subscribed: webhookSubscribed,
        two_step_pin: pin,
        registered: reg.registered,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select()
      .single()

    if (upsertError) {
      console.error('Error storing WhatsApp account:', upsertError)
      await reportError(supabase, {
        error_type: 'whatsapp_connect_failure',
        error_message: `Failed to store WhatsApp account: ${upsertError.message}`,
        source: 'whatsapp-connect', severity: 'error',
        metadata: { waba_id, phone_number_id, stage: 'upsert' }, user_id: user.id,
      }).catch(() => {})
      return new Response(JSON.stringify({ error: 'Failed to store WhatsApp account' }), {
        status: 500, headers: corsHeaders
      })
    }

    // Surface a registration warning so the client can tell the user the number
    // is connected but not yet able to send/receive.
    const warning = reg.registered ? undefined
      : `Number connected, but Cloud API registration failed (${reg.error}). It can't send or receive until registered.`
    return new Response(JSON.stringify({ success: true, account, registered: reg.registered, warning }), { headers: corsHeaders })
  }

  // ── GET /whatsapp-connect — list user's connected accounts ────────────────
  if (req.method === 'GET') {
    const { data: accounts, error } = await supabase
      .from('whatsapp_accounts')
      .select('id, waba_id, phone_number_id, phone_number, display_name, agent_id, is_active, webhook_subscribed, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    return new Response(JSON.stringify({ accounts }), { headers: corsHeaders })
  }

  // ── PATCH /whatsapp-connect — update agent assignment ────────────────────
  if (req.method === 'PATCH') {
    let body: any
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
    }

    const { account_id, agent_id } = body
    if (!account_id) return new Response(JSON.stringify({ error: 'account_id required' }), { status: 400, headers: corsHeaders })

    const { error } = await supabase
      .from('whatsapp_accounts')
      .update({ agent_id: agent_id || null, updated_at: new Date().toISOString() })
      .eq('id', account_id)
      .eq('user_id', user.id)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders })
  }

  // ── DELETE /whatsapp-connect — disconnect account ─────────────────────────
  // Disconnect fully tears the number down: deregister it from Meta's Cloud API
  // first (best-effort), then remove our local record. Without the deregister the
  // number stays registered at Meta with a 2-step PIN we discard, which makes a
  // later reconnect collide (133005 PIN mismatch).
  if (req.method === 'DELETE') {
    const accountId = url.searchParams.get('account_id')
    if (!accountId) return new Response(JSON.stringify({ error: 'account_id required' }), { status: 400, headers: corsHeaders })

    const { data: acct } = await supabase
      .from('whatsapp_accounts')
      .select('phone_number_id, access_token')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle()

    let deregistered: boolean | undefined
    if (acct?.phone_number_id) {
      deregistered = await deregisterNumber(acct.phone_number_id, acct.access_token || META_ACCESS_TOKEN)
      if (!deregistered) console.warn('Disconnect: Meta deregister failed for', acct.phone_number_id, '(removing local record anyway)')
    }

    const { error } = await supabase
      .from('whatsapp_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    return new Response(JSON.stringify({ success: true, deregistered }), { headers: corsHeaders })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
