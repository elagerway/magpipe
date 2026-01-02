import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Initiate Callback Call
 *
 * This function initiates a callback-style outbound call:
 * 1. SignalWire calls the user's cell phone first
 * 2. When user answers, plays whisper: "Outbound call from Solo Mobile"
 * 3. Then bridges to the destination number
 * 4. Caller ID shown to destination is the user's selected service number
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No Authorization header provided");
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth failed:", userError?.message || "No user");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { destination_number, caller_id } = await req.json();

    if (!destination_number || !caller_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: destination_number, caller_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create service role client for database operations
    const serviceRoleClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user's cell phone number from users table
    const { data: userData, error: userDataError } = await serviceRoleClient
      .from("users")
      .select("phone_number, phone_verified")
      .eq("id", user.id)
      .single();

    if (userDataError || !userData?.phone_number) {
      console.error("User phone lookup error:", userDataError);
      return new Response(
        JSON.stringify({
          error: "No verified phone number found for user. Please add your phone number in settings.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userCellPhone = userData.phone_number;

    console.log("Initiating callback call:", {
      user_id: user.id,
      user_cell: userCellPhone,
      destination: destination_number,
      caller_id: caller_id,
    });

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

    // Create call record first to get the ID
    const { data: callRecord, error: insertError } = await serviceRoleClient
      .from("call_records")
      .insert({
        user_id: user.id,
        caller_number: destination_number,
        contact_phone: destination_number,
        service_number: caller_id,
        direction: "outbound",
        disposition: "outbound_completed", // Optimistic default - updated by status callback if call fails
        status: "initiated",
        started_at: new Date().toISOString(),
        duration_seconds: 0,
        duration: 0,
        telephony_vendor: "signalwire",
        // voice_platform omitted - defaults to 'livekit' but this is a callback call without AI
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating call record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create call record" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Call record created:", callRecord.id);

    // CXML URL that handles the call flow:
    // 1. Play whisper to user
    // 2. Bridge to destination with caller ID
    const cxmlUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/callback-call-handler?destination=${encodeURIComponent(destination_number)}&caller_id=${encodeURIComponent(caller_id)}&call_record_id=${encodeURIComponent(callRecord.id)}`;

    // Status callback URL for call status updates
    const statusCallbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/callback-call-status?call_record_id=${encodeURIComponent(callRecord.id)}`;

    // Call user's cell phone first
    // The From number should be the caller_id so user sees their Pat number calling
    const formBody = [
      `To=${encodeURIComponent(userCellPhone)}`,
      `From=${encodeURIComponent(caller_id)}`, // User sees their Pat number calling
      `Url=${encodeURIComponent(cxmlUrl)}`,
      `Method=POST`,
      `StatusCallback=${encodeURIComponent(statusCallbackUrl)}`,
      `StatusCallbackEvent=initiated`,
      `StatusCallbackEvent=ringing`,
      `StatusCallbackEvent=answered`,
      `StatusCallbackEvent=completed`,
      `StatusCallbackMethod=POST`,
    ].join("&");

    console.log("Calling user's cell:", userCellPhone);
    console.log("CXML URL:", cxmlUrl);

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

      // Update call record with error
      await serviceRoleClient
        .from("call_records")
        .update({
          status: "failed",
          disposition: "outbound_failed",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callRecord.id);

      return new Response(
        JSON.stringify({ error: "Failed to initiate call", details: errorText }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const callData = await callResponse.json();
    console.log("Call created successfully:", callData);

    // Update call record with SignalWire call SID
    await serviceRoleClient
      .from("call_records")
      .update({
        vendor_call_id: callData.sid,
        call_sid: callData.sid,
        status: "ringing",
      })
      .eq("id", callRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        call_sid: callData.sid,
        call_record_id: callRecord.id,
        status: callData.status,
        message: "Calling your phone...",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in initiate-callback-call:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
