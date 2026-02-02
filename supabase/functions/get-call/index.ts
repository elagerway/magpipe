import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { call_id } = await req.json();

    if (!call_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "call_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: call, error } = await supabaseClient
      .from("call_records")
      .select(`
        *,
        agent:agent_configs(id, name)
      `)
      .eq("id", call_id)
      .eq("user_id", user.id)
      .single();

    if (error || !call) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Call not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const response = {
      id: call.id,
      agent_id: call.agent_id,
      agent_name: call.agent?.name,
      from_number: call.direction === "inbound" ? call.caller_number : call.service_number,
      to_number: call.direction === "inbound" ? call.service_number : call.caller_number,
      direction: call.direction,
      status: call.status || "completed",
      duration: call.duration_seconds,
      recording_url: call.recording_url,
      transcript: call.transcript,
      transcript_segments: call.transcript_segments,
      sentiment: call.sentiment,
      call_summary: call.call_summary,
      metadata: call.metadata,
      started_at: call.started_at,
      ended_at: call.ended_at,
      created_at: call.created_at,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-call:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
