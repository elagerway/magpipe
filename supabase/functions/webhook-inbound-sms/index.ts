import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  isOptOutMessage,
  isOptInMessage,
  recordOptOut,
  recordOptIn,
  getOptOutConfirmation,
  getOptInConfirmation,
  isOptedOut
} from '../_shared/sms-compliance.ts'
import { analyzeSentiment } from '../_shared/sentiment-analysis.ts'

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.error('OPENAI_API_KEY not set')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000),
      }),
    })

    if (!response.ok) {
      console.error('OpenAI embedding error:', await response.text())
      return null
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    return null
  }
}

/**
 * Search knowledge base for relevant content
 */
async function searchKnowledgeBase(
  supabase: any,
  knowledgeSourceIds: string[],
  query: string,
  limit: number = 3
): Promise<string | null> {
  if (!knowledgeSourceIds || knowledgeSourceIds.length === 0) {
    return null
  }

  // Generate embedding for the query
  const embedding = await generateEmbedding(query)
  if (!embedding) {
    console.log('Could not generate embedding for KB search')
    return null
  }

  try {
    // Query knowledge_chunks with vector similarity
    // Using raw SQL via rpc to do the vector search
    const { data: chunks, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      source_ids: knowledgeSourceIds,
      match_count: limit,
      similarity_threshold: 0.5
    })

    if (error) {
      // If RPC doesn't exist, fall back to direct query
      console.log('RPC match_knowledge_chunks not found, trying direct query')

      // Direct query approach - may be slower but works without RPC
      const { data: directChunks, error: directError } = await supabase
        .from('knowledge_chunks')
        .select('content, metadata')
        .in('knowledge_source_id', knowledgeSourceIds)
        .limit(limit * 2) // Get more and filter by relevance client-side

      if (directError) {
        console.error('Error querying knowledge chunks:', directError)
        return null
      }

      if (!directChunks || directChunks.length === 0) {
        console.log('No knowledge chunks found for source IDs:', knowledgeSourceIds)
        return null
      }

      // Return all content (without vector filtering - fallback)
      const context = directChunks
        .slice(0, limit)
        .map((c: any) => c.content)
        .join('\n\n---\n\n')

      console.log(`📚 Found ${Math.min(directChunks.length, limit)} KB chunks (fallback mode)`)
      return context
    }

    if (!chunks || chunks.length === 0) {
      console.log('No relevant KB chunks found')
      return null
    }

    // Combine relevant chunks
    const context = chunks.map((c: any) => c.content).join('\n\n---\n\n')
    console.log(`📚 Found ${chunks.length} relevant KB chunks`)
    return context

  } catch (error) {
    console.error('Error searching knowledge base:', error)
    return null
  }
}

