/**
 * Initiate a phone-number transfer to another account (issue #115).
 * The number's owner requests transferring it to another (existing, phone-verified)
 * user by email. Creates a pending row and emails the recipient, who must confirm
 * via number-transfer-respond before the number moves.
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

    const { serviceNumberId, toEmail } = await req.json()
    const recipientEmail = (toEmail || '').trim().toLowerCase()
    if (!serviceNumberId) return json({ error: 'serviceNumberId is required' }, 400)
    if (!recipientEmail) return json({ error: 'Recipient email is required' }, 400)

    const { data: me } = await supabase.from('users').select('id, email, name').eq('id', user.id).single()
    if (recipientEmail === (me?.email || '').toLowerCase()) return json({ error: 'You cannot transfer a number to yourself' }, 400)

    // Caller must own the number.
    const { data: number } = await supabase
      .from('service_numbers').select('id, user_id, phone_number').eq('id', serviceNumberId).single()
    if (!number || number.user_id !== user.id) return json({ error: 'Number not found in your account' }, 404)

    // Recipient must already have an account and be phone-verified (service_numbers
    // RLS requires is_phone_verified()).
    const { data: recipient } = await supabase
      .from('users').select('id, email, name, phone_verified').eq('email', recipientEmail).maybeSingle()
    if (!recipient) return json({ error: 'That person does not have a Magpipe account yet. Ask them to sign up first.' }, 404)
    if (recipient.id === user.id) return json({ error: 'You cannot transfer a number to yourself' }, 400)
    if (recipient.phone_verified !== true) return json({ error: 'The recipient must verify their phone number before they can receive a number.' }, 400)

    // One pending transfer per number.
    const { data: existing } = await supabase
      .from('number_transfers').select('id').eq('service_number_id', number.id).eq('status', 'pending').maybeSingle()
    if (existing) return json({ error: 'There is already a pending transfer for this number' }, 409)

    const token = crypto.randomUUID() + crypto.randomUUID()
    const { data: transfer, error: insErr } = await supabase
      .from('number_transfers')
      .insert({
        service_number_id: number.id,
        phone_number: number.phone_number,
        from_user_id: user.id,
        to_email: recipientEmail,
        to_user_id: recipient.id,
        token,
      })
      .select('id, phone_number, status, expires_at').single()
    if (insErr) return json({ error: insErr.message }, 409)

    // Notify the recipient (best-effort).
    try {
      const postmarkKey = Deno.env.get('POSTMARK_API_KEY')
      if (postmarkKey) {
        const baseUrl = Deno.env.get('APP_URL') || 'https://magpipe.ai'
        const link = `${baseUrl}/manage-numbers?number_transfer=${transfer.id}`
        const fromName = me?.name || me?.email || 'A Magpipe user'
        const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 20px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td align="center" style="padding:32px 32px 0;"><img src="https://magpipe.ai/magpipe-logo.png" alt="MAGPIPE" width="48" height="48" style="border-radius:12px;"/></td></tr>
      <tr><td style="padding:24px 32px 0;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;text-align:center;">A phone number is being transferred to you</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#6b7280;text-align:center;line-height:1.5;">
          <strong style="color:#374151;">${esc(fromName)}</strong> wants to transfer <strong style="color:#374151;">${esc(number.phone_number)}</strong> to your account. It only moves if you accept.
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
            Subject: `${fromName} wants to transfer ${number.phone_number} to you`,
            HtmlBody: html,
            MessageStream: 'outbound',
          }),
        })
      }
    } catch (e) {
      console.error('number-transfer-initiate: email failed', e)
    }

    return json({ transfer })
  } catch (e) {
    console.error('number-transfer-initiate error', e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
})
