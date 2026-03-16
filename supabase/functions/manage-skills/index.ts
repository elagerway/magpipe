/**
 * Manage Skills API
 * REST API for the Agent Skills framework.
 * Deploy with: npx supabase functions deploy manage-skills --no-verify-jwt
 *
 * Routes:
 *   GET    /manage-skills/definitions                    — List skill catalog
 *   GET    /manage-skills?agent_id=X                     — List agent's enabled skills
 *   POST   /manage-skills                                — Enable a skill for an agent
 *   PATCH  /manage-skills/:id                            — Update skill config
 *   DELETE /manage-skills/:id                            — Delete (remove) a skill
 *   POST   /manage-skills/:id/execute                    — Execute a skill (or dry_run)
 *   GET    /manage-skills/:id/executions                 — List execution history
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Parse path segments after /manage-skills */
function parsePath(req: Request): { id: string | null; action: string | null } {
  const url = new URL(req.url);
  const parts = url.pathname.split("/manage-skills");
  const trailing = parts[parts.length - 1]?.replace(/^\//, "") || "";
  const segments = trailing.split("/").filter(Boolean);

  if (segments[0] === "definitions") return { id: null, action: "definitions" };
  if (segments.length === 0) return { id: null, action: null };
  if (segments.length === 1) return { id: segments[0], action: null };
  if (segments.length === 2) return { id: segments[0], action: segments[1] };
  return { id: null, action: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) return jsonResponse({ error: { code: "unauthorized", message: "Unauthorized" } }, 401);

    const queryClient = user.authMethod === "api_key"
      ? createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
      : supabaseClient;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { id, action } = parsePath(req);

    // ── LIST SKILL DEFINITIONS (catalog) ──────────────────
    if (req.method === "GET" && action === "definitions") {
      const { data, error } = await serviceClient
        .from("skill_definitions")
        .select("id, slug, name, description, category, icon, supported_triggers, supported_events, supported_channels, required_integrations, config_schema, agent_type_filter")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ skills: data });
    }

    // ── LIST AGENT SKILLS ─────────────────────────────────
    if (req.method === "GET" && !id) {
      const url = new URL(req.url);
      const agentId = url.searchParams.get("agent_id");
      if (!agentId) return jsonResponse({ error: "agent_id query parameter is required" }, 400);

      const { data, error } = await queryClient
        .from("agent_skills")
        .select("*, skill_definitions(id, slug, name, description, category, icon)")
        .eq("user_id", user.id)
        .eq("agent_id", agentId);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ agent_skills: data });
    }

    // ── ENABLE SKILL (create) ─────────────────────────────
    if (req.method === "POST" && !id) {
      const body = await req.json();
      const { agent_id, skill_definition_id, config, trigger_type, schedule_config, delivery_channels } = body;

      if (!agent_id || !skill_definition_id) {
        return jsonResponse({ error: "agent_id and skill_definition_id are required" }, 400);
      }

      const { data, error } = await queryClient
        .from("agent_skills")
        .upsert({
          user_id: user.id,
          agent_id,
          skill_definition_id,
          is_enabled: true,
          config: config || {},
          trigger_type: trigger_type || null,
          schedule_config: schedule_config || null,
          delivery_channels: delivery_channels || [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,skill_definition_id" })
        .select("*, skill_definitions(id, slug, name)")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // If this is a scheduled skill being enabled, create initial scheduled_actions entry
      if (data.trigger_type === 'schedule' && data.is_enabled) {
        await ensureScheduledAction(data, queryClient);
      }

      return jsonResponse({ agent_skill: data }, 201);
    }

    // ── EXECUTE SKILL ─────────────────────────────────────
    if (req.method === "POST" && id && action === "execute") {
      const body = await req.json().catch(() => ({}));
      const isDryRun = body.dry_run === true;

      // Verify ownership
      const { data: skill } = await queryClient
        .from("agent_skills")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!skill) return jsonResponse({ error: "Skill not found" }, 404);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const resp = await fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_skill_id: id,
          trigger_type: isDryRun ? "dry_run" : "manual",
          trigger_context: body.trigger_context || {},
        }),
      });

      const result = await resp.json();
      return jsonResponse(result, resp.ok ? 200 : 500);
    }

    // ── LIST EXECUTIONS ───────────────────────────────────
    if (req.method === "GET" && id && action === "executions") {
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const limit = parseInt(url.searchParams.get("limit") || "50");

      let query = queryClient
        .from("skill_executions")
        .select("id, agent_skill_id, skill_definition_id, trigger_type, status, result, error_message, execution_time_ms, created_at, completed_at, skill_definitions(name, slug)")
        .eq("agent_skill_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 100));

      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ executions: data });
    }

    // ── UPDATE SKILL ──────────────────────────────────────
    if (req.method === "PATCH" && id && !action) {
      const body = await req.json();
      const allowedFields = ["is_enabled", "config", "trigger_type", "schedule_config", "delivery_channels"];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      for (const field of allowedFields) {
        if (body[field] !== undefined) updates[field] = body[field];
      }

      const { data, error } = await queryClient
        .from("agent_skills")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*, skill_definitions(id, slug, name)")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      if (!data) return jsonResponse({ error: "Skill not found" }, 404);

      // If skill was just enabled and is schedule type, ensure a scheduled_actions entry exists
      if (data.trigger_type === 'schedule' && data.is_enabled) {
        await ensureScheduledAction(data, queryClient);
      }

      return jsonResponse({ agent_skill: data });
    }

    // ── DELETE SKILL ──────────────────────────────────────
    if (req.method === "DELETE" && id && !action) {
      const { error } = await queryClient
        .from("agent_skills")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Not found" }, 404);

  } catch (err) {
    console.error("manage-skills error:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

/**
 * Ensure a pending scheduled_actions entry exists for a scheduled skill.
 * Called when a schedule-type skill is enabled. Skips if one already exists.
 */
async function ensureScheduledAction(agentSkill: any, supabase: any) {
  try {
    // Check if a pending entry already exists
    const { data: existing } = await supabase
      .from('scheduled_actions')
      .select('id')
      .eq('action_type', 'execute_skill')
      .eq('status', 'pending')
      .filter('parameters->agent_skill_id', 'eq', agentSkill.id)
      .maybeSingle();

    if (existing) return; // Already scheduled

    const schedule = agentSkill.schedule_config;
    if (!schedule?.interval) return;

    // Calculate next run time
    const now = new Date();
    let nextRun: Date | null = null;

    if (schedule.interval === 'daily') {
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number);
      nextRun = new Date(now);
      nextRun.setHours(hours, minutes, 0, 0);
      // If today's time has already passed, schedule for tomorrow
      if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    } else if (schedule.interval === 'hours') {
      const hours = schedule.every || 6;
      nextRun = new Date(now.getTime() + hours * 60 * 60 * 1000);
    } else if (schedule.interval === 'weekly') {
      const days = schedule.days || ['mon'];
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number);
      const currentDay = now.getDay();
      let daysToAdd = 7;
      for (const day of days) {
        const targetDay = dayMap[day];
        if (targetDay === undefined) continue;
        let diff = targetDay - currentDay;
        if (diff < 0 || (diff === 0 && now.getHours() >= hours)) diff += 7;
        if (diff < daysToAdd) daysToAdd = diff;
      }
      nextRun = new Date(now);
      nextRun.setDate(nextRun.getDate() + daysToAdd);
      nextRun.setHours(hours, minutes, 0, 0);
    } else if (schedule.interval === 'monthly') {
      const day = schedule.day || 1;
      const [hours, minutes] = (schedule.time || '09:00').split(':').map(Number);
      nextRun = new Date(now);
      nextRun.setMonth(nextRun.getMonth() + 1);
      nextRun.setDate(day);
      nextRun.setHours(hours, minutes, 0, 0);
    }

    if (!nextRun) return;

    const { error } = await supabase.from('scheduled_actions').insert({
      user_id: agentSkill.user_id,
      action_type: 'execute_skill',
      scheduled_at: nextRun.toISOString(),
      parameters: { agent_skill_id: agentSkill.id },
      created_via: 'agent',
    });

    if (error) {
      console.error('Failed to create initial scheduled_action:', error);
    } else {
      console.log(`Initial scheduled_action created for skill ${agentSkill.id} at ${nextRun.toISOString()}`);
    }
  } catch (err) {
    console.error('ensureScheduledAction error:', err);
  }
}
