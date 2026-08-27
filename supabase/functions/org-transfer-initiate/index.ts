/**
 * Initiate an organization ownership transfer (issue #114).
 * The current owner of their organization requests handing ownership to another
 * (existing) user by email. Creates a pending transfer and emails the recipient,
 * who must confirm via org-transfer-respond before anything changes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
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

    const { toEmail, moveBilling } = await req.json()
    const recipientEmail = (toEmail || '').trim().toLowerCase()
    if (!recipientEmail) return json({ error: 'Recipient email is required' }, 400)

    // Caller must own their current organization.
    const { data: me } = await supabase
      .from('users').select('id, email, name, current_organization_id').eq('id', user.id).single()
    if (!me?.current_organization_id) return json({ error: 'You are not part of an organization' }, 400)
    if (recipientEmail === (me.email || '').toLowerCase()) return json({ error: 'You cannot transfer ownership to yourself' }, 400)

    const { data: org } = await supabase
      .from('organizations').select('id, name, owner_id').eq('id', me.current_organization_id).single()
    if (!org) return json({ error: 'Organization not found' }, 404)
    if (org.owner_id !== user.id) return json({ error: 'Only the organization owner can transfer ownership' }, 403)

    // Recipient must already have an account (v1). Use .eq on the normalized
    // (lower-cased) email — .ilike would treat % / _ in the input as wildcards.
    const { data: recipient } = await supabase
      .from('users').select('id, email, name').eq('email', recipientEmail).maybeSingle()
    if (!recipient) return json({ error: 'That person does not have a Magpipe account yet. Ask them to sign up first.' }, 404)
    if (recipient.id === user.id) return json({ error: 'You cannot transfer ownership to yourself' }, 400)

    // One pending transfer per org. Expired-but-unresolved rows would deadlock
    // the org forever (nothing else reaps them), so retire those first.
    await supabase
      .from('organization_ownership_transfers')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('organization_id', org.id).eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
    const { data: existing } = await supabase
      .from('organization_ownership_transfers')
      .select('id').eq('organization_id', org.id).eq('status', 'pending').maybeSingle()
    if (existing) return json({ error: 'There is already a pending ownership transfer for this organization' }, 409)

    const token = crypto.randomUUID() + crypto.randomUUID()
    const { data: transfer, error: insErr } = await supabase
      .from('organization_ownership_transfers')
      .insert({
        organization_id: org.id,
        from_user_id: user.id,
        to_email: recipientEmail,
        to_user_id: recipient.id,
        move_billing: !!moveBilling,
        token,
      })
      .select('id, to_email, status, expires_at, move_billing')
      .single()
    if (insErr) return json({ error: insErr.message }, 400)

    // Notify recipient (best-effort — don't fail the request if email is down).
    try {
      const postmarkKey = Deno.env.get('POSTMARK_API_KEY')
      if (postmarkKey) {
        const baseUrl = Deno.env.get('APP_URL') || 'https://magpipe.ai'
        const link = `${baseUrl}/settings?ownership_transfer=${transfer.id}`
        const fromName = me.name || me.email || 'A Magpipe user'
        const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 20px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td align="center" style="padding:32px 32px 0;"><img src="https://magpipe.ai/magpipe-logo.png" alt="MAGPIPE" width="48" height="48" style="border-radius:12px;"/></td></tr>
      <tr><td style="padding:24px 32px 0;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;text-align:center;">Ownership transfer request</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7280;text-align:center;line-height:1.5;">
          <strong style="color:#374151;">${esc(fromName)}</strong> wants to make you the owner of <strong style="color:#374151;">${esc(org.name)}</strong>${transfer.move_billing ? ', including its billing' : ''}. You'll only become the owner if you accept.
        </p></td></tr>
      <tr><td align="center" style="padding:0 32px 32px;">
        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Review &amp; respond</a>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This request expires in 72 hours.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': postmarkKey },
          body: JSON.stringify({
            From: `MAGPIPE <${Deno.env.get('NOTIFICATION_EMAIL') || 'info@magpipe.ai'}>`,
            To: recipientEmail,
            Subject: `${fromName} wants to transfer ownership of ${org.name} to you`,
            HtmlBody: html,
            MessageStream: 'outbound',
          }),
        })
      }
    } catch (e) {
      console.error('org-transfer-initiate: email send failed', e)
    }

    return json({ transfer })
  } catch (e) {
    console.error('org-transfer-initiate error', e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
})
