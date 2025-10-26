import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get('SIGNALWIRE_PROJECT_ID')
    const signalwireToken = Deno.env.get('SIGNALWIRE_API_TOKEN')
    const signalwireSpaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL')
    const signalwireSipUrl = Deno.env.get('SIGNALWIRE_SIP_URL') || 'erik-0f619b8e956e.sip.signalwire.com'

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: 'SignalWire configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authenticated user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Allow optional user_email parameter for service role calls
    const requestBody = await req.json().catch(() => ({}))
    const userEmail = requestBody.user_email

    let user
    if (userEmail) {
      // Service role call - look up user by email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', userEmail)
        .single()

      if (userError || !userData) {
        return new Response(
          JSON.stringify({ error: `User not found: ${userEmail}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      user = { id: userData.id, email: userData.email }
    } else {
      // Regular authenticated call
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - no auth header or user_email provided' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const token = authHeader.replace('Bearer ', '')
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token)

      if (userError || !authUser) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      user = authUser
    }

    console.log('Creating SIP endpoint for user:', user.id, user.email)

    // Check if user already has a SIP endpoint
    const { data: userRecord } = await supabase
      .from('users')
      .select('sip_endpoint_id, sip_username')
      .eq('id', user.id)
      .single()

    if (userRecord?.sip_endpoint_id) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'User already has a SIP endpoint',
          sip_username: userRecord.sip_username,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate SIP credentials
    const sipUsername = `pat_${user.id.replace(/-/g, '').substring(0, 16)}`
    const sipPassword = generateSecurePassword()

    console.log('Creating SIP endpoint with username:', sipUsername)

    // Create SIP endpoint in SignalWire
    const sipEndpointResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/relay/rest/endpoints/sip`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(`${signalwireProjectId}:${signalwireToken}`)}`,
        },
        body: JSON.stringify({
          username: sipUsername,
          password: sipPassword,
          caller_id: `Pat - ${user.email}`,
          encryption: 'required',
        }),
      }
    )

    if (!sipEndpointResponse.ok) {
      const errorText = await sipEndpointResponse.text()
      console.error('SignalWire SIP endpoint creation error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create SIP endpoint', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const endpointData = await sipEndpointResponse.json()
    console.log('SIP endpoint created:', endpointData)

    // Update user record with SIP credentials
    // SignalWire WebSocket server format: wss://space-subdomain.sip.signalwire.com
    const { error: updateError } = await supabase
      .from('users')
      .update({
        sip_endpoint_id: endpointData.id,
        sip_username: sipUsername,
        sip_password: sipPassword,
        sip_realm: signalwireSipUrl,
        sip_ws_server: `wss://${signalwireSipUrl}`,
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error updating user with SIP credentials:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to save SIP credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        sip_endpoint_id: endpointData.id,
        sip_username: sipUsername,
        message: 'SIP endpoint created successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in create-user-sip-endpoint:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateSecurePassword(length = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues)
    .map((value) => charset[value % charset.length])
    .join('')
}
