import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Environment variable mapping for provider credentials
const PROVIDER_CREDENTIALS: Record<string, { clientIdEnv: string; clientSecretEnv: string }> = {
  slack: { clientIdEnv: 'SLACK_CLIENT_ID', clientSecretEnv: 'SLACK_CLIENT_SECRET' },
  hubspot: { clientIdEnv: 'HUBSPOT_CLIENT_ID', clientSecretEnv: 'HUBSPOT_CLIENT_SECRET' },
};

interface OAuthConfig {
  auth_url: string;
  token_url: string;
  scopes?: string[];
}

// This is a webhook that doesn't require JWT verification
Deno.serve(async (req) => {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://solomobile.ai';

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return Response.redirect(`${frontendUrl}/settings?integration_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return Response.redirect(`${frontendUrl}/settings?integration_error=missing_params`);
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse state to get user ID and provider
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return Response.redirect(`${frontendUrl}/settings?integration_error=invalid_state`);
    }

    const { userId, provider } = stateData;

    if (!userId || !provider) {
      return Response.redirect(`${frontendUrl}/settings?integration_error=invalid_state`);
    }

    // Verify state exists in database and hasn't expired
    const { data: storedState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('user_id', userId)
      .eq('state', state)
      .eq('provider', provider)
      .single();

    if (stateError || !storedState) {
      console.error('State validation failed:', stateError);
      return Response.redirect(`${frontendUrl}/settings?integration_error=invalid_state`);
    }

    // Check if state has expired
    if (new Date(storedState.expires_at) < new Date()) {
      await supabase.from('oauth_states').delete().eq('id', storedState.id);
      return Response.redirect(`${frontendUrl}/settings?integration_error=state_expired`);
    }

    // Get code_verifier for PKCE (if used)
    const codeVerifier = storedState.code_verifier;

    // Delete used state
    await supabase.from('oauth_states').delete().eq('id', storedState.id);

    // Get provider configuration from database
    const { data: providerData, error: providerError } = await supabase
      .from('integration_providers')
      .select('id, slug, name, oauth_type, oauth_config')
      .eq('slug', provider)
      .single();

    if (providerError || !providerData) {
      console.error('Provider not found:', provider);
      return Response.redirect(`${frontendUrl}/settings?integration_error=provider_not_found`);
    }

    const oauthConfig: OAuthConfig = providerData.oauth_config;

    // Get credentials from environment
    const credentialMapping = PROVIDER_CREDENTIALS[provider];
    if (!credentialMapping) {
      console.error('Credentials not configured for:', provider);
      return Response.redirect(`${frontendUrl}/settings?integration_error=not_configured`);
    }

    const clientId = Deno.env.get(credentialMapping.clientIdEnv);
    const clientSecret = Deno.env.get(credentialMapping.clientSecretEnv);

    if (!clientId) {
      console.error('Client ID not configured for:', provider);
      return Response.redirect(`${frontendUrl}/settings?integration_error=not_configured`);
    }

    // Build token request
    const redirectUri = `${supabaseUrl}/functions/v1/integration-oauth-callback`;

    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    };

    // Use PKCE code_verifier if available, otherwise use client_secret
    if (codeVerifier && providerData.oauth_type === 'oauth2_pkce') {
      tokenParams.code_verifier = codeVerifier;
    } else if (clientSecret) {
      tokenParams.client_secret = clientSecret;
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(oauthConfig.token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${frontendUrl}/settings?integration_error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Extract external user/workspace ID based on provider
    let externalUserId = null;
    let externalWorkspaceId = null;

    if (provider === 'slack') {
      // Slack returns team info and authed_user in token response
      externalUserId = tokens.authed_user?.id || null;
      externalWorkspaceId = tokens.team?.id || null;
    }

    // Store tokens in user_integrations table
    const { error: insertError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: userId,
        provider_id: providerData.id,
        status: 'connected',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt.toISOString(),
        external_user_id: externalUserId,
        external_workspace_id: externalWorkspaceId,
        config: {},
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider_id',
      });

    if (insertError) {
      console.error('Failed to store tokens:', insertError);
      return Response.redirect(`${frontendUrl}/settings?integration_error=storage_failed`);
    }

    // Success - redirect back to settings with success message
    return Response.redirect(`${frontendUrl}/settings?integration_connected=${provider}`);

  } catch (error) {
    console.error('Error in integration-oauth-callback:', error);
    return Response.redirect(`${frontendUrl}/settings?integration_error=internal_error`);
  }
});
