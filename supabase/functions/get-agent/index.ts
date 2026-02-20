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

    const { agent_id } = await req.json();

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "agent_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: agent, error } = await queryClient
      .from("agent_configs")
      .select("*")
      .eq("id", agent_id)
      .eq("user_id", user.id)
      .single();

    if (error || !agent) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Agent not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for enrichment queries (bypasses RLS has_org_access policies
    // on service_numbers and knowledge_sources). Safe because we already verified agent ownership above.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch all associated data in parallel
    const [
      { data: dynamicVars },
      { data: phoneNumbers },
      { data: customFunctions },
      { data: knowledgeSources },
    ] = await Promise.all([
      serviceClient
        .from("dynamic_variables")
        .select("id, name, description, var_type, enum_options, created_at, updated_at")
        .eq("agent_id", agent_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("service_numbers")
        .select("id, phone_number, friendly_name, capabilities, is_active, created_at")
        .eq("agent_id", agent_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      serviceClient
        .from("custom_functions")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      (agent.knowledge_source_ids?.length > 0
        ? serviceClient
            .from("knowledge_sources")
            .select("id, title, url, sync_status, chunk_count, last_synced_at, created_at, updated_at")
            .in("id", agent.knowledge_source_ids)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] })
      ),
    ]);

    agent.dynamic_variables = dynamicVars || [];
    agent.phone_numbers = phoneNumbers || [];
    agent.custom_functions = customFunctions || [];
    agent.knowledge_sources = knowledgeSources || [];

    return new Response(JSON.stringify(agent), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-agent:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
