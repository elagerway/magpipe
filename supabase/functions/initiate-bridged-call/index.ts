import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { phone_number, caller_id, purpose, goal, template_id } = await req.json();

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
      purpose: purpose || null,
      goal: goal || null,
      template_id: template_id || null,
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

    // CRITICAL: Create call record FIRST so agent can find direction when it joins
    // This avoids race condition where agent joins before call_record exists
    const { data: callRecord, error: insertError } = await serviceRoleClient
      .from("call_records")
      .insert({
        user_id: user.id,
        caller_number: phone_number, // The person being called (contact)
        contact_phone: phone_number,
        service_number: caller_id,
        direction: "outbound",
        disposition: "outbound_completed", // Optimistic default - updated by status callback if call fails
        status: "in-progress", // Must be in-progress for agent to find and update
        started_at: new Date().toISOString(), // Required: NOT NULL constraint
        duration_seconds: 0,
        duration: 0, // Legacy column
        voice_platform: "livekit", // Track which AI platform
        telephony_vendor: "signalwire", // Track which vendor
        // Outbound call context from template
        call_purpose: purpose || null,
        call_goal: goal || null,
        template_id: template_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating call record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create call record", details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Call record created FIRST:", callRecord.id);

    // Create call via SignalWire REST API
    // Step 1: Call LiveKit SIP URI first
    // Step 2: CXML will bridge to PSTN destination after LiveKit answers
    // CRITICAL: Pass direction=outbound and user_id so agent can identify the call correctly
    // Also pass purpose/goal for agent context
    let cxmlUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/outbound-call-swml?destination=${encodeURIComponent(phone_number)}&from=${encodeURIComponent(caller_id)}&direction=outbound&user_id=${encodeURIComponent(user.id)}`;
    if (purpose) {
      cxmlUrl += `&purpose=${encodeURIComponent(purpose)}`;
    }
    if (goal) {
      cxmlUrl += `&goal=${encodeURIComponent(goal)}`;
    }

    // LiveKit SIP URI (agent will auto-join)
    // Use the allowed number in LiveKit trunk: +16282954811
    const livekitSipDomain = Deno.env.get("LIVEKIT_SIP_DOMAIN");
    if (!livekitSipDomain) {
      console.error('LIVEKIT_SIP_DOMAIN not configured');
      return new Response(
        JSON.stringify({ error: 'LiveKit SIP domain not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use a known working number from LiveKit trunk (works for inbound)
    const livekitNumber = '+16042566768';
    const livekitSipUri = `sip:${livekitNumber}@${livekitSipDomain};transport=tls`;
    console.log('Calling LiveKit SIP URI:', livekitSipUri);
    console.log('From caller ID:', caller_id);
    console.log('Will bridge to PSTN:', phone_number);

    // CRITICAL: SignalWire requires + signs to be URL-encoded as %2B
    const formBody = [
      `To=${encodeURIComponent(livekitSipUri)}`, // Call LiveKit with allowed number
      `From=${encodeURIComponent(caller_id)}`, // From selected caller ID (will show on destination phone)
      `Url=${encodeURIComponent(cxmlUrl)}`, // CXML will dial PSTN after LiveKit answers
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

    // Update call record with SignalWire call SID
    const { error: updateError } = await serviceRoleClient
      .from("call_records")
      .update({
        vendor_call_id: callData.sid,
        call_sid: callData.sid, // Legacy column
      })
      .eq("id", callRecord.id);

    if (updateError) {
      console.error("Error updating call record with SID:", updateError);
    } else {
      console.log("Call record updated with SID:", callData.sid);
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
