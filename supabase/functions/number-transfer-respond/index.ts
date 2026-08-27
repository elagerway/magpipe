/**
 * Respond to a phone-number transfer (issue #115).
 * The recipient accepts or declines. On accept, accept_number_transfer() runs the
 * atomic reassignment (moves the number, detaches the former owner's agents,
 * requires the recipient to be phone-verified). History stays with the sender.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
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
    console.error('number-transfer-respond: email failed', e)
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

    const { transferId, action } = await req.json()
    if (!transferId || !['accept', 'decline'].includes(action)) return json({ error: 'transferId and action (accept|decline) are required' }, 400)

    const { data: transfer } = await supabase
      .from('number_transfers')
      .select('id, service_number_id, phone_number, from_user_id, to_user_id, to_email, status')
      .eq('id', transferId).single()
    if (!transfer) return json({ error: 'Transfer not found' }, 404)

    const isRecipient = transfer.to_user_id === user.id ||
      (transfer.to_email || '').toLowerCase() === (user.email || '').toLowerCase()
    if (!isRecipient) return json({ error: 'You are not the recipient of this transfer' }, 403)
    if (transfer.status !== 'pending') return json({ error: `This transfer is already ${transfer.status}` }, 409)

    if (action === 'decline') {
      await supabase.from('number_transfers')
        .update({ status: 'declined', responded_at: new Date().toISOString(), to_user_id: user.id })
        .eq('id', transferId).eq('status', 'pending')
      return json({ ok: true, status: 'declined' })
    }

    // Accept — atomic reassignment (re-verifies owner, recipient phone-verified).
    const { error: rpcErr } = await supabase.rpc('accept_number_transfer', {
      p_transfer_id: transferId,
      p_to_user_id: user.id,
    })
    if (rpcErr) return json({ error: rpcErr.message }, 409)

    // Best-effort notice to the former owner.
    try {
      const { data: fromU } = await supabase.from('users').select('email').eq('id', transfer.from_user_id).single()
      if (fromU?.email) {
        await sendEmail(
          fromU.email,
          `${transfer.phone_number} was transferred`,
          `<p><strong>${esc(user.email || transfer.to_email)}</strong> accepted the transfer of <strong>${esc(transfer.phone_number)}</strong>. It's no longer in your account, and its agent assignments were cleared.</p>`,
        )
      }
    } catch (e) {
      console.error('number-transfer-respond: notice failed', e)
    }

    return json({ ok: true, status: 'accepted', phoneNumber: transfer.phone_number })
  } catch (e) {
    console.error('number-transfer-respond error', e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
})
