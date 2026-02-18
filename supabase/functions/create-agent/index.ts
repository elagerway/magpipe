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

    // Resolve user from JWT or API key
    const user = await resolveUser(req, supabaseClient);

    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));

    if (!body.name) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "name is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for API key auth (no RLS context), anon client for JWT
    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    // Build insert payload — only include fields that were provided
    const insert: Record<string, unknown> = {
      user_id: user.id,
      name: body.name,
      active_voice_stack: body.active_voice_stack || "livekit",
    };

    const allowedFields = [
      "agent_type", "system_prompt", "greeting", "voice_id", "language",
      "llm_model", "organization_name", "owner_name", "agent_role",
      "is_active", "temperature", "transfer_phone_number", "functions",
      "prompt", "response_style", "agent_volume", "ambient_sound",
      "ambient_sound_volume", "noise_suppression", "memory_enabled",
      "semantic_memory_enabled", "translate_to", "pii_storage",
      "calls_schedule", "texts_schedule", "schedule_timezone",
      "outbound_system_prompt", "knowledge_source_ids",
      "vad_silence_duration", "vad_speech_duration", "vad_activation_threshold",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        insert[field] = body[field];
      }
    }

    const { data: agent, error } = await queryClient
      .from("agent_configs")
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error("Error creating agent:", error);
      return new Response(
        JSON.stringify({ error: { code: "insert_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle dynamic_variables if provided
    const dynamicVariables = body.dynamic_variables;
    if (Array.isArray(dynamicVariables) && dynamicVariables.length > 0) {
      const VALID_VAR_TYPES = ["text", "number", "boolean", "enum"];

      for (const v of dynamicVariables) {
        if (!v.name) {
          return new Response(
            JSON.stringify({ error: { code: "validation_error", message: "Each dynamic variable must have a name" } }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const vt = v.var_type || "text";
        if (!VALID_VAR_TYPES.includes(vt)) {
          return new Response(
            JSON.stringify({ error: { code: "validation_error", message: `var_type must be one of: ${VALID_VAR_TYPES.join(", ")}` } }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (vt === "enum" && (!Array.isArray(v.enum_options) || v.enum_options.length === 0)) {
          return new Response(
            JSON.stringify({ error: { code: "validation_error", message: `enum_options required for enum variable "${v.name}"` } }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const rows = dynamicVariables.map((v: Record<string, unknown>) => ({
        user_id: user.id,
        agent_id: agent.id,
        name: v.name,
        description: v.description || null,
        var_type: v.var_type || "text",
        enum_options: (v.var_type || "text") === "enum" ? v.enum_options : null,
      }));

      const { error: insertErr } = await queryClient
        .from("dynamic_variables")
        .insert(rows);

      if (insertErr) {
        console.error("Error inserting dynamic variables:", insertErr);
      }

      // Fetch back the created variables
      const { data: vars } = await queryClient
        .from("dynamic_variables")
        .select("id, name, description, var_type, enum_options, created_at, updated_at")
        .eq("agent_id", agent.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      agent.dynamic_variables = vars || [];
    } else {
      agent.dynamic_variables = [];
    }

    return new Response(
      JSON.stringify({ agent }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-agent:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
