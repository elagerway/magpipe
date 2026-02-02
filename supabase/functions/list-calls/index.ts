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

    const body = await req.json().catch(() => ({}));
    const {
      limit = 50,
      offset = 0,
      direction,
      status,
      agent_id,
      from_date,
      to_date,
      phone_number
    } = body;

    let query = supabaseClient
      .from("call_records")
      .select(`
        id, direction, status, duration_seconds, caller_number, service_number,
        sentiment, call_summary, started_at, ended_at, created_at,
        agent:agent_configs(id, name)
      `, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (direction) {
      query = query.eq("direction", direction);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (agent_id) {
      query = query.eq("agent_id", agent_id);
    }

    if (from_date) {
      query = query.gte("created_at", from_date);
    }

    if (to_date) {
      query = query.lte("created_at", to_date);
    }

    if (phone_number) {
      query = query.or(`caller_number.eq.${phone_number},service_number.eq.${phone_number}`);
    }

    const { data: calls, error, count } = await query;

    if (error) {
      console.error("Error listing calls:", error);
      return new Response(
        JSON.stringify({ error: { code: "query_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const formattedCalls = (calls || []).map(call => ({
      id: call.id,
      agent_id: call.agent?.id,
      agent_name: call.agent?.name,
      from_number: call.direction === "inbound" ? call.caller_number : call.service_number,
      to_number: call.direction === "inbound" ? call.service_number : call.caller_number,
      direction: call.direction,
      status: call.status || "completed",
      duration: call.duration_seconds,
      sentiment: call.sentiment,
      call_summary: call.call_summary,
      started_at: call.started_at,
      ended_at: call.ended_at,
      created_at: call.created_at,
    }));

    return new Response(
      JSON.stringify({
        calls: formattedCalls,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-calls:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
