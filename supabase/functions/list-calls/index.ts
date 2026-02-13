import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors()
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

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    let query = queryClient
      .from("call_records")
      .select(`
        id, direction, status, duration_seconds, caller_number, service_number,
        user_sentiment, call_summary, started_at, ended_at, created_at, agent_id
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

    // Batch-lookup agent names
    const agentIds = [...new Set((calls || []).map(c => c.agent_id).filter(Boolean))];
    let agentMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: agents } = await queryClient
        .from("agent_configs")
        .select("id, name")
        .in("id", agentIds);
      if (agents) {
        agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]));
      }
    }

    // Format response
    const formattedCalls = (calls || []).map(call => ({
      id: call.id,
      agent_id: call.agent_id,
      agent_name: agentMap[call.agent_id] || null,
      from_number: call.direction === "inbound" ? call.caller_number : call.service_number,
      to_number: call.direction === "inbound" ? call.service_number : call.caller_number,
      direction: call.direction,
      status: call.status || "completed",
      duration: call.duration_seconds,
      sentiment: call.user_sentiment,
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
