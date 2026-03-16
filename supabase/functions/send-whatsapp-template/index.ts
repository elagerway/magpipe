/**
 * Send a pre-approved WhatsApp template message to a recipient.
 * Looks up the WhatsApp account by agent_id, sends via Meta Graph API,
 * and stores the outbound message in sms_messages.
 *
 * POST body:
 *   agent_id      — which agent's WhatsApp number to send from
 *   to            — recipient phone number (E.164, e.g. +16045628647)
 *   template_name — name of your approved Meta template (required)
 *   language      — optional, defaults to "en_US"
 *   components    — optional array of template components with variable values
 *                   see https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const E164_RE = /^\+[1-9]\d{7,14}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const user = await resolveUser(req, supabase)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
  }

  const { agent_id, to, template_name, language = 'en_US', components } = body

  if (!agent_id || !to || !template_name) {
    return new Response(JSON.stringify({
      error: 'agent_id, to, and template_name are required',
      docs: 'https://developers.facebook.com/docs/whatsapp/message-templates/guidelines',
    }), { status: 400, headers: corsHeaders })
  }

  if (!UUID_RE.test(agent_id)) {
    return new Response(JSON.stringify({ error: 'agent_id must be a valid UUID' }), { status: 400, headers: corsHeaders })
  }

  if (!E164_RE.test(to)) {
    return new Response(JSON.stringify({ error: 'to must be a valid E.164 phone number' }), { status: 400, headers: corsHeaders })
  }

  // Look up the WhatsApp account linked to this agent
  const { data: waAccount, error: waError } = await supabase
    .from('whatsapp_accounts')
    .select('id, phone_number_id, access_token, waba_id')
    .eq('user_id', user.id)
    .eq('agent_id', agent_id)
    .eq('is_active', true)
    .single()

  if (waError || !waAccount) {
    return new Response(JSON.stringify({ error: 'No active WhatsApp account found for this agent' }), { status: 404, headers: corsHeaders })
  }

  // Fetch template body text from Meta so we can store the actual content
  let templateBody = `[Template: ${template_name}]`
  try {
    const tplRes = await fetch(
      `https://graph.facebook.com/v21.0/${waAccount.waba_id}/message_templates?name=${template_name}&fields=components`,
      { headers: { 'Authorization': `Bearer ${waAccount.access_token}` } }
    )
    const tplData = await tplRes.json()
    const bodyComponent = tplData.data?.[0]?.components?.find((c: any) => c.type === 'BODY')
    if (bodyComponent?.text) templateBody = bodyComponent.text
  } catch (e) {
    console.warn('Could not fetch template body, using placeholder:', e)
  }

  // Meta expects the WhatsApp ID without the leading +
  const waId = to.replace(/^\+/, '')

  // Build template payload — pass components through if provided
  const templatePayload: any = {
    name: template_name,
    language: { code: language },
  }
  if (components && Array.isArray(components) && components.length > 0) {
    templatePayload.components = components
  }

  // Send template via Meta Graph API
  const metaRes = await fetch(
    `https://graph.facebook.com/v21.0/${waAccount.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waId,
        type: 'template',
        template: templatePayload,
      }),
    }
  )

  const metaResult = await metaRes.json()

  if (!metaRes.ok) {
    console.error('Meta template send error:', JSON.stringify(metaResult))
    return new Response(JSON.stringify({
      error: 'Failed to send template',
      detail: metaResult.error?.message,
      docs: 'https://developers.facebook.com/docs/whatsapp/message-templates/guidelines',
    }), { status: 502, headers: corsHeaders })
  }

  const waMessageId: string | null = metaResult.messages?.[0]?.id || null

  // Store the outbound message
  const { error: insertError } = await supabase
    .from('sms_messages')
    .insert({
      user_id: user.id,
      agent_id,
      sender_number: waAccount.phone_number_id,
      recipient_number: to,
      direction: 'outbound',
      content: templateBody,
      status: 'sent',
      sent_at: new Date().toISOString(),
      channel: 'whatsapp',
      external_id: waMessageId,
      is_ai_generated: false,
    })

  if (insertError) {
    console.error('Error storing template message:', insertError)
  }

  return new Response(JSON.stringify({ success: true, message_id: waMessageId }), { headers: corsHeaders })
})
