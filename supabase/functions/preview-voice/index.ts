import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { voice_id, text } = await req.json()

    if (!voice_id) {
      return new Response(
        JSON.stringify({ error: 'voice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract the actual voice ID (remove 11labs- or openai- prefix)
    let actualVoiceId = voice_id
    let provider = 'elevenlabs'

    if (voice_id.startsWith('11labs-')) {
      actualVoiceId = voice_id.replace('11labs-', '')
      provider = 'elevenlabs'
    } else if (voice_id.startsWith('openai-')) {
      actualVoiceId = voice_id.replace('openai-', '')
      provider = 'openai'
    }

    const previewText = text || "Hi, this is a sample of what the voice character will sound like when it answers your phone calls"

    // Handle ElevenLabs voices
    if (provider === 'elevenlabs') {
      const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')!

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${actualVoiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenlabsApiKey,
        },
        body: JSON.stringify({
          text: previewText,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          }
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('ElevenLabs API error:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to generate voice preview' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const audioData = await response.arrayBuffer()

      return new Response(audioData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
        },
      })
    }

    // Handle OpenAI voices
    if (provider === 'openai') {
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: actualVoiceId,
          input: previewText,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('OpenAI API error:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to generate voice preview' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const audioData = await response.arrayBuffer()

      return new Response(audioData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
        },
      })
    }

    return new Response(
      JSON.stringify({ error: 'Unsupported voice provider' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in preview-voice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
