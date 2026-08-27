import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { chunkText, fetchPageContent } from '../_shared/js-content-fetcher.ts';

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // This function should be called via cron or manual invocation
    // Authorization via service role key or API key
    const authHeader = req.headers.get('Authorization');
    const apiKey = req.headers.get('apikey');

    if (!authHeader && !apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Query knowledge sources that need syncing
    const { data: sources, error: queryError } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('sync_status', 'completed')
      .lt('next_sync_at', new Date().toISOString());

    if (queryError) throw queryError;

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No sources to sync',
          synced: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      total: sources.length,
      synced: 0,
      failed: 0,
      errors: [] as Array<{ source_id: string; url: string; error: string }>,
    };

    // Process each source
    for (const source of sources) {
      try {
        // Mark as syncing
        await supabase
          .from('knowledge_sources')
          .update({ sync_status: 'syncing' })
          .eq('id', source.id);

        // Build fetch headers with stored auth
        const fetchHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)',
        };
        const storedAuth = source.auth_headers as Record<string, string> | null;
        if (storedAuth && typeof storedAuth === 'object') {
          Object.assign(fetchHeaders, storedAuth);
        }

        // Fetch page content with JS rendering fallback cascade
        const result = await fetchPageContent(source.url, fetchHeaders, storedAuth || undefined);

        if (!result) {
          throw new Error('No content extracted from URL (tried direct fetch + JS rendering fallbacks)');
        }

        const { title, description, text } = result;
        const chunks = chunkText(text);

        if (chunks.length === 0) {
          throw new Error('No content extracted from URL');
        }

        // Delete old chunks
        await supabase
          .from('knowledge_chunks')
          .delete()
          .eq('knowledge_source_id', source.id);

        // Generate embeddings for each chunk
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
        switch (source.sync_period) {
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
        await supabase
          .from('knowledge_sources')
          .update({
            sync_status: 'completed',
            chunk_count: chunks.length,
            last_synced_at: now.toISOString(),
            next_sync_at: nextSync.toISOString(),
            error_message: null,
            title,
            description: description || text.substring(0, 200),
          })
          .eq('id', source.id);

        // Log action
        await supabase.from('admin_action_logs').insert({
          user_id: source.user_id,
          action_type: 'sync_knowledge_source',
          description: `Synced knowledge source: ${title}`,
          new_value: { url: source.url, chunk_count: chunks.length },
          source: 'background_job',
          success: true,
        });

        results.synced++;

      } catch (error) {
        // Mark as failed
        await supabase
          .from('knowledge_sources')
          .update({
            sync_status: 'failed',
            error_message: error.message || 'Unknown error',
          })
          .eq('id', source.id);

        // Log failed action
        await supabase.from('admin_action_logs').insert({
          user_id: source.user_id,
          action_type: 'sync_knowledge_source',
          description: `Failed to sync knowledge source: ${source.title}`,
          old_value: { url: source.url, error: error.message },
          source: 'background_job',
          success: false,
        });

        results.failed++;
        results.errors.push({
          source_id: source.id,
          url: source.url,
          error: error.message || 'Unknown error',
        });

        console.error(`Failed to sync source ${source.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in knowledge-source-sync:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
