import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { API_URL } from '../_shared/config.ts'

// Initiates a Composio-managed Gmail (or other toolkit) connection for the
// authenticated Magpipe user. Returns a redirect_url the frontend opens to
// complete OAuth. Composio holds the tokens; we only persist a connection_id.

interface ComposioConnectBody {
  toolkit?: string        // toolkit slug, defaults to "gmail"
  redirect_path?: string  // where to send the user back to after OAuth completes
}

const COMPOSIO_API_BASE = 'https://backend.composio.dev'

// Reject anything that isn't a same-origin path. Prevents an attacker from
// crafting a redirect_path that resolves to an external host once the callback
// embeds it in the redirect URL.
function sanitizeRedirectPath(raw: string | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  if (raw.includes('://')) return null
  return raw
}

// Map a magpipe toolkit choice to (auth_config_id, integration_providers.slug)
function resolveToolkit(toolkit: string): { authConfigId: string; providerSlug: string } | null {
  if (toolkit === 'gmail') {
    const id = Deno.env.get('COMPOSIO_GMAIL_AUTH_CONFIG_ID')
    if (!id) return null
    return { authConfigId: id, providerSlug: 'google_email' }
  }
  return null
}

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
      return new Response(JSON.stringify({ error: 'Composio not configured (missing COMPOSIO_API_KEY)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: ComposioConnectBody = await req.json().catch(() => ({}))
    const toolkit = body.toolkit || 'gmail'

    const resolved = resolveToolkit(toolkit)
    if (!resolved) {
      return new Response(JSON.stringify({ error: `Composio toolkit '${toolkit}' is not configured` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Resolve the matching integration_providers row (we reuse google_email so
    // existing UIs see the connection without schema changes)
    const { data: providerData, error: providerError } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', resolved.providerSlug)
      .eq('enabled', true)
      .single()

    if (providerError || !providerData) {
      return new Response(JSON.stringify({ error: `Provider '${resolved.providerSlug}' not registered` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Insert pending row up-front so the callback has something to update
    const { data: integrationRow, error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider_id: providerData.id,
        status: 'pending',
        config: {
          composio_managed: true,
          auth_config_id: resolved.authConfigId,
          toolkit
        }
      })
      .select('id')
      .single()

    if (insertError || !integrationRow) {
      return new Response(JSON.stringify({ error: `Failed to create integration row: ${insertError?.message || 'unknown'}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Composio will redirect the browser back here once OAuth finishes. We
    // pass our own integration_id so the callback can resolve the right row.
    const callbackUrl = new URL(`${API_URL}/functions/v1/composio-callback`)
    callbackUrl.searchParams.set('integration_id', integrationRow.id)
    const safeRedirect = sanitizeRedirectPath(body.redirect_path)
    if (safeRedirect) callbackUrl.searchParams.set('redirect_path', safeRedirect)

    const composioRes = await fetch(`${COMPOSIO_API_BASE}/api/v3/connected_accounts`, {
      method: 'POST',
      headers: {
        'x-api-key': composioApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_config: { id: resolved.authConfigId },
        connection: {
          user_id: user.id,
          callback_url: callbackUrl.toString()
        }
      })
    })

    if (!composioRes.ok) {
      const errText = await composioRes.text()
      console.error('Composio /connected_accounts error:', composioRes.status, errText)
      await supabase.from('user_integrations').update({ status: 'error' }).eq('id', integrationRow.id)
      return new Response(JSON.stringify({ error: `Composio rejected the link request: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const result = await composioRes.json()
    const connectionId: string | undefined = result.connection_id || result.connected_account_id || result.id
    const redirectUrl: string | undefined = result.redirect_url

    if (!connectionId || !redirectUrl) {
      console.error('Composio response missing connection_id or redirect_url:', result)
      await supabase.from('user_integrations').update({ status: 'error' }).eq('id', integrationRow.id)
      return new Response(JSON.stringify({ error: 'Composio response was incomplete' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Persist the connection_id so the callback can fetch the live status
    await supabase
      .from('user_integrations')
      .update({
        config: {
          composio_managed: true,
          auth_config_id: resolved.authConfigId,
          connection_id: connectionId,
          toolkit
        }
      })
      .eq('id', integrationRow.id)

    return new Response(JSON.stringify({
      url: redirectUrl,
      integration_id: integrationRow.id,
      connection_id: connectionId
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in composio-connect:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
