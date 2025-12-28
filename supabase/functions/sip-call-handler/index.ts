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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the recent call record by destination phone number (created by browser)
    // Match calls created in the last 30 seconds without a call_sid
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

    const { data: callRecord, error: fetchError } = await supabase
      .from('call_records')
      .select('id, service_number')
      .eq('contact_phone', destinationNumber)
      .eq('direction', 'outbound')
      .is('call_sid', null)
      .gte('created_at', thirtySecondsAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let callerId = '+16042566768'; // Default fallback

    if (callRecord) {
      console.log(`Found matching call record: ${callRecord.id}`);

      // Use the service_number from the call record as caller ID
      if (callRecord.service_number) {
        callerId = callRecord.service_number;
        console.log(`Using service_number as caller ID: ${callerId}`);
      }

      // Update call record with SignalWire CallSid
      const { error: updateError } = await supabase
        .from('call_records')
        .update({
          call_sid: CallSid as string,
          vendor_call_id: CallSid as string,
        })
        .eq('id', callRecord.id);

      if (updateError) {
        console.error('Error updating call record with CallSid:', updateError);
      } else {
        console.log(`✅ Updated call record ${callRecord.id} with CallSid: ${CallSid}`);
      }
    } else {
      console.log('No matching call record found, using default caller ID');
      if (fetchError) {
        console.log('Fetch error:', fetchError);
      }
    }

    // Return cXML response with recording enabled
    const cxmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" record="record-from-answer" recordingStatusCallback="https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/sip-recording-callback">
    <Number>${destinationNumber}</Number>
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
