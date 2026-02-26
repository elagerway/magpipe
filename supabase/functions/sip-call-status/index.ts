/**
 * SIP Call Status Handler - Updates call records when call status changes
 * This is triggered by SignalWire statusCallback on the dialed number
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { shouldNotify } from '../_shared/app-function-prefs.ts'

Deno.serve(async (req) => {
  try {
    // Parse URL to get call_record_id from query parameter
    const url = new URL(req.url);
    const callRecordId = url.searchParams.get('call_record_id');

    // Parse form data from SignalWire
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('SIP Call Status Handler triggered:', {
      callRecordId,
      params
    });

    const {
      CallSid,
      CallStatus,
      CallDuration,
      DialCallStatus,  // Status of the dialed leg
      DialCallDuration,
    } = params;

    // Use DialCallStatus if available (from <Dial> action), otherwise use CallStatus
    const status = (DialCallStatus || CallStatus) as string;
    const duration = parseInt((DialCallDuration || CallDuration || '0') as string, 10);

    console.log(`Call status update: ${status}, duration: ${duration}s`);

    if (!callRecordId) {
      console.log('No call record ID provided, returning OK');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Map SignalWire statuses to our database statuses
    const statusMap: Record<string, string> = {
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'answered': 'in_progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no_answer',
      'canceled': 'canceled',
    };

    const dbStatus = statusMap[status?.toLowerCase()] || status;

    // Only update for terminal states
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status?.toLowerCase())) {
      const updateData: Record<string, any> = {
        status: dbStatus,
        ended_at: new Date().toISOString(),
      };

      if (duration > 0) {
        updateData.duration_seconds = duration;
        updateData.duration = duration;
      }

      // Set disposition based on status
      if (status?.toLowerCase() === 'completed' && duration > 0) {
        updateData.disposition = 'outbound_completed';
      } else if (status?.toLowerCase() === 'busy') {
        updateData.disposition = 'outbound_busy';
      } else if (status?.toLowerCase() === 'no-answer') {
        updateData.disposition = 'outbound_no_answer';
      } else {
        updateData.disposition = 'outbound_failed';
      }

      // First get the call record to know user_id and call details
      const { data: callRecord, error: fetchError } = await supabase
        .from('call_records')
        .select('user_id, phone_number, caller_number, direction, started_at')
        .eq('id', callRecordId)
        .single();

      const { error } = await supabase
        .from('call_records')
        .update(updateData)
        .eq('id', callRecordId);

      if (error) {
        console.error('Error updating call record:', error);
      } else {
        console.log(`✅ Updated call record ${callRecordId} to status: ${dbStatus}, duration: ${duration}s`);

        // Fetch recordings proactively (with 5s delay to let SignalWire finalize)
        // This is more reliable than depending on SignalWire webhooks
        fetchRecordings(supabaseUrl, supabaseKey, callRecordId, CallSid as string)
          .catch(err => console.error('Failed to fetch recordings:', err));

        // Send Slack call summary notification (fire and forget, if enabled)
        if (callRecord) {
          // Look up agent config to check notification prefs
          const serviceNum = callRecord.phone_number || callRecord.caller_number;
          const { data: svcNum } = await supabase
            .from('service_numbers')
            .select('agent_id')
            .eq('phone_number', serviceNum)
            .maybeSingle();

          let agentFunctions = null;
          if (svcNum?.agent_id) {
            const { data: ac } = await supabase
              .from('agent_configs')
              .select('functions')
              .eq('id', svcNum.agent_id)
              .single();
            agentFunctions = ac?.functions;
          }

          if (shouldNotify(agentFunctions, 'slack', 'calls')) {
            sendSlackCallNotification(
              supabase,
              callRecord.user_id,
              callRecord.phone_number,
              callRecord.direction || 'outbound',
              dbStatus,
              duration
            ).catch(err => console.error('Failed to send Slack call notification:', err));
          }

          // Deduct credits for completed calls with duration
          if (status?.toLowerCase() === 'completed' && duration > 0) {
            deductCallCredits(
              supabaseUrl,
              supabaseKey,
              callRecord.user_id,
              duration,
              callRecordId
            ).catch(err => console.error('Failed to deduct credits:', err));
          }
        }
      }
    } else {
      console.log(`Non-terminal status ${status}, skipping update`);
    }

    // Return empty response (or hangup after dial completes)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Error in SIP call status handler:', error);

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});

/**
 * Send Slack notification for completed calls
 */
/**
 * Deduct credits for a completed call
 */
