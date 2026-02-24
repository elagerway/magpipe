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

    const body = await req.json();
    const { agent_id, ...updates } = body;

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

    // Allowed fields to update
    const allowedFields = [
      "name", "greeting", "system_prompt", "voice_id", "llm_model",
      "language", "max_call_duration", "end_call_phrases",
      "transfer_number", "is_active", "organization_name", "owner_name",
      "agent_role", "agent_type", "temperature", "functions",
      "agent_volume", "ambient_sound", "ambient_sound_volume",
      "noise_suppression", "memory_enabled", "semantic_memory_enabled",
      "translate_to", "pii_storage", "calls_schedule", "texts_schedule",
      "schedule_timezone", "outbound_system_prompt", "knowledge_source_ids",
      "vad_silence_duration", "vad_speech_duration", "vad_activation_threshold",
      "semantic_memory_config",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Handle dynamic_variables separately (stored in a different table)
    const dynamicVariables = updates.dynamic_variables;
    const hasDynamicVars = Array.isArray(dynamicVariables);

    // If only dynamic_variables provided and no agent_configs fields, skip the agent update
    if (Object.keys(updateData).length === 0 && !hasDynamicVars) {
      return new Response(
        JSON.stringify({ error: { code: "no_updates", message: "No valid fields to update" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let agent;

    // Update agent_configs if there are fields to update
    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await queryClient
        .from("agent_configs")
        .update(updateData)
        .eq("id", agent_id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating agent:", error);
        return new Response(
          JSON.stringify({ error: { code: "update_error", message: error.message } }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!data) {
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: "Agent not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      agent = data;
    } else {
      // Just fetch the agent (dynamic_variables only update)
      const { data, error } = await queryClient
        .from("agent_configs")
        .select("*")
        .eq("id", agent_id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: "Agent not found" } }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      agent = data;
    }

    // Sync dynamic variables if provided
    if (hasDynamicVars) {
      const VALID_VAR_TYPES = ["text", "number", "boolean", "enum"];

      // Validate all variables first
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

      // Delete existing variables for this agent
      await queryClient
        .from("dynamic_variables")
        .delete()
        .eq("agent_id", agent_id)
        .eq("user_id", user.id);

      // Insert new variables
      if (dynamicVariables.length > 0) {
        const rows = dynamicVariables.map((v: Record<string, unknown>) => ({
          user_id: user.id,
          agent_id,
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
          return new Response(
            JSON.stringify({ error: { code: "update_error", message: insertErr.message } }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Always return dynamic variables in the response
    const { data: vars } = await queryClient
      .from("dynamic_variables")
      .select("id, name, description, var_type, enum_options, created_at, updated_at")
      .eq("agent_id", agent_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    agent.dynamic_variables = vars || [];

    return new Response(JSON.stringify(agent), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in update-agent:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
