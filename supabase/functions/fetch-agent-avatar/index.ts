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

    // Get agent config
    const { data: agentConfig, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !agentConfig) {
      console.error('Agent config error:', configError)
      return new Response(
        JSON.stringify({
          error: 'Agent not found. Please activate a phone number first to create your agent.',
          details: configError?.message
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found agent config:', {
      user_id: agentConfig.user_id,
      retell_agent_id: agentConfig.retell_agent_id,
      voice_id: agentConfig.voice_id,
      has_avatar: !!agentConfig.avatar_url
    })

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!

    // Map voice names to Retell voice IDs
    const voiceMap: Record<string, string> = {
      'kate': '11labs-Kate',
      'alloy': '11labs-Alloy',
      'nova': '11labs-Nova',
      'shimmer': '11labs-Shimmer',
      'echo': '11labs-Echo',
      'fable': '11labs-Fable'
    }

    let voiceId = agentConfig.voice_id || 'kate'
    // Convert short name to full Retell ID if needed
    if (voiceMap[voiceId]) {
      voiceId = voiceMap[voiceId]
    }

    console.log('Fetching avatar for voice:', voiceId)
    let avatarUrl = null

    // Fetch avatar from Retell API
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
      } else if (voiceResponse.status === 404) {
        // Voice not found in Retell (likely a cloned voice)
        // Use a default avatar for cloned voices
        console.log('Voice not found in Retell API, using default avatar for cloned voice')
        avatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=cloned-voice&backgroundColor=3b82f6'
      }
    } catch (error) {
      console.error('Error fetching voice avatar:', error)
      // Use default avatar on error
      avatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=default-voice&backgroundColor=3b82f6'
    }

    // Update agent config with avatar
    const { error: updateError } = await supabase
      .from('agent_configs')
      .update({ avatar_url: avatarUrl })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating avatar:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update avatar' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        avatar_url: avatarUrl,
        message: 'Avatar fetched and updated successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in fetch-agent-avatar:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})