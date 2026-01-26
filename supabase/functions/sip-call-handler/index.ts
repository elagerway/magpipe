/**
 * SIP Call Handler - Returns cXML to dial and record outbound SIP calls
 * This is triggered when a call is made from a SIP endpoint
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

Deno.serve(async (req) => {
  try {
    // Parse the incoming SignalWire request
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('SIP Call Handler triggered:', params);

    const {
      To,           // Destination number (may be SIP URI like sip:16045628647@...)
      From,         // Caller ID number (from SIP endpoint - will be SIP URI)
      CallSid,      // SignalWire Call SID
      Direction,    // inbound or outbound-dial
    } = params;

    // Check for custom call record ID header
    // SignalWire passes custom headers as SIP_ prefixed form fields
    const callRecordIdHeader = params['SIP_H_X-Call-Record-Id'] || params['X-Call-Record-Id'] || null;
    console.log('Custom call record ID header:', callRecordIdHeader);

    // Extract phone number from SIP URI if needed
    // To might be "sip:16045628647@erik-0f619b8e956e.sip.signalwire.com" or "+16045628647"
    let destinationNumber = (To as string).trim();
    if (destinationNumber.startsWith('sip:')) {
      const match = destinationNumber.match(/sip:([^@]+)@/);
      if (match) {
        destinationNumber = match[1].trim();
        if (!destinationNumber.startsWith('+') && /^\d+$/.test(destinationNumber)) {
          destinationNumber = '+' + destinationNumber;
        }
      }
    }
    destinationNumber = destinationNumber.trim();

    console.log(`Destination: ${To} -> ${destinationNumber}`);
    console.log(`CallSid: ${CallSid}`);
    console.log(`Call Record ID from header: ${callRecordIdHeader}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the call record - first try by call record ID from header, then fall back to phone number match
    let callRecord = null;
    let callerId = '+16042566768'; // Default fallback

    // Try to find by call record ID header first (most reliable)
    if (callRecordIdHeader) {
      console.log(`Looking up call record by vendor_call_id: ${callRecordIdHeader}`);
      const { data, error } = await supabase
        .from('call_records')
        .select('id, service_number')
        .eq('vendor_call_id', callRecordIdHeader)
        .single();

      if (data) {
        callRecord = data;
        console.log(`✅ Found call record by vendor_call_id: ${callRecord.id}`);
      } else if (error) {
        console.log(`No call record found by vendor_call_id, trying phone match. Error: ${error.message}`);
      }
    }

    // Fall back to phone number match if header lookup failed
    if (!callRecord) {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      const { data, error: fetchError } = await supabase
        .from('call_records')
        .select('id, service_number')
        .eq('contact_phone', destinationNumber)
        .eq('direction', 'outbound')
        .is('call_sid', null)
        .gte('created_at', thirtySecondsAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        callRecord = data;
        console.log(`Found call record by phone match: ${callRecord.id}`);
      } else {
        console.log('No matching call record found by phone number');
        if (fetchError) {
          console.log('Fetch error:', fetchError.message);
        }
      }
    }

    if (callRecord) {
      // Use the service_number from the call record as caller ID
      if (callRecord.service_number) {
        callerId = callRecord.service_number;
        console.log(`Using service_number as caller ID: ${callerId}`);
      }

      // Update call record with SignalWire CallSid (add to existing vendor_call_id)
      const { error: updateError } = await supabase
        .from('call_records')
        .update({
          call_sid: CallSid as string,
          // Only update vendor_call_id if it wasn't already set by the browser
          ...(!callRecordIdHeader && { vendor_call_id: CallSid as string }),
        })
        .eq('id', callRecord.id);

      if (updateError) {
        console.error('Error updating call record with CallSid:', updateError);
      } else {
        console.log(`✅ Updated call record ${callRecord.id} with CallSid: ${CallSid}`);
      }
    } else {
      console.log('No matching call record found, using default caller ID');
    }

    // Return cXML response with recording and status callbacks
    // statusCallback ensures we detect when the call ends (remote hangup)
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/sip-call-status?call_record_id=${callRecord?.id || ''}`;

    const cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" record="record-from-answer" recordingStatusCallback="${supabaseUrl}/functions/v1/sip-recording-callback" action="${statusCallbackUrl}" method="POST">
    <Number statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed">${destinationNumber}</Number>
  </Dial>
</Response>`;

    console.log('Returning cXML response:', cxmlResponse);

    return new Response(cxmlResponse, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Error in SIP call handler:', error);

    // Return error response in cXML format
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
  <Hangup/>
</Response>`;

    return new Response(errorResponse, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
});
