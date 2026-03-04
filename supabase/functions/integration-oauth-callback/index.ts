import { createClient } from 'npm:@supabase/supabase-js@2';
import { setupGmailWatch } from '../_shared/gmail-helpers.ts';

// Environment variable mapping for provider credentials
const PROVIDER_CREDENTIALS: Record<string, { clientIdEnv: string; clientSecretEnv: string }> = {
  slack: { clientIdEnv: 'SLACK_CLIENT_ID', clientSecretEnv: 'SLACK_CLIENT_SECRET' },
  hubspot: { clientIdEnv: 'HUBSPOT_CLIENT_ID', clientSecretEnv: 'HUBSPOT_CLIENT_SECRET' },
  google_email: { clientIdEnv: 'GOOGLE_CLIENT_ID', clientSecretEnv: 'GOOGLE_CLIENT_SECRET' },
};

interface OAuthConfig {
  auth_url: string;
  token_url: string;
  scopes?: string[];
}

// This is a webhook that doesn't require JWT verification
Deno.serve(async (req) => {
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://magpipe.ai';

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

    const { userId, provider, redirect_path } = stateData;

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
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/integration-oauth-callback`;

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
    } else if (provider === 'hubspot') {
      // HubSpot returns hub_id in the token response
      externalWorkspaceId = tokens.hub_id?.toString() || null;

      // Fetch user info to get user ID
      if (tokens.access_token) {
        try {
          const userInfoResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokens.access_token);
          if (userInfoResponse.ok) {
            const userInfo = await userInfoResponse.json();
            externalUserId = userInfo.user_id?.toString() || null;
            externalWorkspaceId = userInfo.hub_id?.toString() || externalWorkspaceId;
          }
        } catch (e) {
          console.error('Failed to fetch HubSpot user info:', e);
        }
      }
    } else if (provider === 'google_email') {
      // Fetch Gmail profile to get email address
      if (tokens.access_token) {
        try {
          const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
          });
          if (profileResponse.ok) {
            const profile = await profileResponse.json();
            externalUserId = profile.emailAddress || null;

            // Store Gmail address in support_email_config singleton
            await supabase
              .from('support_email_config')
              .update({
                gmail_address: profile.emailAddress,
                updated_at: new Date().toISOString(),
              })
              .eq('id', '00000000-0000-0000-0000-000000000001');

            console.log('Gmail connected:', profile.emailAddress);

            // Set up Gmail Pub/Sub watch for near-real-time email notifications
            const topicName = Deno.env.get('GMAIL_PUBSUB_TOPIC');
            if (topicName) {
              try {
                const watchResult = await setupGmailWatch(tokens.access_token, topicName);
                if (watchResult) {
                  await supabase
                    .from('agent_email_configs')
                    .update({
                      watch_expiration: new Date(parseInt(watchResult.expiration)).toISOString(),
                      watch_resource_id: watchResult.resourceId || null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', userId)
                    .eq('is_active', true);
                  console.log('Gmail Pub/Sub watch set up, expires:', watchResult.expiration);
                }
              } catch (watchErr) {
                console.error('Gmail watch setup failed (non-fatal):', watchErr);
              }
            }
          }
        } catch (e) {
          console.error('Failed to fetch Gmail profile:', e);
        }
      }
    }

    // Build config object (store gmail_address for easy access from frontend)
    const integrationConfig: Record<string, unknown> = {};
    if (provider === 'google_email' && externalUserId) {
      integrationConfig.gmail_address = externalUserId; // externalUserId is the email address for Google
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
        config: integrationConfig,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider_id',
      });

    if (insertError) {
      console.error('Failed to store tokens:', insertError);
      return Response.redirect(`${frontendUrl}/settings?integration_error=storage_failed`);
    }

    // Success - redirect based on provider / custom redirect path
    if (redirect_path) {
      const separator = redirect_path.includes('?') ? '&' : '?';
      return Response.redirect(`${frontendUrl}${redirect_path}${separator}integration_connected=${provider}`);
    }
    if (provider === 'google_email') {
      return Response.redirect(`${frontendUrl}/admin?tab=support&integration_connected=google_email`);
    }
    return Response.redirect(`${frontendUrl}/settings?integration_connected=${provider}`);

  } catch (error) {
    console.error('Error in integration-oauth-callback:', error);
    return Response.redirect(`${frontendUrl}/settings?integration_error=internal_error`);
  }
});
