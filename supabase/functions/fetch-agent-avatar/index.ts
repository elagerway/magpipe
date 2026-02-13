import { createClient } from "npm:@supabase/supabase-js@2"
import { resolveUser } from "../_shared/api-auth.ts"
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Resolve user via JWT or API key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    )

    const user = await resolveUser(req, supabaseClient)
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create service role client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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