import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface McpExecuteRequest {
  tool_name: string;
  arguments: Record<string, any>;
  mode?: 'preview' | 'execute';  // preview returns pending_action, execute performs the action
}

interface PendingAction {
  type: string;
  preview: string;
  parameters: Record<string, any>;
}

interface McpExecuteResponse {
  success: boolean;
  result?: any;
  message?: string;
  pending_action?: PendingAction;
  requires_confirmation?: boolean;
  business_info?: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT or from x-user-id header (for service-to-service calls)
    const jwt = authHeader.replace('Bearer ', '');
    let userId: string | null = null;

    // Check if this is a service role call with x-user-id header
    const xUserId = req.headers.get('x-user-id');
    if (xUserId && jwt === supabaseServiceKey) {
      // Service role call - trust the x-user-id header
      userId = xUserId;
      console.log('Service role call for user:', userId);
    } else {
      // Regular user call - verify the token
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = userId;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not identified' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: McpExecuteRequest = await req.json();
    const { tool_name, arguments: args, mode = 'preview' } = body;

    if (!tool_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing tool_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let response: McpExecuteResponse;

    // Route to appropriate handler based on tool_name
    switch (tool_name) {
      case 'list_contacts':
        response = await handleListContacts(supabase, userId, args);
        break;

      case 'add_contact':
        response = await handleAddContact(supabase, userId, args, mode);
        break;

      case 'call_contact':
        response = await handleCallContact(supabase, userId, args, mode);
        break;

      case 'send_sms':
        response = await handleSendSms(supabase, userId, args, mode);
        break;

      case 'schedule_sms':
        response = await handleScheduleSms(supabase, userId, args, mode);
        break;

      case 'search_business':
        response = await handleSearchBusiness(args);
        break;

      case 'update_system_prompt':
        response = await handleUpdateSystemPrompt(supabase, userId, args, mode);
        break;

      case 'add_knowledge_source':
        response = await handleAddKnowledgeSource(supabase, userId, jwt, args, mode);
        break;

      case 'check_calendar_availability':
        response = await handleCheckCalendarAvailability(supabase, userId, jwt, args);
        break;

      case 'book_calendar_appointment':
        response = await handleBookCalendarAppointment(supabase, userId, jwt, args, mode);
        break;

      // Integration management tools
      case 'list_available_integrations':
        response = await handleListAvailableIntegrations(supabase, userId);
        break;

      case 'start_integration_connection':
        response = await handleStartIntegrationConnection(supabase, userId, jwt, args);
        break;

      case 'check_integration_status':
        response = await handleCheckIntegrationStatus(supabase, userId, args);
        break;

      // Slack integration tools
      case 'slack_send_message':
      case 'slack_list_channels':
        response = await handleIntegrationTool(supabase, userId, tool_name, args);
        break;

      // HubSpot integration tools
      case 'hubspot_create_contact':
      case 'hubspot_search_contacts':
      case 'hubspot_get_contact':
      case 'hubspot_create_note':
        response = await handleHubSpotTool(supabase, userId, tool_name, args);
        break;

      default:
        // Check if this is an MCP server tool (format: "server_slug:tool_name")
        if (tool_name.includes(':')) {
          response = await handleMcpServerTool(supabase, userId, jwt, tool_name, args);
        } else {
          response = { success: false, message: `Unknown tool: ${tool_name}` };
        }
    }

    // Log tool execution
    const executionTime = Date.now() - startTime;
    await supabase.from('integration_tool_logs').insert({
      user_id: userId,
      tool_name,
      tool_source: getToolSource(tool_name),
      input: args,
      output: response,
      success: response.success,
      error_message: response.success ? null : response.message,
      execution_time_ms: executionTime,
    });

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('MCP execute error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getToolSource(toolName: string): string {
  // Check if MCP server tool (format: "server_slug:tool_name")
  if (toolName.includes(':')) {
    return `mcp:${toolName.split(':')[0]}`;
  }
  const integrationTools = ['slack_send_message', 'slack_list_channels', 'check_calendar_availability', 'book_calendar_appointment'];
  if (integrationTools.some(t => toolName.startsWith(t.split('_')[0]))) {
    return toolName.split('_')[0];
  }
  return 'builtin';
}

// Helper function to normalize phone number
function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

// Helper function to find contacts by name or phone
async function findContacts(supabase: any, userId: string, identifier: string) {
  const searchTerm = identifier.toLowerCase();
  const phoneDigits = identifier.replace(/\D/g, '');

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, phone_number')
    .eq('user_id', userId);

  return (contacts || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm) ||
    (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
  );
}

// Tool Handlers

async function handleListContacts(supabase: any, userId: string, args: any): Promise<McpExecuteResponse> {
  const { search_term } = args;

  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, phone_number, notes, contact_type')
    .eq('user_id', userId)
    .order('name');

  let filtered = contacts || [];
  if (search_term) {
    const term = search_term.toLowerCase();
    filtered = filtered.filter((c: any) =>
      c.name?.toLowerCase().includes(term) ||
      c.phone_number?.includes(search_term)
    );
  }

  if (filtered.length === 0) {
    return {
      success: true,
      message: search_term
        ? `No contacts found matching "${search_term}".`
        : "You don't have any contacts yet. Would you like to add one?",
      result: { contacts: [] },
    };
  }

  const contactList = filtered.slice(0, 10).map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  const moreText = filtered.length > 10 ? `\n\n...and ${filtered.length - 10} more` : '';

  return {
    success: true,
    message: `Here are your contacts:\n${contactList}${moreText}`,
    result: { contacts: filtered.slice(0, 20) },
  };
}

async function handleAddContact(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { name, phone_number, notes } = args;
  const normalizedPhone = normalizePhoneNumber(phone_number);

  // Check for duplicates
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('phone_number', normalizedPhone)
    .single();

  if (existing) {
    return {
      success: false,
      message: `A contact with that phone number already exists: ${existing.name}. Would you like to update their information instead?`,
    };
  }

  if (mode === 'preview') {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'add_contact',
        preview: `Add contact: ${name} (${normalizedPhone})${notes ? ` - ${notes}` : ''}`,
        parameters: { name, phone_number: normalizedPhone, notes },
      },
    };
  }

  // Execute mode - actually add the contact
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      name,
      phone_number: normalizedPhone,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: `Failed to add contact: ${error.message}` };
  }

  return {
    success: true,
    message: `Added ${name} to your contacts.`,
    result: newContact,
  };
}

