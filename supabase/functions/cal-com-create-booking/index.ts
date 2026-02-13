import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface CreateBookingRequest {
  start: string;           // ISO date
  title: string;           // Meeting title
  duration?: number;       // Minutes, default 30
  attendee_name: string;   // Required
  attendee_email?: string; // Optional
  attendee_phone?: string; // Optional
  location?: string;       // Meeting location
  notes?: string;          // Additional notes/purpose
  event_type_id?: number;  // Optional, uses default if not provided
}

// Refresh access token if expired (same as in get-slots)
async function refreshTokenIfNeeded(
  supabase: any,
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): Promise<string> {
  const expiry = new Date(expiresAt);
  const now = new Date();

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
      // Regular user JWT auth
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    // Get user's Cal.com credentials
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('cal_com_access_token, cal_com_refresh_token, cal_com_token_expires_at, cal_com_default_event_type_id, name, email')
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
    const body: CreateBookingRequest = await req.json();

    if (!body.start) {
      return new Response(
        JSON.stringify({ error: 'start time is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.title) {
      return new Response(
        JSON.stringify({ error: 'title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.attendee_name) {
      return new Response(
        JSON.stringify({ error: 'attendee_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const duration = body.duration || 30;
    const eventTypeId = body.event_type_id || userData.cal_com_default_event_type_id;

    // Get event type if not provided
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

    // Build attendee email if not provided
    // For bookings, Cal.com requires an email, so we generate a placeholder if needed
    const attendeeEmail = body.attendee_email ||
      `${body.attendee_name.toLowerCase().replace(/\s+/g, '.')}@placeholder.booking`;

    // Create booking in Cal.com
    const bookingPayload = {
      eventTypeId: eventTypeIdToUse,
      start: new Date(body.start).toISOString(),
      responses: {
        name: body.attendee_name,
        email: attendeeEmail,
        ...(body.attendee_phone && { phone: body.attendee_phone }),
        ...(body.notes && { notes: body.notes }),
      },
      metadata: {
        title: body.title,
        ...(body.location && { location: body.location }),
        source: 'pat_voice_agent',
      },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
      language: 'en',
    };

    console.log('Creating Cal.com booking:', JSON.stringify(bookingPayload, null, 2));

    const bookingResponse = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bookingPayload),
    });

    if (!bookingResponse.ok) {
      const errorText = await bookingResponse.text();
      console.error('Cal.com booking API error:', errorText);

      // Try to parse error for user-friendly message
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage = errorJson.message || errorJson.error || 'Failed to create booking';
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch {
        return new Response(
          JSON.stringify({ error: 'Failed to create booking in Cal.com' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const bookingData = await bookingResponse.json();
    const booking = bookingData.data;

    // Format response
    const startTime = new Date(booking.startTime || body.start);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    return new Response(
      JSON.stringify({
        booking: {
          id: booking.id,
          uid: booking.uid,
          title: body.title,
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          attendee: {
            name: body.attendee_name,
            email: attendeeEmail,
            phone: body.attendee_phone,
          },
          location: body.location,
          notes: body.notes,
          status: booking.status || 'confirmed',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cal-com-create-booking:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
