import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Get authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })
    const user = await resolveUser(req, supabaseClient)

    if (!user) {
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

    // Insert into voices table
    const { error: insertError } = await supabase
      .from('voices')
      .insert({
        user_id: user.id,
        voice_id: result.voice_id,
        voice_name: voiceName,
        is_cloned: true,
      })

    if (insertError) {
      console.error('Error inserting voice:', insertError)
      // Don't fail - voice was cloned successfully in ElevenLabs
    }

    // Update agent_configs to use this voice
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
