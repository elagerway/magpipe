import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface GenerateRequest {
  prompt: string;
  recipient_phone: string;
  recipient_name?: string;
  conversation_history?: string[];
}

interface GenerateResponse {
  message: string;
  character_count: number;
  segment_count: number;
}

// Calculate SMS segments based on message content
function calculateSmsSegments(message: string): { charCount: number; segmentCount: number } {
  const charCount = message.length;

  // Check if message contains non-GSM characters (requiring Unicode/UCS-2)
  const gsmChars = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑܧ¿a-zäöñüà\^{}\\\[~\]|€]*$/;
  const isGsm = gsmChars.test(message);

  if (isGsm) {
    // GSM-7 encoding
    if (charCount <= 160) {
      return { charCount, segmentCount: 1 };
    } else {
      // Multi-part: 153 chars per segment due to UDH header
      return { charCount, segmentCount: Math.ceil(charCount / 153) };
    }
  } else {
    // UCS-2 encoding for Unicode
    if (charCount <= 70) {
      return { charCount, segmentCount: 1 };
    } else {
      // Multi-part: 67 chars per segment
      return { charCount, segmentCount: Math.ceil(charCount / 67) };
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Resolve user via JWT or API key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for DB operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: GenerateRequest = await req.json();

    // Validate request
    if (!body.prompt || body.prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt cannot be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.recipient_phone) {
      return new Response(
        JSON.stringify({ error: 'Recipient phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's agent configuration for context
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('agent_name, system_prompt')
      .eq('user_id', user.id)
      .single();

    // Get recent conversation history with this contact if available
    let conversationContext = '';
    if (!body.conversation_history || body.conversation_history.length === 0) {
      const { data: recentMessages } = await supabase
        .from('sms_messages')
        .select('content, direction, sent_at')
        .eq('user_id', user.id)
        .eq('recipient_number', body.recipient_phone)
        .order('sent_at', { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 0) {
        conversationContext = recentMessages
          .reverse()
          .map(m => `${m.direction === 'outbound' ? 'You' : 'Them'}: ${m.content}`)
          .join('\n');
      }
    } else {
      conversationContext = body.conversation_history.join('\n');
    }

    // Build system prompt for message generation
    const systemPrompt = `You are an SMS message writer. The user will describe what they want to communicate, and you output ONLY the SMS message text that will be sent to the recipient.

CRITICAL RULES:
- Output ONLY the message text - nothing else
- Do NOT talk to the user or ask questions
- Do NOT include meta-commentary like "Here's a message..." or "I'll send..."
- Do NOT address the user - address the RECIPIENT
- The text you output will be sent directly as an SMS to the recipient
- Keep it concise for SMS (ideally under 160 characters)
- Match the tone requested (friendly, professional, casual, urgent)
- No emojis unless specifically requested

${body.recipient_name ? `The recipient's name is ${body.recipient_name}. Address them directly.` : 'Address the recipient directly.'}

${agentConfig?.agent_name ? `You are writing on behalf of "${agentConfig.agent_name}".` : ''}

${conversationContext ? `Recent conversation for context:\n${conversationContext}` : ''}`;

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
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate an SMS message for the following intent:\n\n${body.prompt}` }
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate message: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const generatedMessage = openaiData.choices[0].message.content.trim();

    // Calculate SMS segments
    const { charCount, segmentCount } = calculateSmsSegments(generatedMessage);

    const response: GenerateResponse = {
      message: generatedMessage,
      character_count: charCount,
      segment_count: segmentCount,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-agent-message:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
