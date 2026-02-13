import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const phoneNumber = url.searchParams.get("phone_number");

    if (!phoneNumber) {
      return new Response("Missing phone_number parameter", { status: 400 });
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Look up SIP credentials for this phone number
    const { data: serviceNumber, error } = await supabaseClient
      .from("service_numbers")
      .select("sip_username, sip_domain")
      .eq("phone_number", phoneNumber)
      .single();

    if (error || !serviceNumber) {
      console.error("Failed to find SIP credentials for", phoneNumber, error);
      return new Response("SIP endpoint not configured", { status: 500 });
    }

    const sipUri = `sip:${serviceNumber.sip_username}@${serviceNumber.sip_domain}`;

    console.log(`Forwarding call from ${phoneNumber} to SIP endpoint:`, sipUri);

    // Return CXML that dials the SIP endpoint
    const cxml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;

    return new Response(cxml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("Error in forward-to-sip:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
});
