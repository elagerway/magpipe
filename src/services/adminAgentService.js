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
      businessInfo: data.business_info || null,
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

      case 'call_contact':
        // Navigate to phone page with phone number to initiate call
        // The actual call will be handled by the phone page
        const phoneNumber = actionParameters.parameters.phone_number;
        const contactName = actionParameters.parameters.name;
        const callPurpose = actionParameters.parameters.purpose;
        const callGoal = actionParameters.parameters.goal;

        // Store call intent in sessionStorage for phone page to pick up
        // Include purpose/goal so phone page can skip the template modal
        sessionStorage.setItem('pending_call', JSON.stringify({
          phoneNumber,
          contactName,
          purpose: callPurpose || null,
          goal: callGoal || null,
          timestamp: Date.now()
        }));

        // Navigate to phone page
        if (window.router) {
          window.router.navigate(`/phone?dial=${encodeURIComponent(phoneNumber)}`);
        } else {
          window.location.href = `/phone?dial=${encodeURIComponent(phoneNumber)}`;
        }

        return {
          success: true,
          message: `Navigating to call ${contactName || phoneNumber}...`,
        };

      case 'send_sms':
        // Call send-user-sms Edge Function
        functionName = 'send-user-sms';

        // Get user's service number for sending
        const { data: serviceNumbers } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('user_id', session.user.id)
          .limit(1)
          .single();

        requestBody = {
          to: actionParameters.parameters.phone_number,
          body: actionParameters.parameters.message,
          from: actionParameters.parameters.sender_number || serviceNumbers?.phone_number,
        };
        break;

      case 'add_contact':
        // Insert contact directly into database
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            user_id: session.user.id,
            name: actionParameters.parameters.name,
            phone_number: actionParameters.parameters.phone_number,
            notes: actionParameters.parameters.notes || null,
          })
          .select()
          .single();

        if (contactError) {
          throw new Error('Failed to add contact: ' + contactError.message);
        }

        return {
          success: true,
          message: `Added ${actionParameters.parameters.name} to your contacts.`,
          data: newContact,
        };

      case 'schedule_sms':
        // Get user's service number for sending
        const { data: senderNumbers } = await supabase
          .from('service_numbers')
          .select('phone_number')
          .eq('user_id', session.user.id)
          .limit(1)
          .single();

        // Insert scheduled action into database
        const { data: scheduledAction, error: scheduleError } = await supabase
          .from('scheduled_actions')
          .insert({
            user_id: session.user.id,
            action_type: 'send_sms',
            scheduled_at: actionParameters.parameters.send_at,
            status: 'pending',
            parameters: {
              recipient_phone: actionParameters.parameters.phone_number,
              recipient_name: actionParameters.parameters.name,
              message: actionParameters.parameters.message,
              sender_number: senderNumbers?.phone_number,
            },
            conversation_id: conversationId,
            created_via: 'agent',
          })
          .select()
          .single();

        if (scheduleError) {
          throw new Error('Failed to schedule SMS: ' + scheduleError.message);
        }

        // Format the scheduled time for display
        const scheduledDate = new Date(actionParameters.parameters.send_at);
        const formattedTime = scheduledDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        return {
          success: true,
          message: `Scheduled SMS to ${actionParameters.parameters.name} for ${formattedTime}.`,
          data: scheduledAction,
        };

      case 'book_calendar_appointment': {
        // Call cal-com-create-booking Edge Function
        const bookingResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cal-com-create-booking`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(actionParameters.parameters),
          }
        );

        const bookingResult = await bookingResponse.json();

        if (bookingResult.error) {
          throw new Error(bookingResult.error);
        }

        const booking = bookingResult.booking;
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
          data: booking,
        };
      }

      case 'add_and_call_business':
      case 'add_and_text_business': {
        const isCallAction = actionType === 'add_and_call_business';

        // First add the business as a contact
        const { data: newBusinessContact, error: businessError } = await supabase
          .from('contacts')
          .insert({
            user_id: session.user.id,
            name: actionParameters.parameters.name,
            phone_number: actionParameters.parameters.phone_number,
            address: actionParameters.parameters.address || null,
            website: actionParameters.parameters.website || null,
            notes: `Added via Google Places search`,
            contact_type: 'business',
          })
          .select()
          .single();

        if (businessError) {
          throw new Error('Failed to add business: ' + businessError.message);
        }

        if (isCallAction) {
          // Store call intent and navigate to phone
          sessionStorage.setItem('pending_call', JSON.stringify({
            phoneNumber: actionParameters.parameters.phone_number,
            contactName: actionParameters.parameters.name,
            timestamp: Date.now()
          }));

          // Navigate to phone page
          if (window.router) {
            window.router.navigate(`/phone?dial=${encodeURIComponent(actionParameters.parameters.phone_number)}`);
          } else {
            window.location.href = `/phone?dial=${encodeURIComponent(actionParameters.parameters.phone_number)}`;
          }

          return {
            success: true,
            message: `Added ${actionParameters.parameters.name} to contacts. Navigating to call...`,
            data: newBusinessContact,
          };
        } else {
          // Send SMS to the business
          const { data: businessServiceNumbers } = await supabase
            .from('service_numbers')
            .select('phone_number')
            .eq('user_id', session.user.id)
            .limit(1)
            .single();

          const { data: smsData, error: smsError } = await supabase.functions.invoke('send-user-sms', {
            body: {
              to: actionParameters.parameters.phone_number,
              body: actionParameters.parameters.message,
              from: businessServiceNumbers?.phone_number,
            },
          });

          if (smsError) {
            throw new Error('Failed to send SMS: ' + smsError.message);
          }

          return {
            success: true,
            message: `Added ${actionParameters.parameters.name} to contacts and sent message.`,
            data: { contact: newBusinessContact, sms: smsData },
          };
        }
      }

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
