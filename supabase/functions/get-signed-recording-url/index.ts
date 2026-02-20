import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
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

    const { call_id } = await req.json();

    if (!call_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "call_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    // Look up the call record
    const { data: call, error } = await queryClient
      .from("call_records")
      .select("id, recording_url, recordings")
      .eq("id", call_id)
      .eq("user_id", user.id)
      .single();

    if (error || !call) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Call not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build response from recordings array, using signalwire_url as fallback for pending_sync
    const recordings = (call.recordings || [])
      .filter((r: any) => r.url || r.signalwire_url)
      .map((r: any) => ({
        url: r.url || r.signalwire_url,
        label: r.label || "main",
        duration_seconds: r.duration_seconds || r.duration || null,
        source: r.source || (r.signalwire_url ? "signalwire" : "unknown"),
        status: r.status || (r.url ? "synced" : "pending_sync"),
        created_at: r.created_at || r.timestamp || null,
      }));

    // If no recordings array but recording_url exists, return that
    if (recordings.length === 0 && call.recording_url) {
      recordings.push({
        url: call.recording_url,
        label: "main",
        duration_seconds: null,
        source: "unknown",
        status: "synced",
        created_at: null,
      });
    }

    if (recordings.length === 0) {
      return new Response(
        JSON.stringify({ error: { code: "no_recording", message: "No recording available for this call" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        call_id: call.id,
        recording_url: recordings[0].url,
        recordings,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in get-signed-recording-url:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
})
