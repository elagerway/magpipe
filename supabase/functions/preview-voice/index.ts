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

    // Get the public URL for the preview
    const { data: publicUrl } = supabase.storage
      .from('public')
      .getPublicUrl(storagePath)

    // Try to fetch the file to see if it exists
    const testResponse = await fetch(publicUrl.publicUrl, { method: 'HEAD' })

    if (testResponse.ok) {
      console.log('Found cached preview for voice:', voice_id)
      // Fetch and return the audio file
      const audioResponse = await fetch(publicUrl.publicUrl)
      const audioData = await audioResponse.arrayBuffer()

      return new Response(audioData, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // Preview not generated yet
    return new Response(
      JSON.stringify({
        error: 'Preview not yet generated for this voice.',
        generate_url: 'http://localhost:3000/voice-preview-generator.html'
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in preview-voice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
