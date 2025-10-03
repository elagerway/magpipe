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
    const { voice_id, sample_text } = await req.json()

    if (!voice_id || !sample_text) {
      return new Response(
        JSON.stringify({ error: 'voice_id and sample_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')
    if (!retellApiKey) {
      throw new Error('RETELL_API_KEY not configured')
    }

    // Step 1: Create a temporary Retell LLM
    console.log('Creating temporary LLM for voice:', voice_id)
    const llmResponse = await fetch('https://api.retellai.com/create-retell-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        general_prompt: sample_text,
        begin_message: sample_text,
      }),
    })

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text()
      throw new Error(`Failed to create LLM: ${errorText}`)
    }

    const llm = await llmResponse.json()
    console.log('Created LLM:', llm.llm_id)

    // Step 2: Create a temporary agent
    console.log('Creating temporary agent...')
    const agentResponse = await fetch('https://api.retellai.com/create-agent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_name: `Preview Generator - ${voice_id}`,
        voice_id: voice_id,
        response_engine: {
          type: 'retell-llm',
          llm_id: llm.llm_id,
        },
        enable_backchannel: false,
        enable_transcript_persistence: true,
        enable_call_recording: true,
        opt_out_sensitive_data_storage: false,
        agent_speaks_first: true,
      }),
    })

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text()
      // Clean up LLM
      await fetch(`https://api.retellai.com/delete-retell-llm/${llm.llm_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${retellApiKey}` },
      })
      throw new Error(`Failed to create agent: ${errorText}`)
    }

    const agent = await agentResponse.json()
    console.log('Created agent:', agent.agent_id)

    // Step 3: Create a web call
    console.log('Creating web call...')
    const callResponse = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agent.agent_id,
      }),
    })

    if (!callResponse.ok) {
      const errorText = await callResponse.text()
      // Clean up
      await fetch(`https://api.retellai.com/delete-agent/${agent.agent_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${retellApiKey}` },
      })
      await fetch(`https://api.retellai.com/delete-retell-llm/${llm.llm_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${retellApiKey}` },
      })
      throw new Error(`Failed to create web call: ${errorText}`)
    }

    const call = await callResponse.json()
    console.log('Created web call:', call.call_id)

    return new Response(
      JSON.stringify({
        call_id: call.call_id,
        access_token: call.access_token,
        agent_id: agent.agent_id,
        llm_id: llm.llm_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in generate-voice-preview:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
