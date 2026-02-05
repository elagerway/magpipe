import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin/support/god role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'support', 'god'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin, support, or god role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET') {
      // Get the global agent config
      const { data: globalAgent, error } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('is_global', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      return new Response(
        JSON.stringify({ agent: globalAgent || null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();

      // Check if global agent exists
      const { data: existingGlobal } = await supabase
        .from('agent_configs')
        .select('id')
        .eq('is_global', true)
        .single();

      if (existingGlobal) {
        // Update existing global agent
        const { data: updated, error: updateError } = await supabase
          .from('agent_configs')
          .update({
            name: body.name,
            system_prompt: body.system_prompt,
            voice_id: body.voice_id,
            greeting: body.greeting,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingGlobal.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ agent: updated, message: 'Global agent updated' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Create new global agent (owned by the god user)
        const { data: godUser } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'god')
          .limit(1)
          .single();

        const ownerId = godUser?.id || user.id;

        const { data: created, error: createError } = await supabase
          .from('agent_configs')
          .insert({
            user_id: ownerId,
            name: body.name || 'Magpipe Assistant',
            system_prompt: body.system_prompt || 'You are the Magpipe AI assistant. Help users with their questions about the platform.',
            voice_id: body.voice_id || 'shimmer',
            greeting: body.greeting || 'Hi! How can I help you today?',
            is_global: true,
            is_default: false,
            agent_type: 'inbound',
          })
          .select()
          .single();

        if (createError) throw createError;

        return new Response(
          JSON.stringify({ agent: created, message: 'Global agent created' }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-global-agent:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
