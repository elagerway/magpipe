import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Built-in ElevenLabs voices
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm, American female", provider: "elevenlabs", is_custom: false },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep, American male", provider: "elevenlabs", is_custom: false },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Soft, American female", provider: "elevenlabs", is_custom: false },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", description: "Youthful, American female", provider: "elevenlabs", is_custom: false },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Strong, American male", provider: "elevenlabs", is_custom: false },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp, American male", provider: "elevenlabs", is_custom: false },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Trustworthy, American male", provider: "elevenlabs", is_custom: false },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", description: "Friendly, American male", provider: "elevenlabs", is_custom: false },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Expressive, American female", provider: "elevenlabs", is_custom: false },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Warm, American female", provider: "elevenlabs", is_custom: false },
];

// Built-in OpenAI voices
const OPENAI_VOICES = [
  { id: "openai-alloy", name: "Alloy", description: "Neutral, professional", provider: "openai", is_custom: false },
  { id: "openai-echo", name: "Echo", description: "Warm, friendly", provider: "openai", is_custom: false },
  { id: "openai-fable", name: "Fable", description: "Expressive, dynamic", provider: "openai", is_custom: false },
  { id: "openai-onyx", name: "Onyx", description: "Deep, authoritative", provider: "openai", is_custom: false },
  { id: "openai-nova", name: "Nova", description: "Bright, energetic", provider: "openai", is_custom: false },
  { id: "openai-shimmer", name: "Shimmer", description: "Soft, calm", provider: "openai", is_custom: false },
];

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
      if (!provider || provider === "elevenlabs") {
        voices.push(...ELEVENLABS_VOICES);
      }
      if (!provider || provider === "openai") {
        voices.push(...OPENAI_VOICES);
      }
    }

    // Get user's cloned voices from ElevenLabs (skip built-in voices we already added)
    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
    const builtinVoiceIds = new Set(ELEVENLABS_VOICES.map(v => v.id));
    if (elevenlabsApiKey && (!provider || provider === "elevenlabs")) {
      try {
        const response = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": elevenlabsApiKey },
        });

        if (response.ok) {
          const data = await response.json();
          // Only add voices that aren't already in our built-in list
          const customVoices = (data.voices || [])
            .filter((v: { voice_id: string }) => !builtinVoiceIds.has(v.voice_id))
            .map((v: { voice_id: string; name: string; description?: string; preview_url?: string; category?: string }) => ({
              id: v.voice_id,
              name: v.name,
              description: v.description,
              provider: "elevenlabs",
              preview_url: v.preview_url,
              is_custom: true,
            }));
          voices.push(...customVoices);
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
