/**
 * LinkedIn OAuth 2.0 Callback Handler
 *
 * Handles the redirect from LinkedIn after user authorization.
 * Exchanges the auth code for access + refresh tokens.
 * Stores tokens in linkedin_oauth_tokens table.
 *
 * Also provides the /init endpoint to start the OAuth flow.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CALLBACK_URL = 'https://api.magpipe.ai/functions/v1/linkedin-oauth-callback'
const SCOPES = 'openid profile w_member_social'

function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, length)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  const url = new URL(req.url)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // === INIT: Start OAuth flow ===
  if (url.searchParams.get('action') === 'init') {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const state = generateRandomString(32)

    await supabase.from('linkedin_oauth_state').insert({ state })

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(LINKEDIN_CLIENT_ID)}&` +
      `redirect_uri=${encodeURIComponent(CALLBACK_URL)}&` +
      `scope=${encodeURIComponent(SCOPES)}&` +
      `state=${state}`

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // === CALLBACK: Handle redirect from LinkedIn ===
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    const desc = url.searchParams.get('error_description') || error
    return redirectToAdmin(`error=${encodeURIComponent(desc)}`)
  }

  if (!code || !state) {
    return redirectToAdmin('error=Missing+code+or+state')
  }

  // Validate state
  const { data: stateRow, error: stateError } = await supabase
    .from('linkedin_oauth_state')
    .select('id')
    .eq('state', state)
    .single()

  if (stateError || !stateRow) {
    return redirectToAdmin('error=Invalid+or+expired+state')
  }

  await supabase.from('linkedin_oauth_state').delete().eq('state', state)

  // Exchange code for tokens
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_URL,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('LinkedIn token exchange failed:', tokenData)
    return redirectToAdmin(`error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'Token exchange failed')}`)
  }

  // Fetch LinkedIn person ID via OpenID userinfo
  const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  })
  const userData = await userRes.json()
  const personId = userData.sub || null

  // Fetch org ID — first org page this user administers
  let orgId: string | null = null
  try {
    const orgRes = await fetch('https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=1', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'X-Restli-Protocol-Version': '2.0.0' },
    })
    const orgData = await orgRes.json()
    const orgUrn = orgData?.elements?.[0]?.organizationalTarget
    if (orgUrn) {
      orgId = orgUrn.replace('urn:li:organization:', '')
    }
  } catch (e) {
    console.error('Failed to fetch org ID:', e)
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 5183944) * 1000).toISOString()

  // Replace any existing token
  await supabase.from('linkedin_oauth_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('linkedin_oauth_tokens').insert({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: expiresAt,
    person_id: personId,
    org_id: orgId,
    scope: tokenData.scope || SCOPES,
  })

  return redirectToAdmin('linkedin_connected=true')
})

function redirectToAdmin(params: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://magpipe.ai/admin?tab=blog&${params}`,
    },
  })
}
