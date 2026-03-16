/**
 * WhatsApp Connect — exchanges Meta Embedded Signup code for access token,
 * subscribes to WABA webhooks, and stores the account in whatsapp_accounts.
 *
 * Also handles GET (list accounts) and DELETE (disconnect).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const META_APP_ID = Deno.env.get('META_APP_ID')!
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const user = await resolveUser(req, supabase)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const url = new URL(req.url)

  // ── POST /whatsapp-connect — exchange code, store account ─────────────────
  if (req.method === 'POST') {
    let body: any
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
    }

    const { code, waba_id, phone_number_id, access_token: directToken } = body

    if (!waba_id || !phone_number_id) {
      return new Response(JSON.stringify({ error: 'waba_id and phone_number_id are required' }), {
        status: 400, headers: corsHeaders
      })
    }

    let accessToken: string

    if (directToken) {
      // Direct token provided (manual connection flow)
      accessToken = directToken
    } else if (code) {
      // Exchange OAuth code for access token (Embedded Signup flow)
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`
      const tokenRes = await fetch(tokenUrl)
      const tokenData = await tokenRes.json()

      if (tokenData.error || !tokenData.access_token) {
        console.error('Meta token exchange failed:', tokenData)
        return new Response(JSON.stringify({ error: 'Failed to exchange Meta auth code', detail: tokenData.error?.message }), {
          status: 400, headers: corsHeaders
        })
      }
      accessToken = tokenData.access_token
    } else {
      return new Response(JSON.stringify({ error: 'Either code or access_token is required' }), {
        status: 400, headers: corsHeaders
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
        updated_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select()
      .single()

    if (upsertError) {
      console.error('Error storing WhatsApp account:', upsertError)
      return new Response(JSON.stringify({ error: 'Failed to store WhatsApp account' }), {
        status: 500, headers: corsHeaders
      })
    }

    return new Response(JSON.stringify({ success: true, account }), { headers: corsHeaders })
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
  if (req.method === 'DELETE') {
    const accountId = url.searchParams.get('account_id')
    if (!accountId) return new Response(JSON.stringify({ error: 'account_id required' }), { status: 400, headers: corsHeaders })

    const { error } = await supabase
      .from('whatsapp_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id)

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