Deno.serve(async (req) => {
  try {
    const formData = await req.formData()
    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string
    const numMedia = parseInt(formData.get('NumMedia') as string || '0')

    console.log('Inbound SMS:', { to, from, body, messageSid, numMedia })

    // Check if the number is active
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: serviceNumber, error } = await supabase
      .from('service_numbers')
      .select('*, users!inner(*)')
      .eq('phone_number', to)
      .eq('is_active', true)
      .single()

    if (error || !serviceNumber) {
      console.log('Number not active or not found:', to)

      // Silently ignore - don't respond to SMS on inactive numbers
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' },
        status: 200,
      })
    }

    console.log('Number is active, processing SMS for user:', serviceNumber.users.email)

    // Get agent config - prioritize number-specific agent, then default agent
    let agentConfig = null

    if (serviceNumber.agent_id) {
      // Route to the agent assigned to this phone number
      console.log('Routing SMS to agent assigned to number:', serviceNumber.agent_id)
      const { data: assignedAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('id', serviceNumber.agent_id)
        .single()

      agentConfig = assignedAgent
    }

    if (!agentConfig) {
      // Fallback to user's default agent
      const { data: defaultAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .eq('is_default', true)
        .single()

      agentConfig = defaultAgent
    }

    if (!agentConfig) {
      // Last fallback: get any agent for this user
      const { data: anyAgent } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('user_id', serviceNumber.user_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      agentConfig = anyAgent
    }

    const agentId = agentConfig?.id || null
    console.log('Using agent for SMS:', agentId, agentConfig?.name || 'None')

    // Analyze sentiment of the incoming message
    let messageSentiment: string | null = null
    try {
      messageSentiment = await analyzeSentiment(body)
      console.log(`SMS sentiment: ${messageSentiment}`)
    } catch (err) {
      console.error('Sentiment analysis failed:', err)
    }

    // Log the message to database with agent_id and sentiment
    const { error: insertError } = await supabase
      .from('sms_messages')
      .insert({
        user_id: serviceNumber.user_id,
        agent_id: agentId,
        sender_number: from,
        recipient_number: to,
        direction: 'inbound',
        content: body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        sentiment: messageSentiment,
      })

    if (insertError) {
      console.error('Error logging SMS:', insertError)
      // Still process the message even if logging failed
      processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null)
    } else {
      // Deduct credits for inbound SMS (fire and forget)
      deductSmsCredits(supabaseUrl, supabaseKey, serviceNumber.user_id, 1)
        .catch(err => console.error('Failed to deduct inbound SMS credits:', err))

      // Auto-enrich contact if not exists (fire and forget)
      autoEnrichContact(serviceNumber.user_id, from, supabase)
        .catch(err => console.error('Auto-enrich error:', err))

      // Check for opt-out/opt-in keywords (USA SMS compliance)
      // Only process STOP for US numbers, not Canadian numbers
      const { isUSNumber } = await import('../_shared/sms-compliance.ts')
      const toIsUSNumber = await isUSNumber(to, supabase)

      if (toIsUSNumber && isOptOutMessage(body)) {
        console.log('Opt-out message detected from:', from, 'to US number:', to)
        await recordOptOut(supabase, from)

        // Send confirmation message (without additional opt-out text)
        const confirmationMessage = getOptOutConfirmation()
        sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)

        // Return early - don't process with AI or send notifications
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }

      if (toIsUSNumber && isOptInMessage(body)) {
        console.log('Opt-in message detected from:', from, 'to US number:', to)
        await recordOptIn(supabase, from)

        // Send confirmation message (without additional opt-out text)
        const confirmationMessage = getOptInConfirmation()
        sendSMS(serviceNumber.user_id, from, to, confirmationMessage, supabase, false)

        // Return early - don't process with AI
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' },
          status: 200,
        })
      }

      // Send new message notification (fire and forget)
      console.log('Sending new message notification for user:', serviceNumber.user_id)

      const notificationData = {
        userId: serviceNumber.user_id,
        type: 'new_message',
        data: {
          senderNumber: from,
          timestamp: new Date().toISOString(),
          content: body
        }
      }

      // Send email notification
      fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send email notification:', err))

      // Send SMS notification
      fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send SMS notification:', err))

      // Send push notification
      fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(notificationData)
      }).catch(err => console.error('Failed to send push notification:', err))

      // Send Slack notification and get thread info for reply
      // Pass to processAndReplySMS so agent response can be added as thread reply
      sendSlackNotification(serviceNumber.user_id, from, body, supabase)
        .then(slackThread => {
          // Process SMS and add agent reply to Slack thread
          processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, slackThread)
        })
        .catch(err => {
          console.error('Failed to send Slack notification:', err)
          // Still process SMS even if Slack fails
          processAndReplySMS(serviceNumber.user_id, from, to, body, supabase, agentConfig, null)
        })
    }

    // Return empty TwiML response (no auto-reply, we'll send async)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in webhook-inbound-sms:', error)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200,
    })
  }
})

/**
 * Get contact memory for SMS context injection
 */
async function getContactMemory(
  supabase: any,
  fromPhone: string,
  userId: string,
  agentConfig: any
): Promise<string> {
  try {
    const normalizedPhone = fromPhone.startsWith('+')
      ? fromPhone
      : `+${fromPhone.replace(/\D/g, '')}`

    // Look up contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (!contact) {
      return ''
    }

    // Look up conversation context
    const { data: ctx } = await supabase
      .from('conversation_contexts')
      .select('summary, key_topics, preferences, interaction_count, sms_interaction_count')
      .eq('contact_id', contact.id)
      .eq('agent_id', agentConfig.id)
      .maybeSingle()

    if (!ctx) {
      return ''
    }

    const callCount = ctx.interaction_count || 0
    const smsCount = ctx.sms_interaction_count || 0
    const total = callCount + smsCount

    if (total === 0) {
      return ''
    }

    // Build interaction description
    const parts: string[] = []
    if (callCount > 0) parts.push(`${callCount} call${callCount !== 1 ? 's' : ''}`)
    if (smsCount > 0) parts.push(`${smsCount} text${smsCount !== 1 ? 's' : ''}`)

    const memoryParts: string[] = []
    memoryParts.push('CONTACT MEMORY:')
    memoryParts.push(`This phone number has interacted ${total} time(s) before (${parts.join(', ')}).`)
    memoryParts.push('Note: multiple people may share the same number.')

    if (ctx.summary) {
      memoryParts.push(`Previous summary: ${ctx.summary}`)
    }

    if (ctx.key_topics && Array.isArray(ctx.key_topics) && ctx.key_topics.length > 0) {
      memoryParts.push(`Key topics: ${ctx.key_topics.join(', ')}`)
    }

    memoryParts.push('Use this context once you know who you\'re speaking with.')

    const contactName = contact.name || normalizedPhone
    console.log(`🧠 SMS memory loaded for ${contactName}: ${total} interactions (${parts.join(', ')})`)

    return memoryParts.join('\n')
  } catch (error) {
    console.error('Error getting contact memory for SMS:', error)
    return ''
  }
}

