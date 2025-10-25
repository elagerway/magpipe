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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's agent config
    const { data: agentConfig, error: configError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !agentConfig) {
      return new Response(
        JSON.stringify({ error: 'Agent not configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const retellApiKey = Deno.env.get('RETELL_API_KEY')!
    const webhookUrl = Deno.env.get('RETELL_WEBHOOK_URL') || `${supabaseUrl}/functions/v1/webhook-retellai-analysis`

    console.log('Configuring webhook for agent:', agentConfig.retell_agent_id)
    console.log('Webhook URL:', webhookUrl)

    // Update Retell agent with webhook URL
    const updateResponse = await fetch(`https://api.retellai.com/update-agent/${agentConfig.retell_agent_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${retellApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_url: webhookUrl,
      }),
    })

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Retell API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to configure webhook', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const updatedAgent = await updateResponse.json()
    console.log('Webhook configured successfully:', updatedAgent)

    return new Response(
      JSON.stringify({
        success: true,
        webhook_url: webhookUrl,
        agent_id: agentConfig.retell_agent_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in configure-retell-webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})