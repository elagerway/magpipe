import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  console.log('Incoming request:', req.method, req.url)
  console.log('Headers:', Object.fromEntries(req.headers))

  // Upgrade to WebSocket
  if (req.headers.get('upgrade') !== 'websocket') {
    console.log('Not a websocket upgrade request')
    return new Response('Expected websocket', { status: 400 })
  }

  console.log('Upgrading to WebSocket...')
  const { socket, response } = Deno.upgradeWebSocket(req)
  console.log('WebSocket upgrade successful')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

  let greetingSent = false
  let userId = null
  let systemPrompt = null
  let conversationHistory: Array<{ role: string; content: string }> = []

  socket.onopen = () => {
    console.log('WebSocket connected')

    // Send initial greeting - will be customized after we get call_details
    const greetingText = "Hi, how can I help you today?"
    const initialGreeting = {
      response_type: "agent_interrupt",
      interrupt_id: 1,
      content: greetingText,
      content_complete: true,
      no_interruption_allowed: true
    }
    socket.send(JSON.stringify(initialGreeting))
    console.log('Sent initial greeting on open:', initialGreeting)
    greetingSent = true

    // Add greeting to conversation history
    conversationHistory.push({
      role: 'assistant',
      content: greetingText
    })
  }

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data)
      console.log('Received message:', message)

      // Handle different message types from Retell
      switch (message.interaction_type) {
        case 'call_details':
          console.log('Call details:', message)

          // Get user_id from metadata and load their system prompt
          userId = message.call?.metadata?.user_id
          console.log('User ID from metadata:', userId)
          if (userId) {
            const { data: agentConfig, error: configError } = await supabase
              .from('agent_configs')
              .select('system_prompt')
              .eq('user_id', userId)
              .single()

            if (configError) {
              console.error('Error loading agent config:', configError)
            }

            systemPrompt = agentConfig?.system_prompt || 'You are a friendly, professional AI assistant.'
            console.log('Loaded system prompt for user:', userId, '(length:', systemPrompt?.length, 'chars)')
          } else {
            console.warn('No user_id in call metadata, using default prompt')
            systemPrompt = 'You are a friendly, professional AI assistant.'
          }
          break

        case 'update_only':
          // User is speaking, no response needed
          console.log('Transcript update:', message.transcript)
          break

        case 'response_required':
          // User finished speaking, we need to respond
          console.log('User said:', message.transcript)

          let aiResponse = ''

          try {
            // Add user message to conversation history
            conversationHistory.push({
              role: 'user',
              content: message.transcript
            })

            // Generate response using OpenAI
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: systemPrompt || 'You are a friendly, professional AI assistant that answers phone calls.'
                  },
                  ...conversationHistory
                ],
                temperature: 0.7,
                max_tokens: 150,
              }),
            })

            if (!openaiResponse.ok) {
              const errorText = await openaiResponse.text()
              console.error('OpenAI API error:', errorText)
              throw new Error(`OpenAI API failed: ${errorText}`)
            }

            const openaiData = await openaiResponse.json()
            aiResponse = openaiData.choices[0].message.content

            // Add assistant response to conversation history
            conversationHistory.push({
              role: 'assistant',
              content: aiResponse
            })
          } catch (error) {
            console.error('Error generating AI response:', error)
            // Fallback to a simple response if OpenAI fails
            aiResponse = "I'm sorry, I'm having trouble processing that. Could you please repeat what you need help with?"
          }

          // Always send a response back to Retell
          const response = {
            response_type: "response",
            response_id: message.response_id,
            content: aiResponse,
            content_complete: true,
          }

          socket.send(JSON.stringify(response))
          console.log('Sent response:', response)
          break

        case 'ping_pong':
          // Keep-alive ping
          socket.send(JSON.stringify({ interaction_type: 'ping_pong' }))
          break

        default:
          console.log('Unknown interaction type:', message.interaction_type)
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  }

  socket.onerror = (error) => {
    console.error('WebSocket error:', error)
  }

  socket.onclose = () => {
    console.log('WebSocket closed')
  }

  return response
})