import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ChatRequest {
  message: string;
  conversation_id?: string;
}

interface PendingAction {
  type: 'update_system_prompt' | 'add_knowledge_source' | 'remove_knowledge_source' | 'call_contact' | 'send_sms' | 'add_contact' | 'schedule_sms' | 'add_and_call_business' | 'add_and_text_business';
  preview: string;
  parameters: Record<string, any>;
}

interface ChatResponse {
  conversation_id: string;
  response: string;
  requires_confirmation: boolean;
  pending_action?: PendingAction;
}

// OpenAI function definitions
const functions = [
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
          description: 'Optional: phone number to call from (must be user\'s number)',
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
    description: 'Search or list user\'s contacts',
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
    description: 'Add a new contact to the user\'s contact list',
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
];

serve(async (req) => {
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

    // Parse request body
    const body: ChatRequest = await req.json();

    // Validate request
    if (!body.message || body.message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.message.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Message too long (max 2000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create or load conversation
    let conversationId = body.conversation_id;
    if (!conversationId) {
      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('admin_conversations')
        .insert({
          user_id: user.id,
          status: 'active',
        })
        .select()
        .single();

      if (convError) throw convError;
      conversationId = newConv.id;
    }

    // Save user message
    await supabase.from('admin_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: body.message,
    });

    // Load conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('admin_messages')
      .select('role, content, function_call')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    // Build OpenAI messages array
    const openaiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.function_call && { function_call: m.function_call }),
    }));

    // Add system message
    openaiMessages.unshift({
      role: 'system',
      content: `You are an admin assistant for Pat AI. You help users configure their call/SMS handling agent and take actions on their behalf.

You can:
- Update system prompts (use update_system_prompt function)
- Add knowledge sources from URLs (use add_knowledge_source function)
- Call contacts by name or phone number (use call_contact function)
- Send SMS messages to contacts (use send_sms function)
- Schedule SMS messages for future delivery like appointment reminders (use schedule_sms function)
- List or search contacts (use list_contacts function)
- Add new contacts (use add_contact function)
- Search for businesses online and add them to contacts (use search_business function)

CRITICAL INSTRUCTIONS:
1. When you call a function, ALWAYS provide a natural conversational response explaining what you've prepared
2. After calling a function, ALWAYS ask "Is there anything else I can help you with?"
3. For actions like calls and SMS, explain that the action is prepared and will need confirmation before executing
4. Keep the conversation flowing - don't abruptly end it
5. Only when the user explicitly says they're done should you say goodbye

Example flows:
User: "Update my SMS response to be more friendly"
You: [call update_system_prompt function] AND say "I've prepared a friendlier SMS response for you. When you're ready, you can review and confirm it. Is there anything else I can help you with?"

User: "Call John"
You: [call call_contact function with contact_identifier: "John"] AND say "I found John in your contacts. Ready to place the call when you confirm. Is there anything else?"

User: "Text Sarah: I'm running late"
You: [call send_sms function with recipient: "Sarah", message: "I'm running late"] AND say "I've prepared a message to Sarah. You can review and send it when ready. Anything else?"

User: "Who are my contacts?"
You: [call list_contacts function] AND respond with the list of contacts

User: "Send John an appointment reminder tomorrow at 9am"
You: [call schedule_sms function with recipient: "John", message: "This is a reminder about your appointment", send_at: ISO 8601 timestamp for tomorrow 9am] AND say "I've scheduled an appointment reminder for John tomorrow at 9am. It will be sent automatically. Anything else?"

User: "Call Pizza Hut"
You: [First check if "Pizza Hut" is in contacts - if NOT found, call search_business function with query: "Pizza Hut", intent: "call"] AND say "I found Pizza Hut - here's the info. Would you like me to add them to your contacts and call?"

User: "Text the nearest Starbucks that I'm running late"
You: [call search_business function with query: "Starbucks", intent: "text", message: "I'm running late"] AND say "I found a Starbucks location. Would you like me to add them and send your message?"

IMPORTANT for business search:
- When a user asks to call/text someone NOT in their contacts and it sounds like a business name (Pizza Hut, Starbucks, Dr. Smith, etc.), use search_business
- Always confirm the found business with the user before adding to contacts
- If search returns no results or no phone number, offer to search with a different query or location

CRITICAL - NEVER REFUSE TO CALL OR TEXT:
- You CAN make calls and send texts to ANY number - contacts OR businesses
- If someone asks to call "Pizza Hut" or any business, use search_business to find their number, then offer to call
- NEVER say "I can't make calls to external numbers" - you absolutely CAN via the search_business function
- For ANY business name the user wants to call/text, use search_business first to look up their phone number

Be warm, conversational, and helpful. Never expose vendor names like "OpenAI" or "Retell" - use "Pat AI assistant" instead.`,
    });

    // Call OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    console.log('OpenAI key length:', openaiApiKey.length);
    console.log('OpenAI key prefix:', openaiApiKey.substring(0, 10));

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: openaiMessages,
        functions,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      console.error('OpenAI response status:', openaiResponse.status);
      console.error('OpenAI response headers:', Object.fromEntries(openaiResponse.headers.entries()));
      throw new Error(`OpenAI API error (${openaiResponse.status}): ${error}`);
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices[0].message;

    // Save assistant response
    await supabase.from('admin_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: assistantMessage.content || '',
      function_call: assistantMessage.function_call || null,
    });

    // Update conversation last_message_at
    await supabase
      .from('admin_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Build response
    const response: ChatResponse = {
      conversation_id: conversationId,
      response: assistantMessage.content || 'Processing...',
      requires_confirmation: !!assistantMessage.function_call,
    };

    // If function call, add pending action
    if (assistantMessage.function_call) {
      const functionName = assistantMessage.function_call.name;
      const functionArgs = JSON.parse(assistantMessage.function_call.arguments);

      if (functionName === 'update_system_prompt') {
        // Get current prompt from agent_configs
        const { data: agentConfig } = await supabase
          .from('agent_configs')
          .select('system_prompt')
          .eq('user_id', user.id)
          .single();

        response.pending_action = {
          type: 'update_system_prompt',
          preview: `Proposed new prompt:\n\n${functionArgs.new_prompt}`,
          parameters: functionArgs,
        };
      } else if (functionName === 'add_knowledge_source') {
        response.pending_action = {
          type: 'add_knowledge_source',
          preview: `Will add knowledge from: ${functionArgs.url}`,
          parameters: functionArgs,
        };
      } else if (functionName === 'call_contact') {
        // Look up contact by name or phone number
        const { contact_identifier, caller_id, purpose, goal } = functionArgs;
        const searchTerm = contact_identifier.toLowerCase();
        const phoneDigits = contact_identifier.replace(/\D/g, '');

        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, phone_number')
          .eq('user_id', user.id);

        // Find matching contacts (only check phone if there are digits to match)
        const matches = (contacts || []).filter(c =>
          c.name?.toLowerCase().includes(searchTerm) ||
          (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
        );

        // Build preview with purpose/goal if provided
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
          // Check if it's a direct phone number
          if (phoneDigits.length >= 10) {
            const formattedNumber = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;
            response.pending_action = {
              type: 'call_contact',
              preview: buildPreview(contact_identifier, formattedNumber),
              parameters: {
                phone_number: formattedNumber,
                name: contact_identifier,
                caller_id,
                purpose: purpose || null,
                goal: goal || null,
              },
            };
          } else {
            response.response = `I couldn't find a contact matching "${contact_identifier}". Try using their full name or phone number.`;
            response.requires_confirmation = false;
          }
        } else if (matches.length === 1) {
          response.pending_action = {
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
          };
        } else {
          // Multiple matches - list them
          const contactList = matches.map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          response.response = `I found multiple contacts matching "${contact_identifier}":\n${contactList}\n\nPlease be more specific about who you'd like to call.`;
          response.requires_confirmation = false;
        }
      } else if (functionName === 'send_sms') {
        // Look up recipient contact
        const { recipient, message, sender_number } = functionArgs;
        const searchTerm = recipient.toLowerCase();
        const phoneDigits = recipient.replace(/\D/g, '');

        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, phone_number')
          .eq('user_id', user.id);

        // Find matching contacts (only check phone if there are digits to match)
        const matches = (contacts || []).filter(c =>
          c.name?.toLowerCase().includes(searchTerm) ||
          (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
        );

        if (matches.length === 0) {
          if (phoneDigits.length >= 10) {
            response.pending_action = {
              type: 'send_sms',
              preview: `Send to ${recipient}: "${message}"`,
              parameters: {
                phone_number: phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`,
                name: recipient,
                message,
                sender_number
              },
            };
          } else {
            response.response = `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`;
            response.requires_confirmation = false;
          }
        } else if (matches.length === 1) {
          response.pending_action = {
            type: 'send_sms',
            preview: `Send to ${matches[0].name} (${matches[0].phone_number}): "${message}"`,
            parameters: {
              contact_id: matches[0].id,
              phone_number: matches[0].phone_number,
              name: matches[0].name,
              message,
              sender_number
            },
          };
        } else {
          const contactList = matches.map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          response.response = `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific about who you'd like to text.`;
          response.requires_confirmation = false;
        }
      } else if (functionName === 'list_contacts') {
        // List/search contacts - this doesn't require confirmation
        const { search_term } = functionArgs;

        let query = supabase
          .from('contacts')
          .select('name, phone_number')
          .eq('user_id', user.id)
          .order('name');

        const { data: contacts } = await query;

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
            : "You don't have any contacts yet. Would you like to add one?";
        } else {
          const contactList = filteredContacts.slice(0, 10).map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
          const moreText = filteredContacts.length > 10 ? `\n\n...and ${filteredContacts.length - 10} more` : '';
          response.response = `Here are your contacts:\n${contactList}${moreText}`;
        }
        response.requires_confirmation = false;
      } else if (functionName === 'add_contact') {
        const { name, phone_number, notes } = functionArgs;

        // Normalize phone number
        const phoneDigits = phone_number.replace(/\D/g, '');
        const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

        // Check for duplicates
        const { data: existing } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('phone_number', normalizedPhone)
          .single();

        if (existing) {
          response.response = `A contact with that phone number already exists: ${existing.name}. Would you like to update their information instead?`;
          response.requires_confirmation = false;
        } else {
          response.pending_action = {
            type: 'add_contact',
            preview: `Add contact: ${name} (${normalizedPhone})${notes ? ` - ${notes}` : ''}`,
            parameters: { name, phone_number: normalizedPhone, notes },
          };
        }
      } else if (functionName === 'schedule_sms') {
        // Schedule SMS for future delivery
        const { recipient, message, send_at } = functionArgs;
        const searchTerm = recipient.toLowerCase();
        const phoneDigits = recipient.replace(/\D/g, '');

        // Parse and validate the scheduled time
        let scheduledTime: Date;
        try {
          scheduledTime = new Date(send_at);
          if (isNaN(scheduledTime.getTime())) {
            throw new Error('Invalid date');
          }
          // Ensure it's in the future
          if (scheduledTime <= new Date()) {
            response.response = `The scheduled time must be in the future. Please specify a future date and time.`;
            response.requires_confirmation = false;
          }
        } catch {
          response.response = `I couldn't understand the time "${send_at}". Please try again with a specific time like "tomorrow at 9am" or "January 5th at 2pm".`;
          response.requires_confirmation = false;
        }

        // If time is valid and in the future, look up recipient
        if (!response.response || response.requires_confirmation !== false) {
          const { data: contacts } = await supabase
            .from('contacts')
            .select('id, name, phone_number')
            .eq('user_id', user.id);

          // Find matching contacts
          const matches = (contacts || []).filter(c =>
            c.name?.toLowerCase().includes(searchTerm) ||
            (phoneDigits.length >= 3 && c.phone_number?.includes(phoneDigits))
          );

          // Format time for display
          const formattedTime = scheduledTime!.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          if (matches.length === 0) {
            if (phoneDigits.length >= 10) {
              const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;
              response.pending_action = {
                type: 'schedule_sms',
                preview: `Schedule SMS to ${recipient} for ${formattedTime}:\n"${message}"`,
                parameters: {
                  phone_number: normalizedPhone,
                  name: recipient,
                  message,
                  send_at: scheduledTime!.toISOString(),
                },
              };
            } else {
              response.response = `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`;
              response.requires_confirmation = false;
            }
          } else if (matches.length === 1) {
            response.pending_action = {
              type: 'schedule_sms',
              preview: `Schedule SMS to ${matches[0].name} (${matches[0].phone_number}) for ${formattedTime}:\n"${message}"`,
              parameters: {
                contact_id: matches[0].id,
                phone_number: matches[0].phone_number,
                name: matches[0].name,
                message,
                send_at: scheduledTime!.toISOString(),
              },
            };
          } else {
            const contactList = matches.map(c => `• ${c.name}: ${c.phone_number}`).join('\n');
            response.response = `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific about who you'd like to schedule the message for.`;
            response.requires_confirmation = false;
          }
        }
      } else if (functionName === 'search_business') {
        const { query, location, intent, message: smsMessage } = functionArgs;

        // Call Google Places API
        const GOOGLE_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');

        if (!GOOGLE_API_KEY) {
          response.response = `Business search is not configured. Please contact support.`;
          response.requires_confirmation = false;
        } else {
          // Use Text Search API
          const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
          searchUrl.searchParams.set('query', location ? `${query} ${location}` : query);
          searchUrl.searchParams.set('key', GOOGLE_API_KEY);

          const placesResponse = await fetch(searchUrl.toString());
          const placesData = await placesResponse.json();

          if (placesData.status === 'OK' && placesData.results && placesData.results.length > 0) {
            const place = placesData.results[0];

            // Get place details to get phone number
            const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
            detailsUrl.searchParams.set('place_id', place.place_id);
            detailsUrl.searchParams.set('fields', 'formatted_phone_number,international_phone_number,name,formatted_address,website,opening_hours');
            detailsUrl.searchParams.set('key', GOOGLE_API_KEY);

            const detailsResponse = await fetch(detailsUrl.toString());
            const detailsData = await detailsResponse.json();
            const details = detailsData.result;

            if (details && (details.international_phone_number || details.formatted_phone_number)) {
              // Normalize phone number to E.164 format
              const rawPhone = details.international_phone_number || details.formatted_phone_number;
              const phoneDigits = rawPhone.replace(/\D/g, '');
              const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`;

              const actionType = intent === 'text' ? 'add_and_text_business' : 'add_and_call_business';
              const actionVerb = intent === 'text' ? 'text' : 'call';

              response.pending_action = {
                type: actionType,
                preview: `Found: ${details.name}\nAddress: ${details.formatted_address}\nPhone: ${details.formatted_phone_number || details.international_phone_number}\n\nWould you like me to add this to your contacts and ${actionVerb} them?`,
                parameters: {
                  name: details.name,
                  phone_number: normalizedPhone,
                  address: details.formatted_address || null,
                  website: details.website || null,
                  source: 'google_places',
                  intent,
                  message: smsMessage || null,
                },
              };
            } else {
              response.response = `I found ${details?.name || place.name} at ${details?.formatted_address || place.formatted_address}, but they don't have a phone number listed. Would you like me to search for another location?`;
              response.requires_confirmation = false;
            }
          } else {
            response.response = `I couldn't find any businesses matching "${query}"${location ? ` near ${location}` : ''}. Try being more specific or adding a location.`;
            response.requires_confirmation = false;
          }
        }
      }

      // Save pending action to conversation context
      await supabase
        .from('admin_conversations')
        .update({
          context: { pending_action: response.pending_action },
        })
        .eq('id', conversationId);
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-agent-chat:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.stack,
        name: error.name
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
