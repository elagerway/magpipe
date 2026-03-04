import { createClient } from 'npm:@supabase/supabase-js@2';

// This is a webhook that doesn't require JWT verification
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    // State might have + converted to space in URL, convert back
    const state = url.searchParams.get('state')?.replace(/ /g, '+') || null;
    const error = url.searchParams.get('error');

    console.log('Received state:', state);

    // Get frontend URL for redirects
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://magpipe.ai';

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error from Cal.com:', error);
      return Response.redirect(`${frontendUrl}/settings?cal_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return Response.redirect(`${frontendUrl}/settings?cal_error=missing_params`);
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate state and get user ID
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return Response.redirect(`${frontendUrl}/settings?cal_error=invalid_state`);
    }

    // Verify state exists in database and hasn't expired
    const { data: storedState, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('user_id', stateData.userId)
      .eq('state', state)
      .eq('provider', 'cal_com')
      .single();

    if (stateError || !storedState) {
      console.error('State validation failed:', stateError);
      console.error('Looking for state:', state);
      console.error('User ID from state:', stateData.userId);
      return Response.redirect(`${frontendUrl}/settings?cal_error=invalid_state`);
    }
    console.log('State validated successfully');

    // Check if state has expired
    if (new Date(storedState.expires_at) < new Date()) {
      await supabase.from('oauth_states').delete().eq('id', storedState.id);
      return Response.redirect(`${frontendUrl}/settings?cal_error=state_expired`);
    }

    // Get code_verifier for PKCE
    const codeVerifier = storedState.code_verifier;

    // Delete used state
    await supabase.from('oauth_states').delete().eq('id', storedState.id);

    // Exchange code for tokens using PKCE (code_verifier instead of client_secret)
    const clientId = Deno.env.get('CAL_COM_CLIENT_ID')!;
    const redirectUri = `${supabaseUrl}/functions/v1/cal-com-oauth-callback`;

    const tokenResponse = await fetch('https://app.cal.com/api/auth/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return Response.redirect(`${frontendUrl}/settings?cal_error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();
    console.log('Token exchange successful');

    // Calculate token expiration
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    // Get Cal.com user info to store user ID
    const userInfoResponse = await fetch('https://api.cal.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    let calUserId = null;
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      calUserId = userInfo.data?.id?.toString() || null;
    }

    // Store tokens in database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        cal_com_access_token: tokens.access_token,
        cal_com_refresh_token: tokens.refresh_token,
        cal_com_token_expires_at: expiresAt.toISOString(),
        cal_com_user_id: calUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stateData.userId);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return Response.redirect(`${frontendUrl}/settings?cal_error=storage_failed`);
    }

    // Success - redirect back to return URL or settings
    const returnUrl = stateData.returnUrl || '/settings';
    console.log('stateData:', JSON.stringify(stateData));
    console.log('returnUrl from state:', returnUrl);
    const redirectUrl = returnUrl.startsWith('http') ? returnUrl : `${frontendUrl}${returnUrl}`;
    console.log('Final redirectUrl:', redirectUrl);
    const separator = redirectUrl.includes('?') ? '&' : '?';
    return Response.redirect(`${redirectUrl}${separator}cal_connected=true`);

  } catch (error) {
    console.error('Error in cal-com-oauth-callback:', error);
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://magpipe.ai';
    return Response.redirect(`${frontendUrl}/settings?cal_error=internal_error`);
  }
});