async function handleCallContact(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { contact_identifier, caller_id, purpose, goal } = args;
  const matches = await findContacts(supabase, userId, contact_identifier);
  const phoneDigits = contact_identifier.replace(/\D/g, '');

  const buildPreview = (name: string, phone: string) => {
    let preview = `Call ${name} at ${phone}?`;
    if (purpose || goal) {
      preview += '\n';
      if (purpose) preview += `\nPurpose: ${purpose}`;
      if (goal) preview += `\nGoal: ${goal}`;
    }
    return preview;
  };

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const formattedNumber = normalizePhoneNumber(contact_identifier);
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'call_contact',
          preview: buildPreview(contact_identifier, formattedNumber),
          parameters: {
            phone_number: formattedNumber,
            name: contact_identifier,
            caller_id,
            purpose: purpose || null,
            goal: goal || null,
          },
        },
      };
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${contact_identifier}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    return {
      success: true,
      requires_confirmation: true,
      pending_action: {
        type: 'call_contact',
        preview: buildPreview(matches[0].name, matches[0].phone_number),
        parameters: {
          contact_id: matches[0].id,
          phone_number: matches[0].phone_number,
          name: matches[0].name,
          caller_id,
          purpose: purpose || null,
          goal: goal || null,
        },
      },
    };
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${contact_identifier}":\n${contactList}\n\nPlease be more specific about who you'd like to call.`,
  };
}

async function handleSendSms(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { recipient, message, sender_number } = args;
  const matches = await findContacts(supabase, userId, recipient);
  const phoneDigits = recipient.replace(/\D/g, '');

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const normalizedPhone = normalizePhoneNumber(recipient);

      if (mode === 'preview') {
        return {
          success: true,
          requires_confirmation: true,
          pending_action: {
            type: 'send_sms',
            preview: `Send to ${recipient}: "${message}"`,
            parameters: {
              phone_number: normalizedPhone,
              name: recipient,
              message,
              sender_number,
            },
          },
        };
      }

      // Execute mode - send the SMS
      return await executeSendSms(supabase, userId, normalizedPhone, message, sender_number);
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    if (mode === 'preview') {
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'send_sms',
          preview: `Send to ${matches[0].name} (${matches[0].phone_number}): "${message}"`,
          parameters: {
            contact_id: matches[0].id,
            phone_number: matches[0].phone_number,
            name: matches[0].name,
            message,
            sender_number,
          },
        },
      };
    }

    return await executeSendSms(supabase, userId, matches[0].phone_number, message, sender_number);
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific about who you'd like to text.`,
  };
}