/**
 * Search for similar conversation memories with OTHER contacts (semantic memory)
 */
async function searchSimilarMemories(
  supabase: any,
  fromPhone: string,
  userId: string,
  agentConfig: any
): Promise<string> {
  try {
    const semanticConfig = agentConfig.semantic_memory_config || {
      max_results: 3,
      similarity_threshold: 0.75,
    }

    const normalizedPhone = fromPhone.startsWith('+')
      ? fromPhone
      : `+${fromPhone.replace(/\D/g, '')}`

    // Look up contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (!contact) {
      return ''
    }

    // Get this contact's memory to use as search query
    const { data: ctx } = await supabase
      .from('conversation_contexts')
      .select('summary, key_topics')
      .eq('contact_id', contact.id)
      .eq('agent_id', agentConfig.id)
      .maybeSingle()

    if (!ctx || !ctx.summary) {
      return ''
    }

    const searchText = `${ctx.summary}\n\nTopics: ${(ctx.key_topics || []).join(', ')}`
    const queryEmbedding = await generateEmbedding(searchText)
    if (!queryEmbedding) {
      return ''
    }

    // Call match_similar_memories RPC (excludes current contact)
    const { data: similar, error } = await supabase.rpc('match_similar_memories', {
      query_embedding: queryEmbedding,
      match_agent_id: agentConfig.id,
      match_user_id: userId,
      exclude_contact_id: contact.id,
      match_threshold: semanticConfig.similarity_threshold || 0.75,
      match_count: semanticConfig.max_results || 3,
    })

    if (error || !similar || similar.length === 0) {
      if (error) console.error('Semantic search error:', error)
      return ''
    }

    // Increment semantic_match_count for matched memories
    try {
      const matchedIds = similar.map((m: any) => m.id).filter(Boolean)
      if (matchedIds.length > 0) {
        await supabase.rpc('increment_semantic_match_count_batch', { memory_ids: matchedIds })
      }
    } catch (incErr) {
      console.error('Failed to increment semantic match counts:', incErr)
    }

    // Format results (same format as voice agent's get_semantic_context)
    const parts: string[] = ['SIMILAR PAST CONVERSATIONS']
    parts.push('Other contacts have discussed similar topics:')

    for (let i = 0; i < similar.length; i++) {
      const mem = similar[i]
      const similarityPct = Math.round((mem.similarity || 0) * 100)
      parts.push(`\n${i + 1}. ${mem.contact_name || 'A contact'} (${similarityPct}% similar):`)
      if (mem.summary) parts.push(`   Summary: ${mem.summary}`)
      if (mem.key_topics && Array.isArray(mem.key_topics) && mem.key_topics.length > 0) {
        parts.push(`   Topics: ${mem.key_topics.slice(0, 5).join(', ')}`)
      }
    }

    parts.push('\nUse this context to identify patterns or common issues. Don\'t reference other contacts directly.')

    console.log(`🔮 SMS semantic search found ${similar.length} similar memories`)
    return parts.join('\n')
  } catch (error) {
    console.error('Error searching similar memories for SMS:', error)
    return ''
  }
}

/**
 * Update contact memory after SMS exchange
 */
