import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { call_id } = await req.json();

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    if (!call_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "call_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: call, error } = await queryClient
      .from("call_records")
      .select("*")
      .eq("id", call_id)
      .eq("user_id", user.id)
      .single();

    if (error || !call) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Call not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch agent name separately (no FK exists)
    let agentName = null;
    if (call.agent_id) {
      const { data: agent } = await queryClient
        .from("agent_configs")
        .select("name")
        .eq("id", call.agent_id)
        .single();
      agentName = agent?.name;
    }

    // Format response
    const response = {
      id: call.id,
      agent_id: call.agent_id,
      agent_name: agentName,
      from_number: call.direction === "inbound" ? call.caller_number : call.service_number,
      to_number: call.direction === "inbound" ? call.service_number : call.caller_number,
      direction: call.direction,
      status: call.status || "completed",
      duration: call.duration_seconds,
      recording_url: call.recording_url,
      transcript: call.transcript,
      sentiment: call.user_sentiment,
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
