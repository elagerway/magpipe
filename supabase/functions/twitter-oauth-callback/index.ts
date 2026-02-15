/**
 * Twitter OAuth 2.0 Callback Handler
 *
 * Handles the redirect from X after user authorization.
 * Exchanges the auth code for access + refresh tokens using PKCE.
 * Stores tokens in twitter_oauth_tokens table.
 *
 * Also provides the /init endpoint to start the OAuth flow.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const TWITTER_CLIENT_ID = Deno.env.get('TWITTER_CLIENT_ID')!
const TWITTER_CLIENT_SECRET = Deno.env.get('TWITTER_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/twitter-oauth-callback`
const SCOPES = 'tweet.read tweet.write users.read offline.access'

function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, length)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

Deno.serve(async (req) => {
  // === CORS preflight — must be first ===
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
    // Verify admin auth
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
    const codeVerifier = generateRandomString(64)
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // Store state + code_verifier in DB
    await supabase.from('twitter_oauth_state').insert({
      state,
      code_verifier: codeVerifier,
    })

    const authUrl = `https://twitter.com/i/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(TWITTER_CLIENT_ID)}&` +
      `redirect_uri=${encodeURIComponent(CALLBACK_URL)}&` +
      `scope=${encodeURIComponent(SCOPES)}&` +
      `state=${state}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // === CALLBACK: Handle redirect from X ===
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

  // Look up code_verifier from state
  const { data: stateRow, error: stateError } = await supabase
    .from('twitter_oauth_state')
    .select('code_verifier')
    .eq('state', state)
    .single()

  if (stateError || !stateRow) {
    return redirectToAdmin('error=Invalid+or+expired+state')
  }

  // Clean up used state
  await supabase.from('twitter_oauth_state').delete().eq('state', state)

  // Exchange code for tokens
  const basicAuth = btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`)

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: CALLBACK_URL,
      code_verifier: stateRow.code_verifier,
    }),
  })

  const tokenData = await tokenRes.json()

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('Token exchange failed:', tokenData)
    return redirectToAdmin(`error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'Token exchange failed')}`)
  }

  // Calculate expiry
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 7200) * 1000).toISOString()

  // Upsert tokens — delete old ones, insert new
  await supabase.from('twitter_oauth_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('twitter_oauth_tokens').insert({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    scope: tokenData.scope || SCOPES,
  })

  return redirectToAdmin('twitter_connected=true')
})

function redirectToAdmin(params: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://magpipe.ai/admin?tab=blog&${params}`,
    },
  })
}
