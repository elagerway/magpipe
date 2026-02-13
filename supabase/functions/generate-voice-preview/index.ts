import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const { voice_id, sample_text, voice_stack } = await req.json()

    if (!voice_id || !sample_text) {
      return new Response(
        JSON.stringify({ error: 'voice_id and sample_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate voice preview using ElevenLabs TTS
    console.log('Generating preview using ElevenLabs TTS')

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!elevenLabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured')
    }

    const cleanVoiceId = voice_id.replace('11labs-', '')

    // Generate audio with ElevenLabs
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${cleanVoiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sample_text,
          model_id: 'eleven_turbo_v2_5',
        }),
      }
    )

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text()
      console.error('ElevenLabs error:', errorText)
      throw new Error('Failed to generate voice preview with ElevenLabs')
    }

    const audioData = await elevenLabsResponse.arrayBuffer()

    // Save to storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const storagePath = `voice-previews/${voice_id}.mp3`
    await supabase.storage
      .from('public')
      .upload(storagePath, audioData, {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    console.log('Saved preview to storage:', storagePath)

    return new Response(
      JSON.stringify({ success: true, message: 'Preview generated and saved' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in generate-voice-preview:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
