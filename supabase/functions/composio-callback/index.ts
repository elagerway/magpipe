import { createClient } from 'npm:@supabase/supabase-js@2'
import { APP_URL } from '../_shared/config.ts'
import { reportError } from '../_shared/error-reporter.ts'

// Composio redirects the browser here after OAuth completes. We look up the
// pending user_integrations row by integration_id (passed through from
// composio-connect), verify the connection is ACTIVE on Composio's side, and
// flip the row to connected. No JWT — this is a browser-driven webhook.

const COMPOSIO_API_BASE = 'https://backend.composio.dev'

// Same-origin path guard so a tampered redirect_path can't bounce users to
// an external origin via this server.
function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) return '/apps'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/apps'
  if (raw.includes('://')) return '/apps'
  return raw
}

function buildRedirectUrl(frontendUrl: string, redirectPath: string, params: Record<string, string>): string {
  const target = new URL(`${frontendUrl}${redirectPath}`)
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
  return target.toString()
}

// Composio is the token vault — they redact raw tokens (incl. id_token) in
// API responses. To get the user's verified Gmail address we call the
// GMAIL_GET_PROFILE action via tools/execute, which proxies the call through
// Composio's stored token. Returns null if the call fails (we don't fail
// the connect just because we couldn't fetch the profile).
async function fetchGmailProfileEmail(
  apiKey: string,
  composioUserId: string
): Promise<string | null> {
  try {
    const res = await fetch(`${COMPOSIO_API_BASE}/api/v3/tools/execute/GMAIL_GET_PROFILE`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: composioUserId, arguments: {} })
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.successful) return null
    const email = json.data?.response_data?.emailAddress
    return typeof email === 'string' ? email : null
  } catch (err) {
    console.error('GMAIL_GET_PROFILE failed:', err)
    return null
  }
}

Deno.serve(async (req) => {
  const frontendUrl = APP_URL || Deno.env.get('FRONTEND_URL') || 'https://magpipe.ai'

  try {
    const url = new URL(req.url)
    const integrationId = url.searchParams.get('integration_id')
    const redirectPath = sanitizeRedirectPath(url.searchParams.get('redirect_path'))

    if (!integrationId) {
      return Response.redirect(buildRedirectUrl(frontendUrl, '/apps', { integration_error: 'missing_integration_id' }), 303)
    }

    const composioApiKey = Deno.env.get('COMPOSIO_API_KEY')
    if (!composioApiKey) {
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_error: 'composio_not_configured' }), 303)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: integration, error: fetchError } = await supabase
      .from('user_integrations')
      .select('id, user_id, config')
      .eq('id', integrationId)
      .single()

    if (fetchError || !integration) {
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_error: 'integration_not_found' }), 303)
    }

    const connectionId = integration.config?.connection_id
    if (!connectionId) {
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_error: 'missing_connection_id' }), 303)
    }

    // Fetch live state from Composio
    const composioRes = await fetch(`${COMPOSIO_API_BASE}/api/v3/connected_accounts/${connectionId}`, {
      headers: { 'x-api-key': composioApiKey }
    })

    if (!composioRes.ok) {
      console.error('Composio fetch error:', composioRes.status, await composioRes.text())
      await supabase.from('user_integrations').update({ status: 'error' }).eq('id', integrationId)
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_error: 'composio_fetch_failed' }), 303)
    }

    const composioData = await composioRes.json()
    const status: string = composioData.status || composioData.state?.val?.status || 'UNKNOWN'
    const composioUserId: string | undefined = composioData.user_id

    // IDOR guard: anyone who guesses an integration_id UUID could otherwise
    // race a legitimate ACTIVE Composio account to flip an unrelated row.
    // Reject if Composio's stored user_id doesn't match the row's owner.
    if (composioUserId && composioUserId !== integration.user_id) {
      console.error('Composio user_id mismatch', {
        connectionId,
        composioUserId,
        expected: integration.user_id
      })
      await supabase.from('user_integrations').update({ status: 'error' }).eq('id', integrationId)
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_error: 'user_mismatch' }), 303)
    }

    if (status !== 'ACTIVE') {
      const newStatus = status === 'FAILED' || status === 'EXPIRED' ? 'error' : 'pending'
      await supabase.from('user_integrations').update({ status: newStatus }).eq('id', integrationId)
      return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, {
        integration_error: 'connection_not_active',
        composio_status: status
      }), 303)
    }

    // Resolve the verified Gmail address by proxying through Composio's
    // tools/execute. composioUserId is the Magpipe user UUID (we passed it as
    // user_id when initiating the connection).
    const userEmail = composioUserId
      ? await fetchGmailProfileEmail(composioApiKey, composioUserId)
      : null

    await supabase
      .from('user_integrations')
      .update({
        status: 'connected',
        external_user_id: userEmail,
        connected_at: new Date().toISOString()
      })
      .eq('id', integrationId)

    return Response.redirect(buildRedirectUrl(frontendUrl, redirectPath, { integration_connected: 'gmail_composio' }), 303)

  } catch (error) {
    console.error('Error in composio-callback:', error)
    const _sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await reportError(_sb, {
      error_type: 'composio_callback_error',
      error_message: error instanceof Error ? error.message : String(error),
      error_code: 'composio-callback:catch',
      source: 'composio',
    })
    return Response.redirect(buildRedirectUrl(frontendUrl, '/apps', { integration_error: 'callback_failed' }), 303)
  }
})
