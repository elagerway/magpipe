import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Extract an optional ID from the URL path after /manage-dynamic-variables/ */
function extractId(req: Request): string | null {
  const url = new URL(req.url);
  const parts = url.pathname.split("/manage-dynamic-variables");
  const trailing = parts[parts.length - 1]?.replace(/^\//, "");
  return trailing || null;
}

const VALID_VAR_TYPES = ["text", "number", "boolean", "enum"];

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
        .from("dynamic_variables")
        .select("id, agent_id, user_id, name, description, var_type, enum_options, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse(data);
    }

    // ── GET ONE ──────────────────────────────────────────
    if (req.method === "GET" && id) {
      const { data, error } = await queryClient
        .from("dynamic_variables")
        .select("id, agent_id, user_id, name, description, var_type, enum_options, created_at, updated_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) return jsonResponse({ error: "Dynamic variable not found" }, 404);
      return jsonResponse(data);
    }

    // ── CREATE ───────────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json();

      const required = ["agent_id", "name"];
      for (const field of required) {
        if (!body[field]) return jsonResponse({ error: `${field} is required` }, 400);
      }

      // Validate var_type
      const varType = body.var_type || "text";
      if (!VALID_VAR_TYPES.includes(varType)) {
        return jsonResponse({ error: `var_type must be one of: ${VALID_VAR_TYPES.join(", ")}` }, 400);
      }

      // Validate enum_options
      if (varType === "enum") {
        if (!Array.isArray(body.enum_options) || body.enum_options.length === 0) {
          return jsonResponse({ error: "enum_options must be a non-empty array when var_type is enum" }, 400);
        }
      }

      const insert: Record<string, unknown> = {
        user_id: user.id,
        agent_id: body.agent_id,
        name: body.name,
        var_type: varType,
        enum_options: varType === "enum" ? body.enum_options : null,
      };

      if (body.description !== undefined) insert.description = body.description;

      const { data, error } = await queryClient
        .from("dynamic_variables")
        .insert(insert)
        .select("id, agent_id, user_id, name, description, var_type, enum_options, created_at, updated_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return jsonResponse({ error: "A variable with this name already exists for this agent" }, 409);
        }
        return jsonResponse({ error: error.message }, 500);
      }
      return jsonResponse(data, 201);
    }

    // ── UPDATE ───────────────────────────────────────────
    if (req.method === "PATCH" && id) {
      const body = await req.json();

      const allowed = ["name", "description", "var_type", "enum_options"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const field of allowed) {
        if (body[field] !== undefined) updates[field] = body[field];
      }

      // Validate var_type if provided
      if (updates.var_type && !VALID_VAR_TYPES.includes(updates.var_type as string)) {
        return jsonResponse({ error: `var_type must be one of: ${VALID_VAR_TYPES.join(", ")}` }, 400);
      }

      // Determine effective var_type for enum validation
      const effectiveVarType = updates.var_type as string | undefined;
      if (effectiveVarType === "enum") {
        const opts = updates.enum_options ?? body.enum_options;
        if (!Array.isArray(opts) || opts.length === 0) {
          return jsonResponse({ error: "enum_options must be a non-empty array when var_type is enum" }, 400);
        }
      } else if (effectiveVarType && effectiveVarType !== "enum") {
        // Switching away from enum — clear options
        updates.enum_options = null;
      }

      const { data, error } = await queryClient
        .from("dynamic_variables")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, agent_id, user_id, name, description, var_type, enum_options, created_at, updated_at")
        .single();

      if (error || !data) return jsonResponse({ error: "Dynamic variable not found" }, 404);
      return jsonResponse(data);
    }

    // ── DELETE ───────────────────────────────────────────
    if (req.method === "DELETE" && id) {
      const { data, error } = await queryClient
        .from("dynamic_variables")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error || !data) return jsonResponse({ error: "Dynamic variable not found" }, 404);
      return jsonResponse({ success: true, message: "Dynamic variable deleted" });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Error in manage-dynamic-variables:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});
