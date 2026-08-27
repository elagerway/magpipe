/**
 * Respond to an organization ownership transfer (issue #114).
 * The recipient accepts or declines. On accept, the DB swap runs atomically via
 * accept_org_ownership_transfer(); if the transfer opted into moving billing,
 * the Stripe customer/subscription is reassigned to the new owner here.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const esc = (s: string) => (s || '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Invalid token' }, 401)

    const { transferId, action } = await req.json()
    if (!transferId || !['accept', 'decline'].includes(action)) return json({ error: 'transferId and action (accept|decline) are required' }, 400)

    const { data: transfer } = await supabase
      .from('organization_ownership_transfers')
      .select('id, organization_id, from_user_id, to_user_id, to_email, status, move_billing, expires_at')
      .eq('id', transferId).single()
    if (!transfer) return json({ error: 'Transfer not found' }, 404)

    // Only the intended recipient may respond (match on id, or email as a fallback).
    const isRecipient = transfer.to_user_id === user.id ||
      (transfer.to_email || '').toLowerCase() === (user.email || '').toLowerCase()
    if (!isRecipient) return json({ error: 'You are not the recipient of this transfer' }, 403)
    if (transfer.status !== 'pending') return json({ error: `This transfer is already ${transfer.status}` }, 409)

    if (action === 'decline') {
      await supabase.from('organization_ownership_transfers')
        .update({ status: 'declined', responded_at: new Date().toISOString(), to_user_id: user.id })
        .eq('id', transferId).eq('status', 'pending')
      return json({ ok: true, status: 'declined' })
    }

    // Accept — atomic DB swap (re-verifies owner/pending/expiry inside the txn).
    const { data: swap, error: rpcErr } = await supabase.rpc('accept_org_ownership_transfer', {
      p_transfer_id: transferId,
      p_to_user_id: user.id,
    })
    if (rpcErr) return json({ error: rpcErr.message }, 409)
    const result = Array.isArray(swap) ? swap[0] : swap
    const { organization_id, from_user_id, move_billing } = result || {}

    // Optional: full Stripe reassignment from former owner -> new owner.
    let billingMoved = false
    let billingWarning: string | null = null
    if (move_billing) {
      try {
        const { data: fromU, error: fromErr } = await supabase
          .from('users').select('stripe_customer_id, stripe_subscription_id').eq('id', from_user_id).single()
        // If we can't read the former owner's billing, do NOT proceed — resetting
        // them to free without moving the sub would orphan it.
        if (fromErr || !fromU) throw new Error(fromErr?.message || 'Could not load billing details')
        const customerId = fromU.stripe_customer_id as string | null
        const subscriptionId = fromU.stripe_subscription_id as string | null

        // Re-point Stripe to the new owner FIRST. The webhook resolves the user
        // via subscription.metadata.supabase_user_id (and customer metadata), so
        // BOTH the customer and the subscription metadata must be updated or
        // future billing events would mis-route to the former owner.
        if (customerId) {
          const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
          if (!stripeKey) throw new Error('Stripe not configured')
          const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
          await stripe.customers.update(customerId, {
            email: (user.email || transfer.to_email) as string,
            metadata: { supabase_user_id: user.id },
          })
          if (subscriptionId) {
            await stripe.subscriptions.update(subscriptionId, { metadata: { supabase_user_id: user.id } })
          }
        }

        // Move the billing columns atomically (single RPC = one transaction) so
        // the two users can never both carry the same customer/subscription.
        const { error: moveErr } = await supabase.rpc('move_org_billing', { p_from: from_user_id, p_to: user.id })
        if (moveErr) throw new Error(moveErr.message)
        billingMoved = true
      } catch (e) {
        // Ownership already transferred; billing move is best-effort and surfaced
        // to the caller via billingWarning for manual follow-up.
        billingWarning = (e as Error).message || 'Billing move failed'
        console.error('org-transfer-respond: billing move failed', e)
      }
    }

    // Best-effort notice to the former owner.
    try {
      const postmarkKey = Deno.env.get('POSTMARK_API_KEY')
      if (postmarkKey) {
        const { data: fromU } = await supabase.from('users').select('email, name').eq('id', from_user_id).single()
        const { data: org } = await supabase.from('organizations').select('name').eq('id', organization_id).single()
        if (fromU?.email) {
          await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': postmarkKey },
            body: JSON.stringify({
              From: `MAGPIPE <${Deno.env.get('NOTIFICATION_EMAIL') || 'info@magpipe.ai'}>`,
              To: fromU.email,
              Subject: `Ownership of ${org?.name || 'your organization'} was transferred`,
              HtmlBody: `<p>${esc(user.email || transfer.to_email)} accepted ownership of <strong>${esc(org?.name || 'your organization')}</strong>${billingMoved ? ', including billing' : ''}. You are now an editor of it.</p>`,
              MessageStream: 'outbound',
            }),
          })
        }
      }
    } catch (e) {
      console.error('org-transfer-respond: notice email failed', e)
    }

    return json({ ok: true, status: 'accepted', organizationId: organization_id, billingMoved, billingWarning })
  } catch (e) {
    console.error('org-transfer-respond error', e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
})
