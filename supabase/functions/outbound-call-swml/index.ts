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

    // Parse form data from SignalWire
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;

    console.log("Outbound call CXML requested:", {
      callSid,
      from,
      to,
      destination,
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

    console.log("Bridging to PSTN destination:", destination);

    // Return CXML that dials the PSTN destination
    // Browser is already connected as the first leg
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="record-from-answer" recordingStatusCallback="${Deno.env.get("SUPABASE_URL")}/functions/v1/sip-recording-callback" recordingStatusCallbackMethod="POST">
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
