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
  type: 'update_system_prompt' | 'add_knowledge_source' | 'remove_knowledge_source';
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
      content: `You are an admin assistant for Pat AI. You help users configure their call/SMS handling agent.

You can:
- Update system prompts (use update_system_prompt function)
- Add knowledge sources from URLs (use add_knowledge_source function)

CRITICAL INSTRUCTIONS:
1. When you call a function, ALWAYS provide a natural conversational response explaining what you've prepared
2. After calling a function, ALWAYS ask "Is there anything else I can help you configure?"
3. Explain that changes are prepared but will need confirmation before becoming active
4. Keep the conversation flowing - don't abruptly end it
5. Only when the user explicitly says they're done should you say goodbye

Example flow:
User: "Update my SMS response to be more friendly"
You: [call update_system_prompt function] AND say "I've prepared a friendlier SMS response for you. When you're ready, you can review and confirm it on your dashboard. Is there anything else I can help you configure?"

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