async function updateContactMemory(
  supabase: any,
  fromPhone: string,
  toPhone: string,
  userId: string,
  agentConfig: any,
  inboundMessage: string,
  aiReply: string
) {
  try {
    const normalizedPhone = fromPhone.startsWith('+')
      ? fromPhone
      : `+${fromPhone.replace(/\D/g, '')}`

    const agentId = agentConfig.id
    const memoryConfig = agentConfig.memory_config || {}
    const generateEmbeddingFlag = agentConfig.semantic_memory_enabled || false

    // Look up or create contact
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (!contact) {
      // Create basic contact
      const { data: newContact, error: createErr } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          phone_number: normalizedPhone,
          name: 'Unknown',
          first_name: 'Unknown',
          is_whitelisted: false,
        })
        .select('id, name')
        .single()

      if (createErr) {
        console.error('Failed to create contact for memory:', createErr)
        return
      }
      contact = newContact
    }

    const contactId = contact.id
    const contactName = contact.name || normalizedPhone

    // Check existing context
    const { data: existingCtx } = await supabase
      .from('conversation_contexts')
      .select('id, summary, key_topics, interaction_count, sms_interaction_count')
      .eq('contact_id', contactId)
      .eq('agent_id', agentId)
      .maybeSingle()

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const smsExchange = `Customer texted: "${inboundMessage}" → Agent replied: "${aiReply}"`

    if (existingCtx) {
      // Merge summary
      let updatedSummary = smsExchange
      const existingSummary = existingCtx.summary

      if (existingSummary) {
        try {
          const mergeResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{
                role: 'user',
                content: `Merge these two relationship summaries into one concise paragraph (2-3 sentences max):

Previous summary: ${existingSummary}

New SMS exchange: ${smsExchange}

Keep the most important information. Focus on the overall relationship and key needs.`
              }],
              temperature: 0.3,
              max_tokens: 150,
            }),
          })

          if (mergeResponse.ok) {
            const mergeResult = await mergeResponse.json()
            updatedSummary = mergeResult.choices[0].message.content.trim()
          }
        } catch (err) {
          console.error('Failed to merge SMS summaries:', err)
          updatedSummary = smsExchange
        }
      }

      // Extract and merge topics
      let newTopics: string[] = []
      try {
        const topicsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `Extract 1-3 key topics from this SMS exchange as a JSON array of short strings:
"${inboundMessage}" → "${aiReply}"
Return ONLY a JSON array, e.g. ["topic1", "topic2"]`
            }],
            temperature: 0.3,
            max_tokens: 50,
          }),
        })

        if (topicsResponse.ok) {
          const topicsResult = await topicsResponse.json()
          const parsed = JSON.parse(topicsResult.choices[0].message.content.trim())
          if (Array.isArray(parsed)) {
            newTopics = parsed
          }
        }
      } catch (err) {
        console.error('Failed to extract SMS topics:', err)
      }

      // Merge topics (unique, max 10)
      const existingTopics = existingCtx.key_topics || []
      const mergedTopics = [...new Set([...existingTopics, ...newTopics])].slice(0, 10)

      const newSmsCount = (existingCtx.sms_interaction_count || 0) + 1

      // Generate embedding if enabled
      let embedding: number[] | null = null
      if (generateEmbeddingFlag && updatedSummary) {
        embedding = await generateEmbedding(`${updatedSummary}\n\nTopics: ${mergedTopics.join(', ')}`)
      }

      const updateData: any = {
        summary: updatedSummary,
        key_topics: mergedTopics,
        sms_interaction_count: newSmsCount,
        last_updated: new Date().toISOString(),
      }
      if (embedding) {
        updateData.embedding = embedding
      }

      await supabase
        .from('conversation_contexts')
        .update(updateData)
        .eq('id', existingCtx.id)

      console.log(`🧠 Updated SMS memory for ${contactName}: now ${newSmsCount} SMS interactions`)
    } else {
      // Create new context
      let summary = smsExchange
      let keyTopics: string[] = []

      // Generate summary
      try {
        const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `Summarize this SMS exchange in 1-2 sentences:
Customer: "${inboundMessage}"
Agent: "${aiReply}"`
            }],
            temperature: 0.3,
            max_tokens: 100,
          }),
        })

        if (summaryResponse.ok) {
          const summaryResult = await summaryResponse.json()
          summary = summaryResult.choices[0].message.content.trim()
        }
      } catch (err) {
        console.error('Failed to generate SMS summary:', err)
      }

      // Extract topics
      try {
        const topicsResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `Extract 1-3 key topics from this SMS exchange as a JSON array of short strings:
"${inboundMessage}" → "${aiReply}"
Return ONLY a JSON array, e.g. ["topic1", "topic2"]`
            }],
            temperature: 0.3,
            max_tokens: 50,
          }),
        })

        if (topicsResponse.ok) {
          const topicsResult = await topicsResponse.json()
          const parsed = JSON.parse(topicsResult.choices[0].message.content.trim())
          if (Array.isArray(parsed)) {
            keyTopics = parsed
          }
        }
      } catch (err) {
        console.error('Failed to extract SMS topics:', err)
      }

      // Generate embedding if enabled
      let embedding: number[] | null = null
      if (generateEmbeddingFlag && summary) {
        embedding = await generateEmbedding(`${summary}\n\nTopics: ${keyTopics.join(', ')}`)
      }

      const insertData: any = {
        contact_id: contactId,
        agent_id: agentId,
        user_id: userId,
        contact_phone: normalizedPhone,
        service_number: toPhone,
        summary,
        key_topics: keyTopics,
        interaction_count: 0,
        sms_interaction_count: 1,
      }
      if (embedding) {
        insertData.embedding = embedding
      }

      await supabase
        .from('conversation_contexts')
        .insert(insertData)

      console.log(`🧠 Created new SMS memory for ${contactName}`)
    }
  } catch (error) {
    console.error('Error updating contact memory for SMS:', error)
  }
}

