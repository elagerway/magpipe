import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
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

    // Get agent_id from request body
    const { agent_id } = await req.json();

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: 'Missing agent_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch agent config
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, agent_id, name, system_prompt, voice_id, user_id')
      .eq('id', agent_id)
      .single();

    if (agentError || !agentConfig) {
      console.error('Agent config error:', agentError);
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch owner's info for prompt variables
    const { data: ownerData } = await supabase
      .from('users')
      .select('name, organization_name')
      .eq('id', agentConfig.user_id)
      .single();

    const ownerName = ownerData?.name || 'the owner';
    const organizationName = ownerData?.organization_name || ownerName;
    const firstName = ownerName.split(' ')[0];

    // Process system prompt variables
    let processedPrompt = agentConfig.system_prompt || '';
    processedPrompt = processedPrompt
      .replace(/<organization>/g, organizationName)
      .replace(/<owner>/g, ownerName)
      .replace(/<owner_first_name>/g, firstName)
      .replace(/\{organization\}/g, organizationName)
      .replace(/\{owner\}/g, ownerName)
      .replace(/\{owner_first_name\}/g, firstName);

    // Map ElevenLabs voice ID to OpenAI Realtime voice
    // OpenAI Realtime voices: alloy, echo, fable, onyx, nova, shimmer
    let openaiVoice = 'shimmer'; // Default warm female voice

    const voiceId = agentConfig.voice_id || '';
    if (voiceId.startsWith('openai-')) {
      // Direct OpenAI voice mapping
      openaiVoice = voiceId.replace('openai-', '');
    } else if (voiceId === 'alloy' || voiceId === 'echo' || voiceId === 'fable' ||
               voiceId === 'onyx' || voiceId === 'nova' || voiceId === 'shimmer') {
      // Legacy direct voice ID
      openaiVoice = voiceId;
    }
    // For ElevenLabs voices, we use shimmer as fallback (warm female voice)

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Create ephemeral token for Realtime API (GA version)
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI Realtime API error:', error);
      throw new Error(`Failed to create Realtime session: ${response.status}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        token: data.value,
        model: 'gpt-4o-realtime-preview-2024-12-17',
        agentConfig: {
          id: agentConfig.id,
          agent_id: agentConfig.agent_id,
          agent_name: agentConfig.name,
          system_prompt: processedPrompt,
          voice_id: openaiVoice,
          organization_name: organizationName,
          owner_name: ownerName,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in realtime-omni-token:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
