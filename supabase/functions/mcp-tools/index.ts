import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Built-in tool definitions (core Pat features)
const BUILTIN_TOOLS = [
  {
    name: 'update_system_prompt',
    description: 'Update the system prompt for the call/SMS handling agent',
    parameters: {
      type: 'object',
      properties: {
        new_prompt: {
          type: 'string',
          description: 'The updated system prompt text',
        },
        modification_type: {
          type: 'string',
          enum: ['append', 'replace', 'modify'],
          description: 'How to apply the change',
        },
      },
      required: ['new_prompt', 'modification_type'],
    },
  },
  {
    name: 'add_knowledge_source',
    description: 'Add a URL to the knowledge base',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch knowledge from',
        },
        sync_period: {
          type: 'string',
          enum: ['24h', '7d', '1mo', '3mo'],
          description: 'How often to re-sync',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'preview_changes',
    description: 'Show preview of proposed changes before applying',
    parameters: {
      type: 'object',
      properties: {
        action_type: {
          type: 'string',
          description: 'Type of action to preview',
        },
        details: {
          type: 'object',
          description: 'Details of the proposed change',
        },
      },
      required: ['action_type', 'details'],
    },
  },
  {
    name: 'call_contact',
    description: 'Initiate a phone call to a contact. Searches contacts by name or phone number. Extract call purpose and goal from context when user explains why they want to call.',
    parameters: {
      type: 'object',
      properties: {
        contact_identifier: {
          type: 'string',
          description: 'Contact name or phone number to call',
        },
        caller_id: {
          type: 'string',
          description: "Optional: phone number to call from (must be user's number)",
        },
        purpose: {
          type: 'string',
          description: 'Why the user is making this call (extracted from context, e.g., "follow up on inquiry", "discuss appointment")',
        },
        goal: {
          type: 'string',
          description: 'What the user wants to achieve from this call (extracted from context, e.g., "schedule meeting", "confirm appointment")',
        },
      },
      required: ['contact_identifier'],
    },
  },
  {
    name: 'send_sms',
    description: 'Send an SMS text message to a contact',
    parameters: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Contact name or phone number',
        },
        message: {
          type: 'string',
          description: 'The message content to send',
        },
        sender_number: {
          type: 'string',
          description: 'Optional: phone number to send from',
        },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'list_contacts',
    description: "Search or list user's contacts",
    parameters: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'Optional: filter contacts by name or phone',
        },
      },
    },
  },
  {
    name: 'add_contact',
    description: "Add a new contact to the user's contact list",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Contact name',
        },
        phone_number: {
          type: 'string',
          description: 'Phone number in any format',
        },
        notes: {
          type: 'string',
          description: 'Optional notes about the contact',
        },
      },
      required: ['name', 'phone_number'],
    },
  },
  {
    name: 'schedule_sms',
    description: 'Schedule an SMS message to be sent at a future time. Use this for appointment reminders, follow-ups, or any delayed messages.',
    parameters: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Contact name or phone number to send the message to',
        },
        message: {
          type: 'string',
          description: 'The message content to send',
        },
        send_at: {
          type: 'string',
          description: 'When to send the message. MUST be in ISO 8601 format (e.g., "2026-01-04T09:00:00-08:00"). Convert natural language times like "tomorrow at 9am" to ISO 8601.',
        },
      },
      required: ['recipient', 'message', 'send_at'],
    },
  },
  {
    name: 'search_business',
    description: 'Search for a business online using Google Places API. Use this when the user wants to call or text a business that is not in their contacts. Returns business name, address, and phone number.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Business name to search for (e.g., "Pizza Hut", "Dr. Smith dentist")',
        },
        location: {
          type: 'string',
          description: 'Optional location hint (e.g., "Vancouver", "near me"). If not provided, will use general search.',
        },
        intent: {
          type: 'string',
          enum: ['call', 'text'],
          description: 'What the user wants to do - call or text the business',
        },
        message: {
          type: 'string',
          description: 'If intent is "text", the message to send to the business',
        },
      },
      required: ['query', 'intent'],
    },
  },
  // Voice-mode specific tools (confirmation flow)
  {
    name: 'confirm_pending_action',
    description: 'Execute a pending action that was previewed and awaiting confirmation',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cancel_pending_action',
    description: 'Cancel a pending action that was previewed',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  // Integration management tools
  {
    name: 'list_available_integrations',
    description: 'List all available integrations that can be connected, and which ones are already connected. Use this when user asks "what integrations can I connect?" or "what apps are available?"',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'start_integration_connection',
    description: 'Start the process to connect a new integration. Returns a clickable link the user can tap to authorize the connection. Use this when user says "connect Slack" or "link my calendar".',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'The integration to connect (e.g., "slack", "cal_com", "hubspot")',
        },
      },
      required: ['provider'],
    },
  },
  {
    name: 'check_integration_status',
    description: 'Check if a specific integration is connected. Use this to verify connection status.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'The integration to check (e.g., "slack", "cal_com")',
        },
      },
      required: ['provider'],
    },
  },
];

