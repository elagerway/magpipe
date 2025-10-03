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

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's agent config
    const { data: config, error: configError } = await supabase
      .from('agent_configs')
      .select('retell_agent_id, voice_id')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      throw new Error('Agent config not found')
    }

    if (!config.retell_agent_id) {
      throw new Error('No Retell agent configured')
    }

    console.log(`Updating Retell agent ${config.retell_agent_id} with voice ${config.voice_id}`)

    // Update Retell agent
    const retellApiKey = Deno.env.get('RETELL_API_KEY')!
    const response = await fetch(
      `https://api.retellai.com/update-agent/${config.retell_agent_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_id: config.voice_id,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to update Retell agent:', errorText)
      throw new Error(`Failed to update Retell agent: ${errorText}`)
    }

    const result = await response.json()
    console.log('Successfully updated Retell agent')

    return new Response(
      JSON.stringify({
        success: true,
        agent_id: config.retell_agent_id,
        voice_id: config.voice_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in update-agent-voice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