async function executeSendSms(supabase: any, userId: string, toNumber: string, message: string, senderNumber?: string) {
  // Get user's service number if not provided
  if (!senderNumber) {
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .limit(1)
      .single();
    senderNumber = serviceNumbers?.phone_number;
  }

  if (!senderNumber) {
    return { success: false, message: 'No service number available to send from' };
  }

  // Send SMS via SignalWire
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN');
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';

  const response = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${projectId}:${apiToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: senderNumber,
      To: toNumber,
      Body: message,
    }),
  });

  const result = await response.json();

  if (result.error_code) {
    return { success: false, message: `SMS failed: ${result.error_message || 'Unknown error'}` };
  }

  // Save to sms_messages table
  await supabase.from('sms_messages').insert({
    user_id: userId,
    direction: 'outgoing',
    service_number: senderNumber,
    contact_phone: toNumber,
    message_body: message,
    is_ai_generated: false,
    status: 'sent',
  });

  return {
    success: true,
    message: `Message sent successfully.`,
    result: { message_sid: result.sid },
  };
}

async function handleScheduleSms(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { recipient, message, send_at } = args;

  // Validate scheduled time
  let scheduledTime: Date;
  try {
    scheduledTime = new Date(send_at);
    if (isNaN(scheduledTime.getTime())) {
      return { success: false, message: 'Invalid date format' };
    }
    if (scheduledTime <= new Date()) {
      return { success: false, message: 'Scheduled time must be in the future' };
    }
  } catch {
    return { success: false, message: `Could not parse time "${send_at}"` };
  }

  const matches = await findContacts(supabase, userId, recipient);
  const phoneDigits = recipient.replace(/\D/g, '');

  const formattedTime = scheduledTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const buildParams = (phoneNumber: string, name: string) => ({
    phone_number: phoneNumber,
    name,
    message,
    send_at: scheduledTime.toISOString(),
  });

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const normalizedPhone = normalizePhoneNumber(recipient);

      if (mode === 'preview') {
        return {
          success: true,
          requires_confirmation: true,
          pending_action: {
            type: 'schedule_sms',
            preview: `Schedule SMS to ${recipient} for ${formattedTime}:\n"${message}"`,
            parameters: buildParams(normalizedPhone, recipient),
          },
        };
      }

      return await executeScheduleSms(supabase, userId, buildParams(normalizedPhone, recipient));
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    const params = {
      ...buildParams(matches[0].phone_number, matches[0].name),
      contact_id: matches[0].id,
    };

    if (mode === 'preview') {
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'schedule_sms',
          preview: `Schedule SMS to ${matches[0].name} (${matches[0].phone_number}) for ${formattedTime}:\n"${message}"`,
          parameters: params,
        },
      };
    }

    return await executeScheduleSms(supabase, userId, params);
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific.`,
  };
}

async function executeScheduleSms(supabase: any, userId: string, params: any): Promise<McpExecuteResponse> {
  // Get user's service number
  const { data: serviceNumbers } = await supabase
    .from('service_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .limit(1)
    .single();

  const { error } = await supabase.from('scheduled_actions').insert({
    user_id: userId,
    action_type: 'send_sms',
    scheduled_at: params.send_at,
    status: 'pending',
    parameters: {
      recipient_phone: params.phone_number,
      recipient_name: params.name,
      message: params.message,
      sender_number: serviceNumbers?.phone_number,
    },
    created_via: 'agent',
  });

  if (error) {
    return { success: false, message: `Failed to schedule SMS: ${error.message}` };
  }

  const formattedTime = new Date(params.send_at).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    success: true,
    message: `Scheduled SMS to ${params.name} for ${formattedTime}.`,
  };
}

async function handleSearchBusiness(args: any): Promise<McpExecuteResponse> {
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

async function handleUpdateSystemPrompt(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
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

async function handleAddKnowledgeSource(supabase: any, userId: string, jwt: string, args: any, mode: string): Promise<McpExecuteResponse> {
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

async function handleCheckCalendarAvailability(supabase: any, userId: string, jwt: string, args: any): Promise<McpExecuteResponse> {
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

async function handleBookCalendarAppointment(supabase: any, userId: string, jwt: string, args: any, mode: string): Promise<McpExecuteResponse> {
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

async function handleIntegrationTool(supabase: any, userId: string, toolName: string, args: any): Promise<McpExecuteResponse> {
  // Get user's integration for this tool
  const providerSlug = toolName.split('_')[0];  // e.g., 'slack' from 'slack_send_message'

  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select(`
      id,
      access_token,
      refresh_token,
      token_expires_at,
      external_workspace_id,
      integration_providers!inner(id, slug, oauth_config)
    `)
    .eq('user_id', userId)
    .eq('integration_providers.slug', providerSlug)
    .eq('status', 'connected')
    .single();

  if (integrationError || !integration) {
    return {
      success: false,
      message: `${providerSlug} is not connected. Would you like me to help you connect it? Just say "connect ${providerSlug}".`,
    };
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  const tokenExpiry = new Date(integration.token_expires_at);
  const refreshThreshold = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry < refreshThreshold && integration.refresh_token) {
    const refreshResult = await refreshSlackToken(supabase, integration);
    if (!refreshResult.success) {
      return {
        success: false,
        message: `Your ${providerSlug} connection has expired. Please reconnect it in Settings.`,
      };
    }
    integration.access_token = refreshResult.access_token;
  }

  // Route to specific handler based on tool
  switch (toolName) {
    case 'slack_send_message':
      return await handleSlackSendMessage(integration.access_token, args);

    case 'slack_list_channels':
      return await handleSlackListChannels(integration.access_token);

    default:
      return {
        success: false,
        message: `Tool ${toolName} is not yet implemented.`,
      };
  }
}

async function refreshSlackToken(supabase: any, integration: any): Promise<{ success: boolean; access_token?: string }> {
  const clientId = Deno.env.get('SLACK_CLIENT_ID');
  const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('Slack credentials not configured');
    return { success: false };
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack token refresh failed:', result.error);
      return { success: false };
    }

    // Update stored tokens
    const expiresAt = new Date(Date.now() + (result.expires_in || 43200) * 1000);

    await supabase
      .from('user_integrations')
      .update({
        access_token: result.access_token,
        refresh_token: result.refresh_token || integration.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return { success: true, access_token: result.access_token };

  } catch (error) {
    console.error('Slack token refresh error:', error);
    return { success: false };
  }
}

async function handleSlackSendMessage(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { channel, message } = args;

  if (!channel || !message) {
    return {
      success: false,
      message: 'Please specify both a channel and a message.',
    };
  }

  // Resolve channel name to ID if needed
  let channelId = channel;

  // If channel starts with #, look it up
  if (channel.startsWith('#')) {
    const channelName = channel.slice(1).toLowerCase();
    const channelsResult = await handleSlackListChannels(accessToken);

    if (channelsResult.success && channelsResult.result?.channels) {
      const foundChannel = channelsResult.result.channels.find(
        (c: any) => c.name.toLowerCase() === channelName
      );

      if (foundChannel) {
        channelId = foundChannel.id;
      } else {
        return {
          success: false,
          message: `I couldn't find a channel called "${channel}". Try "list Slack channels" to see available channels.`,
        };
      }
    }
  }

  try {
    // First, try to join the channel (auto-join for public channels)
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    });
    // Ignore join result - it's ok if already joined or if it's a DM

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      // Handle common errors
      if (result.error === 'channel_not_found') {
        return {
          success: false,
          message: `I couldn't find that channel. Make sure the channel exists and I have access to it.`,
        };
      }
      if (result.error === 'not_in_channel') {
        return {
          success: false,
          message: `I couldn't join that channel. It may be private - ask a channel admin to invite the Maggie app.`,
        };
      }

      return {
        success: false,
        message: `Failed to send message: ${result.error}`,
      };
    }

    return {
      success: true,
      message: `Message sent to ${channel}!`,
      result: {
        channel: result.channel,
        timestamp: result.ts,
      },
    };

  } catch (error) {
    console.error('Slack send message error:', error);
    return {
      success: false,
      message: 'Failed to send message to Slack. Please try again.',
    };
  }
}