async function deductCallCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  durationSeconds: number,
  callRecordId: string
) {
  try {
    // Get user's agent config to determine voice, LLM, and add-on rates
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('voice_id, ai_model, memory_enabled, semantic_memory_enabled, knowledge_source_ids, pii_storage')
      .eq('user_id', userId)
      .single();

    // Determine active add-ons
    const addons: string[] = [];
    const kbIds = agentConfig?.knowledge_source_ids || [];
    if (kbIds.length > 0) addons.push('knowledge_base');
    if (agentConfig?.memory_enabled) addons.push('memory');
    if (agentConfig?.semantic_memory_enabled) addons.push('semantic_memory');
    if (agentConfig?.pii_storage === 'redacted') addons.push('pii_removal');

    // Call deduct-credits function
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        userId,
        type: 'voice',
        durationSeconds,
        voiceId: agentConfig?.voice_id,
        aiModel: agentConfig?.ai_model,
        addons: addons.length > 0 ? addons : undefined,
        referenceType: 'call',
        referenceId: callRecordId,
      }),
    });

    const result = await response.json();
    if (result.success) {
      console.log(
        `Deducted $${result.cost} for ${durationSeconds}s call (addons: ${addons.join(',') || 'none'}), balance: $${result.balanceAfter}`
      );
    } else {
      console.error('Failed to deduct credits:', result.error);
    }
  } catch (error) {
    console.error('Error deducting call credits:', error);
  }
}

/**
 * Fetch recordings from SignalWire proactively
 */
async function fetchRecordings(
  supabaseUrl: string,
  supabaseKey: string,
  callRecordId: string,
  callSid: string
) {
  // Wait 5 seconds for recordings to finalize
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`📥 Fetching recordings for call ${callRecordId}...`);

  const response = await fetch(`${supabaseUrl}/functions/v1/fetch-call-recordings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      call_record_id: callRecordId,
      call_sid: callSid,
    }),
  });

  const result = await response.json();
  if (result.success) {
    console.log(`✅ Fetched ${result.recordings_added} recording(s)`);
  } else {
    console.error('Failed to fetch recordings:', result.error);
  }
}

async function sendSlackCallNotification(
  supabase: any,
  userId: string,
  phoneNumber: string,
  direction: string,
  status: string,
  durationSeconds: number
) {
  try {
    // Get Slack provider ID
    const { data: slackProvider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'slack')
      .single();

    if (!slackProvider) return;

    // Check if user has Slack connected
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('access_token, config')
      .eq('user_id', userId)
      .eq('status', 'connected')
      .eq('provider_id', slackProvider.id)
      .single();

    if (!integration?.access_token) return;

    // Get contact name if available
    const { data: contact } = await supabase
      .from('contacts')
      .select('name')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .single();

    const contactName = contact?.name || phoneNumber;

    // Format duration
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Determine emoji and status text
    const isInbound = direction === 'inbound';
    const emoji = status === 'completed' ? (isInbound ? '📞' : '📱') : '❌';
    const directionText = isInbound ? 'Inbound call from' : 'Outbound call to';
    const statusText = status === 'completed' ? `Duration: ${durationStr}` : `Status: ${status}`;

    // Resolve channel: user's notification_preferences.slack_channel → config.notification_channel → fallback
    let channelId: string | null = null;

    const { data: notifPrefs } = await supabase
      .from('notification_preferences')
      .select('slack_channel')
      .eq('user_id', userId)
      .single();

    if (notifPrefs?.slack_channel) {
      const name = notifPrefs.slack_channel.replace(/^#/, '').toLowerCase();
      const listResp = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true',
        { headers: { 'Authorization': `Bearer ${integration.access_token}` } }
      );
      const listResult = await listResp.json();
      if (listResult.ok && listResult.channels) {
        const found = listResult.channels.find((c: any) => c.name.toLowerCase() === name);
        if (found) channelId = found.id;
      }
    }

    if (!channelId) {
      channelId = integration.config?.notification_channel;
    }
    if (!channelId) {
      const channelsResponse = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel&limit=10',
        { headers: { 'Authorization': `Bearer ${integration.access_token}` } }
      );
      const channelsResult = await channelsResponse.json();
      if (channelsResult.ok && channelsResult.channels?.length > 0) {
        const magpipeChannel = channelsResult.channels.find((c: any) => c.name === 'magpipe-notifications');
        const generalChannel = channelsResult.channels.find((c: any) => c.name === 'general');
        channelId = magpipeChannel?.id || generalChannel?.id || channelsResult.channels[0].id;
      }
    }

    if (!channelId) return;

    // Auto-join channel
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `channel=${encodeURIComponent(channelId)}`,
    });

    // Send the notification
    const slackMessage = {
      channel: channelId,
      text: `${emoji} ${directionText} ${contactName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${directionText} ${contactName}*\n${statusText}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${phoneNumber} • ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('Slack call notification failed:', result.error);
    } else {
      console.log('Slack call notification sent for', phoneNumber);
    }
  } catch (error) {
    console.error('Error sending Slack call notification:', error);
  }
}
