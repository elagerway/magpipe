import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')

    const { data, error } = await supabase
      .from('voices')
      .select('voice_id, voice_name, is_cloned')
      .eq('is_cloned', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    const voices = data || []

    // For each cloned voice, check if a preview exists in storage — if not, generate one
    if (elevenlabsApiKey) {
      for (const voice of voices) {
        const previewPath = `avatars/voices/${voice.voice_id}-preview.mp3`
        const { data: urlData } = supabase.storage.from('public').getPublicUrl(previewPath)
        const checkRes = await fetch(urlData.publicUrl, { method: 'HEAD' })

        if (checkRes.ok) {
          // Preview already exists
          (voice as any).preview_url = urlData.publicUrl
          continue
        }

        // Generate preview via ElevenLabs TTS
        try {
          const name = voice.voice_name || 'your assistant'
          const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`, {
            method: 'POST',
            headers: {
              'xi-api-key': elevenlabsApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: `Hi there! My name is ${name}. I'm here to help answer your calls and messages. How can I assist you today?`,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          })

          if (ttsRes.ok) {
            const audioBlob = await ttsRes.blob()
            await supabase.storage.from('public').upload(previewPath, audioBlob, {
              contentType: 'audio/mpeg',
              upsert: true,
            })
            const { data: newUrlData } = supabase.storage.from('public').getPublicUrl(previewPath)
            ;(voice as any).preview_url = newUrlData.publicUrl
            console.log(`✅ Generated preview for ${voice.voice_name} (${voice.voice_id})`)
          }
        } catch (e) {
          console.error(`Error generating preview for ${voice.voice_id}:`, e)
        }
      }
    }

    return new Response(
      JSON.stringify({ voices }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in get-cloned-voices:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
