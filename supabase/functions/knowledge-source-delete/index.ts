import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from "../_shared/api-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteRequest {
  id: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: DeleteRequest = await req.json();

    // Validate ID
    if (!body.id) {
      return new Response(
        JSON.stringify({ error: 'ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid UUID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if source exists and belongs to user
    const { data: source, error: findError } = await supabase
      .from('knowledge_sources')
      .select('id, chunk_count, url, title')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .single();

    if (findError || !source) {
      return new Response(
        JSON.stringify({ error: 'Knowledge source not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chunkCount = source.chunk_count || 0;

    // Delete source (cascades to chunks via FK)
    const { error: deleteError } = await supabase
      .from('knowledge_sources')
      .delete()
      .eq('id', body.id);

    if (deleteError) throw deleteError;

    // Log action
    await supabase.from('admin_action_logs').insert({
      user_id: user.id,
      action_type: 'remove_knowledge_source',
      description: `Removed knowledge source: ${source.title}`,
      old_value: { url: source.url, chunk_count: chunkCount },
      source: 'web_chat',
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted_chunks: chunkCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in knowledge-source-delete:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
