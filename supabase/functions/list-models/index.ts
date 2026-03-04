import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Available LLM models for voice agents
const LLM_MODELS = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "Latest and most capable, recommended for voice agents",
    latency: "low",
    is_default: true
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Highly capable, great for complex conversations",
    latency: "low",
    is_default: false
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and cost-effective",
    latency: "lowest",
    is_default: false
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "Highly capable, great for complex conversations",
    latency: "low",
    is_default: false
  },
  {
    id: "claude-3-haiku",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    description: "Fast and cost-effective",
    latency: "lowest",
    is_default: false
  },
];

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

    const body = await req.json().catch(() => ({}));
    const { provider } = body;

    let models = [...LLM_MODELS];

    // Filter by provider if specified
    if (provider) {
      models = models.filter(m => m.provider === provider);
    }

    return new Response(JSON.stringify({ models }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in list-models:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
