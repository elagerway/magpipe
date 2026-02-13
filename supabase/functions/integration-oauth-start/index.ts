import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64Url as base64UrlEncode } from 'jsr:@std/encoding@1/base64url';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Generate PKCE code verifier (43-128 chars, URL-safe)
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Generate PKCE code challenge from verifier (SHA256 hash, base64url encoded)
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

// Environment variable mapping for provider credentials
const PROVIDER_CREDENTIALS: Record<string, { clientIdEnv: string; clientSecretEnv?: string }> = {
  cal_com: { clientIdEnv: 'CAL_COM_CLIENT_ID', clientSecretEnv: 'CAL_COM_CLIENT_SECRET' },
  slack: { clientIdEnv: 'SLACK_CLIENT_ID', clientSecretEnv: 'SLACK_CLIENT_SECRET' },
  hubspot: { clientIdEnv: 'HUBSPOT_CLIENT_ID', clientSecretEnv: 'HUBSPOT_CLIENT_SECRET' },
  google_email: { clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET' },
};

interface OAuthConfig {
  auth_url: string;
  token_url: string;
  scopes?: string[];
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Get authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { provider } = body;

    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Missing provider parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Special handling for Cal.com - redirect to existing function
    if (provider === 'cal_com') {
      // Redirect to existing cal-com-oauth-start for backward compatibility
      const response = await fetch(`${supabaseUrl}/functions/v1/cal-com-oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
      });
      const result = await response.json();
      return new Response(
        JSON.stringify(result),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get provider configuration from database
    const { data: providerData, error: providerError } = await supabase
      .from('integration_providers')
      .select('id, slug, name, oauth_type, oauth_config')
      .eq('slug', provider)
      .eq('enabled', true)
      .single();

    if (providerError || !providerData) {
      return new Response(
        JSON.stringify({ error: `Integration '${provider}' not found or not enabled` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if OAuth is configured for this provider
    if (!providerData.oauth_type || !providerData.oauth_config) {
      return new Response(
        JSON.stringify({ error: `Integration '${provider}' does not support OAuth` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const oauthConfig: OAuthConfig = providerData.oauth_config;

    // Get credentials from environment
    const credentialMapping = PROVIDER_CREDENTIALS[provider];
    if (!credentialMapping) {
      return new Response(
        JSON.stringify({ error: `Credentials not configured for '${provider}'` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = Deno.env.get(credentialMapping.clientIdEnv);
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: `${providerData.name} integration not configured` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate state parameter
    const state = btoa(JSON.stringify({
      userId: user.id,
      provider: provider,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    }));

    // Generate PKCE if required
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;

    if (providerData.oauth_type === 'oauth2_pkce') {
      codeVerifier = generateCodeVerifier();
      codeChallenge = await generateCodeChallenge(codeVerifier);
    }

    // Store state in database for validation during callback
    await supabase.from('oauth_states').upsert({
      user_id: user.id,
      state,
      code_verifier: codeVerifier,
      provider: provider,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minute expiry
    });

    // Build OAuth URL
    const redirectUri = `https://api.magpipe.ai/functions/v1/integration-oauth-callback`;
    const scopes = oauthConfig.scopes?.join(' ') || '';

    const oauthUrl = new URL(oauthConfig.auth_url);
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('state', state);

    if (scopes) {
      oauthUrl.searchParams.set('scope', scopes);
    }

    // Add PKCE parameters if using PKCE
    if (codeChallenge) {
      oauthUrl.searchParams.set('code_challenge', codeChallenge);
      oauthUrl.searchParams.set('code_challenge_method', 'S256');
    }

    // Google-specific: request offline access for refresh token
    if (provider === 'google_email') {
      oauthUrl.searchParams.set('access_type', 'offline');
      oauthUrl.searchParams.set('prompt', 'consent');
    }

    return new Response(
      JSON.stringify({ url: oauthUrl.toString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in integration-oauth-start:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