async function handleSlackListChannels(accessToken: string): Promise<McpExecuteResponse> {
  try {
    const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const result = await response.json();

    if (!result.ok) {
      return {
        success: false,
        message: `Failed to list channels: ${result.error}`,
      };
    }

    const channels = (result.channels || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      is_private: c.is_private,
      num_members: c.num_members,
    }));

    if (channels.length === 0) {
      return {
        success: true,
        message: "I don't see any channels. Make sure the Maggie app has been added to your Slack workspace.",
        result: { channels: [] },
      };
    }

    // Build a nice message
    const publicChannels = channels.filter((c: any) => !c.is_private);
    const privateChannels = channels.filter((c: any) => c.is_private);

    let message = `Here are your Slack channels:\n\n`;

    if (publicChannels.length > 0) {
      message += `Public channels:\n${publicChannels.slice(0, 10).map((c: any) => `• #${c.name}`).join('\n')}`;
      if (publicChannels.length > 10) {
        message += `\n...and ${publicChannels.length - 10} more`;
      }
    }

    if (privateChannels.length > 0) {
      message += `\n\nPrivate channels:\n${privateChannels.slice(0, 5).map((c: any) => `• 🔒 ${c.name}`).join('\n')}`;
      if (privateChannels.length > 5) {
        message += `\n...and ${privateChannels.length - 5} more`;
      }
    }

    message += '\n\nYou can say "send a message to #channel-name" to post a message.';

    return {
      success: true,
      message,
      result: { channels },
    };

  } catch (error) {
    console.error('Slack list channels error:', error);
    return {
      success: false,
      message: 'Failed to list Slack channels. Please try again.',
    };
  }
}

