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

    const body = await req.json().catch(() => ({}));
    const { limit = 50, offset = 0, agent_id, is_active } = body;

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    let query = queryClient
      .from("service_numbers")
      .select(`
        *,
        agent:agent_configs(id, name)
      `, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (agent_id) {
      query = query.eq("agent_id", agent_id);
    }

    if (typeof is_active === "boolean") {
      query = query.eq("is_active", is_active);
    }

    const { data: numbers, error, count } = await query;

    if (error) {
      console.error("Error listing numbers:", error);
      return new Response(
        JSON.stringify({ error: { code: "query_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const formattedNumbers = (numbers || []).map(num => ({
      id: num.id,
      phone_number: num.phone_number,
      friendly_name: num.friendly_name,
      agent_id: num.agent_id,
      agent_name: num.agent?.name,
      capabilities: num.capabilities || { voice: true, sms: true, mms: false },
      is_active: num.is_active,
      provider: num.provider || "signalwire",
      created_at: num.created_at,
    }));

    return new Response(
      JSON.stringify({
        numbers: formattedNumbers,
        total: count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-phone-numbers:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
