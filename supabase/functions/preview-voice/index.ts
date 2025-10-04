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
    const { voice_id, text } = await req.json()

    if (!voice_id) {
      return new Response(
        JSON.stringify({ error: 'voice_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if we already have a cached preview for this voice
    const storagePath = `voice-previews/${voice_id}.mp3`

    // Try to download the file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('public')
      .download(storagePath)

    if (!downloadError && fileData) {
      console.log('Found cached preview for voice:', voice_id)
      const audioData = await fileData.arrayBuffer()

      return new Response(audioData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    console.log('No cached preview found, will generate:', downloadError?.message)

    // Preview not cached - generate it now using ElevenLabs
    console.log('Generating preview for voice:', voice_id)

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')
    if (!elevenLabsApiKey) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const previewText = text || 'Hi, this is a preview of my voice. How do I sound?'
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
          text: previewText,
          model_id: 'eleven_turbo_v2_5',
        }),
      }
    )

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text()
      console.error('ElevenLabs error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to generate voice preview' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const audioData = await elevenLabsResponse.arrayBuffer()

    // Cache the preview for future use
    try {
      await supabase.storage
        .from('public')
        .upload(storagePath, audioData, {
          contentType: 'audio/mpeg',
          upsert: true,
        })
      console.log('Cached preview at:', storagePath)
    } catch (storageError) {
      console.error('Failed to cache preview:', storageError)
      // Continue anyway - we can still return the audio
    }

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })

  } catch (error) {
    console.error('Error in preview-voice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
