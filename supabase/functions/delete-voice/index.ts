import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUILTIN_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

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

    const { voice_id } = await req.json();

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    if (!voice_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "voice_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if it's a built-in voice
    if (BUILTIN_VOICES.includes(voice_id)) {
      return new Response(
        JSON.stringify({ error: { code: "builtin_voice", message: "Built-in voices cannot be deleted" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete from ElevenLabs
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elevenlabsApiKey) {
      return new Response(
        JSON.stringify({ error: { code: "config_error", message: "ElevenLabs not configured" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voice_id}`, {
      method: "DELETE",
      headers: { "xi-api-key": elevenlabsApiKey },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      console.error("Error deleting voice from ElevenLabs:", errorText);
      return new Response(
        JSON.stringify({ error: { code: "delete_error", message: "Failed to delete voice" } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update any agents using this voice to use default
    await queryClient
      .from("agent_configs")
      .update({ voice_id: "alloy", voice_provider: "openai" })
      .eq("user_id", user.id)
      .eq("voice_id", voice_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in delete-voice:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
