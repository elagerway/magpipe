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
    // SignalWire sends call details as POST parameters
    const contentType = req.headers.get('content-type') || ''
    let callData: any = {}

    if (contentType.includes('application/json')) {
      callData = await req.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData()
      callData = Object.fromEntries(formData)
    }

    console.log('📞 SWML Handler called with data:')
    console.log(JSON.stringify(callData, null, 2))

    const {
      CallSid,
      From,
      To,
      CallStatus,
    } = callData

    // Extract destination number from SIP URI
    // LiveKit sends: sip:+16042566768@erik-livekit.dapp.signalwire.com
    // We need to extract: +16042566768
    const toNumber = To ? To.replace(/^sip:/i, '').replace(/@.*/, '') : ''
    const fromNumber = From ? From.replace(/^sip:/i, '').replace(/@.*/, '') : ''

    console.log(`📱 Call from ${fromNumber} to ${toNumber}`)

    // Generate SWML script to bridge the call
    const swmlScript = {
      version: '1.0.0',
      sections: {
        main: [
          // Send webhook at call start
          {
            execute: {
              dest: 'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/signalwire-status-webhook',
              method: 'POST',
              params: {
                call_id: CallSid || 'unknown',
                call_state: 'initiated',
                direction: 'outbound',
                from: fromNumber,
                to: toNumber,
                start_time: new Date().toISOString(),
              }
            }
          },
          // Bridge the call to destination
          {
            connect: {
              answer_on_bridge: true,
              from: fromNumber,
              to: toNumber,
              codecs: ['PCMU', 'PCMA'],
              timeout: 30,
              max_duration: 3600,
              on_answered: [
                {
                  execute: {
                    dest: 'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/signalwire-status-webhook',
                    method: 'POST',
                    params: {
                      call_id: CallSid || 'unknown',
                      call_state: 'answered',
                      direction: 'outbound',
                      from: fromNumber,
                      to: toNumber,
                      answered_at: new Date().toISOString(),
                    }
                  }
                }
              ],
              on_ended: [
                {
                  execute: {
                    dest: 'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/signalwire-status-webhook',
                    method: 'POST',
                    params: {
                      call_id: CallSid || 'unknown',
                      call_state: 'completed',
                      direction: 'outbound',
                      from: fromNumber,
                      to: toNumber,
                      end_time: new Date().toISOString(),
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }

    console.log('📤 Returning SWML script:')
    console.log(JSON.stringify(swmlScript, null, 2))

    // Return SWML as JSON
    return new Response(
      JSON.stringify(swmlScript),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )
  } catch (error) {
    console.error('❌ Error generating SWML:', error)

    // Return a simple error SWML
    const errorSwml = {
      version: '1.0.0',
      sections: {
        main: [
          {
            play: {
              url: 'say:We encountered an error processing your call. Please try again later.'
            }
          },
          {
            hangup: {}
          }
        ]
      }
    }

    return new Response(
      JSON.stringify(errorSwml),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200, // Still return 200 so SignalWire processes it
      }
    )
  }
})
