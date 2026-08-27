import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
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

    // Clear Cal.com tokens from user record
    const { error: updateError } = await supabase
      .from('users')
      .update({
        cal_com_access_token: null,
        cal_com_refresh_token: null,
        cal_com_token_expires_at: null,
        cal_com_user_id: null,
        cal_com_default_event_type_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error('Failed to disconnect Cal.com: ' + updateError.message);
    }

    // Also clear user_integrations record
    const { data: calProvider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'cal_com')
      .single();

    if (calProvider) {
      await supabase
        .from('user_integrations')
        .update({ status: 'disconnected', access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('provider_id', calProvider.id);

      // Disable any skills that require cal_com
      const { data: calSkills } = await supabase
        .from('agent_skills')
        .select('id, skill_definitions!inner(required_integrations)')
        .eq('user_id', user.id)
        .eq('is_enabled', true);

      const skillsToDisable = (calSkills || []).filter((s: any) => {
        const reqs = s.skill_definitions?.required_integrations || [];
        return reqs.includes('cal_com');
      });

      if (skillsToDisable.length > 0) {
        await supabase
          .from('agent_skills')
          .update({ is_enabled: false, updated_at: new Date().toISOString() })
          .in('id', skillsToDisable.map((s: any) => s.id));
        console.log(`Disabled ${skillsToDisable.length} skill(s) that required Cal.com`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Cal.com disconnected successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cal-com-disconnect:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