async function processAndReplySMS(
  userId: string,
  from: string,
  to: string,
  body: string,
  supabase: any,
  agentConfig: any,
  slackThread: { channel: string; ts: string; accessToken: string } | null
) {
  try {
    // Check if sender has opted out (USA SMS compliance)
    // Only block if they opted out AND this is a US number
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const toIsUSNumber = await isUSNumber(to, supabase)

    if (toIsUSNumber) {
      const hasOptedOut = await isOptedOut(supabase, from)
      if (hasOptedOut) {
        console.log('Sender has opted out from US number:', to, '- not sending AI reply to:', from)
        return // Don't respond to opted-out users
      }
    }

    // Check if AI is paused for this conversation
    // Note: Separate conversations per service number (different numbers = different threads)
    const { data: context } = await supabase
      .from('conversation_contexts')
      .select('ai_paused_until')
      .eq('user_id', userId)
      .eq('contact_phone', from)
      .eq('service_number', to)
      .single()

    if (context?.ai_paused_until) {
      const pausedUntil = new Date(context.ai_paused_until)
      const now = new Date()

      if (pausedUntil > now) {
        console.log(`AI is paused for this conversation until ${pausedUntil.toISOString()}`)
        return // Don't respond
      }
    }

    // Agent config is now passed in - no need to fetch again
    if (!agentConfig) {
      console.log('No agent configured for user')
      return
    }

    // Check if agent is active - don't respond if inactive
    if (agentConfig.is_active === false) {
      console.log('Agent is inactive, not responding to SMS:', agentConfig.id, agentConfig.name || 'Unnamed')
      return
    }

    // Check if within texts schedule
    let smsAfterHours = false
    if (agentConfig.texts_schedule) {
      const inSchedule = isWithinSchedule(agentConfig.texts_schedule, agentConfig.schedule_timezone)
      if (!inSchedule) {
        console.log('SMS outside scheduled hours for agent:', agentConfig.id, agentConfig.name || 'Unnamed')
        smsAfterHours = true

        // If SMS forwarding number is configured, forward and auto-reply
        const smsForwardingNumber = agentConfig.after_hours_sms_forwarding
        if (smsForwardingNumber) {
          console.log('Forwarding after-hours SMS to:', smsForwardingNumber)
          const forwardBody = `After-hours SMS from ${from}: ${body}`
          await sendSMS(userId, smsForwardingNumber, to, forwardBody, supabase, false)
        }
        // Send off-duty message and stop processing
        console.log('Sending off-duty auto-reply')
        await sendSMS(userId, from, to, 'This Magpipe agent is currently off duty.', supabase, false)
        return
      }
    }

    // Get recent conversation history for context
    const { data: recentMessages } = await supabase
      .from('sms_messages')
      .select('content, direction, sent_at')
      .eq('user_id', userId)
      .or(`sender_number.eq.${from},recipient_number.eq.${from}`)
      .order('sent_at', { ascending: false })
      .limit(6) // Get last 6 messages (including the one just received)

    // Build conversation history (exclude the current message, reverse to chronological order)
    const conversationHistory = recentMessages
      ?.filter(m => m.content !== body) // Exclude current message
      ?.reverse()
      ?.map(m => ({
        role: m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content
      })) || []

    const hasExistingConversation = conversationHistory.length > 0
    console.log('Conversation history found:', hasExistingConversation, 'messages:', conversationHistory.length)

    // Get contact memory for context injection
    let memoryContext = ''
    if (agentConfig.memory_enabled) {
      memoryContext = await getContactMemory(supabase, from, userId, agentConfig)
    }

    // Search for similar memories from OTHER contacts (semantic memory)
    let semanticContext = ''
    if (agentConfig.semantic_memory_enabled && memoryContext) {
      semanticContext = await searchSimilarMemories(supabase, from, userId, agentConfig)
    }

    // Search Knowledge Base for relevant context
    let kbContext: string | null = null
    const knowledgeSourceIds = agentConfig.knowledge_source_ids || []
    if (knowledgeSourceIds.length > 0) {
      console.log('Searching KB for agent with', knowledgeSourceIds.length, 'knowledge sources')
      kbContext = await searchKnowledgeBase(supabase, knowledgeSourceIds, body, 3)
      if (kbContext) {
        console.log('📚 KB context found, length:', kbContext.length)
      }
    }

    // For SMS, use OpenAI to generate intelligent responses
    // Use SMS-specific prompt or fall back to system_prompt adapted for SMS

    // SMS context suffix - explicitly tells AI this is TEXT, not voice
    const SMS_CONTEXT_SUFFIX = `

IMPORTANT CONTEXT:
- You are responding via SMS TEXT MESSAGE (not a voice call)
- The customer is TEXTING you, not calling
- Keep responses BRIEF: 1-2 sentences maximum
- Use casual, friendly text message language
- NEVER mention: "calling", "call back", "speak", "talk", "phone call", "voice"
- ALWAYS use text-appropriate language: "text", "message", "reply", "send"
- If they ask to talk/call, say: "I can help via text, or you can call ${to} to speak with someone"
- This is asynchronous messaging - they may not respond immediately
${hasExistingConversation ? '- This is an ONGOING conversation - respond naturally to continue it, do NOT give a welcome/intro message' : ''}`

    // Build KB context section if available
    const KB_CONTEXT_SECTION = kbContext ? `

KNOWLEDGE BASE - USE THIS INFORMATION TO ANSWER QUESTIONS:
${kbContext}

IMPORTANT: Base your answers on the knowledge base information above. If the question is not covered in the knowledge base, you can provide a general helpful response, but prefer the KB content when relevant.
` : ''

    // Build memory context section if available
    const MEMORY_CONTEXT_SECTION = memoryContext ? `\n\n${memoryContext}` : ''

    // Build semantic context section if available
    const SEMANTIC_CONTEXT_SECTION = semanticContext ? `\n\n${semanticContext}` : ''

    const smsPrompt = agentConfig.system_prompt
      ? `${agentConfig.system_prompt}${KB_CONTEXT_SECTION}${MEMORY_CONTEXT_SECTION}${SEMANTIC_CONTEXT_SECTION}${SMS_CONTEXT_SUFFIX}`
      : `You are Maggie, a helpful AI assistant. You are responding to an SMS text message. Reply in a friendly and concise way. Keep responses brief (1-2 sentences max). Do not reference phone calls - this is a text message conversation.${KB_CONTEXT_SECTION}${MEMORY_CONTEXT_SECTION}${SEMANTIC_CONTEXT_SECTION}${SMS_CONTEXT_SUFFIX}`

    const systemPrompt = smsPrompt

    console.log('SMS system prompt applied with context suffix, hasExistingConversation:', hasExistingConversation)

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: body }
    ]

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: messages,
      }),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', errorText)
      // Fallback to simple response
      const reply = "Hi! I'm Maggie, your AI assistant. Sorry, I'm having trouble processing your message right now. Please try again later."
      await sendSMS(userId, from, to, reply, supabase)
      return
    }

    const openaiResult = await openaiResponse.json()
    const reply = openaiResult.choices[0].message.content

    console.log('OpenAI generated reply:', reply)

    // Send the reply
    await sendSMS(userId, from, to, reply, supabase)

    // Update contact memory with SMS exchange (fire and forget)
    if (agentConfig.memory_enabled) {
      updateContactMemory(supabase, from, to, userId, agentConfig, body, reply)
        .catch(err => console.error('Failed to update SMS memory:', err))
    }

    // Send agent reply to Slack thread if we have thread info
    if (slackThread) {
      const agentName = agentConfig?.name || 'AI Assistant'
      await sendSlackAgentReply(slackThread, agentName, reply)
    }
  } catch (error) {
    console.error('Error in processAndReplySMS:', error)
  }
}