// Tools that require specific integrations to be connected
const INTEGRATION_TOOL_REQUIREMENTS: Record<string, string> = {
  check_calendar_availability: 'cal_com',
  book_calendar_appointment: 'cal_com',
  slack_send_message: 'slack',
  slack_list_channels: 'slack',
};

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

interface McpToolsResponse {
  tools: ToolDefinition[];
  integrations: {
    connected: string[];
    available: string[];
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
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

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all enabled integration providers with their tool schemas
    const { data: providers, error: providersError } = await supabase
      .from('integration_providers')
      .select('id, slug, name, tools_schema')
      .eq('enabled', true);

    if (providersError) throw providersError;

    // Get user's connected integrations
    const { data: userIntegrations, error: integrationsError } = await supabase
      .from('user_integrations')
      .select('provider_id, status')
      .eq('user_id', user.id)
      .eq('status', 'connected');

    if (integrationsError) throw integrationsError;

    // Build set of connected provider IDs
    const connectedProviderIds = new Set(userIntegrations?.map(ui => ui.provider_id) || []);

    // Build provider slug lookup
    const providerById: Record<string, { slug: string; name: string; tools_schema: ToolDefinition[] }> = {};
    const allProviderSlugs: string[] = [];

    for (const p of providers || []) {
      if (p.slug !== 'builtin') {
        providerById[p.id] = {
          slug: p.slug,
          name: p.name,
          tools_schema: p.tools_schema || [],
        };
        allProviderSlugs.push(p.slug);
      }
    }

    // Get connected provider slugs
    const connectedSlugs: string[] = [];
    for (const providerId of connectedProviderIds) {
      const provider = providerById[providerId];
      if (provider) {
        connectedSlugs.push(provider.slug);
      }
    }

    // Start with built-in tools
    const tools: ToolDefinition[] = [...BUILTIN_TOOLS];

    // Add integration tools for connected integrations
    for (const providerId of connectedProviderIds) {
      const provider = providerById[providerId];
      if (provider && provider.tools_schema) {
        // Add each tool from the provider
        for (const tool of provider.tools_schema) {
          tools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          });
        }
      }
    }

    // Also check for Cal.com in users table (backward compatibility)
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', user.id)
      .single();

    if (userData?.cal_com_access_token && !connectedSlugs.includes('cal_com')) {
      // User has Cal.com connected in old location, add calendar tools
      connectedSlugs.push('cal_com');

      // Find Cal.com provider and add its tools
      for (const p of providers || []) {
        if (p.slug === 'cal_com' && p.tools_schema) {
          for (const tool of p.tools_schema) {
            tools.push({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            });
          }
        }
      }
    }

    const response: McpToolsResponse = {
      tools,
      integrations: {
        connected: connectedSlugs,
        available: allProviderSlugs.filter(s => !connectedSlugs.includes(s)),
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('MCP tools error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
