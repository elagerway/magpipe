import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  // Upgrade to WebSocket
  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected websocket', { status: 400 })
  }

  const { socket, response } = Deno.upgradeWebSocket(req)

  socket.onopen = () => {
    console.log('WebSocket connected')
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
            response_id: message.response_id,
            content: "Hi! I'm Pat, your AI assistant. How can I help you today?",
            content_complete: true,
            end_call: false,
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