async function sendSMS(
  userId: string,
  to: string,
  from: string,
  body: string,
  supabase: any,
  addOptOutText: boolean = true
) {
  try {
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')!
    const signalwireApiToken = Deno.env.get('SIGNALWIRE_API_TOKEN')!
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')!

    // Always reply from the number that received the message
    // This ensures conversation continuity and proper campaign compliance
    const fromNumber = from

    // Add opt-out instructions (USA SMS compliance) only when sending FROM a US number
    const { isUSNumber } = await import('../_shared/sms-compliance.ts')
    const fromIsUSNumber = await isUSNumber(fromNumber, supabase)
    const shouldAddOptOutText = addOptOutText && fromIsUSNumber
    const messageBody = shouldAddOptOutText ? `${body}\n\nSTOP to opt out` : body

    const smsData = new URLSearchParams({
      From: fromNumber,
      To: to,
      Body: messageBody,
    })

    const auth = btoa(`${signalwireProjectId}:${signalwireApiToken}`)
    const smsResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsData.toString(),
      }
    )

    if (!smsResponse.ok) {
      const errorText = await smsResponse.text()
      console.error('SignalWire SMS send error:', errorText)
    } else {
      const smsResult = await smsResponse.json()
      console.log('SMS sent:', smsResult.sid)

      // Log the outbound SMS
      await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          sender_number: fromNumber,
          recipient_number: to,
          direction: 'outbound',
          content: body,
          status: 'sent',
          sent_at: new Date().toISOString(),
          is_ai_generated: true,
        })

      // Deduct credits for the AI-generated SMS (fire and forget)
      deductSmsCredits(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        userId,
        1
      ).catch(err => console.error('Failed to deduct SMS credits:', err))
    }
  } catch (error) {
    console.error('Error sending SMS:', error)
  }
}

