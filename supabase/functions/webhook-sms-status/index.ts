/**
 * SMS Status Webhook - Receives delivery status updates from SignalWire
 * Updates sms_messages table with delivery status
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { reportError } from '../_shared/error-reporter.ts';

Deno.serve(async (req) => {
  try {
    // Parse the incoming SignalWire status callback (form-urlencoded)
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('SMS status callback received:', params);

    const {
      MessageSid,        // Unique message identifier
      MessageStatus,     // Status: queued, sending, sent, delivered, undelivered, failed
      To,                // Recipient phone number
      From,              // Sender phone number
      ErrorCode,         // Error code if failed
      ErrorMessage,      // Error message if failed
    } = params;

    if (!MessageSid) {
      console.log('No MessageSid in callback');
      return new Response('OK', { status: 200 });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Map SignalWire status to our status
    let status: string;
    switch (MessageStatus) {
      case 'delivered':
        status = 'delivered';
        break;
      case 'undelivered':
      case 'failed':
        status = MessageStatus;
        break;
      case 'sent':
        status = 'sent';
        break;
      case 'queued':
      case 'sending':
        status = 'pending';
        break;
      default:
        status = 'sent';
    }

    // Update the message record
    const updateData: Record<string, unknown> = {
      status,
    };

    // Set delivered_at timestamp when delivered
    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    }

    // Log failed deliveries to system_error_logs for observability
    if (status === 'failed' || status === 'undelivered') {
      console.log(`SMS delivery failed: ${ErrorCode} - ${ErrorMessage}`);
      reportError(supabase, {
        error_type: 'sms_delivery_failure',
        error_message: `SMS ${status}: ${ErrorMessage || 'No error message'}`,
        error_code: ErrorCode || status,
        source: 'signalwire',
        severity: 'warning',
        metadata: { message_sid: MessageSid, to: To, from: From, status: MessageStatus },
      }).catch(() => {});

      // Stamp the carrier failure reason onto the row so get_message /
      // list_messages surface WHY it failed (matches the WhatsApp path).
      // Merge into existing metadata — never clobber attribution data.
      const { data: existingRow } = await supabase
        .from('sms_messages')
        .select('metadata')
        .eq('message_sid', MessageSid)
        .maybeSingle();
      const existingMeta = (existingRow?.metadata && typeof existingRow.metadata === 'object' && !Array.isArray(existingRow.metadata))
        ? existingRow.metadata as Record<string, unknown>
        : {};
      updateData.metadata = {
        ...existingMeta,
        delivery_error: {
          code: ErrorCode || status,
          reason: ErrorMessage || `SMS ${status}`,
          at: new Date().toISOString(),
        },
      };
    }

    const { data, error } = await supabase
      .from('sms_messages')
      .update(updateData)
      .eq('message_sid', MessageSid)
      .select();

    if (error) {
      console.error('Error updating SMS status:', error);
      return new Response('Error', { status: 500 });
    }

    if (!data || data.length === 0) {
      console.log(`No message found with SID: ${MessageSid}`);
      // Still return 200 to prevent retries
      return new Response('OK', { status: 200 });
    }

    console.log(`Updated SMS ${MessageSid} to status: ${status}`);

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error in webhook-sms-status:', error);
    return new Response('Internal server error', { status: 500 });
  }
});
