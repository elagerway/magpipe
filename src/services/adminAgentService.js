/**
 * Admin Agent Service
 * Handles communication with the admin conversational agent
 */

import { supabase } from '../lib/supabase.js';

/**
 * Send a message to the admin agent
 * @param {string} message - The user's message
 * @param {string|null} conversationId - Optional conversation ID to continue existing conversation
 * @returns {Promise<{conversationId: string, response: string, requiresConfirmation: boolean, pendingAction?: object}>}
 */
export async function sendMessage(message, conversationId = null) {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  if (message.length > 2000) {
    throw new Error('Message too long (max 2000 characters)');
  }

  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Prepare request body
    const requestBody = {
      message: message.trim(),
    };

    if (conversationId) {
      requestBody.conversation_id = conversationId;
    }

    // Call Edge Function - using fetch directly to get error details

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-agent-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Edge Function error response:', data);
      console.error('Status:', response.status);
      console.error('Status text:', response.statusText);

      // Handle specific error codes
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in again.');
      } else if (response.status === 400) {
        throw new Error('Invalid request. Please try again.');
      } else {
        // Include detailed error info for debugging
        const errorMessage = data?.error || data?.message || 'Failed to send message';
        const errorDetails = data?.details || '';
        console.error('Error message:', errorMessage);
        console.error('Error details:', errorDetails);
        throw new Error(errorMessage);
      }
    }

    // Return parsed response
    return {
      conversationId: data.conversation_id,
      response: data.response || '',
      requiresConfirmation: data.requires_confirmation || false,
      pendingAction: data.pending_action || null,
    };

  } catch (error) {
    console.error('Admin agent service error:', error);

    // Re-throw with user-friendly message
    if (error.message.includes('Not authenticated')) {
      // Redirect to login
      window.location.href = '/login';
      throw error;
    }

    throw error;
  }
}

/**
 * Confirm and execute a pending action
 * @param {string} conversationId - The conversation ID with pending action
 * @param {object} actionParameters - The action parameters from pending_action
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function confirmAction(conversationId, actionParameters) {
  if (!conversationId || !actionParameters) {
    throw new Error('Missing conversation ID or action parameters');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Determine which Edge Function to call based on action type
    const actionType = actionParameters.type;
    let functionName = null;
    let requestBody = {};

    switch (actionType) {
      case 'update_system_prompt':
        // This would need a separate Edge Function to update system prompt
        // For now, we'll just send a confirmation message back to the agent
        return await sendMessage('Yes, please apply those changes.', conversationId);

      case 'add_knowledge_source':
        functionName = 'knowledge-source-add';
        requestBody = {
          url: actionParameters.parameters.url,
          sync_period: actionParameters.parameters.sync_period || '7d',
        };
        break;

      case 'remove_knowledge_source':
        functionName = 'knowledge-source-delete';
        requestBody = {
          id: actionParameters.parameters.id,
        };
        break;

      default:
        throw new Error('Unknown action type');
    }

    if (functionName) {
      // Execute the action via Edge Function
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: requestBody,
      });

      if (error) {
        throw new Error('Failed to execute action');
      }

      return {
        success: true,
        message: 'Action completed successfully',
        data,
      };
    }

  } catch (error) {
    console.error('Confirm action error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Get conversation history
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getConversationHistory(conversationId) {
  if (!conversationId) {
    throw new Error('Conversation ID required');
  }

  try {
    const { data, error } = await supabase
      .from('admin_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];

  } catch (error) {
    console.error('Get conversation history error:', error);
    throw new Error('Failed to load conversation history');
  }
}

/**
 * List all conversations for current user
 * @returns {Promise<Array<{id: string, status: string, created_at: string, last_message_at: string}>>}
 */
export async function listConversations() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('admin_conversations')
      .select('id, status, created_at, last_message_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];

  } catch (error) {
    console.error('List conversations error:', error);
    throw new Error('Failed to load conversations');
  }
}
