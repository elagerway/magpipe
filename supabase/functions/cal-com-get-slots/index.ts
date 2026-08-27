import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { CalTokenError, fetchCalEventTypes, getCalAccessToken } from '../_shared/cal-com.ts'

interface GetSlotsRequest {
  action?: 'get_event_types'; // when set, list event types instead of slots (Booking Settings modal)
  start: string; // ISO date or date string
  end: string;   // ISO date or date string
  duration?: number; // minutes, default 30
  event_type_id?: number;
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

    // Refresh if needed. getCalAccessToken also clears dead credentials, so a
    // rejected refresh token stops the UI claiming a live connection.
    const accessToken = await getCalAccessToken(supabase, userId);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Cal.com not connected', code: 'NOT_CONNECTED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body: GetSlotsRequest = await req.json();

    // List event types (used by the agent Booking Settings modal). Runs BEFORE
    // the start/end slot params are required — that call sends neither, which is
    // why it previously 400'd and the UI showed "No event types found". The
    // cal-api-version header is required: without it /v2/event-types returns a
    // grouped { data: { eventTypeGroups: [...] } } shape instead of a flat
    // { data: [...] } array. (#100)
    if (body.action === 'get_event_types') {
      try {
        const eventTypes = await fetchCalEventTypes(accessToken);
        return new Response(
          JSON.stringify({ eventTypes }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        console.error('Cal.com event-types error:', e);
        // `reconnect_required` lets the UI tell "your Cal.com connection is
        // broken" apart from "this account has no event types" — the two
        // looked identical before, and the modal told people to go create
        // event types they already had.
        const reconnect = e instanceof CalTokenError && e.invalidGrant;
        return new Response(
          JSON.stringify({
            error: String((e as Error).message || e),
            reconnect_required: reconnect,
            eventTypes: [],
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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
      try {
        const ets = await fetchCalEventTypes(accessToken);
        if (ets.length > 0) eventTypeIdToUse = ets[0].id;
      } catch (e) {
        console.error('Cal.com event-types (slots auto-pick) error:', e);
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
