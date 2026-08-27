import { createClient } from 'npm:@supabase/supabase-js@2'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'
import {
  extractBody,
  isComposioManaged,
  sendGmailReplyComposio,
  isBulkOrAutomated,
  quarantineEmail,
  hasRecentAiReplyToSender,
  extractImagePartsWithCid,
  downloadAndUploadAttachmentsComposio,
  rewriteCidReferences,
  fetchMessageByIdComposio
} from '../_shared/gmail-helpers.ts'
import { reportError } from '../_shared/error-reporter.ts'

// Public webhook (no JWT). Composio POSTs here when a Gmail trigger fires.
// We HMAC-verify the request, look up our user_integrations row by the
// connected_account_id in the V3 envelope metadata, then run the same
// parse → dedup → insert → AI reply pipeline as poll-gmail-tickets — but
// driven by an event instead of a 5-min cron.
//
// Webhook URL (set in Composio dashboard org settings):
//   https://<API_URL>/functions/v1/composio-trigger-webhook
// Verification secret: env COMPOSIO_WEBHOOK_SECRET (Composio-issued).

interface ComposioV3Envelope {
  id: string                       // unique delivery id
  type: string                     // e.g. "composio.trigger.message"
  metadata: {
    log_id?: string
    trigger_slug: string           // e.g. "GMAIL_NEW_GMAIL_MESSAGE"
    trigger_id?: string
    connected_account_id: string   // → user_integrations.config.connection_id
    auth_config_id?: string
    user_id?: string               // Composio user_id (= magpipe user_id)
  }
  data: Record<string, unknown>
  timestamp: string
}