// Integration management handlers

async function handleListAvailableIntegrations(supabase: any, userId: string): Promise<McpExecuteResponse> {
  // Get all enabled integration providers
  const { data: providers, error: providersError } = await supabase
    .from('integration_providers')
    .select('id, slug, name, description, category')
    .eq('enabled', true)
    .neq('slug', 'builtin')
    .order('name');

  if (providersError) {
    return { success: false, message: 'Failed to fetch integrations' };
  }

  // Get user's connected integrations
  const { data: userIntegrations } = await supabase
    .from('user_integrations')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('status', 'connected');

  const connectedProviderIds = new Set((userIntegrations || []).map((ui: any) => ui.provider_id));

  // Also check legacy Cal.com connection
  const { data: userData } = await supabase
    .from('users')
    .select('cal_com_access_token')
    .eq('id', userId)
    .single();

  const hasLegacyCalCom = !!userData?.cal_com_access_token;

  // Categorize providers
  const connected: any[] = [];
  const available: any[] = [];

  for (const provider of providers || []) {
    const isConnected = connectedProviderIds.has(provider.id) ||
      (provider.slug === 'cal_com' && hasLegacyCalCom);

    const info = {
      slug: provider.slug,
      name: provider.name,
      description: provider.description,
      category: provider.category,
    };

    if (isConnected) {
      connected.push(info);
    } else {
      available.push(info);
    }
  }

  // Build natural language response
  let message = '';

  if (connected.length > 0) {
    message += `You have ${connected.length} connected integration${connected.length > 1 ? 's' : ''}: ${connected.map(c => c.name).join(', ')}.\n\n`;
  } else {
    message += "You don't have any integrations connected yet.\n\n";
  }

  if (available.length > 0) {
    message += `Available to connect: ${available.map(a => a.name).join(', ')}.\n\n`;
    message += 'Would you like me to help you connect any of these?';
  } else {
    message += 'All available integrations are already connected!';
  }

  return {
    success: true,
    message,
    result: {
      connected,
      available,
    },
  };
}

async function handleStartIntegrationConnection(supabase: any, userId: string, jwt: string, args: any): Promise<McpExecuteResponse> {
  const { provider } = args;

  if (!provider) {
    return { success: false, message: 'Please specify which integration you want to connect.' };
  }

  // Check if provider exists and is enabled
  const { data: providerData } = await supabase
    .from('integration_providers')
    .select('id, slug, name')
    .eq('slug', provider)
    .eq('enabled', true)
    .single();

  if (!providerData) {
    return {
      success: false,
      message: `I couldn't find an integration called "${provider}". Try saying "list integrations" to see what's available.`,
    };
  }

  // Check if already connected
  const { data: existingConnection } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider_id', providerData.id)
    .eq('status', 'connected')
    .single();

  // Also check legacy Cal.com
  if (provider === 'cal_com') {
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', userId)
      .single();

    if (userData?.cal_com_access_token) {
      return {
        success: false,
        message: `${providerData.name} is already connected! You can use it right away.`,
      };
    }
  }

  if (existingConnection) {
    return {
      success: false,
      message: `${providerData.name} is already connected! You can use it right away.`,
    };
  }

  // Call integration-oauth-start to get OAuth URL
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/integration-oauth-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({ provider }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    return {
      success: false,
      message: result.error || `Failed to start ${providerData.name} connection. Please try again from Settings.`,
    };
  }

  // Return the OAuth URL for the user to click
  return {
    success: true,
    message: `To connect ${providerData.name}, please tap the link below to authorize access:\n\n[Connect ${providerData.name}](${result.url})\n\nAfter authorizing, you'll be returned here and I'll confirm the connection.`,
    result: {
      provider: provider,
      oauth_url: result.url,
    },
  };
}

