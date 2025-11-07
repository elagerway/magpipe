import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { phone_number, caller_id } = await req.json();

    if (!phone_number || !caller_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: phone_number, caller_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get("SIGNALWIRE_PROJECT_ID");
    const signalwireToken = Deno.env.get("SIGNALWIRE_API_TOKEN");
    const signalwireSpaceUrl = Deno.env.get("SIGNALWIRE_SPACE_URL");

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: "SignalWire configuration missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`);

    console.log("Initiating outbound call:", {
      to: phone_number,
      from: caller_id,
      user_id: user.id,
    });

    // Create service role client for database operations
    const serviceRoleClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Initiating bridged call:", {
      callerNumber: caller_id,
      pstnDestination: phone_number,
      userId: user.id,
    });

    // Create call via SignalWire REST API
    // To: The user's purchased number (will forward to SIP endpoint)
    // From: System number (+16042566768) to avoid calling yourself
    // CXML will bridge to PSTN destination
    const cxmlUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outbound-call-swml?destination=${encodeURIComponent(phone_number)}`;

    // CRITICAL: Use system number as From to avoid loop
    const systemNumber = "+16042566768";

    // CRITICAL: SignalWire requires + signs to be URL-encoded as %2B
    const formBody = [
      `To=${encodeURIComponent(caller_id)}`, // Call the user's number (forwards to SIP)
      `From=${encodeURIComponent(systemNumber)}`, // From system number
      `Url=${encodeURIComponent(cxmlUrl)}`,
      `Method=POST`,
      `StatusCallback=${encodeURIComponent(`${Deno.env.get("SUPABASE_URL")}/functions/v1/outbound-call-status`)}`,
      `StatusCallbackEvent=initiated`,
      `StatusCallbackEvent=ringing`,
      `StatusCallbackEvent=answered`,
      `StatusCallbackEvent=completed`,
      `StatusCallbackMethod=POST`,
    ].join("&");

    console.log("Form body:", formBody);

    const callResponse = await fetch(
      `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${signalwireAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
      }
    );

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      console.error("Failed to create call:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create call", details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const callData = await callResponse.json();
    console.log("Call created successfully:", callData);

    // Create call record in database
    const { data: callRecord, error: insertError } = await serviceRoleClient
      .from("call_records")
      .insert({
        user_id: user.id,
        signalwire_call_id: callData.sid,
        contact_phone: phone_number,
        service_number: caller_id,
        direction: "outbound",
        status: "initiated",
        duration_seconds: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating call record:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        call_sid: callData.sid,
        call_record_id: callRecord?.id,
        status: callData.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in initiate-bridged-call:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