async function verifySignature(
  webhookId: string,
  webhookTimestamp: string,
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  // Composio's V3 signature scheme: HMAC-SHA256(secret, "{id}.{timestamp}.{body}")
  // base64-encoded, optionally prefixed with "v1," in the header.
  const signingString = `${webhookId}.${webhookTimestamp}.${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingString))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
  const received = signatureHeader.includes(',') ? signatureHeader.split(',', 2)[1] : signatureHeader
  // Constant-time-ish compare
  if (expected.length !== received.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()

  // 1. Verify the signature (skip in dev if no secret set, but log loudly)
  const secret = Deno.env.get('COMPOSIO_WEBHOOK_SECRET')
  if (secret) {
    const webhookId = req.headers.get('webhook-id') || ''
    const webhookTs = req.headers.get('webhook-timestamp') || ''
    const sig = req.headers.get('webhook-signature') || ''
    if (!webhookId || !webhookTs || !sig) {
      console.error('Composio webhook missing svix headers')
      return new Response('Unauthorized', { status: 401 })
    }
    const ok = await verifySignature(webhookId, webhookTs, rawBody, sig, secret)
    if (!ok) {
      console.error('Composio webhook signature mismatch')
      return new Response('Unauthorized', { status: 401 })
    }
  } else {
    console.warn('COMPOSIO_WEBHOOK_SECRET not set — accepting webhook unverified')
  }

  // 2. Parse V3 envelope
  let envelope: ComposioV3Envelope
  try {
    envelope = JSON.parse(rawBody)
  } catch (err) {
    console.error('Composio webhook: malformed JSON:', err)
    return new Response('Bad request', { status: 400 })
  }

  if (envelope.metadata?.trigger_slug !== 'GMAIL_NEW_GMAIL_MESSAGE') {
    // Other triggers — accept and noop
    console.log(`Composio webhook: skipping ${envelope.metadata?.trigger_slug}`)
    return new Response('ok', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 3. Look up our user_integrations row by connected_account_id
  const connectionId = envelope.metadata.connected_account_id
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('config->>connection_id', connectionId)
    .eq('status', 'connected')
    .maybeSingle()

  if (!integration) {
    console.error(`Composio webhook: no user_integrations row for connection_id=${connectionId}`)
    // A trigger firing for a connection we can't map usually means the local
    // user_integrations row was disconnected/deleted while Composio's trigger
    // stayed live (or vice-versa) — surface it so the drift is visible.
    await reportError(supabase, {
      error_type: 'composio_trigger_error',
      error_message: `Composio trigger fired but no connected user_integrations row for connection_id=${connectionId}`,
      error_code: 'composio-trigger-webhook:no-integration',
      source: 'composio',
      severity: 'warning',
      metadata: { connection_id: connectionId },
    })
    // Return 200 so Composio doesn't retry forever for an unmapped connection
    return new Response('ok (no matching integration)', { status: 200 })
  }
  if (!isComposioManaged(integration)) {
    console.error(`Composio webhook: integration ${integration.id} is not composio_managed; ignoring`)
    return new Response('ok (not composio-managed)', { status: 200 })
  }

  // 4. Reconstruct a Gmail-API-shaped message object so parseGmailMessage works
  const data = envelope.data as Record<string, any>
  const gmailMsg = {
    id: data.id || data.message_id,
    threadId: data.thread_id,
    payload: data.payload || {},
    internalDate: data.message_timestamp
      ? String(new Date(data.message_timestamp).getTime())
      : '0'
  }
  const gmailMessageId = gmailMsg.id

  // 5. Resolve which inbox config owns this — support inbox first, then any
  //    matching agent_email_configs row. (Support inbox is the only flow wired
  //    today; agent_email_configs activation is a separate frontend action.)
  let config: any = null
  let configKind: 'support' | 'agent' = 'support'
  const { data: supportCfg } = await supabase
    .from('support_email_config')
    .select('*')
    .eq('gmail_address', integration.external_user_id)
    .maybeSingle()
  if (supportCfg) {
    config = supportCfg
  } else {
    const { data: agentCfg } = await supabase
      .from('agent_email_configs')
      .select('*')
      .eq('user_id', integration.user_id)
      .eq('integration_id', integration.id)
      .eq('is_active', true)
      .neq('agent_mode', 'off')
      .limit(1)
      .maybeSingle()
    if (agentCfg) {
      config = agentCfg
      configKind = 'agent'
    }
  }

  if (!config) {
    console.log(`Composio webhook: no active config for integration ${integration.id} — dropping event`)
    return new Response('ok (no active config)', { status: 200 })
  }

  // 6. Dedup — return early if we've already processed this gmail_message_id
  const { data: existingEmail } = await supabase
    .from('email_messages')
    .select('id')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle()
  if (existingEmail) {
    console.log(`Composio webhook: dedup hit for ${gmailMessageId}`)
    return new Response('ok (dedup)', { status: 200 })
  }

  // 7. Parse — reuse the same helper as the poll path so behavior matches
  //    (extractBody is imported, parseGmailMessage we inline below since it's
  //    not exported from gmail-helpers.ts — same logic as the poll functions)
  const parsed = parseGmailMessage(gmailMsg, config.gmail_address, config.send_as_email)
  if (!parsed) {
    console.error(`Composio webhook: parseGmailMessage failed for ${gmailMessageId}`)
    return new Response('ok (parse failed)', { status: 200 })
  }

  // Skip outbound (we sent it) and system mail
  if (parsed.direction === 'outbound') {
    console.log(`Composio webhook: outbound msg ${gmailMessageId} — skipping`)
    return new Response('ok (outbound)', { status: 200 })
  }
  if (isSystemEmailFrom(parsed.from_email)) {
    console.log(`Composio webhook: system email from ${parsed.from_email} — skipping`)
    return new Response('ok (system)', { status: 200 })
  }

  // Bulk/automated filter — drop newsletters, "verify your subscription"
  // welcome mail, marketing, etc. Records one row per drop in
  // quarantined_emails for audit.
  const bulkCheck = isBulkOrAutomated(gmailMsg.payload)
  if (bulkCheck.isBulk) {
    console.log(`Composio webhook: bulk/automated (${bulkCheck.reason}) ${gmailMessageId} — quarantining`)
    await quarantineEmail(supabase, {
      userId: integration.user_id,
      parsedMsg: parsed,
      reason: bulkCheck.reason!,
      reasonDetail: { matchedHeader: bulkCheck.matchedHeader, matchedValue: bulkCheck.matchedValue }
    })
    return new Response('ok (quarantined)', { status: 200 })
  }

  // 7b. Inline images / attachments — re-host via Composio so screenshots render
  // in admin (cid: refs don't resolve in a browser). The trigger envelope's
  // payload can be partial, so fall back to fetching the full message by id.
  let attachments: any[] = []
  try {
    let imgParts = extractImagePartsWithCid(gmailMsg.payload)
    if (imgParts.length === 0) {
      const full = await fetchMessageByIdComposio(integration.user_id, gmailMessageId)
      if (full?.payload) imgParts = extractImagePartsWithCid(full.payload)
    }
    if (imgParts.length > 0) {
      attachments = await downloadAndUploadAttachmentsComposio(
        integration.user_id, gmailMessageId, parsed.thread_id || gmailMessageId, imgParts, supabase
      )
      if (attachments.length > 0) parsed.body_html = rewriteCidReferences(parsed.body_html, attachments)
    }
  } catch (e) {
    console.error('Composio webhook: attachment handling failed (non-fatal):', e)
  }

  // 8. Insert into the right table
  let sentiment: string | null = null
  try { sentiment = await analyzeSentiment(parsed.body_text || parsed.subject || '') } catch { /* non-fatal */ }

  if (configKind === 'support') {
    await supabase.from('support_tickets').insert({
      gmail_message_id: parsed.gmail_message_id,
      thread_id: parsed.thread_id,
      from_email: parsed.from_email,
      from_name: parsed.from_name,
      to_email: parsed.to_email,
      cc_email: parsed.cc_email || null,
      subject: parsed.subject,
      body_text: parsed.body_text,
      body_html: parsed.body_html,
      direction: parsed.direction,
      status: 'open',
      received_at: parsed.received_at,
      ...(attachments.length ? { attachments } : {})
    })
    // Cross-write so the user-facing /inbox view picks it up too
    await supabase.from('email_messages').insert({
      user_id: integration.user_id,
      agent_id: config.support_agent_id || null,
      gmail_message_id: parsed.gmail_message_id,
      thread_id: parsed.thread_id,
      from_email: parsed.from_email,
      from_name: parsed.from_name,
      to_email: parsed.to_email,
      cc: parsed.cc_email || null,
      subject: parsed.subject,
      body_text: parsed.body_text,
      body_html: parsed.body_html,
      direction: parsed.direction,
      status: 'delivered',
      is_read: false,
      sentiment,
      sent_at: parsed.received_at,
      ...(attachments.length ? { attachments } : {})
    })
  } else {
    await supabase.from('email_messages').insert({
      user_id: config.user_id,
      agent_id: config.agent_id,
      gmail_message_id: parsed.gmail_message_id,
      thread_id: parsed.thread_id,
      from_email: parsed.from_email,
      from_name: parsed.from_name,
      to_email: parsed.to_email,
      cc: parsed.cc_email || null,
      subject: parsed.subject,
      body_text: parsed.body_text,
      body_html: parsed.body_html,
      direction: parsed.direction,
      status: 'delivered',
      is_read: false,
      sentiment,
      sent_at: parsed.received_at
    })
  }

  // 9. AI reply (auto mode only) — fire and forget so the webhook returns fast.
  // Backstop: at most one AI reply per sender per 24h, even if spam slipped
  // through the bulk filter. Ticket already exists, just skip the reply.
  if (config.agent_mode === 'auto') {
    const agentId = configKind === 'support' ? config.support_agent_id : config.agent_id
    if (agentId) {
      const recentlyReplied = await hasRecentAiReplyToSender(supabase, parsed.from_email, 24)
      if (recentlyReplied) {
        console.log(`Composio webhook: rate-limited AI reply to ${parsed.from_email} (replied within 24h)`)
      } else {
        generateAndSendReply(supabase, integration, config, agentId, parsed)
          .catch(err => console.error('Composio webhook: AI reply failed:', err))
      }
    }
  }

  return new Response('ok', { status: 200 })
})

// ─── Helpers ──────────────────────────────────────────────────────────

function parseGmailMessage(msg: any, gmailAddress: string, sendAsEmail?: string) {
  try {
    const headers = msg.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const from = getHeader('From')
    const to = getHeader('To')
    const cc = getHeader('Cc')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageIdHeader = getHeader('Message-ID') || getHeader('Message-Id')

    let fromName = ''
    let fromEmail = from
    const angleMatch = from.match(/<([^>]+@[^>]+)>/)
    if (angleMatch) {
      fromEmail = angleMatch[1].trim()
      fromName = from.substring(0, from.indexOf('<')).replace(/"/g, '').trim()
    } else {
      const simpleMatch = from.match(/([^\s]+@[^\s]+)/)
      if (simpleMatch) fromEmail = simpleMatch[1].trim()
    }

    const fromLower = fromEmail.toLowerCase()
    const isOutbound =
      fromLower === (gmailAddress || '').toLowerCase() ||
      (sendAsEmail ? fromLower === sendAsEmail.toLowerCase() : false)
    const direction = isOutbound ? 'outbound' : 'inbound'

    const { text, html } = extractBody(msg.payload)

    const normalizeEmail = (email: string) => {
      if (!sendAsEmail || !gmailAddress) return email
      return email.replace(new RegExp(gmailAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), sendAsEmail)
    }

    return {
      gmail_message_id: msg.id,
      thread_id: msg.threadId,
      message_id_header: messageIdHeader,
      from_email: isOutbound && sendAsEmail ? sendAsEmail : fromEmail,
      from_name: fromName,
      to_email: normalizeEmail(to),
      cc_email: cc ? normalizeEmail(cc) : '',
      subject,
      body_text: text,
      body_html: html,
      direction,
      received_at: date ? new Date(date).toISOString() : new Date(parseInt(msg.internalDate || '0')).toISOString()
    }
  } catch (e) {
    console.error('parseGmailMessage failed:', e)
    return null
  }
}

function isSystemEmailFrom(email: string): boolean {
  const lower = (email || '').toLowerCase()
  return (
    lower.includes('mailer-daemon') ||
    lower.includes('noreply') ||
    lower.includes('no-reply') ||
    lower.includes('postmaster') ||
    lower.includes('notifications@') ||
    lower.includes('notification@') ||
    lower.includes('systemgenerated') ||
    lower.includes('@magpipe.ai')
  )
}

async function generateAndSendReply(
  supabase: any,
  integration: any,
  config: any,
  agentId: string,
  msg: any
) {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not set — skipping reply')
    return
  }

  const { data: agent } = await supabase
    .from('agent_configs')
    .select('id, system_prompt, llm_model, agent_name, knowledge_source_ids')
    .eq('id', agentId)
    .single()

  const { data: threadMessages } = await supabase
    .from('email_messages')
    .select('from_email, from_name, direction, body_text, sent_at')
    .eq('thread_id', msg.thread_id)
    .order('sent_at', { ascending: true })
    .limit(10)

  const threadContext = (threadMessages || [])
    .map((m: any) => `[${m.direction}] ${m.from_name || m.from_email}: ${(m.body_text || '').substring(0, 500)}`)
    .join('\n\n')

  const agentName = agent?.agent_name || 'Magpipe Team'
  let systemPrompt = (agent?.system_prompt || '').trim()
  systemPrompt += `\n\nYou are responding to an email. Write a professional reply.
- Be warm but concise.
- Address the sender's question directly.
- If unsure, say the team will follow up.
- Sign off as "${agentName}".`

  const ai = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
    body: JSON.stringify({
      model: agent?.llm_model || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Draft a reply to this email:\n\nFrom: ${msg.from_name || msg.from_email}\nSubject: ${msg.subject}\n\n${msg.body_text || ''}${threadContext ? `\n\nThread:\n${threadContext}` : ''}`
        }
      ]
    })
  })
  if (!ai.ok) {
    console.error('OpenAI error:', await ai.text())
    return
  }
  const result = await ai.json()
  const draft = result.choices?.[0]?.message?.content
  if (!draft) return

  const replySubject = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`
  const sendResult = await sendGmailReplyComposio(integration.user_id, msg, draft, replySubject)
  if (!sendResult) {
    console.error(`Composio reply send failed for thread ${msg.thread_id}`)
    return
  }

  let replySentiment: string | null = null
  try { replySentiment = await analyzeSentiment(draft) } catch { /* non-fatal */ }

  const sendFrom = config.send_as_email || config.gmail_address || integration.external_user_id

  await supabase.from('email_messages').insert({
    user_id: integration.user_id,
    agent_id: agentId,
    gmail_message_id: sendResult.id,
    thread_id: sendResult.threadId || msg.thread_id,
    from_email: sendFrom,
    to_email: msg.from_email,
    subject: replySubject,
    body_text: draft,
    direction: 'outbound',
    status: 'sent',
    is_ai_generated: true,
    is_read: true,
    sentiment: replySentiment,
    sent_at: new Date().toISOString()
  })

  // If support pipeline, also drop a row on support_tickets so admin sees the reply
  if (config.support_agent_id) {
    await supabase.from('support_tickets').insert({
      gmail_message_id: `auto-${Date.now()}-${msg.gmail_message_id}`,
      thread_id: msg.thread_id,
      from_email: sendFrom,
      from_name: '',
      to_email: msg.from_email,
      subject: replySubject,
      body_text: draft,
      direction: 'outbound',
      status: 'open',
      ai_draft: draft,
      ai_draft_status: 'sent',
      received_at: new Date().toISOString()
    })
  }

  console.log(`Composio webhook: AI reply sent for thread ${msg.thread_id}`)
}
