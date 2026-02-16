/**
 * Gmail Pub/Sub Push Webhook
 * Receives push notifications from Google Cloud Pub/Sub when new emails arrive.
 * Deploy with: npx supabase functions deploy gmail-push-webhook --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'
import {
  getValidAccessToken,
  fetchViaHistory,
  getLatestHistoryId,
  parseGmailMessage,
  isSystemEmail,
  autoEnrichEmailContact,
  generateAiReply,
} from '../_shared/gmail-helpers.ts'

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // 1. Verify shared secret from query param
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const expectedSecret = Deno.env.get('GMAIL_PUBSUB_SECRET')

    if (!expectedSecret || secret !== expectedSecret) {
      console.error('Invalid or missing Pub/Sub secret')
      return new Response('Unauthorized', { status: 401 })
    }

    // 2. Decode Pub/Sub message
    const body = await req.json()
    const pubsubMessage = body?.message
    if (!pubsubMessage?.data) {
      console.error('No Pub/Sub message data')
      // Return 200 to avoid retries for malformed messages
      return jsonResponse({ skipped: true, reason: 'no_data' })
    }

    const decoded = JSON.parse(atob(pubsubMessage.data))
    const { emailAddress, historyId } = decoded
    console.log(`Pub/Sub notification: email=${emailAddress}, historyId=${historyId}`)

    if (!emailAddress) {
      return jsonResponse({ skipped: true, reason: 'no_email_address' })
    }

    // 3. Look up matching agent email configs
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: emailConfigs, error: configError } = await supabase
      .from('agent_email_configs')
      .select('*')
      .eq('gmail_address', emailAddress)
      .eq('is_active', true)

    if (configError || !emailConfigs?.length) {
      console.log(`No active config for ${emailAddress}:`, configError?.message || 'none found')
      return jsonResponse({ skipped: true, reason: 'no_config' })
    }

    // Get google_email provider ID
    const { data: provider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single()

    if (!provider) {
      return jsonResponse({ skipped: true, reason: 'provider_not_found' })
    }

    let totalNewInbound = 0

    // 4. Process each matching config
    for (const config of emailConfigs) {
      // Get integration
      let integration: any = null
      if (config.integration_id) {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('id', config.integration_id)
          .eq('status', 'connected')
          .single()
        integration = data
      } else {
        const { data } = await supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', config.user_id)
          .eq('provider_id', provider.id)
          .eq('status', 'connected')
          .limit(1)
          .single()
        integration = data
      }

      if (!integration) {
        console.log(`No integration for config ${config.id}`)
        continue
      }

      // Get valid access token (refresh if needed)
      const accessToken = await getValidAccessToken(supabase, integration)
      if (!accessToken) {
        console.error(`Failed to get token for config ${config.id}`)
        continue
      }

      // Fetch new messages via History API
      const startHistoryId = config.last_history_id
      let messages: any[] = []

      if (startHistoryId) {
        messages = await fetchViaHistory(accessToken, startHistoryId)
      } else {
        // First time: set baseline, don't import old emails
        const latestId = await getLatestHistoryId(accessToken)
        await supabase
          .from('agent_email_configs')
          .update({
            last_history_id: latestId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
        console.log(`Config ${config.id}: initial sync, set history_id to ${latestId}`)
        continue
      }

      console.log(`Config ${config.id}: fetched ${messages.length} messages via push`)

      // Process messages
      const newInboundMessages: any[] = []
      const ourAddresses = new Set<string>()
      if (config.gmail_address) ourAddresses.add(config.gmail_address.toLowerCase())
      if (config.send_as_email) ourAddresses.add(config.send_as_email.toLowerCase())

      for (const msg of messages) {
        const parsed = parseGmailMessage(msg, config.gmail_address, config.send_as_email)
        if (!parsed) continue

        // Only process emails sent TO our configured address(es)
        if (parsed.direction === 'inbound') {
          const toAddresses = (parsed.to_email || '').toLowerCase()
          const isToUs = [...ourAddresses].some(addr => toAddresses.includes(addr))
          if (!isToUs) continue
        }

        // Skip system/automated emails
        if (isSystemEmail(parsed.from_email)) {
          console.log(`Skipping system email from: ${parsed.from_email}`)
          continue
        }

        // Dedup via gmail_message_id UNIQUE constraint
        const { data: existing } = await supabase
          .from('email_messages')
          .select('id')
          .eq('gmail_message_id', parsed.gmail_message_id)
          .single()

        if (existing) continue

        // Sentiment analysis for inbound
        let sentiment: string | null = null
        if (parsed.direction === 'inbound') {
          try {
            sentiment = await analyzeSentiment(parsed.body_text || parsed.subject || '')
          } catch (e) {
            console.error('Sentiment analysis failed:', e)
          }
        }

        // Extract image attachments
        let attachments: any[] = []
        const attachmentMetas = extractImageAttachments(msg.payload)
        if (attachmentMetas.length > 0) {
          attachments = await downloadAndUploadAttachments(
            accessToken, parsed.gmail_message_id, parsed.thread_id, attachmentMetas, supabase, supabaseUrl
          )
          console.log(`email_messages: uploaded ${attachments.length} attachment(s) for msg ${parsed.gmail_message_id}`)
        }

        // Insert
        const insertData: Record<string, any> = {
            user_id: config.user_id,
            agent_id: config.agent_id,
            gmail_message_id: parsed.gmail_message_id,
            thread_id: parsed.thread_id,
            from_email: parsed.from_email,
            from_name: parsed.from_name,
            to_email: parsed.to_email,
            subject: parsed.subject,
            body_text: parsed.body_text,
            body_html: parsed.body_html,
            direction: parsed.direction,
            status: parsed.direction === 'inbound' ? 'delivered' : 'sent',
            is_read: parsed.direction === 'outbound',
            sentiment,
            sent_at: parsed.received_at,
        }
        if (attachments.length > 0) {
          insertData.attachments = attachments
        }
        const { error: insertError } = await supabase
          .from('email_messages')
          .insert(insertData)

        if (insertError) {
          console.error('Failed to insert email:', insertError)
          continue
        }

        // Cross-write to support_tickets if this thread exists there
        await mirrorToSupportTickets(supabase, supabaseUrl, accessToken, parsed, msg)

        if (parsed.direction === 'inbound') {
          newInboundMessages.push({ ...parsed, sentiment })
          autoEnrichEmailContact(config.user_id, parsed.from_email, parsed.from_name, supabase)
            .catch(err => console.error('Email contact enrichment error:', err))
          deductEmailCredits(supabaseUrl, supabaseKey, config.user_id, 1)
            .catch(err => console.error('Email credit deduction error:', err))
        }
      }

      // Update last_history_id
      const latestHistoryId = await getLatestHistoryId(accessToken)
      await supabase
        .from('agent_email_configs')
        .update({
          last_history_id: latestHistoryId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id)

      // Also keep support_email_config history_id in sync so the poller stays current
      await supabase
        .from('support_email_config')
        .update({
          last_history_id: latestHistoryId,
          last_polled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', '00000000-0000-0000-0000-000000000001')

      // Generate AI replies for new inbound messages
      let agent: any = null
      if (config.agent_id) {
        const { data: agentData } = await supabase
          .from('agent_configs')
          .select('id, system_prompt, llm_model, temperature, knowledge_source_ids, agent_name')
          .eq('id', config.agent_id)
          .single()
        agent = agentData
      }
      const sendFrom = config.send_as_email || config.gmail_address

      for (const msg of newInboundMessages) {
        totalNewInbound++

        if (config.agent_mode === 'draft' || config.agent_mode === 'auto') {
          // Check for existing AI reply to prevent doubles
          const msgTime = msg.received_at || new Date().toISOString()

          const { count: emailReplies } = await supabase
            .from('email_messages')
            .select('id', { count: 'exact', head: true })
            .eq('thread_id', msg.thread_id)
            .eq('direction', 'outbound')
            .eq('is_ai_generated', true)
            .gte('sent_at', msgTime)

          const { count: ticketReplies } = await supabase
            .from('support_tickets')
            .select('id', { count: 'exact', head: true })
            .eq('thread_id', msg.thread_id)
            .eq('direction', 'outbound')
            .not('ai_draft', 'is', null)
            .gte('received_at', msgTime)

          const totalReplies = (emailReplies || 0) + (ticketReplies || 0)
          if (totalReplies > 0) {
            console.log(`Skipping AI reply for thread ${msg.thread_id} — already replied after ${msgTime}`)
            continue
          }

          await generateAiReply(supabase, accessToken, config, agent, sendFrom, msg)
        }
      }
    }

    return jsonResponse({
      success: true,
      email: emailAddress,
      configs_processed: emailConfigs.length,
      new_inbound: totalNewInbound,
    })

  } catch (error: any) {
    console.error('Error in gmail-push-webhook:', error)
    // Return 200 even on error to prevent infinite Pub/Sub retries for permanent failures
    // Only return non-200 for transient errors we want retried
    return jsonResponse({ error: error.message }, 200)
  }
})

async function deductEmailCredits(supabaseUrl: string, supabaseKey: string, userId: string, messageCount: number) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({ userId, type: 'email', messageCount, referenceType: 'email' })
    })
    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} email(s), balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct email credits:', result.error)
    }
  } catch (err) {
    console.error('Error deducting email credits:', err)
  }
}

/**
 * If this Gmail thread already exists in support_tickets, mirror the new message there too.
 * This keeps support tickets in sync when the push webhook processes messages.
 */
