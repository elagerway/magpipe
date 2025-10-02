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
    console.log('=== UPDATE RETELL TRANSFER TOOL START ===')

    // Get authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No Authorization header provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User authenticated:', user.id)

    // Get user's agent config
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!agentConfig?.retell_agent_id) {
      console.error('No retell_agent_id found')
      return new Response(
        JSON.stringify({ error: 'No agent configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!agentConfig?.retell_llm_id) {
      console.error('No retell_llm_id found')
      return new Response(
        JSON.stringify({ error: 'No LLM configured. Please recreate your agent.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's transfer numbers
    const { data: transferNumbers } = await supabase
      .from('transfer_numbers')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    console.log('Found transfer numbers:', transferNumbers?.length || 0)

    // Get transfer numbers with passcodes
    const transfersWithPasscodes = transferNumbers?.filter(t => t.transfer_secret) || []
    console.log('Transfer numbers with passcodes:', transfersWithPasscodes.length)

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!
    const llmId = agentConfig.retell_llm_id

    console.log('Fetching Retell LLM:', llmId)

    // Get current LLM configuration
    const llmResponse = await fetch(`https://api.retellai.com/get-retell-llm/${llmId}`, {
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
      },
    })

    console.log('Retell LLM API response status:', llmResponse.status)

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text()
      console.error('Failed to get LLM:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to get LLM configuration', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const llm = await llmResponse.json()
    console.log('Got LLM, existing tools count:', llm.general_tools?.length || 0)

    // Build unique tool names using user_id (max 63 chars)
    const userIdShort = user.id.replace(/-/g, '') // 32 chars

    // Get existing tools and remove any old transfer tools for this user
    const existingTools = llm.general_tools || []
    let filteredTools = existingTools.filter((tool: any) => {
      // Remove any tools that start with this user's ID
      if (tool.name.startsWith(userIdShort)) return false
      // Remove old generic transfer tools
      if (tool.name === 'transfer_call' || tool.name === 'transfer_call_immediate' || tool.name.endsWith('_transfer_immed')) return false
      return true
    })

    let updatedTools = [...filteredTools]

    // Build transfer instructions for the general prompt
    let transferInstructions = ''

    if (transferNumbers && transferNumbers.length > 0) {
      // Create transfer tool with requested_person parameter
      const regularToolName = `${userIdShort}_transfer` // 32 + 1 + 8 = 41 chars
      // Supabase anon key for Edge Functions (from project settings)
      const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs'
      const transferToolUrl = `${supabaseUrl}/functions/v1/transfer-call?apikey=${anonKey}`

      const regularTransferTool = {
        type: 'custom',
        name: regularToolName,
        url: `${supabaseUrl}/functions/v1/transfer-call`,
        description: 'Transfer the call after screening and saying goodbye. First say "Transferring you to [person] now" or "Let me transfer you", THEN call this tool.',
        speak_after_execution: false,
        speak_during_execution: false,
        execution_message_description: '',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        parameters: {
          type: 'object',
          properties: {
            requested_person: {
              type: 'string',
              description: 'The name of the person the caller asked to speak with (e.g., "Erik", "Rick"). Leave empty for general transfer requests.',
            }
          }
        }
      }

      updatedTools = [...updatedTools, regularTransferTool]

      // Get list of available transfer destinations
      const labels = transferNumbers.map(t => t.label).filter(l => l).join(', ')

      // Create passcode transfer tools for each transfer number with a passcode
      const passcodeTools = []
      const passcodeMap = new Map() // Map<passcode, {label, toolName}>

      transfersWithPasscodes.forEach((transfer) => {
        const sanitizedLabel = transfer.label.replace(/[^a-zA-Z0-9]/g, '')
        const immediateToolName = `${userIdShort}_pass_${sanitizedLabel}`.substring(0, 63)
        const immediateTransferToolUrl = `${supabaseUrl}/functions/v1/transfer-call-immediate?apikey=${anonKey}`

        const immediateTransferTool = {
          type: 'custom',
          name: immediateToolName,
          url: `${supabaseUrl}/functions/v1/transfer-call-immediate`,
          description: `Transfer immediately when the caller says "${transfer.transfer_secret}". First say "One moment please" or similar brief acknowledgment, THEN call this tool.`,
          speak_after_execution: false,
          speak_during_execution: false,
          execution_message_description: '',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          parameters: {
            type: 'object',
            properties: {
              transfer_number_id: {
                type: 'string',
                description: `Always set to: ${transfer.id}`,
              }
            },
            required: ['transfer_number_id']
          }
        }

        passcodeTools.push(immediateTransferTool)
        passcodeMap.set(transfer.transfer_secret, { label: transfer.label, toolName: immediateToolName, id: transfer.id })
      })

      updatedTools = [...updatedTools, ...passcodeTools]

      // Build prompt
      transferInstructions = `\n\n## CALL TRANSFER\n`
      transferInstructions += `Available transfer destinations: ${labels}\n\n`

      // If there are passcodes, add emergency passcode section
      if (passcodeTools.length > 0) {
        transferInstructions += `### Emergency Passcodes\n`
        passcodeMap.forEach((info, passcode) => {
          transferInstructions += `- If caller says "${passcode}" at ANY point, immediately use ${info.toolName} with transfer_number_id: "${info.id}"\n`
        })
        transferInstructions += `\n`
      }

      // Build lists of people with and without passcodes
      const peopleWithPasscodes = transfersWithPasscodes.map(t => t.label).filter(l => l)
      const peopleWithoutPasscodes = transferNumbers.filter(t => !t.transfer_secret).map(t => t.label).filter(l => l)

      console.log('People WITH passcodes:', peopleWithPasscodes)
      console.log('People WITHOUT passcodes:', peopleWithoutPasscodes)

      // Person-specific transfer logic
      transferInstructions += `### Person-Specific Transfer Request\n`
      transferInstructions += `When caller asks for a specific person:\n`
      transferInstructions += `1. Ask for caller's name AND reason for calling\n`
      transferInstructions += `2. Then follow these rules:\n\n`

      // Add instructions for people WITHOUT passcodes first (direct transfer)
      if (peopleWithoutPasscodes.length > 0) {
        transferInstructions += `People who can be transferred immediately (no passcode needed):\n`
        peopleWithoutPasscodes.forEach(person => {
          transferInstructions += `- ${person}: Say "Transferring you to ${person} now" then use ${regularToolName} with requested_person="${person}"\n`
        })
        transferInstructions += `\n`
      }

      // Add instructions for people WITH passcodes (busy + wait for passcode)
      if (peopleWithPasscodes.length > 0) {
        transferInstructions += `People who require a passcode:\n`
        peopleWithPasscodes.forEach(person => {
          transferInstructions += `- ${person}: Say "I'm sorry ${person} is busy. Can I take a message?" Then wait for passcode or take message\n`
        })
        transferInstructions += `\n`
      }

      transferInstructions += `For anyone else not listed: Take a message\n\n`

      // General transfer logic
      transferInstructions += `### General Transfer Request\n`
      transferInstructions += `When caller asks to speak with "someone" or makes a general transfer request:\n`
      transferInstructions += `1. Ask for caller's name AND reason for calling\n`

      if (passcodeTools.length > 0) {
        transferInstructions += `2. Say: "I'm sorry everyone is busy at the moment. Can I take a message or maybe I can help?"\n`
        transferInstructions += `3. If caller says a passcode, use the corresponding passcode tool\n`
        transferInstructions += `4. Otherwise, take a message\n`
      } else {
        transferInstructions += `2. Say: "Let me transfer you"\n`
        transferInstructions += `3. Use ${regularToolName} without requested_person parameter\n`
      }
    }

    // Get current LLM prompt and update with transfer instructions
    const currentPrompt = llm.general_prompt || ''

    // Remove any existing transfer sections (check all formats)
    let updatedPrompt = currentPrompt
    const withPasscodeStart = currentPrompt.indexOf('\n\n## CALL TRANSFER WITH SECRET PASSCODE')
    const regularStart = currentPrompt.indexOf('\n\n## CALL TRANSFER')
    const oldSectionStart = currentPrompt.indexOf('\n\nCALL TRANSFER:')
    const urgentSectionStart = currentPrompt.indexOf('\n\n## URGENT: SECRET PASSCODE')

    if (withPasscodeStart !== -1) {
      updatedPrompt = currentPrompt.substring(0, withPasscodeStart)
    } else if (urgentSectionStart !== -1) {
      updatedPrompt = currentPrompt.substring(0, urgentSectionStart)
    } else if (regularStart !== -1) {
      updatedPrompt = currentPrompt.substring(0, regularStart)
    } else if (oldSectionStart !== -1) {
      updatedPrompt = currentPrompt.substring(0, oldSectionStart)
    }

    updatedPrompt += transferInstructions

    console.log('Updating LLM with transfer tools and prompt')
    console.log('New tools count:', updatedTools.length)
    console.log('=== TRANSFER INSTRUCTIONS ===')
    console.log(transferInstructions)
    console.log('=== END TRANSFER INSTRUCTIONS ===')

    // Update the LLM with both tools and prompt
    const updateResponse = await fetch(`https://api.retellai.com/update-retell-llm/${llmId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        general_tools: updatedTools,
        general_prompt: updatedPrompt,
      }),
    })

    console.log('Update response status:', updateResponse.status)

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Failed to update LLM. Status:', updateResponse.status)
      console.error('Error response:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to update LLM configuration', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const updatedLlm = await updateResponse.json()
    console.log('LLM updated successfully!')
    console.log('Updated LLM tools count:', updatedLlm.general_tools?.length || 0)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transfer tool added to LLM',
        llm_id: llmId,
        tools_count: updatedLlm.general_tools?.length || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in update-retell-transfer-tool:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
