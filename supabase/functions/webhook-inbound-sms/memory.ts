import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { generateEmbedding } from './knowledge.ts'

export async function getContactMemory(
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
export async function searchSimilarMemories(
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
export async function updateContactMemory(
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