/**
 * Deduct credits for SMS messages
 */
async function deductSmsCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  messageCount: number
) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'sms',
        messageCount,
        referenceType: 'sms'
      })
    })

    const result = await response.json()
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} SMS, balance: $${result.balanceAfter}`)
    } else {
      console.error('Failed to deduct SMS credits:', result.error)
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error)
  }
}

/**
 * Auto-enrich contact if phone number doesn't exist in contacts
 * Called when new SMS interactions occur
 */
async function autoEnrichContact(
  userId: string,
  phoneNumber: string,
  supabase: any
) {
  // Normalize phone number (ensure E.164 format)
  const normalizedPhone = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+${phoneNumber.replace(/\D/g, '')}`

  try {
    // Check if contact already exists
    const { data: existingContact, error: checkError } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', normalizedPhone)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking for existing contact:', checkError)
      return
    }

    if (existingContact) {
      console.log('Contact already exists for', normalizedPhone)
      return
    }

    console.log('No contact found for', normalizedPhone, '- attempting lookup')

    // Call the contact-lookup Edge Function
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const response = await fetch(
      `${supabaseUrl}/functions/v1/contact-lookup`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.notFound || !data.success) {
      // No data found - create a basic contact with just the phone number
      console.log('No enrichment data found for', normalizedPhone, '- creating basic contact')
      const { error: createError } = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          phone_number: normalizedPhone,
          name: 'Unknown',
          first_name: 'Unknown',
          is_whitelisted: false
        })

      if (createError) {
        console.error('Error creating basic contact:', createError)
      } else {
        console.log('Created basic contact for', normalizedPhone)
      }
      return
    }

    // Create enriched contact
    const contact = data.contact
    const firstName = contact.first_name || (contact.name ? contact.name.split(' ')[0] : 'Unknown')
    const lastName = contact.last_name || (contact.name ? contact.name.split(' ').slice(1).join(' ') : null)
    const fullName = contact.name || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'

    const contactData = {
      user_id: userId,
      phone_number: normalizedPhone,
      name: fullName,
      first_name: firstName,
      last_name: lastName,
      email: contact.email || null,
      address: contact.address || null,
      company: contact.company || null,
      job_title: contact.job_title || null,
      avatar_url: contact.avatar_url || null,
      linkedin_url: contact.linkedin_url || null,
      twitter_url: contact.twitter_url || null,
      facebook_url: contact.facebook_url || null,
      enriched_at: new Date().toISOString(),
      is_whitelisted: false
    }

    const { error: createError } = await supabase
      .from('contacts')
      .insert(contactData)

    if (createError) {
      console.error('Error creating enriched contact:', createError)
    } else {
      console.log('Created enriched contact for', normalizedPhone, contactData)
    }

  } catch (error) {
    console.error('Error in autoEnrichContact:', error)
  }
}

/**
 * Check if the current time is within the agent's schedule
 * @param schedule - Schedule object with days as keys
 * @param timezone - IANA timezone string
 * @returns boolean - true if within schedule, false if outside
 */
