import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // This endpoint returns CXML to handle the outbound call
    // SignalWire has already called the SIP endpoint (browser)
    // Now we just need to bridge to the PSTN destination

    // Parse URL to get destination from query parameter
    const url = new URL(req.url);
    const destination = url.searchParams.get("destination");

    // Get caller ID from query parameter (selected by user in UI)
    const from = url.searchParams.get("from");

    // Parse form data from SignalWire
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const to = formData.get("To") as string;

    console.log("Outbound call CXML requested:", {
      callSid,
      to,
      destination,
      callerId: from,
    });

    if (!destination) {
      console.error("Missing destination parameter");
      const errorCxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Missing destination.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorCxml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    console.log("LiveKit answered, now bridging to PSTN:", {
      destination,
      callerId: from
    });

    // Return CXML that bridges LiveKit call to PSTN destination
    // LiveKit is already connected (this CXML executes after LiveKit answers)
    // Now we dial the PSTN number and bridge the two legs together
    // IMPORTANT: callerId must be a valid E.164 phone number (not SIP URI)
    // PAUSE: Give agent 3 seconds to fully connect before dialing PSTN
    // Added action callback to debug dial completion reason
    const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outbound-dial-status?destination=${encodeURIComponent(destination)}&from=${encodeURIComponent(from || '')}`;
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="3"/>
  <Dial action="${actionUrl}" timeout="60" record="record-from-answer" recordingStatusCallback="${Deno.env.get("SUPABASE_URL")}/functions/v1/sip-recording-callback" callerId="${from}">
    <Number>${destination}</Number>
  </Dial>
</Response>`;

    return new Response(cxml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error generating CXML:", error);

    // Return error CXML
    const errorCxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again.</Say>
  <Hangup/>
</Response>`;

    return new Response(errorCxml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }
});
