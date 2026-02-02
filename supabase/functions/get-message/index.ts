import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { message_id } = await req.json();

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "message_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: message, error } = await supabaseClient
      .from("sms_messages")
      .select("*")
      .eq("id", message_id)
      .eq("user_id", user.id)
      .single();

    if (error || !message) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Message not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const response = {
      id: message.id,
      thread_id: message.thread_id,
      from_number: message.from_number,
      to_number: message.to_number,
      body: message.body,
      direction: message.direction,
      status: message.status || "delivered",
      is_ai_generated: message.is_ai_generated || false,
      media_urls: message.media_urls || [],
      segments: message.segments || 1,
      error_code: message.error_code,
      error_message: message.error_message,
      created_at: message.created_at,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-message:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
