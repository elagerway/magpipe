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

    const body = await req.json().catch(() => ({}))
    const { agent_id } = body

    // Create service role client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get agent config — by agent_id if provided, otherwise all agents for user
    let query = supabase
      .from('agent_configs')
      .select('id, voice_id, avatar_url')
      .eq('user_id', user.id)

    if (agent_id) {
      query = query.eq('id', agent_id)
    }

    const { data: agents, error: configError } = await query

    if (configError || !agents?.length) {
      console.error('Agent config error:', configError)
      return new Response(
        JSON.stringify({ error: 'No agents found', details: configError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: Array<{ agent_id: string; avatar_url: string | null; error?: string }> = []

    for (const agent of agents) {
      const voiceId = agent.voice_id
      if (!voiceId) {
        results.push({ agent_id: agent.id, avatar_url: null, error: 'No voice set' })
        continue
      }

      // Check if we have a pre-generated avatar in storage for this voice
      const { data: urlData } = supabase.storage.from('public').getPublicUrl(`avatars/voices/${voiceId}.jpg`)
      const storedAvatarUrl = urlData.publicUrl

      // Verify the file actually exists
      const checkRes = await fetch(storedAvatarUrl, { method: 'HEAD' })
      if (checkRes.ok) {
        // Update agent config with the stored avatar
        await supabase
          .from('agent_configs')
          .update({ avatar_url: storedAvatarUrl })
          .eq('id', agent.id)

        console.log(`✅ Avatar set for agent ${agent.id} from stored voice avatar: ${voiceId}`)
        results.push({ agent_id: agent.id, avatar_url: storedAvatarUrl })
        continue
      }

      // No stored avatar — try ElevenLabs API for cloned voices
      const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')
      if (!elevenlabsApiKey || voiceId.startsWith('openai-')) {
        results.push({ agent_id: agent.id, avatar_url: null, error: 'No avatar available for this voice' })
        continue
      }

      try {
        const voiceRes = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
          headers: { 'xi-api-key': elevenlabsApiKey },
        })

        if (!voiceRes.ok) {
          results.push({ agent_id: agent.id, avatar_url: null, error: `ElevenLabs API error: ${voiceRes.status}` })
          continue
        }

        const voiceData = await voiceRes.json()
        const imageUrl = voiceData.sharing?.image_url || voiceData.image_url

        if (!imageUrl) {
          results.push({ agent_id: agent.id, avatar_url: null, error: 'No image available for this voice' })
          continue
        }

        // Download and re-upload to our storage
        const imageRes = await fetch(imageUrl)
        if (!imageRes.ok) {
          results.push({ agent_id: agent.id, avatar_url: null, error: `Failed to download image` })
          continue
        }

        const imageBlob = await imageRes.blob()
        const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
        const ext = contentType.includes('png') ? 'png' : 'jpg'
        const fileName = `avatars/${agent.id}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('public')
          .upload(fileName, imageBlob, { contentType, upsert: true })

        if (uploadError) {
          results.push({ agent_id: agent.id, avatar_url: null, error: 'Failed to upload image' })
          continue
        }

        const { data: newUrlData } = supabase.storage.from('public').getPublicUrl(fileName)
        const avatarUrl = newUrlData.publicUrl

        await supabase
          .from('agent_configs')
          .update({ avatar_url: avatarUrl })
          .eq('id', agent.id)

        console.log(`✅ Avatar saved for agent ${agent.id}: ${avatarUrl}`)
        results.push({ agent_id: agent.id, avatar_url: avatarUrl })
      } catch (e) {
        console.error(`Error fetching avatar for agent ${agent.id}:`, e)
        results.push({ agent_id: agent.id, avatar_url: null, error: e.message })
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
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
