import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface GetSlotsRequest {
  start: string; // ISO date or date string
  end: string;   // ISO date or date string
  duration?: number; // minutes, default 30
  event_type_id?: number;
}

// Refresh access token if expired
async function refreshTokenIfNeeded(
  supabase: any,
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): Promise<string> {
  const expiry = new Date(expiresAt);
  const now = new Date();

  // Refresh if token expires within 5 minutes
  if (expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
    return accessToken;
  }

  console.log('Refreshing Cal.com access token...');

  const clientId = Deno.env.get('CAL_COM_CLIENT_ID')!;
  const clientSecret = Deno.env.get('CAL_COM_CLIENT_SECRET')!;

  const tokenResponse = await fetch('https://app.cal.com/api/auth/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to refresh Cal.com token');
  }

  const tokens = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Update tokens in database
  await supabase
    .from('users')
    .update({
      cal_com_access_token: tokens.access_token,
      cal_com_refresh_token: tokens.refresh_token || refreshToken,
      cal_com_token_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return tokens.access_token;
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

    // Get user - either from JWT or from x-user-id header (for internal service calls)
    const jwt = authHeader.replace('Bearer ', '');
    const internalUserId = req.headers.get('x-user-id');

    let userId: string;

    // Check if this is an internal service call (using service role key + x-user-id)
    if (jwt === supabaseServiceKey && internalUserId) {
      userId = internalUserId;
    } else {
      // Regular user JWT or API key auth
      const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
      });
      const resolvedUser = await resolveUser(req, supabaseClient);
      if (!resolvedUser) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = resolvedUser.id;
    }

    // Get user's Cal.com credentials
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('cal_com_access_token, cal_com_refresh_token, cal_com_token_expires_at, cal_com_default_event_type_id')
      .eq('id', userId)
      .single();

    if (userDataError || !userData?.cal_com_access_token) {
      return new Response(
        JSON.stringify({ error: 'Cal.com not connected', code: 'NOT_CONNECTED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(
      supabase,
      userId,
      userData.cal_com_access_token,
      userData.cal_com_refresh_token,
      userData.cal_com_token_expires_at
    );

    // Parse request
    const body: GetSlotsRequest = await req.json();

    if (!body.start || !body.end) {
      return new Response(
        JSON.stringify({ error: 'start and end dates are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duration = body.duration || 30;
    const eventTypeId = body.event_type_id || userData.cal_com_default_event_type_id;

    // If no event type, get user's first event type
    let eventTypeIdToUse = eventTypeId;
    if (!eventTypeIdToUse) {
      const eventTypesResponse = await fetch('https://api.cal.com/v2/event-types', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (eventTypesResponse.ok) {
        const eventTypes = await eventTypesResponse.json();
        if (eventTypes.data && eventTypes.data.length > 0) {
          eventTypeIdToUse = eventTypes.data[0].id;
        }
      }
    }

    if (!eventTypeIdToUse) {
      return new Response(
        JSON.stringify({ error: 'No event types found. Please create an event type in Cal.com first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get available slots from Cal.com
    const startDate = new Date(body.start).toISOString();
    const endDate = new Date(body.end).toISOString();

    const slotsUrl = new URL(`https://api.cal.com/v2/slots/available`);
    slotsUrl.searchParams.set('startTime', startDate);
    slotsUrl.searchParams.set('endTime', endDate);
    slotsUrl.searchParams.set('eventTypeId', eventTypeIdToUse.toString());
    slotsUrl.searchParams.set('duration', duration.toString());

    const slotsResponse = await fetch(slotsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!slotsResponse.ok) {
      const errorText = await slotsResponse.text();
      console.error('Cal.com slots API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to get availability from Cal.com' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slotsData = await slotsResponse.json();

    // Format slots for response
    const slots = slotsData.data?.slots || [];
    const formattedSlots = slots.map((slot: any) => ({
      start: slot.time,
      end: new Date(new Date(slot.time).getTime() + duration * 60000).toISOString(),
    }));

    return new Response(
      JSON.stringify({
        slots: formattedSlots,
        event_type_id: eventTypeIdToUse,
        duration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cal-com-get-slots:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
