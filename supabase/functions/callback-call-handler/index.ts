import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Callback Call Handler
 *
 * This CXML handler is triggered when the user answers their cell phone.
 * It:
 * 1. Plays a whisper announcement: "Outbound call from MAGPIPE"
 * 2. Bridges to the destination number with recording
 * 3. Uses the caller_id for the outbound leg to destination
 */
Deno.serve(async (req) => {
  try {
    // Parse URL parameters
    const url = new URL(req.url);
    const destination = url.searchParams.get("destination");
    const callerId = url.searchParams.get("caller_id");
    const callRecordId = url.searchParams.get("call_record_id");

    // Parse form data from SignalWire
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;

    console.log("Callback call handler triggered:", {
      callSid,
      callStatus,
      destination,
      callerId,
      callRecordId,
    });

    if (!destination) {
      console.error("Missing destination parameter");
      const errorCxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Configuration error. Missing destination.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorCxml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Update call record status to in_progress
    if (callRecordId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await supabase
        .from("call_records")
        .update({
          status: "in_progress",
        })
        .eq("id", callRecordId);

      console.log("Updated call record to in_progress");
    }

    // Status callback URL for dial status (when destination answers/hangs up)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/callback-call-status?call_record_id=${callRecordId || ""}`;
    const recordingCallbackUrl = `${supabaseUrl}/functions/v1/sip-recording-callback`;

    // Generate CXML response:
    // 1. Whisper to user that this is their outbound call
    // 2. Bridge to destination with caller ID and recording
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Outbound call from MAGPIPE. Connecting now.</Say>
  <Dial
    callerId="${callerId}"
    record="record-from-answer"
    recordingStatusCallback="${recordingCallbackUrl}"
    action="${statusCallbackUrl}"
    method="POST"
  >
    <Number statusCallback="${statusCallbackUrl}" statusCallbackEvent="initiated ringing answered completed">${destination}</Number>
  </Dial>
</Response>`;

    console.log("Returning CXML:", cxml);

    return new Response(cxml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error in callback-call-handler:", error);

    const errorCxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">An error occurred. Please try again.</Say>
  <Hangup/>
</Response>`;

    return new Response(errorCxml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }
});