async function handleCheckIntegrationStatus(supabase: any, userId: string, args: any): Promise<McpExecuteResponse> {
  const { provider } = args;

  if (!provider) {
    return { success: false, message: 'Please specify which integration to check.' };
  }

  // Get provider info
  const { data: providerData } = await supabase
    .from('integration_providers')
    .select('id, slug, name')
    .eq('slug', provider)
    .single();

  if (!providerData) {
    return {
      success: false,
      message: `I couldn't find an integration called "${provider}".`,
    };
  }

  // Check user_integrations
  const { data: connection } = await supabase
    .from('user_integrations')
    .select('status, connected_at')
    .eq('user_id', userId)
    .eq('provider_id', providerData.id)
    .single();

  // Also check legacy Cal.com
  if (provider === 'cal_com') {
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', userId)
      .single();

    if (userData?.cal_com_access_token) {
      return {
        success: true,
        message: `${providerData.name} is connected and ready to use!`,
        result: {
          provider: provider,
          connected: true,
          status: 'connected',
        },
      };
    }
  }

  if (connection?.status === 'connected') {
    const connectedDate = new Date(connection.connected_at).toLocaleDateString();
    return {
      success: true,
      message: `${providerData.name} is connected (since ${connectedDate}) and ready to use!`,
      result: {
        provider: provider,
        connected: true,
        status: connection.status,
        connected_at: connection.connected_at,
      },
    };
  }

  return {
    success: true,
    message: `${providerData.name} is not connected. Would you like me to help you connect it?`,
    result: {
      provider: provider,
      connected: false,
      status: connection?.status || 'not_connected',
    },
  };
}

/**
 * Handle HubSpot integration tools
 */
async function handleHubSpotTool(
  supabase: any,
  userId: string,
  toolName: string,
  args: any
): Promise<McpExecuteResponse> {
  // Get user's HubSpot integration
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select(`
      id,
      access_token,
      refresh_token,
      token_expires_at,
      external_workspace_id,
      integration_providers!inner(id, slug, oauth_config)
    `)
    .eq('user_id', userId)
    .eq('integration_providers.slug', 'hubspot')
    .eq('status', 'connected')
    .single();

  if (integrationError || !integration) {
    return {
      success: false,
      message: 'HubSpot is not connected. Please connect HubSpot in Settings → Apps.',
    };
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  const tokenExpiry = new Date(integration.token_expires_at);
  const refreshThreshold = new Date(Date.now() + 5 * 60 * 1000);

  if (tokenExpiry < refreshThreshold && integration.refresh_token) {
    const refreshResult = await refreshHubSpotToken(supabase, integration);
    if (!refreshResult.success) {
      return {
        success: false,
        message: 'Your HubSpot connection has expired. Please reconnect it in Settings.',
      };
    }
    integration.access_token = refreshResult.access_token;
  }

  // Route to specific handler
  switch (toolName) {
    case 'hubspot_create_contact':
      return await handleHubSpotCreateContact(integration.access_token, args);

    case 'hubspot_search_contacts':
      return await handleHubSpotSearchContacts(integration.access_token, args);

    case 'hubspot_get_contact':
      return await handleHubSpotGetContact(integration.access_token, args);

    case 'hubspot_create_note':
      return await handleHubSpotCreateNote(integration.access_token, args);

    default:
      return {
        success: false,
        message: `HubSpot tool ${toolName} is not yet implemented.`,
      };
  }
}

async function refreshHubSpotToken(supabase: any, integration: any): Promise<{ success: boolean; access_token?: string }> {
  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID');
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error('HubSpot credentials not configured');
    return { success: false };
  }

  try {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('HubSpot token refresh failed:', result);
      return { success: false };
    }

    // Update stored tokens
    const expiresAt = new Date(Date.now() + (result.expires_in || 21600) * 1000);

    await supabase
      .from('user_integrations')
      .update({
        access_token: result.access_token,
        refresh_token: result.refresh_token || integration.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    return { success: true, access_token: result.access_token };

  } catch (error) {
    console.error('HubSpot token refresh error:', error);
    return { success: false };
  }
}

async function handleHubSpotCreateContact(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email, firstname, lastname, phone } = args;

  if (!email) {
    return {
      success: false,
      message: 'Email is required to create a HubSpot contact.',
    };
  }

  // First, search if contact already exists
  const existingContact = await searchHubSpotContactByEmail(accessToken, email);

  const properties: Record<string, string> = { email };
  if (firstname) properties.firstname = firstname;
  if (lastname) properties.lastname = lastname;
  if (phone) properties.phone = phone;

  try {
    let response;
    let result;

    if (existingContact) {
      // Update existing contact
      response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingContact.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });

      result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: `Failed to update HubSpot contact: ${result.message || 'Unknown error'}`,
        };
      }

      return {
        success: true,
        message: `Updated contact ${email} in HubSpot.`,
        result: {
          contact_id: result.id,
          email: result.properties?.email,
          updated: true,
        },
      };
    } else {
      // Create new contact
      response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      });

      result = await response.json();

      if (!response.ok) {
        // Handle duplicate contact error
        if (result.category === 'CONFLICT') {
          return {
            success: false,
            message: `A contact with email ${email} already exists in HubSpot.`,
          };
        }
        return {
          success: false,
          message: `Failed to create HubSpot contact: ${result.message || 'Unknown error'}`,
        };
      }

      return {
        success: true,
        message: `Created contact ${email} in HubSpot.`,
        result: {
          contact_id: result.id,
          email: result.properties?.email,
          created: true,
        },
      };
    }
  } catch (error) {
    console.error('HubSpot create contact error:', error);
    return {
      success: false,
      message: 'Failed to create contact in HubSpot. Please try again.',
    };
  }
}

