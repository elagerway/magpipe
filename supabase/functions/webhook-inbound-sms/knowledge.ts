import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function generateEmbedding(text: string): Promise<number[] | null> {
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
export async function searchKnowledgeBase(
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
