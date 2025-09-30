import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { agentConfig } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Get user's agent config with system prompt
    const { data: existingConfig } = await supabase
      .from('agent_configs')
      .select('system_prompt')
      .eq('user_id', user.id)
      .single()

    const systemPrompt = existingConfig?.system_prompt || agentConfig?.prompt || 'You are a friendly, professional AI assistant that answers phone calls and text messages on behalf of your user.'

    // Create Retell LLM with the system prompt
    const llmData = {
      model: 'gpt-4o-mini',
      general_prompt: systemPrompt,
      begin_message: "Hi, how can I help you today?"
    }

    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(llmData),
    })

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text()
      console.error('Failed to create Retell LLM:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create Retell LLM', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const llm = await llmResponse.json()
    console.log('Retell LLM created:', llm.llm_id)

    // Create Retell agent with the LLM
    const agentData = {
      agent_name: agentConfig?.name || `Pat AI - ${user.email}`,
      voice_id: agentConfig?.voice_id || '11labs-Kate',
      language: 'en-US',
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id,
      },
    }

    console.log('Creating Retell agent:', agentData)

    const createResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentData),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('Retell API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create Retell agent', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const agent = await createResponse.json()
    console.log('Retell agent created:', agent.agent_id)

    // Fetch Kate's avatar from Retell API
    const voiceId = agentConfig?.voice_id || '11labs-Kate'
    let avatarUrl = null

    try {
      const voiceResponse = await fetch(`https://api.retellai.com/get-voice/${voiceId}`, {
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
        },
      })

      if (voiceResponse.ok) {
        const voiceData = await voiceResponse.json()
        avatarUrl = voiceData.avatar_url || voiceData.preview_url
        console.log('Voice avatar URL:', avatarUrl)
      }
    } catch (error) {
      console.error('Error fetching voice avatar:', error)
      // Continue without avatar if fetch fails
    }

    // Save agent config to database
    const { error: insertError } = await supabase
      .from('agent_configs')
      .upsert({
        user_id: user.id,
        retell_agent_id: agent.agent_id,
        agent_name: agentConfig?.name || `Pat AI - ${user.email}`,
        voice_id: voiceId,
        avatar_url: avatarUrl,
        prompt: agentConfig?.prompt || 'You are Pat, a helpful AI assistant. You answer calls and messages for the user. Be friendly, professional, and helpful.',
        language: 'en-US',
      })

    if (insertError) {
      console.error('Error saving agent config:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save agent configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        agent_id: agent.agent_id,
        message: 'Retell agent created successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in create-retell-agent:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})