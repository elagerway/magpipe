import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddSourceRequest {
  url: string;
  sync_period?: '24h' | '7d' | '1mo' | '3mo';
  auth_headers?: Record<string, string>;  // Optional auth headers for protected pages
}

// Simple text chunking (500-1000 tokens ~= 2000-4000 characters)
function chunkText(text: string, maxChunkSize = 3000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Extract readable content from HTML
function extractContent(html: string): { title: string; description: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }

  // Extract title
  const titleEl = doc.querySelector('title');
  const title = titleEl?.textContent?.trim() || 'Untitled';

  // Extract meta description
  const metaDesc = doc.querySelector('meta[name="description"]');
  const description = metaDesc?.getAttribute('content')?.trim() || '';

  // Extract main content (simple approach - get all text from body)
  const body = doc.querySelector('body');
  let text = '';

  if (body) {
    // Remove script and style tags
    const scripts = body.querySelectorAll('script, style, nav, header, footer');
    scripts.forEach(el => el.remove());

    text = body.textContent || '';
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
  }

  return { title, description, text };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body: AddSourceRequest = await req.json();

    // Validate URL
    if (!body.url || typeof body.url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.url.length > 2048) {
      return new Response(
        JSON.stringify({ error: 'URL too long (max 2048 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(body.url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: 'URL must start with http:// or https://' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate sync_period if provided
    const validPeriods = ['24h', '7d', '1mo', '3mo'];
    const syncPeriod = body.sync_period || '7d';
    if (!validPeriods.includes(syncPeriod)) {
      return new Response(
        JSON.stringify({ error: 'Invalid sync_period. Must be one of: 24h, 7d, 1mo, 3mo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's knowledge source count (max 50)
    const { count } = await supabase
      .from('knowledge_sources')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 knowledge sources allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch URL
    let htmlContent: string;
    try {
      // Build headers - include any custom auth headers if provided
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; PatAI/1.0)',
      };

      if (body.auth_headers && typeof body.auth_headers === 'object') {
        // Merge custom auth headers (e.g., Authorization, Cookie)
        Object.assign(fetchHeaders, body.auth_headers);
      }

      const fetchResponse = await fetch(body.url, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!fetchResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Could not access that URL (${fetchResponse.status} ${fetchResponse.statusText})` }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      htmlContent = await fetchResponse.text();

      // Check size
      if (htmlContent.length > 1024 * 1024) { // 1MB limit
        return new Response(
          JSON.stringify({ error: 'Content too large (max 1MB)' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ error: `Could not fetch URL: ${error.message}` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract content
    const { title, description, text } = extractContent(htmlContent);

    // Chunk text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No content extracted from URL' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create knowledge source record
    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .insert({
        user_id: user.id,
        url: body.url,
        title,
        description: description || text.substring(0, 200),
        sync_period: syncPeriod,
        sync_status: 'syncing',
      })
      .select()
      .single();

    if (sourceError) throw sourceError;

    // Generate embeddings for each chunk
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const chunkRecords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: chunk,
        }),
      });

      if (!embeddingResponse.ok) {
        console.error('OpenAI embedding error:', await embeddingResponse.text());
        throw new Error('Failed to generate embeddings');
      }

      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      chunkRecords.push({
        knowledge_source_id: source.id,
        content: chunk,
        embedding,
        chunk_index: i,
        token_count: Math.ceil(chunk.length / 4), // Rough estimate
      });
    }

    // Insert all chunks
    const { error: chunksError } = await supabase
      .from('knowledge_chunks')
      .insert(chunkRecords);

    if (chunksError) throw chunksError;

    // Calculate next sync time
    const now = new Date();
    const nextSync = new Date(now);
    switch (syncPeriod) {
      case '24h':
        nextSync.setHours(nextSync.getHours() + 24);
        break;
      case '7d':
        nextSync.setDate(nextSync.getDate() + 7);
        break;
      case '1mo':
        nextSync.setMonth(nextSync.getMonth() + 1);
        break;
      case '3mo':
        nextSync.setMonth(nextSync.getMonth() + 3);
        break;
    }

    // Update source with completed status
    const { data: updatedSource } = await supabase
      .from('knowledge_sources')
      .update({
        sync_status: 'completed',
        chunk_count: chunks.length,
        last_synced_at: now.toISOString(),
        next_sync_at: nextSync.toISOString(),
      })
      .eq('id', source.id)
      .select()
      .single();

    // Log action
    await supabase.from('admin_action_logs').insert({
      user_id: user.id,
      action_type: 'add_knowledge_source',
      description: `Added knowledge source: ${title}`,
      new_value: { url: body.url, chunk_count: chunks.length },
      source: 'web_chat',
      success: true,
    });

    return new Response(
      JSON.stringify({
        id: updatedSource.id,
        url: updatedSource.url,
        title: updatedSource.title,
        description: updatedSource.description,
        status: updatedSource.sync_status,
        chunk_count: updatedSource.chunk_count,
        sync_period: updatedSource.sync_period,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in knowledge-source-add:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
