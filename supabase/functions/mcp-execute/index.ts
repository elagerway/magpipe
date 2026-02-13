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
        response = await handleHubSpotTool(supabase, userId, tool_name, args);
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
