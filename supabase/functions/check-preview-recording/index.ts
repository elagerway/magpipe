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
    const { call_id, voice_id } = await req.json()

    if (!call_id || !voice_id) {
      return new Response(
        JSON.stringify({ error: 'call_id and voice_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')
    if (!retellApiKey) {
      throw new Error('RETELL_API_KEY not configured')
    }

    // Check call status
    const statusResponse = await fetch(`https://api.retellai.com/v2/get-call/${call_id}`, {
      headers: { 'Authorization': `Bearer ${retellApiKey}` },
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      console.error('Failed to get call status:', statusResponse.status, errorText)
      throw new Error(`Failed to get call status: ${statusResponse.status} - ${errorText}`)
    }

    const callData = await statusResponse.json()
    console.log('Call data:', JSON.stringify(callData, null, 2))

    // If call hasn't ended yet, return no recording
    if (!callData.end_timestamp) {
      return new Response(
        JSON.stringify({ recording_url: null, status: 'in_progress' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If no recording available yet, return waiting
    if (!callData.recording_url) {
      return new Response(
        JSON.stringify({ recording_url: null, status: 'processing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Recording is available! Download and upload to Supabase
    console.log('Recording available, downloading...')
    const recordingResponse = await fetch(callData.recording_url)
    const audioData = await recordingResponse.arrayBuffer()
    console.log('Downloaded recording:', (audioData.byteLength / 1024).toFixed(2), 'KB')

    // Upload to Supabase storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const storagePath = `voice-previews/${voice_id}.mp3`

    const { error: uploadError } = await supabase.storage
      .from('public')
      .upload(storagePath, audioData, {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    if (uploadError) {
      throw new Error(`Failed to upload to storage: ${uploadError.message}`)
    }

    const { data: publicUrl } = supabase.storage
      .from('public')
      .getPublicUrl(storagePath)

    console.log('Uploaded to storage:', publicUrl.publicUrl)

    // Clean up temporary resources from Retell
    console.log('Cleaning up temporary resources...')

    // Get agent_id from call data if available
    if (callData.agent_id) {
      const agentResponse = await fetch(`https://api.retellai.com/get-agent/${callData.agent_id}`, {
        headers: { 'Authorization': `Bearer ${retellApiKey}` },
      })

      if (agentResponse.ok) {
        const agentData = await agentResponse.json()
        const llmId = agentData.response_engine?.llm_id

        // Delete agent
        await fetch(`https://api.retellai.com/delete-agent/${callData.agent_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${retellApiKey}` },
        })
        console.log('Deleted agent:', callData.agent_id)

        // Delete LLM
        if (llmId) {
          await fetch(`https://api.retellai.com/delete-retell-llm/${llmId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${retellApiKey}` },
          })
          console.log('Deleted LLM:', llmId)
        }
      }
    }

    return new Response(
      JSON.stringify({
        recording_url: publicUrl.publicUrl,
        status: 'completed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in check-preview-recording:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
