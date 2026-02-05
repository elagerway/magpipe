import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
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
      // Get all users with their permission status for global agent editing
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, name, role, can_edit_global_agent')
        .order('role', { ascending: false })
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ users: users || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const body = await req.json();

      // Expect { userIds: string[], grant: boolean } to grant/revoke permission
      // Or { userId: string, grant: boolean } for single user update
      if (body.userId !== undefined) {
        // Single user update
        const { userId, grant } = body;

        const { data: updated, error: updateError } = await supabase
          .from('users')
          .update({
            can_edit_global_agent: grant,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id, email, name, role, can_edit_global_agent')
          .single();

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({
            user: updated,
            message: grant ? 'Permission granted' : 'Permission revoked'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (body.userIds !== undefined) {
        // Batch update - set can_edit_global_agent to true for these users, false for others
        const { userIds } = body;

        // First, set all to false
        await supabase
          .from('users')
          .update({ can_edit_global_agent: false })
          .neq('role', 'god'); // Don't touch god users

        // Then set the specified ones to true
        if (userIds.length > 0) {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              can_edit_global_agent: true,
              updated_at: new Date().toISOString(),
            })
            .in('id', userIds);

          if (updateError) throw updateError;
        }

        return new Response(
          JSON.stringify({ message: 'Permissions updated successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected userId or userIds.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
