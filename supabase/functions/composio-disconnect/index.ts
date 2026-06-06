import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Disconnects a Composio-managed integration: revokes the connection on
// Composio's side (so they drop the OAuth token), then deletes the local
// user_integrations row. If the Composio call fails, we still delete the
// local row but log loudly so an operator can clean up the orphan.

const COMPOSIO_API_BASE = 'https://backend.composio.dev'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const composioApiKey = Deno.env.get('COMPOSIO_API_KEY')
    if (!composioApiKey) {
      return new Response(JSON.stringify({ error: 'Composio not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json().catch(() => ({}))
    const integrationId: string | undefined = body.integration_id
    if (!integrationId) {
      return new Response(JSON.stringify({ error: 'integration_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Look up the row, enforce ownership, and read the connection_id
    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('id, user_id, config')
      .eq('id', integrationId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !integration) {
      return new Response(JSON.stringify({ error: 'Integration not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const connectionId = integration.config?.connection_id
    let composioRevoked = false
    let composioError: string | null = null

    if (connectionId) {
      try {
        const res = await fetch(`${COMPOSIO_API_BASE}/api/v3/connected_accounts/${connectionId}`, {
          method: 'DELETE',
          headers: { 'x-api-key': composioApiKey }
        })
        if (res.ok) {
          composioRevoked = true
        } else {
          composioError = `Composio DELETE returned ${res.status}: ${await res.text()}`
          console.error(composioError)
        }
      } catch (err) {
        composioError = err instanceof Error ? err.message : 'unknown'
        console.error('Composio DELETE threw:', err)
      }
    }

    // Delete the local row regardless — the user clicked disconnect, we honor
    // intent. If Composio failed, the orphan token will be visible in the
    // Composio dashboard for manual cleanup.
    const { error: deleteError } = await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integrationId)
      .eq('user_id', user.id)

    if (deleteError) {
      return new Response(JSON.stringify({
        error: 'Composio revoked but local delete failed: ' + deleteError.message,
        composio_revoked: composioRevoked
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      composio_revoked: composioRevoked,
      composio_error: composioError
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in composio-disconnect:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