async function searchHubSpotContactByEmail(accessToken: string, email: string): Promise<any | null> {
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email,
          }],
        }],
        properties: ['email', 'firstname', 'lastname', 'phone'],
        limit: 1,
      }),
    });

    const result = await response.json();

    if (response.ok && result.results && result.results.length > 0) {
      return result.results[0];
    }

    return null;
  } catch (error) {
    console.error('HubSpot search error:', error);
    return null;
  }
}

async function handleHubSpotSearchContacts(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { query } = args;

  if (!query) {
    return {
      success: false,
      message: 'Please provide a search query.',
    };
  }

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 10,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to search HubSpot: ${result.message || 'Unknown error'}`,
      };
    }

    const contacts = (result.results || []).map((c: any) => ({
      id: c.id,
      email: c.properties?.email,
      name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || 'Unknown',
      phone: c.properties?.phone,
      company: c.properties?.company,
    }));

    if (contacts.length === 0) {
      return {
        success: true,
        message: `No contacts found matching "${query}" in HubSpot.`,
        result: { contacts: [] },
      };
    }

    const contactList = contacts.map((c: any) =>
      `• ${c.name} (${c.email})${c.phone ? ` - ${c.phone}` : ''}`
    ).join('\n');

    return {
      success: true,
      message: `Found ${contacts.length} contact(s) in HubSpot:\n${contactList}`,
      result: { contacts },
    };

  } catch (error) {
    console.error('HubSpot search error:', error);
    return {
      success: false,
      message: 'Failed to search HubSpot. Please try again.',
    };
  }
}

async function handleHubSpotGetContact(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email } = args;

  if (!email) {
    return {
      success: false,
      message: 'Please provide an email address.',
    };
  }

  const contact = await searchHubSpotContactByEmail(accessToken, email);

  if (!contact) {
    return {
      success: true,
      message: `No contact found with email ${email} in HubSpot.`,
      result: { found: false },
    };
  }

  const name = [contact.properties?.firstname, contact.properties?.lastname].filter(Boolean).join(' ') || 'Unknown';

  return {
    success: true,
    message: `Found contact: ${name} (${contact.properties?.email})${contact.properties?.phone ? ` - ${contact.properties?.phone}` : ''}`,
    result: {
      found: true,
      contact: {
        id: contact.id,
        email: contact.properties?.email,
        firstname: contact.properties?.firstname,
        lastname: contact.properties?.lastname,
        phone: contact.properties?.phone,
      },
    },
  };
}

async function handleHubSpotCreateNote(accessToken: string, args: any): Promise<McpExecuteResponse> {
  const { email, content, subject } = args;

  if (!email) {
    return {
      success: false,
      message: 'Email is required to create a note for a HubSpot contact.',
    };
  }

  if (!content) {
    return {
      success: false,
      message: 'Note content is required.',
    };
  }

  try {
    // First find the contact by email
    const contact = await searchHubSpotContactByEmail(accessToken, email);

    if (!contact) {
      return {
        success: false,
        message: `No contact found with email ${email} in HubSpot. Create the contact first.`,
      };
    }

    // Create the note with association to the contact
    // Using the Notes API: https://developers.hubspot.com/docs/api/crm/notes
    const noteBody = subject ? `**${subject}**\n\n${content}` : content;

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [{
          to: { id: contact.id },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 202, // Note to Contact association
          }],
        }],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('HubSpot create note error:', result);
      return {
        success: false,
        message: `Failed to create note in HubSpot: ${result.message || JSON.stringify(result)}`,
      };
    }

    // Create a Communication record to update "Last Contacted" field
    // Using HubSpot's Communications API with SMS channel type
    try {
      const commResponse = await fetch('https://api.hubapi.com/crm/v3/objects/communications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_communication_channel_type: 'SMS',
            hs_communication_logged_from: 'CRM',
            hs_communication_body: noteBody,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: contact.id },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 81, // Communication to Contact
            }],
          }],
        }),
      });
      if (!commResponse.ok) {
        const commError = await commResponse.json();
        console.warn('Failed to create SMS communication:', commError);
      }
    } catch (commError) {
      console.warn('Failed to create SMS communication:', commError);
    }

    const contactName = [contact.properties?.firstname, contact.properties?.lastname].filter(Boolean).join(' ') || email;

    return {
      success: true,
      message: `Created note for ${contactName} in HubSpot.`,
      result: {
        note_id: result.id,
        contact_id: contact.id,
        contact_email: email,
      },
    };

  } catch (error) {
    console.error('HubSpot create note error:', error);
    return {
      success: false,
      message: 'Failed to create note in HubSpot. Please try again.',
    };
  }
}

/**
 * Handle MCP server tool execution
 * Tool names are in format "server_slug:tool_name"
 */
async function handleMcpServerTool(
  supabase: any,
  userId: string,
  jwt: string,
  toolName: string,
  args: any
): Promise<McpExecuteResponse> {
  const [serverSlug, actualToolName] = toolName.split(':');

  if (!serverSlug || !actualToolName) {
    return {
      success: false,
      message: `Invalid tool name format: ${toolName}`,
    };
  }

  // First, look for a custom MCP server with matching slug (derived from name)
  const { data: customServers } = await supabase
    .from('user_mcp_servers')
    .select('id, name, server_url')
    .eq('user_id', userId)
    .eq('status', 'active');

  let serverId: string | null = null;
  let serverType: 'custom' | 'catalog' = 'custom';
  let serverName: string = '';

  // Check custom servers
  if (customServers) {
    for (const server of customServers) {
      const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (slug === serverSlug) {
        serverId = server.id;
        serverName = server.name;
        serverType = 'custom';
        break;
      }
    }
  }

  // If not found in custom, check catalog connections
  if (!serverId) {
    const { data: catalogConnections } = await supabase
      .from('user_mcp_connections')
      .select(`
        id,
        catalog:mcp_server_catalog(slug, name)
      `)
      .eq('user_id', userId)
      .eq('status', 'connected');

    if (catalogConnections) {
      for (const conn of catalogConnections) {
        if (conn.catalog?.slug === serverSlug) {
          serverId = conn.id;
          serverName = conn.catalog.name;
          serverType = 'catalog';
          break;
        }
      }
    }
  }

  if (!serverId) {
    return {
      success: false,
      message: `MCP server "${serverSlug}" not found. Make sure it's connected in Settings → MCP Servers.`,
    };
  }

  // Call mcp-proxy to execute the tool
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/mcp-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        server_type: serverType,
        server_id: serverId,
        method: 'tools/call',
        params: {
          name: actualToolName,
          arguments: args,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('MCP proxy error:', result);
      return {
        success: false,
        message: result.error || `Failed to execute tool on ${serverName}`,
      };
    }

    // MCP tools/call returns content array
    let resultMessage = '';
    if (result.content) {
      for (const item of result.content) {
        if (item.type === 'text') {
          resultMessage += item.text;
        } else if (item.type === 'resource') {
          resultMessage += `\n[Resource: ${item.resource?.uri}]`;
        }
      }
    }

    return {
      success: true,
      message: resultMessage || `Tool ${actualToolName} executed successfully`,
      result: result,
    };

  } catch (error) {
    console.error('MCP tool execution error:', error);
    return {
      success: false,
      message: `Failed to connect to ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
