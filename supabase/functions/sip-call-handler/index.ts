/**
 * SIP Call Handler - Returns cXML to dial and record outbound SIP calls
 * This is triggered when a call is made from a SIP endpoint
 */

Deno.serve(async (req) => {
  try {
    // Parse the incoming SignalWire request
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log('SIP Call Handler triggered:', params);

    let {
      To,           // Destination number (may be SIP URI like sip:16045628647@...)
      From,         // Caller ID number (from SIP endpoint - will be SIP URI)
      CallSid,      // SignalWire Call SID
      Direction,    // inbound or outbound-dial
      'X-From-Number': xFromNumber, // Custom header with actual caller ID
      'P-Asserted-Identity': pAssertedIdentity, // SIP header with caller ID
    } = params;

    // SIMPLE: Just use a known working number for now
    // SignalWire requires callerId to be a number you own
    const callerId = '+16042566768';

    console.log(`Using caller ID: ${callerId}`);

    // Extract phone number from SIP URI if needed
    // To might be "sip:16045628647@erik-0f619b8e956e.sip.signalwire.com" or "+16045628647"
    let destinationNumber = (To as string).trim();
    if (destinationNumber.startsWith('sip:')) {
      // Extract the number part: sip:16045628647@... -> 16045628647
      const match = destinationNumber.match(/sip:([^@]+)@/);
      if (match) {
        destinationNumber = match[1].trim();
        // Add + prefix if it's not already there and looks like a number
        if (!destinationNumber.startsWith('+') && /^\d+$/.test(destinationNumber)) {
          destinationNumber = '+' + destinationNumber;
        }
      }
    }

    // Final cleanup
    destinationNumber = destinationNumber.trim();

    console.log(`Destination: ${To} -> ${destinationNumber}`);

    // Return cXML response
    // Note: callerId must be a valid SignalWire number you own for PSTN calls
    // Use the extracted callerId from X-From-Number or P-Asserted-Identity headers
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
