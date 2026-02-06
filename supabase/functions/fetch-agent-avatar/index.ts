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
      voice_id: agentConfig.voice_id,
      has_avatar: !!agentConfig.avatar_url
    })

    const voiceId = agentConfig.voice_id || 'kate'
    console.log('Generating avatar for voice:', voiceId)

    // Generate avatar based on voice ID
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${voiceId}&backgroundColor=3b82f6`

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