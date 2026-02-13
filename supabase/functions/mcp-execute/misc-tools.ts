import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { normalizePhoneNumber, McpExecuteResponse } from './utils.ts'

export async function handleSearchBusiness(args: any): Promise<McpExecuteResponse> {
  const { query, location, intent, message } = args;
  const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

  if (!GOOGLE_API_KEY) {
    return { success: false, message: 'Business search is not configured' };
  }

  // Use Text Search API
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  searchUrl.searchParams.set('query', location ? `${query} ${location}` : query);
  searchUrl.searchParams.set('key', GOOGLE_API_KEY);

  const placesResponse = await fetch(searchUrl.toString());
  const placesData = await placesResponse.json();

  if (placesData.status !== 'OK' || !placesData.results?.length) {
    return {
      success: false,
      message: `I couldn't find any businesses matching "${query}"${location ? ` near ${location}` : ''}. Try being more specific or adding a location.`,
    };
  }

  const place = placesData.results[0];

  // Get place details for phone number
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', place.place_id);
  detailsUrl.searchParams.set('fields', 'formatted_phone_number,international_phone_number,name,formatted_address,website,opening_hours');
  detailsUrl.searchParams.set('key', GOOGLE_API_KEY);

  const detailsResponse = await fetch(detailsUrl.toString());
  const detailsData = await detailsResponse.json();
  const details = detailsData.result;

  if (!details || (!details.international_phone_number && !details.formatted_phone_number)) {
    return {
      success: false,
      message: `I found ${details?.name || place.name} at ${details?.formatted_address || place.formatted_address}, but they don't have a phone number listed.`,
    };
  }

  const rawPhone = details.international_phone_number || details.formatted_phone_number;
  const normalizedPhone = normalizePhoneNumber(rawPhone);

  return {
    success: true,
    message: `I found ${details.name}:`,
    business_info: {
      name: details.name,
      phone: details.formatted_phone_number || details.international_phone_number,
      phone_number: normalizedPhone,
      address: details.formatted_address || null,
      website: details.website || null,
    },
  };
}

export async function handleUpdateSystemPrompt(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { new_prompt, modification_type } = args;

  if (mode === 'preview') {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'update_system_prompt',
        preview: `Proposed new prompt:\n\n${new_prompt}`,
        parameters: { new_prompt, modification_type },
      },
    };
  }

  // Get current prompt
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('system_prompt')
    .eq('user_id', userId)
    .single();

  let updatedPrompt = new_prompt;

  if (modification_type === 'append' && agentConfig?.system_prompt) {
    updatedPrompt = `${agentConfig.system_prompt}\n\n${new_prompt}`;
  }

  const { error } = await supabase
    .from('agent_configs')
    .update({ system_prompt: updatedPrompt })
    .eq('user_id', userId);

  if (error) {
    return { success: false, message: `Failed to update prompt: ${error.message}` };
  }

  return {
    success: true,
    message: 'System prompt updated successfully.',
  };
}

export async function handleAddKnowledgeSource(supabase: any, userId: string, jwt: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { url, sync_period } = args;

  if (mode === 'preview') {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'add_knowledge_source',
        preview: `Will add knowledge from: ${url}`,
        parameters: { url, sync_period: sync_period || '7d' },
      },
    };
  }

  // Call knowledge-source-add Edge Function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ url, sync_period: sync_period || '7d' }),
  });

  const result = await response.json();

  if (!response.ok) {
    return { success: false, message: result.error || 'Failed to add knowledge source' };
  }

  return {
    success: true,
    message: `Added knowledge source: ${url}`,
    result,
  };
}

export async function handleCheckCalendarAvailability(supabase: any, userId: string, jwt: string, args: any): Promise<McpExecuteResponse> {
  const { date, duration } = args;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/cal-com-get-slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ date, duration: duration || 30 }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return { success: false, message: result.error || 'Failed to check calendar' };
  }

  return {
    success: true,
    message: result.message || 'Here are the available slots:',
    result: { slots: result.slots || [] },
  };
}

export async function handleBookCalendarAppointment(supabase: any, userId: string, jwt: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { title, start_time, attendee_name, attendee_email, attendee_phone, duration, location, purpose } = args;

  if (mode === 'preview') {
    const formattedTime = new Date(start_time).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'book_calendar_appointment',
        preview: `Book "${title}" with ${attendee_name} at ${formattedTime}${location ? ` at ${location}` : ''}?`,
        parameters: {
          title,
          start: start_time,
          attendee_name,
          attendee_email,
          attendee_phone,
          duration: duration || 30,
          location,
          notes: purpose,
        },
      },
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/cal-com-create-booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      title,
      start: start_time,
      attendee_name,
      attendee_email,
      attendee_phone,
      duration: duration || 30,
      location,
      notes: purpose,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return { success: false, message: result.error || 'Failed to book appointment' };
  }

  const booking = result.booking;
  const bookingTime = new Date(booking.start).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return {
    success: true,
    message: `Booked "${booking.title}" for ${bookingTime}. It's on your calendar!`,
    result: booking,
  };
}