async function mirrorToSupportTickets(supabase: any, supabaseUrl: string, accessToken: string, parsed: any, rawMsg: any) {
  try {
    // Check if this thread exists in support_tickets
    const { data: existingTicket } = await supabase
      .from('support_tickets')
      .select('id, thread_id, status')
      .eq('thread_id', parsed.thread_id)
      .limit(1)
      .single()

    if (!existingTicket) return // Not a support ticket thread

    // Check dedup — already in support_tickets?
    const { data: existingMsg } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('gmail_message_id', parsed.gmail_message_id)
      .single()

    if (existingMsg) return // Already mirrored

    // Extract and upload image attachments
    let attachments: any[] = []
    const attachmentMetas = extractImageAttachments(rawMsg?.payload)
    console.log(`mirrorToSupportTickets: found ${attachmentMetas.length} image attachment(s) for msg ${parsed.gmail_message_id}, rawMsg has payload: ${!!rawMsg?.payload}`)
    if (attachmentMetas.length > 0) {
      attachments = await downloadAndUploadAttachments(
        accessToken, parsed.gmail_message_id, parsed.thread_id, attachmentMetas, supabase, supabaseUrl
      )
      console.log(`mirrorToSupportTickets: uploaded ${attachments.length} of ${attachmentMetas.length} attachment(s)`)
    }

    // Insert into support_tickets
    const insertData: Record<string, any> = {
      gmail_message_id: parsed.gmail_message_id,
      thread_id: parsed.thread_id,
      from_email: parsed.from_email,
      from_name: parsed.from_name,
      to_email: parsed.to_email,
      subject: parsed.subject,
      body_text: parsed.body_text,
      body_html: parsed.body_html,
      direction: parsed.direction,
      status: existingTicket.status || 'open',
      received_at: parsed.received_at,
    }
    if (attachments.length > 0) {
      insertData.attachments = attachments
    }

    const { error } = await supabase.from('support_tickets').insert(insertData)
    if (error) {
      console.error('Failed to mirror to support_tickets:', error.message)
    } else {
      console.log(`Mirrored ${parsed.direction} message to support ticket thread ${parsed.thread_id}`)
    }
  } catch (e) {
    // Non-fatal — don't break email processing
    console.error('mirrorToSupportTickets error:', e)
  }
}


