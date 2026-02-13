import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { conversation_id, messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let finalConversationId = conversation_id;

    // If no conversation ID, create a new conversation
    if (!finalConversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('admin_conversations')
        .insert({
          user_id: user.id,
          status: 'active',
        })
        .select('id')
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        console.error('Error details:', JSON.stringify(convError, null, 2));
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation', details: convError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      finalConversationId = newConv.id;
    } else {
      // Update existing conversation's last_message_at timestamp
      await supabase
        .from('admin_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalConversationId)
        .eq('user_id', user.id);
    }

    // Insert all messages
    const messageRecords = messages.map((msg, index) => ({
      conversation_id: finalConversationId,
      role: msg.role,
      content: msg.content,
      created_at: new Date(Date.now() + index).toISOString(), // Ensure ordering
    }));

    const { error: messagesError } = await supabase
      .from('admin_messages')
      .insert(messageRecords);

    if (messagesError) {
      console.error('Error inserting messages:', messagesError);
      throw new Error('Failed to save messages');
    }

    return new Response(
      JSON.stringify({
        conversation_id: finalConversationId,
        messages_saved: messages.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in save-voice-conversation:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
