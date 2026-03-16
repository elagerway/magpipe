/**
 * Send a WhatsApp message on behalf of a user.
 * Looks up the user's WhatsApp account for the given phone_number_id,
 * sends the message via Meta Graph API, and stores it in sms_messages.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const user = await resolveUser(req, supabase)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
  }

  const { phone_number_id, recipient_wa_id, message } = body
  if (!phone_number_id || !recipient_wa_id || !message) {
    return new Response(JSON.stringify({ error: 'phone_number_id, recipient_wa_id, and message are required' }), {
      status: 400, headers: corsHeaders
    })
  }

  // Look up the WhatsApp account to get the access token
  const { data: waAccount, error: waError } = await supabase
    .from('whatsapp_accounts')
    .select('id, access_token, agent_id')
    .eq('user_id', user.id)
    .eq('phone_number_id', phone_number_id)
    .eq('is_active', true)
    .single()

  if (waError || !waAccount) {
    console.error('WhatsApp account not found:', waError)
    return new Response(JSON.stringify({ error: 'WhatsApp account not found' }), { status: 404, headers: corsHeaders })
  }

  // Send via Meta Graph API
  const metaRes = await fetch(
    `https://graph.facebook.com/v21.0/${phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient_wa_id,
        type: 'text',
        text: { body: message },
      }),
    }
  )

  if (!metaRes.ok) {
    const errText = await metaRes.text()
    console.error('Meta WhatsApp send error:', errText)
    return new Response(JSON.stringify({ error: 'Failed to send WhatsApp message', detail: errText }), {
      status: 502, headers: corsHeaders
    })
  }

  const metaResult = await metaRes.json()
  const waMessageId: string | null = metaResult.messages?.[0]?.id || null

  // Pause AI for 5 minutes when user manually sends a message
  const pauseUntil = new Date(Date.now() + 5 * 60 * 1000)
  await supabase
    .from('conversation_contexts')
    .upsert({
      user_id: user.id,
      contact_phone: recipient_wa_id,
      service_number: phone_number_id,
      ai_paused_until: pauseUntil.toISOString(),
      last_updated: new Date().toISOString(),
    }, {
      onConflict: 'user_id,contact_phone,service_number'
    })

  // Store the outbound message
  const { data: stored, error: insertError } = await supabase
    .from('sms_messages')
    .insert({
      user_id: user.id,
      agent_id: waAccount.agent_id || null,
      sender_number: phone_number_id,
      recipient_number: recipient_wa_id,
      direction: 'outbound',
      content: message,
      status: 'sent',
      sent_at: new Date().toISOString(),
      channel: 'whatsapp',
      external_id: waMessageId,
      is_ai_generated: false,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error storing outbound WhatsApp message:', insertError)
    // Still return success — message was sent
  }

  return new Response(JSON.stringify({ success: true, message_id: waMessageId, stored }), {
    headers: corsHeaders
  })
})