function isWithinSchedule(
  schedule: Record<string, { enabled: boolean; start: string; end: string }>,
  timezone?: string
): boolean {
  try {
    const tz = timezone || 'America/Los_Angeles'
    const now = new Date()

    // Get current day and time in the agent's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase()
    const hour = parts.find(p => p.type === 'hour')?.value
    const minute = parts.find(p => p.type === 'minute')?.value

    if (!weekday || !hour || !minute) {
      console.error('Failed to parse current time for schedule check')
      return true // Default to available on parse error
    }

    const currentTime = `${hour}:${minute}`
    const daySchedule = schedule[weekday]

    if (!daySchedule) {
      console.log(`No schedule defined for ${weekday}, defaulting to available`)
      return true
    }

    if (!daySchedule.enabled) {
      console.log(`Schedule disabled for ${weekday}`)
      return false
    }

    // Compare times as strings (HH:MM format)
    const isWithin = currentTime >= daySchedule.start && currentTime <= daySchedule.end
    console.log(`Schedule check: ${weekday} ${currentTime} in ${daySchedule.start}-${daySchedule.end}: ${isWithin}`)

    return isWithin
  } catch (error) {
    console.error('Error checking schedule:', error)
    return true // Default to available on error
  }
}

/**
 * Send Slack notification for incoming SMS
 * Returns thread info so agent response can be added as reply
 */
async function sendSlackNotification(
  userId: string,
  senderPhone: string,
  messageContent: string,
  supabase: any
): Promise<{ channel: string; ts: string; accessToken: string } | null> {
  try {
    // Check if user has Slack connected
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('access_token, config')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .eq('provider_id', (
        await supabase
          .from('integration_providers')
          .select('id')
          .eq('slug', 'slack')
          .single()
      ).data?.id)
      .single()

    if (integrationError || !integration?.access_token) {
      // User doesn't have Slack connected - silently skip
      return null
    }

    // Get contact name if available
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('user_id', userId)
      .eq('phone_number', senderPhone)
      .single()

    const senderName = contact?.name || senderPhone

    // Get notification channel from config, default to DM
    const notificationChannel = integration.config?.notification_channel

    let channelId = notificationChannel

    // If no channel configured, send as DM to the user
    if (!channelId) {
      // Get the Slack user ID for the bot owner (open DM with self)
      const authResponse = await fetch('https://slack.com/api/auth.test', {
        headers: { 'Authorization': `Bearer ${integration.access_token}` }
      })
      const authResult = await authResponse.json()

      if (!authResult.ok) {
        console.error('Slack auth.test failed:', authResult.error)
        return null
      }

      // Open a DM - we'll use a special channel for notifications
      // For now, post to #general or first available channel
      const channelsResponse = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel&limit=10',
        { headers: { 'Authorization': `Bearer ${integration.access_token}` } }
      )
      const channelsResult = await channelsResponse.json()

      if (channelsResult.ok && channelsResult.channels?.length > 0) {
        // Look for a pat-notifications channel, otherwise use general
        const patChannel = channelsResult.channels.find((c: any) => c.name === 'pat-notifications')
        const generalChannel = channelsResult.channels.find((c: any) => c.name === 'general')
        channelId = patChannel?.id || generalChannel?.id || channelsResult.channels[0].id
      }
    }

    if (!channelId) {
      console.log('No Slack channel available for notification')
      return null
    }

    // Try to join the channel first (in case not a member)
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    })

    // Format the message nicely
    const slackMessage = {
      channel: channelId,
      text: `📱 New SMS from ${senderName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📱 *New SMS from ${senderName}*\n>${messageContent.replace(/\n/g, '\n>')}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `From: ${senderPhone} • ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('Slack notification failed:', result.error)
      return null
    } else {
      console.log('Slack notification sent for SMS from', senderPhone, 'ts:', result.ts)
      return {
        channel: channelId,
        ts: result.ts,
        accessToken: integration.access_token
      }
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
    return null
  }
}

/**
 * Send agent response as a thread reply to the Slack notification
 */
async function sendSlackAgentReply(
  slackThread: { channel: string; ts: string; accessToken: string },
  agentName: string,
  agentReply: string
) {
  try {
    const slackMessage = {
      channel: slackThread.channel,
      thread_ts: slackThread.ts,
      text: `🤖 ${agentName} replied`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤖 *${agentName} replied:*\n>${agentReply.replace(/\n/g, '\n>')}`
          }
        }
      ]
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackThread.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    })

    const result = await response.json()
    if (!result.ok) {
      console.error('Slack agent reply failed:', result.error)
    } else {
      console.log('Slack agent reply sent in thread')
    }
  } catch (error) {
    console.error('Error sending Slack agent reply:', error)
  }
}