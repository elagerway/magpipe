/**
 * Immediately transfer organization ownership to an existing team member
 * (issue #121). Unlike org-transfer-initiate/respond (#114), transferring to an
 * approved member of your own org needs no recipient confirmation — it's a
 * trusted in-team action. Owner-only. Sends notify-only emails to both parties.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14.10.0'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const esc = (s: string) => (s || '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get('POSTMARK_API_KEY')
  if (!key || !to) return
  try {
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': key },
      body: JSON.stringify({
        From: `MAGPIPE <${Deno.env.get('NOTIFICATION_EMAIL') || 'info@magpipe.ai'}>`,
        To: to, Subject: subject, HtmlBody: html, MessageStream: 'outbound',
      }),
    })
  } catch (e) {
    console.error('org-transfer-to-member: email failed', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) return json({ error: 'Invalid token' }, 401)

    const { memberId } = await req.json()
    if (!memberId) return json({ error: 'memberId is required' }, 400)

    // Caller must own their current organization.
    const { data: me } = await supabase
      .from('users').select('id, email, name, current_organization_id').eq('id', user.id).single()
    if (!me?.current_organization_id) return json({ error: 'You are not part of an organization' }, 400)

    const { data: org } = await supabase
      .from('organizations').select('id, name, owner_id').eq('id', me.current_organization_id).single()
    if (!org) return json({ error: 'Organization not found' }, 404)
    if (org.owner_id !== user.id) return json({ error: 'Only the organization owner can transfer ownership' }, 403)

    // Expired-but-unresolved transfers would trip the one-pending-per-org
    // unique index forever (nothing else reaps them — the HelloMD deadlock),
    // so retire them before either insert below.
    await supabase
      .from('organization_ownership_transfers')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('organization_id', org.id).eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    // Target must be a member of THIS org, and must have a Magpipe account (you
    // can't set organizations.owner_id to a user that doesn't exist — that's the
    // only hard requirement; approval status doesn't matter). Resolve by the
    // membership's user_id, else by the invite email in case they've signed up.
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, organization_id, user_id, email, role')
      .eq('id', memberId).single()
    if (!member || member.organization_id !== org.id) return json({ error: 'Member not found in your organization' }, 404)

    let newOwner: { id: string; email: string; name: string | null } | null = null
    if (member.user_id) {
      const { data } = await supabase.from('users').select('id, email, name').eq('id', member.user_id).single()
      newOwner = data
    }
    if (!newOwner && member.email) {
      const { data } = await supabase.from('users').select('id, email, name').eq('email', member.email.toLowerCase()).maybeSingle()
      newOwner = data
    }
    if (!newOwner) {
      // No account yet — queue a pending ownership transfer. handle_new_user
      // links to_user_id when they sign up, then they accept it from Settings
      // (#114 flow), which runs the swap + billing move. Can't transfer to a
      // user that doesn't exist, so this is the best we can do.
      if (!member.email) return json({ error: 'That teammate has no email on file.' }, 400)
      const qToken = crypto.randomUUID() + crypto.randomUUID()
      const { error: qErr } = await supabase.from('organization_ownership_transfers').insert({
        organization_id: org.id,
        from_user_id: user.id,
        to_email: member.email.toLowerCase(),
        to_user_id: null,
        move_billing: true,
        token: qToken,
      })
      if (qErr) {
        const dup = (qErr as { code?: string }).code === '23505'
        return json({ error: dup ? 'There is already a pending ownership transfer for this organization.' : qErr.message }, 409)
      }
      try {
        await sendEmail(
          member.email,
          `Ownership of ${org.name} is waiting for you`,
          `<p>${esc(me.name || me.email || 'The owner')} wants to make you the owner of <strong>${esc(org.name || 'their organization')}</strong>. Once you've completed your sign-in, you'll be able to take ownership from Settings.</p>`,
        )
      } catch (_) { /* best-effort */ }
      return json({ ok: true, queued: true, email: member.email })
    }
    if (newOwner.id === user.id) return json({ error: 'That member is already the owner' }, 400)

    // Record an accepted transfer for audit, then run the atomic swap RPC.
    const token = crypto.randomUUID() + crypto.randomUUID()
    const { data: transfer, error: insErr } = await supabase
      .from('organization_ownership_transfers')
      .insert({
        organization_id: org.id,
        from_user_id: user.id,
        to_email: (newOwner.email || member.email || '').toLowerCase(),
        to_user_id: newOwner.id,
        move_billing: true,
        token,
      })
      .select('id').single()
    if (insErr) return json({ error: insErr.message }, 409)

    const { error: rpcErr } = await supabase.rpc('accept_org_ownership_transfer', {
      p_transfer_id: transfer.id,
      p_to_user_id: newOwner.id,
    })
    if (rpcErr) {
      // Roll back the audit row so it doesn't linger as pending.
      await supabase.from('organization_ownership_transfers')
        .update({ status: 'cancelled', responded_at: new Date().toISOString() })
        .eq('id', transfer.id).eq('status', 'pending')
      return json({ error: rpcErr.message }, 409)
    }

    // Move billing (Stripe customer + subscription) from the former owner to the
    // new owner. Best-effort: ownership is already transferred, so a billing
    // hiccup is surfaced via billingWarning rather than failing the request.
    // Mirrors org-transfer-respond's reassignment (#119).
    let billingMoved = false
    let billingWarning: string | null = null
    try {
      const { data: fromU, error: fromErr } = await supabase
        .from('users').select('stripe_customer_id, stripe_subscription_id').eq('id', user.id).single()
      if (fromErr || !fromU) throw new Error(fromErr?.message || 'Could not load billing details')
      const customerId = fromU.stripe_customer_id as string | null
      const subscriptionId = fromU.stripe_subscription_id as string | null
      if (customerId) {
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
        if (!stripeKey) throw new Error('Stripe not configured')
        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
        // Re-point BOTH customer and subscription metadata (webhook resolves via
        // subscription.metadata.supabase_user_id) or events mis-route to the former owner.
        await stripe.customers.update(customerId, {
          email: (newOwner.email || member.email) as string,
          metadata: { supabase_user_id: newOwner.id },
        })
        if (subscriptionId) {
          await stripe.subscriptions.update(subscriptionId, { metadata: { supabase_user_id: newOwner.id } })
        }
      }
      // Atomic column move (single RPC) so the two users never both hold the customer.
      const { error: moveErr } = await supabase.rpc('move_org_billing', { p_from: user.id, p_to: newOwner.id })
      if (moveErr) throw new Error(moveErr.message)
      billingMoved = true
    } catch (e) {
      billingWarning = (e as Error).message || 'Billing move failed'
      console.error('org-transfer-to-member: billing move failed', e)
    }

    // Notify-only emails (no action links).
    const orgName = esc(org.name || 'your organization')
    const newOwnerName = esc(newOwner.name || newOwner.email || 'A teammate')
    const fromName = esc(me.name || me.email || 'The previous owner')
    const billingLine = billingMoved ? ', including billing' : ''
    await sendEmail(
      newOwner.email,
      `You're now the owner of ${org.name}`,
      `<p>You are the owner of <strong>${orgName}</strong> now. ${fromName} transferred ownership to you${billingLine} — you now control the team, its agents, billing, and settings.</p>`,
    )
    await sendEmail(
      me.email,
      `You transferred ownership of ${org.name}`,
      `<p>You have transferred ownership of <strong>${orgName}</strong> to <strong>${newOwnerName}</strong>${billingLine}. You are now an editor of it.</p>`,
    )

    return json({ ok: true, organizationId: org.id, newOwnerId: newOwner.id, billingMoved, billingWarning })
  } catch (e) {
    console.error('org-transfer-to-member error', e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
})
