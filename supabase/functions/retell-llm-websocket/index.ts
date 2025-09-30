import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

  let greetingSent = false

  socket.onopen = () => {
    console.log('WebSocket connected')

    // Use agent_interrupt to make agent speak first
    const initialGreeting = {
      response_type: "agent_interrupt",
      interrupt_id: 1,
      content: "Hello, this is Pat. How can I help you?",
      content_complete: true,
      no_interruption_allowed: true
    }
    socket.send(JSON.stringify(initialGreeting))
    console.log('Sent agent_interrupt greeting on open:', initialGreeting)
    greetingSent = true
  }

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data)
      console.log('Received message:', message)

      // Handle different message types from Retell
      switch (message.interaction_type) {
        case 'call_details':
          console.log('Call details:', message)
          break

        case 'update_only':
          // User is speaking, no response needed
          console.log('Transcript update:', message.transcript)
          break

        case 'response_required':
          // User finished speaking, we need to respond
          console.log('User said:', message.transcript)

          // Send a simple response
          const response = {
            response_type: "response",
            response_id: message.response_id,
            content: "Hi! I'm Pat, your AI assistant. How can I help you today?",
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