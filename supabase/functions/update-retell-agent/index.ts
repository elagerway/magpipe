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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No Authorization header')
      return new Response(
        JSON.stringify({ error: 'No Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.id)

    // Get user's agent config
    const { data: agentConfig, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    console.log('Agent config query result:', { agentConfig, configError })

    if (configError || !agentConfig) {
      console.error('Agent config not found:', configError)
      return new Response(
        JSON.stringify({ error: 'Agent config not found', details: configError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!agentConfig.retell_agent_id) {
      return new Response(
        JSON.stringify({ error: 'No Retell agent ID found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Update the Retell agent with current config
    const updatePayload: any = {
      voice_id: agentConfig.voice_id,
    }

    // Add advanced settings if they exist
    if (agentConfig.agent_volume !== null && agentConfig.agent_volume !== undefined) {
      updatePayload.agent_volume = agentConfig.agent_volume
    }
    // Set ambient_sound to null if "off", otherwise send the value
    if (agentConfig.ambient_sound === 'off' || !agentConfig.ambient_sound) {
      updatePayload.ambient_sound = null
    } else {
      updatePayload.ambient_sound = agentConfig.ambient_sound
      // Only send ambient_sound_volume if ambient_sound is enabled
      if (agentConfig.ambient_sound_volume !== null && agentConfig.ambient_sound_volume !== undefined) {
        updatePayload.ambient_sound_volume = agentConfig.ambient_sound_volume
      }
    }
    if (agentConfig.noise_suppression) {
      updatePayload.enable_backchannel = agentConfig.noise_suppression === 'enabled'
    }
    if (agentConfig.temperature !== null && agentConfig.temperature !== undefined) {
      updatePayload.responsiveness = agentConfig.temperature
    }

    console.log('Updating Retell agent:', agentConfig.retell_agent_id)
    console.log('Update payload:', updatePayload)

    // Update both the agent AND the LLM to ensure voice changes take effect
    const agentResponse = await fetch(
      `https://api.retellai.com/update-agent/${agentConfig.retell_agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      }
    )

    const response = agentResponse

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Retell API error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to update Retell agent', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log('Retell agent updated successfully:', result)

    return new Response(
      JSON.stringify({ success: true, agent: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error updating Retell agent:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
