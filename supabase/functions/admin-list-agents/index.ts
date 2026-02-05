import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
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

    // Verify admin/support role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'support', 'god'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin, support, or god role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all agents with owner info
    const { data: agents, error: agentsError } = await supabase
      .from('agent_configs')
      .select(`
        id,
        agent_id,
        name,
        voice_id,
        system_prompt,
        user_id,
        is_global,
        created_at,
        users!inner (
          name,
          email,
          organization_name
        )
      `)
      .order('created_at', { ascending: false });

    if (agentsError) {
      console.error('Error fetching agents:', agentsError);
      throw agentsError;
    }

    // Format response - put global agent first
    const formattedAgents = (agents || []).map(agent => ({
      id: agent.id,
      agent_id: agent.agent_id,
      name: agent.is_global ? `⭐ ${agent.name || 'Global Agent'} (Platform)` : (agent.name || 'Unnamed Agent'),
      voice_id: agent.voice_id,
      user_id: agent.user_id,
      is_global: agent.is_global || false,
      owner_name: agent.is_global ? 'System' : (agent.users?.name || 'Unknown'),
      owner_email: agent.users?.email || '',
      organization_name: agent.is_global ? 'Magpipe' : (agent.users?.organization_name || ''),
      created_at: agent.created_at,
    })).sort((a, b) => {
      // Global agent first
      if (a.is_global && !b.is_global) return -1;
      if (!a.is_global && b.is_global) return 1;
      // Then by created_at desc
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return new Response(
      JSON.stringify({ agents: formattedAgents }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in admin-list-agents:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
