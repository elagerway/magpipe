import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Create client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const body = await req.json()
    const { query, agentId, excludeContactId, memoryId } = body

    if (!agentId) {
      return new Response(JSON.stringify({ error: 'agentId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Verify the agent belongs to this user
    const { data: agent, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, semantic_memory_config')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const semanticConfig = agent.semantic_memory_config || {
      max_results: 3,
      similarity_threshold: 0.75,
    }

    // Use service role client for RPC calls (RLS may block RPC)
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, serviceKey)

    let queryEmbedding: number[]

    if (memoryId) {
      // Mode: find similar to an existing memory (use its stored embedding)
      const { data: mem, error: memError } = await serviceClient
        .from('conversation_contexts')
        .select('embedding')
        .eq('id', memoryId)
        .eq('agent_id', agentId)
        .single()

      if (memError || !mem?.embedding) {
        return new Response(JSON.stringify({ error: 'Memory not found or has no embedding', results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      queryEmbedding = mem.embedding
    } else if (query) {
      // Mode: search by text query — generate embedding
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
      if (!openaiApiKey) {
        return new Response(JSON.stringify({ error: 'OpenAI not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: query.slice(0, 8000),
        }),
      })

      if (!embeddingResponse.ok) {
        console.error('OpenAI embedding error:', await embeddingResponse.text())
        return new Response(JSON.stringify({ error: 'Failed to generate embedding' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      const embeddingData = await embeddingResponse.json()
      queryEmbedding = embeddingData.data[0].embedding
    } else {
      return new Response(JSON.stringify({ error: 'Either query or memoryId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Call match_similar_memories RPC
    const { data: results, error: rpcError } = await serviceClient.rpc('match_similar_memories', {
      query_embedding: queryEmbedding,
      match_agent_id: agentId,
      match_user_id: user.id,
      exclude_contact_id: excludeContactId || null,
      match_threshold: semanticConfig.similarity_threshold || 0.75,
      match_count: semanticConfig.max_results || 3,
    })

    if (rpcError) {
      console.error('RPC error:', rpcError)
      return new Response(JSON.stringify({ error: 'Search failed', results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    return new Response(JSON.stringify({ results: results || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (error) {
    console.error('Error in semantic-memory-search:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
