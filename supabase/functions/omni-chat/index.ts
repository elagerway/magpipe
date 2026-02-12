import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from "../_shared/api-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ChatRequest {
  agent_id: string;
  message: string;
  conversation_history?: Array<{ role: string; content: string }>;
}

interface PendingAction {
  type: string;
  preview: string;
  parameters: Record<string, any>;
}

// OpenAI function definitions for admin commands
const functions = [
  {
    name: 'call_contact',
    description: 'Initiate a phone call to a contact. Searches contacts by name or phone number.',
    parameters: {
      type: 'object',
      properties: {
        contact_identifier: {
          type: 'string',
          description: 'Contact name or phone number to call',
        },
        purpose: {
          type: 'string',
          description: 'Why the user is making this call',
        },
        goal: {
          type: 'string',
          description: 'What the user wants to achieve from this call',
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
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'list_contacts',
    description: 'Search or list contacts',
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
    description: 'Add a new contact',
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
    description: 'Schedule an SMS message to be sent at a future time',
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
        send_at: {
          type: 'string',
          description: 'When to send the message in ISO 8601 format',
        },
      },
      required: ['recipient', 'message', 'send_at'],
    },
  },
  {
    name: 'search_business',
    description: 'Search for a business online using Google Places API',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Business name to search for',
        },
        location: {
          type: 'string',
          description: 'Optional location hint',
        },
        intent: {
          type: 'string',
          enum: ['call', 'text'],
          description: 'What the user wants to do - call or text the business',
        },
      },
      required: ['query', 'intent'],
    },
  },
  {
    name: 'update_agent_config',
    description: 'Update the selected agent configuration (system prompt, name, etc.)',
    parameters: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['system_prompt', 'name', 'greeting'],
          description: 'Which field to update',
        },
        value: {
          type: 'string',
          description: 'The new value',
        },
        modification_type: {
          type: 'string',
          enum: ['append', 'replace', 'modify'],
          description: 'How to apply the change (for system_prompt)',
        },
      },
      required: ['field', 'value'],
    },
  },
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin/support/god role
    const { data: userData, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (roleError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['admin', 'support', 'god'].includes(userData.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin, support, or god role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: ChatRequest = await req.json();

    if (!body.agent_id) {
      return new Response(
        JSON.stringify({ error: 'agent_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.message || body.message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch agent config
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configs')
      .select('id, name, system_prompt, voice_id, user_id')
      .eq('id', body.agent_id)
      .single();

    if (agentError || !agentConfig) {
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get agent owner info
    const { data: ownerData } = await supabase
      .from('users')
      .select('id, name, organization_name')
      .eq('id', agentConfig.user_id)
      .single();

    // Build admin system prompt
    const systemPrompt = `You are an admin assistant for the god/admin user. You can execute commands and manage the system.

SELECTED AGENT CONTEXT:
- Agent Name: ${agentConfig.name || 'Unnamed'}
- Agent Owner: ${ownerData?.name || 'Unknown'} (${ownerData?.organization_name || 'No organization'})
- Agent ID: ${agentConfig.id}

You can:
- Call contacts by name or phone number (use call_contact function)
- Send SMS messages to contacts (use send_sms function)
- Schedule SMS messages for future delivery (use schedule_sms function)
- List or search contacts (use list_contacts function)
- Add new contacts (use add_contact function)
- Search for businesses online (use search_business function)
- Update the selected agent's configuration (use update_agent_config function)

IMPORTANT:
1. When you call a function, ALWAYS provide a natural conversational response explaining what you've prepared
2. For actions like calls and SMS, explain that the action is ready and will need confirmation
3. You are speaking to a god/admin user who has full system access
4. Be concise but helpful

Example flows:
User: "Call John"
You: [call call_contact function] "I found John. Ready to place the call when you confirm."

User: "Update this agent's greeting to be more friendly"
You: [call update_agent_config function] "I've prepared a friendlier greeting for ${agentConfig.name}. Review and confirm to apply."`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(body.conversation_history || []),
      { role: 'user', content: body.message }
    ];

    // Call OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        functions,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices[0].message;

    // Build response
    const response: any = {
      response: assistantMessage.content || 'Processing...',
      agent_name: agentConfig.name,
      requires_confirmation: !!assistantMessage.function_call,
    };

    // If function call, process and add pending action
    if (assistantMessage.function_call) {
      const functionName = assistantMessage.function_call.name;
      const functionArgs = JSON.parse(assistantMessage.function_call.arguments);
      const ownerId = agentConfig.user_id;

      if (functionName === 'call_contact') {
        const { contact_identifier, purpose, goal } = functionArgs;
        const searchTerm = contact_identifier.toLowerCase();
        const phoneDigits = contact_identifier.replace(/\D/g, '');

        // Search in agent owner's contacts
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, phone_number')
          .eq('user_id', ownerId);

        const matches = (contacts || []).filter(c =>
          c.name?.toLowerCase().includes(searchTerm) ||
          (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
        );

        if (matches.length === 1) {
          response.pending_action = {
            type: 'call_contact',
            preview: `Call ${matches[0].name} at ${matches[0].phone_number}?${purpose ? `\nPurpose: ${purpose}` : ''}${goal ? `\nGoal: ${goal}` : ''}`,
            parameters: {
              contact_id: matches[0].id,
              phone_number: matches[0].phone_number,
              name: matches[0].name,
              purpose,
              goal,
            },
          };
        } else if (matches.length > 1) {
          const contactList = matches.map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          response.response = `I found multiple contacts matching "${contact_identifier}":\n${contactList}\n\nPlease be more specific.`;
          response.requires_confirmation = false;
        } else if (phoneDigits.length >= 10) {
          const formattedNumber = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;
          response.pending_action = {
            type: 'call_contact',
            preview: `Call ${contact_identifier} at ${formattedNumber}?`,
            parameters: { phone_number: formattedNumber, name: contact_identifier },
          };
        } else {
          response.response = `I couldn't find a contact matching "${contact_identifier}".`;
          response.requires_confirmation = false;
        }
      } else if (functionName === 'send_sms') {
        const { recipient, message } = functionArgs;
        const searchTerm = recipient.toLowerCase();
        const phoneDigits = recipient.replace(/\D/g, '');

        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, phone_number')
          .eq('user_id', ownerId);

        const matches = (contacts || []).filter(c =>
          c.name?.toLowerCase().includes(searchTerm) ||
          (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
        );

        if (matches.length === 1) {
          response.pending_action = {
            type: 'send_sms',
            preview: `Send to ${matches[0].name} (${matches[0].phone_number}):\n"${message}"`,
            parameters: {
              contact_id: matches[0].id,
              phone_number: matches[0].phone_number,
              name: matches[0].name,
              message,
            },
          };
        } else if (matches.length > 1) {
          const contactList = matches.map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          response.response = `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific.`;
          response.requires_confirmation = false;
        } else if (phoneDigits.length >= 10) {
          const formattedNumber = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;
          response.pending_action = {
            type: 'send_sms',
            preview: `Send to ${formattedNumber}:\n"${message}"`,
            parameters: { phone_number: formattedNumber, name: recipient, message },
          };
        } else {
          response.response = `I couldn't find a contact matching "${recipient}".`;
          response.requires_confirmation = false;
        }
      } else if (functionName === 'list_contacts') {
        const { search_term } = functionArgs;

        const { data: contacts } = await supabase
          .from('contacts')
          .select('name, phone_number')
          .eq('user_id', ownerId)
          .order('name');

        let filteredContacts = contacts || [];
        if (search_term) {
          const term = search_term.toLowerCase();
          filteredContacts = filteredContacts.filter(c =>
            c.name?.toLowerCase().includes(term) ||
            c.phone_number?.includes(search_term)
          );
        }

        if (filteredContacts.length === 0) {
          response.response = search_term
            ? `No contacts found matching "${search_term}".`
            : "No contacts found for this agent's owner.";
        } else {
          const contactList = filteredContacts.slice(0, 10).map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          const moreText = filteredContacts.length > 10 ? `\n\n...and ${filteredContacts.length - 10} more` : '';
          response.response = `Contacts for ${ownerData?.name || 'agent owner'}:\n${contactList}${moreText}`;
        }
        response.requires_confirmation = false;
      } else if (functionName === 'add_contact') {
        const { name, phone_number, notes } = functionArgs;
        const phoneDigits = phone_number.replace(/\D/g, '');
        const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

        response.pending_action = {
          type: 'add_contact',
          preview: `Add contact for ${ownerData?.name || 'agent owner'}:\n${name} (${normalizedPhone})${notes ? ` - ${notes}` : ''}`,
          parameters: { name, phone_number: normalizedPhone, notes, user_id: ownerId },
        };
      } else if (functionName === 'update_agent_config') {
        const { field, value, modification_type } = functionArgs;

        response.pending_action = {
          type: 'update_agent_config',
          preview: `Update ${agentConfig.name}'s ${field}:\n\n${value}`,
          parameters: {
            agent_id: agentConfig.id,
            field,
            value,
            modification_type,
          },
        };
      } else if (functionName === 'search_business') {
        const { query, location, intent } = functionArgs;
        const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

        if (!GOOGLE_API_KEY) {
          response.response = 'Business search is not configured.';
          response.requires_confirmation = false;
        } else {
          const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
          searchUrl.searchParams.set('query', location ? `${query} ${location}` : query);
          searchUrl.searchParams.set('key', GOOGLE_API_KEY);

          const placesResponse = await fetch(searchUrl.toString());
          const placesData = await placesResponse.json();

          if (placesData.status === 'OK' && placesData.results?.length > 0) {
            const place = placesData.results[0];

            const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
            detailsUrl.searchParams.set('place_id', place.place_id);
            detailsUrl.searchParams.set('fields', 'formatted_phone_number,international_phone_number,name,formatted_address');
            detailsUrl.searchParams.set('key', GOOGLE_API_KEY);

            const detailsResponse = await fetch(detailsUrl.toString());
            const detailsData = await detailsResponse.json();
            const details = detailsData.result;

            if (details?.international_phone_number || details?.formatted_phone_number) {
              const rawPhone = details.international_phone_number || details.formatted_phone_number;
              const phoneDigits = rawPhone.replace(/\D/g, '');
              const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

              response.response = `Found ${details.name}:\n📍 ${details.formatted_address || 'No address'}\n📞 ${rawPhone}`;
              response.business_info = {
                name: details.name,
                phone: rawPhone,
                phone_number: normalizedPhone,
                address: details.formatted_address,
              };
            } else {
              response.response = `Found ${details?.name || place.name} but no phone number listed.`;
            }
          } else {
            response.response = `Couldn't find businesses matching "${query}"${location ? ` near ${location}` : ''}.`;
          }
          response.requires_confirmation = false;
        }
      }
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in omni-chat:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
