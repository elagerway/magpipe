import { createClient } from 'npm:@supabase/supabase-js@2'
import { getToolSource, McpExecuteResponse } from './utils.ts'
import { handleListContacts, handleAddContact, handleCallContact } from './contacts.ts'
import { handleSendSms, handleScheduleSms } from './sms.ts'
import { handleSearchBusiness, handleUpdateSystemPrompt, handleAddKnowledgeSource, handleCheckCalendarAvailability, handleBookCalendarAppointment } from './misc-tools.ts'
import { handleIntegrationTool } from './slack.ts'
import { handleListAvailableIntegrations, handleStartIntegrationConnection, handleCheckIntegrationStatus } from './integrations.ts'
import { handleHubSpotTool } from './hubspot.ts'
import { handleMcpServerTool } from './mcp-server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface McpExecuteRequest {
  tool_name: string;
  arguments: Record<string, any>;
  mode?: 'preview' | 'execute';
}


Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
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
      userId = xUserId;
      console.log('Service role call for user:', userId);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid authorization token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
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
      case 'list_available_integrations':
        response = await handleListAvailableIntegrations(supabase, userId);
        break;
      case 'start_integration_connection':
        response = await handleStartIntegrationConnection(supabase, userId, jwt, args);
        break;
      case 'check_integration_status':
        response = await handleCheckIntegrationStatus(supabase, userId, args);
        break;
      case 'slack_send_message':
      case 'slack_list_channels':
        response = await handleIntegrationTool(supabase, userId, tool_name, args);
        break;
      case 'hubspot_create_contact':
      case 'hubspot_search_contacts':
      case 'hubspot_get_contact':
      case 'hubspot_create_note':
      case 'hubspot_list_contact_properties':
        response = await handleHubSpotTool(supabase, userId, tool_name, args);
        break;
      case 'cal_com_list_event_types':
        response = await handleCalComListEventTypes(supabase, userId);
        break;
      default:
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

/**
 * Fetch Cal.com event types for the authenticated user.
 */
async function handleCalComListEventTypes(supabase: any, userId: string): Promise<McpExecuteResponse> {
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('id, access_token, refresh_token, token_expires_at, integration_providers!inner(slug)')
    .eq('user_id', userId)
    .eq('integration_providers.slug', 'cal_com')
    .eq('status', 'connected')
    .single();

  if (!integration?.access_token) {
    return { success: false, message: 'Cal.com not connected.' };
  }

  // Refresh token if expired
  let accessToken = integration.access_token;
  const expiry = new Date(integration.token_expires_at || 0);
  if (expiry.getTime() - Date.now() < 5 * 60 * 1000 && integration.refresh_token) {
    const clientId = Deno.env.get('CAL_COM_CLIENT_ID')!;
    try {
      const refreshParams: Record<string, string> = {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: integration.refresh_token,
      };
      const clientSecret = Deno.env.get('CAL_COM_CLIENT_SECRET');
      if (clientSecret) refreshParams.client_secret = clientSecret;

      const refreshResp = await fetch('https://app.cal.com/api/auth/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(refreshParams),
      });
      const refreshBody = await refreshResp.text();
      if (refreshResp.ok) {
        const tokens = JSON.parse(refreshBody);
        accessToken = tokens.access_token;
        const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
        await supabase.from('user_integrations').update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || integration.refresh_token,
          token_expires_at: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', integration.id);
        // Also update legacy users table
        await supabase.from('users').update({
          cal_com_access_token: tokens.access_token,
          cal_com_refresh_token: tokens.refresh_token || integration.refresh_token,
          cal_com_token_expires_at: newExpiry.toISOString(),
        }).eq('id', userId);
      } else {
        console.error('Cal.com token refresh failed:', refreshBody);
        return { success: false, message: 'Cal.com token expired. Please reconnect Cal.com.' };
      }
    } catch (err) {
      console.error('Cal.com token refresh error:', err);
      return { success: false, message: 'Failed to refresh Cal.com token.' };
    }
  }

  try {
    const response = await fetch('https://api.cal.com/v2/event-types', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'cal-api-version': '2024-06-14',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, message: `Cal.com API error (${response.status}): ${errText}` };
    }

    const data = await response.json();
    const eventTypes = (data.data || []).map((et: any) => ({
      id: et.id,
      slug: et.slug,
      title: et.title,
      length: et.lengthInMinutes || et.length,
    }));

    return {
      success: true,
      message: `Found ${eventTypes.length} event type(s).`,
      result: { event_types: eventTypes },
    };
  } catch (err) {
    console.error('Cal.com list event types error:', err);
    return { success: false, message: 'Failed to fetch Cal.com event types.' };
  }
}