/**
 * Walk the MIME tree and collect image attachment metadata (max 10, max 5MB each).
 */
function extractImageAttachments(payload: any): { attachmentId: string; filename: string; mimeType: string; size: number }[] {
  const results: { attachmentId: string; filename: string; mimeType: string; size: number }[] = []
  const MAX_ATTACHMENTS = 10
  const MAX_SIZE = 5 * 1024 * 1024

  function walk(part: any) {
    if (results.length >= MAX_ATTACHMENTS) return
    if (part.body?.attachmentId && part.mimeType?.startsWith('image/')) {
      const size = part.body.size || 0
      if (size <= MAX_SIZE) {
        results.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename || `image-${results.length + 1}.${part.mimeType.split('/')[1] || 'png'}`,
          mimeType: part.mimeType,
          size,
        })
      }
    }
    if (part.parts) {
      for (const child of part.parts) walk(child)
    }
  }

  if (payload) walk(payload)
  return results
}


/**
 * Download attachments from Gmail API, upload to Supabase Storage.
 */
async function downloadAndUploadAttachments(
  accessToken: string,
  messageId: string,
  threadId: string,
  metas: { attachmentId: string; filename: string; mimeType: string; size: number }[],
  supabase: any,
  supabaseUrl: string
): Promise<{ filename: string; url: string; mime_type: string; size_bytes: number }[]> {
  const results: { filename: string; url: string; mime_type: string; size_bytes: number }[] = []

  for (const meta of metas) {
    try {
      const resp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${meta.attachmentId}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      if (!resp.ok) continue

      const attachData = await resp.json()
      if (!attachData.data) continue

      const base64 = attachData.data.replace(/-/g, '+').replace(/_/g, '/')
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const timestamp = Date.now()
      const safeName = meta.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${threadId}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(storagePath, bytes, { contentType: meta.mimeType, upsert: false })

      if (uploadError) {
        console.error(`Failed to upload ${meta.filename}:`, uploadError.message)
        continue
      }

      results.push({
        filename: meta.filename,
        url: `https://api.magpipe.ai/storage/v1/object/public/support-attachments/${storagePath}`,
        mime_type: meta.mimeType,
        size_bytes: meta.size,
      })
    } catch (e) {
      console.error(`Error processing attachment ${meta.filename}:`, e)
    }
  }

  return results
}


function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
