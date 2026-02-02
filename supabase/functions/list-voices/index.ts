import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Built-in voices
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy", description: "Neutral, professional", provider: "openai", is_custom: false },
  { id: "echo", name: "Echo", description: "Warm, friendly", provider: "openai", is_custom: false },
  { id: "fable", name: "Fable", description: "Expressive, dynamic", provider: "openai", is_custom: false },
  { id: "onyx", name: "Onyx", description: "Deep, authoritative", provider: "openai", is_custom: false },
  { id: "nova", name: "Nova", description: "Bright, energetic", provider: "openai", is_custom: false },
  { id: "shimmer", name: "Shimmer", description: "Soft, calm", provider: "openai", is_custom: false },
];

serve(async (req) => {
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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { provider, include_builtin = true } = body;

    let voices: Array<{
      id: string;
      name: string;
      description?: string;
      provider: string;
      preview_url?: string;
      is_custom: boolean;
    }> = [];

    // Add built-in voices
    if (include_builtin) {
      if (!provider || provider === "openai") {
        voices.push(...OPENAI_VOICES);
      }
    }

    // Get custom cloned voices from ElevenLabs
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (elevenlabsApiKey && (!provider || provider === "elevenlabs")) {
      try {
        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": elevenlabsApiKey },
        });

        if (response.ok) {
          const data = await response.json();
          const elevenLabsVoices = (data.voices || []).map((v: { voice_id: string; name: string; description?: string; preview_url?: string; category?: string }) => ({
            id: v.voice_id,
            name: v.name,
            description: v.description,
            provider: "elevenlabs",
            preview_url: v.preview_url,
            is_custom: v.category === "cloned",
          }));
          voices.push(...elevenLabsVoices);
        }
      } catch (e) {
        console.error("Error fetching ElevenLabs voices:", e);
      }
    }

    // Filter by provider if specified
    if (provider) {
      voices = voices.filter(v => v.provider === provider);
    }

    return new Response(JSON.stringify({ voices }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in list-voices:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
