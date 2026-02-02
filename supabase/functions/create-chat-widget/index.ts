import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateWidgetKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "wgt_";
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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

    const {
      agent_id,
      name = "Website Chat",
      primary_color = "#6366f1",
      position = "bottom-right",
      welcome_message = "Hi! How can I help you today?",
      offline_message = "Leave a message and we'll get back to you.",
      collect_visitor_name = true,
      collect_visitor_email = false,
      allowed_domains = [],
    } = await req.json();

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "agent_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify agent exists and belongs to user
    const { data: agent, error: agentError } = await supabaseClient
      .from("agent_configs")
      .select("id, name")
      .eq("id", agent_id)
      .eq("user_id", user.id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: { code: "invalid_agent", message: "Agent not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const widget_key = generateWidgetKey();

    const { data: widget, error } = await supabaseClient
      .from("chat_widgets")
      .insert({
        user_id: user.id,
        agent_id,
        widget_key,
        name,
        primary_color,
        position,
        welcome_message,
        offline_message,
        collect_visitor_name,
        collect_visitor_email,
        allowed_domains,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating widget:", error);
      return new Response(
        JSON.stringify({ error: { code: "create_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate embed code
    const embedCode = `<script>(function(w,d,s,o,f,js,fjs){w['PatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);}(window,document,'script','PatChat','https://solomobile.ai/widget/pat-chat.js'));PatChat('init',{widgetKey:'${widget_key}'});</script>`;

    return new Response(
      JSON.stringify({
        ...widget,
        agent_name: agent.name,
        embed_code: embedCode,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in create-chat-widget:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
