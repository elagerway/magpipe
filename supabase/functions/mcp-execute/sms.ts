import { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { normalizePhoneNumber, findContacts, McpExecuteResponse } from './utils.ts'

export async function handleSendSms(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { recipient, message, sender_number } = args;
  const matches = await findContacts(supabase, userId, recipient);
  const phoneDigits = recipient.replace(/\D/g, '');

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const normalizedPhone = normalizePhoneNumber(recipient);

      if (mode === 'preview') {
        return {
          success: true,
          requires_confirmation: true,
          pending_action: {
            type: 'send_sms',
            preview: `Send to ${recipient}: "${message}"`,
            parameters: {
              phone_number: normalizedPhone,
              name: recipient,
              message,
              sender_number,
            },
          },
        };
      }

      // Execute mode - send the SMS
      return await executeSendSms(supabase, userId, normalizedPhone, message, sender_number);
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    if (mode === 'preview') {
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'send_sms',
          preview: `Send to ${matches[0].name} (${matches[0].phone_number}): "${message}"`,
          parameters: {
            contact_id: matches[0].id,
            phone_number: matches[0].phone_number,
            name: matches[0].name,
            message,
            sender_number,
          },
        },
      };
    }

    return await executeSendSms(supabase, userId, matches[0].phone_number, message, sender_number);
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific about who you'd like to text.`,
  };
}

export async function executeSendSms(supabase: any, userId: string, toNumber: string, message: string, senderNumber?: string) {
  // Get user's service number if not provided
  if (!senderNumber) {
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', userId)
      .limit(1)
      .single();
    senderNumber = serviceNumbers?.phone_number;
  }

  if (!senderNumber) {
    return { success: false, message: 'No service number available to send from' };
  }

  // Send SMS via SignalWire
  const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
  const apiToken = Deno.env.get('SIGNALWIRE_API_TOKEN');
  const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL') || 'erik.signalwire.com';

  const response = await fetch(`https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${projectId}:${apiToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: senderNumber,
      To: toNumber,
      Body: message,
    }),
  });

  const result = await response.json();

  if (result.error_code) {
    return { success: false, message: `SMS failed: ${result.error_message || 'Unknown error'}` };
  }

  // Look up agent_id from service number
  let agentId: string | null = null;
  const { data: snRows } = await supabase
    .from('service_numbers')
    .select('agent_id')
    .eq('phone_number', senderNumber)
    .eq('user_id', userId)
    .limit(1);
  if (snRows && snRows.length > 0 && snRows[0].agent_id) {
    agentId = snRows[0].agent_id;
  }

  // Save to sms_messages table
  const insertData: any = {
    user_id: userId,
    direction: 'outbound',
    sender_number: senderNumber,
    recipient_number: toNumber,
    content: message,
    is_ai_generated: false,
    status: 'sent',
    sent_at: new Date().toISOString(),
  };
  if (agentId) insertData.agent_id = agentId;
  await supabase.from('sms_messages').insert(insertData);

  // Deduct credits for the SMS
  deductSmsCredits(userId, 1).catch(err => console.error('Failed to deduct SMS credits:', err));

  return {
    success: true,
    message: `Message sent successfully.`,
    result: { message_sid: result.sid },
  };
}

export async function handleScheduleSms(supabase: any, userId: string, args: any, mode: string): Promise<McpExecuteResponse> {
  const { recipient, message, send_at } = args;

  // Validate scheduled time
  let scheduledTime: Date;
  try {
    scheduledTime = new Date(send_at);
    if (isNaN(scheduledTime.getTime())) {
      return { success: false, message: 'Invalid date format' };
    }
    if (scheduledTime <= new Date()) {
      return { success: false, message: 'Scheduled time must be in the future' };
    }
  } catch {
    return { success: false, message: `Could not parse time "${send_at}"` };
  }

  const matches = await findContacts(supabase, userId, recipient);
  const phoneDigits = recipient.replace(/\D/g, '');

  const formattedTime = scheduledTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const buildParams = (phoneNumber: string, name: string) => ({
    phone_number: phoneNumber,
    name,
    message,
    send_at: scheduledTime.toISOString(),
  });

  if (matches.length === 0) {
    if (phoneDigits.length >= 10) {
      const normalizedPhone = normalizePhoneNumber(recipient);

      if (mode === 'preview') {
        return {
          success: true,
          requires_confirmation: true,
          pending_action: {
            type: 'schedule_sms',
            preview: `Schedule SMS to ${recipient} for ${formattedTime}:\n"${message}"`,
            parameters: buildParams(normalizedPhone, recipient),
          },
        };
      }

      return await executeScheduleSms(supabase, userId, buildParams(normalizedPhone, recipient));
    }
    return {
      success: false,
      message: `I couldn't find a contact matching "${recipient}". Try using their full name or phone number.`,
    };
  }

  if (matches.length === 1) {
    const params = {
      ...buildParams(matches[0].phone_number, matches[0].name),
      contact_id: matches[0].id,
    };

    if (mode === 'preview') {
      return {
        success: true,
        requires_confirmation: true,
        pending_action: {
          type: 'schedule_sms',
          preview: `Schedule SMS to ${matches[0].name} (${matches[0].phone_number}) for ${formattedTime}:\n"${message}"`,
          parameters: params,
        },
      };
    }

    return await executeScheduleSms(supabase, userId, params);
  }

  // Multiple matches
  const contactList = matches.map((c: any) => `• ${c.name}: ${c.phone_number}`).join('\n');
  return {
    success: false,
    message: `I found multiple contacts matching "${recipient}":\n${contactList}\n\nPlease be more specific.`,
  };
}

export async function executeScheduleSms(supabase: any, userId: string, params: any): Promise<McpExecuteResponse> {
  // Get user's service number
  const { data: serviceNumbers } = await supabase
    .from('service_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .limit(1)
    .single();

  const { error } = await supabase.from('scheduled_actions').insert({
    user_id: userId,
    action_type: 'send_sms',
    scheduled_at: params.send_at,
    status: 'pending',
    parameters: {
      recipient_phone: params.phone_number,
      recipient_name: params.name,
      message: params.message,
      sender_number: serviceNumbers?.phone_number,
    },
    created_via: 'agent',
  });

  if (error) {
    return { success: false, message: `Failed to schedule SMS: ${error.message}` };
  }

  const formattedTime = new Date(params.send_at).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    success: true,
    message: `Scheduled SMS to ${params.name} for ${formattedTime}.`,
  };
}

export async function deductSmsCredits(userId: string, messageCount: number) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        userId,
        type: 'sms',
        messageCount,
        referenceType: 'sms'
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`Deducted $${result.cost} for ${messageCount} SMS, balance: $${result.balanceAfter}`);
    } else {
      console.error('Failed to deduct SMS credits:', result.error);
    }
  } catch (error) {
    console.error('Error deducting SMS credits:', error);
  }
}
