import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Extract an optional ID from the URL path after /custom-functions/ */
function extractId(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/custom-functions");
  const trailing = parts[parts.length - 1]?.replace(/^\//, "");
  return trailing || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

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
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const queryClient =
      user.authMethod === "api_key"
        ? createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
          )
        : supabaseClient;

    const id = extractId(req);

    // ── LIST ─────────────────────────────────────────────
    if (req.method === "GET" && !id) {
      const url = new URL(req.url);
      const agentId = url.searchParams.get("agent_id");

      if (!agentId) return jsonResponse({ error: "agent_id query parameter is required" }, 400);

      const { data, error } = await queryClient
        .from("custom_functions")
        .select("*")
        .eq("user_id", user.id)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    // ── GET ONE ──────────────────────────────────────────
    if (req.method === "GET" && id) {
      const { data, error } = await queryClient
        .from("custom_functions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) return jsonResponse({ error: "Custom function not found" }, 404);
      return jsonResponse(data);
    }

    // ── POST (create + action-based routing for MCP) ────
    if (req.method === "POST") {
      const body = await req.json();

      // Action-based routing (MCP client sends POST for everything)
      if (body.action === "list") {
        const agentId = body.agent_id;
        if (!agentId) return jsonResponse({ error: "agent_id is required" }, 400);

        const { data, error } = await queryClient
          .from("custom_functions")
          .select("*")
          .eq("user_id", user.id)
          .eq("agent_id", agentId)
          .order("created_at", { ascending: false });

        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse(data);
      }

      if (body.action === "update") {
        if (!body.function_id) return jsonResponse({ error: "function_id is required" }, 400);

        const allowed = [
          "name", "description", "http_method", "endpoint_url",
          "headers", "query_params", "body_schema", "response_variables",
          "timeout_ms", "max_retries", "is_active",
        ];
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const field of allowed) {
          if (body[field] !== undefined) updates[field] = body[field];
        }

        const { data, error } = await queryClient
          .from("custom_functions")
          .update(updates)
          .eq("id", body.function_id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error || !data) return jsonResponse({ error: "Custom function not found" }, 404);
        return jsonResponse(data);
      }

      if (body.action === "delete") {
        if (!body.function_id) return jsonResponse({ error: "function_id is required" }, 400);

        const { data, error } = await queryClient
          .from("custom_functions")
          .delete()
          .eq("id", body.function_id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error || !data) return jsonResponse({ error: "Custom function not found" }, 404);
        return jsonResponse({ success: true, message: "Custom function deleted" });
      }

      // Default POST = create (action: "create" or no action)
      const required = ["agent_id", "name", "description", "http_method", "endpoint_url"];
      for (const field of required) {
        if (!body[field]) return jsonResponse({ error: `${field} is required` }, 400);
      }

      const insert: Record<string, unknown> = {
        user_id: user.id,
        agent_id: body.agent_id,
        name: body.name,
        description: body.description,
        http_method: body.http_method,
        endpoint_url: body.endpoint_url,
      };

      const optional = [
        "headers", "query_params", "body_schema", "response_variables",
        "timeout_ms", "max_retries", "is_active",
      ];
      for (const field of optional) {
        if (body[field] !== undefined) insert[field] = body[field];
      }

      const { data, error } = await queryClient
        .from("custom_functions")
        .insert(insert)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return jsonResponse({ error: "A function with this name already exists for this agent" }, 409);
        }
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse(data, 201);
    }

    // ── UPDATE ───────────────────────────────────────────
    if (req.method === "PATCH" && id) {
      const body = await req.json();

      const allowed = [
        "name", "description", "http_method", "endpoint_url",
        "headers", "query_params", "body_schema", "response_variables",
        "timeout_ms", "max_retries", "is_active",
      ];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const field of allowed) {
        if (body[field] !== undefined) updates[field] = body[field];
      }

      const { data, error } = await queryClient
        .from("custom_functions")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error || !data) return jsonResponse({ error: "Custom function not found" }, 404);
      return jsonResponse(data);
    }

    // ── DELETE ───────────────────────────────────────────
    if (req.method === "DELETE" && id) {
      const { data, error } = await queryClient
        .from("custom_functions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error || !data) return jsonResponse({ error: "Custom function not found" }, 404);
      return jsonResponse({ success: true, message: "Custom function deleted" });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Error in custom-functions:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});
