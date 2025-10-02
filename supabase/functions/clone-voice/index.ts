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
    // Get authenticated user
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

    // Parse multipart form data
    const formData = await req.formData()
    const audioFile = formData.get('audio')
    const voiceName = formData.get('name') || `${user.email}'s Voice`
    const removeNoise = formData.get('remove_background_noise') === 'true'

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'Audio file is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Cloning voice for user:', user.id)
    console.log('Voice name:', voiceName)
    console.log('Remove noise:', removeNoise)

    // Get ElevenLabs API key
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY')!

    // Create FormData for ElevenLabs API
    const elevenlabsFormData = new FormData()
    elevenlabsFormData.append('name', voiceName as string)
    elevenlabsFormData.append('files', audioFile)
    if (removeNoise) {
      elevenlabsFormData.append('remove_background_noise', 'true')
    }

    console.log('Sending request to ElevenLabs...')

    // Call ElevenLabs voice cloning API
    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenlabsApiKey,
      },
      body: elevenlabsFormData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to clone voice', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log('Voice cloned successfully:', result.voice_id)

    // Save the cloned voice ID to agent_configs
    const voiceId = `11labs-${result.voice_id}`

    const { error: updateError } = await supabase
      .from('agent_configs')
      .update({
        voice_id: voiceId,
        cloned_voice_id: result.voice_id,
        cloned_voice_name: voiceName,
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating agent config:', updateError)
      // Don't fail - voice was cloned successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        voice_id: result.voice_id,
        voice_name: voiceName,
        message: 'Voice cloned successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in clone-voice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
