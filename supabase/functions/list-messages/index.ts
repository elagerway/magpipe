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

    const body = await req.json().catch(() => ({}));
    const {
      limit = 50,
      offset = 0,
      thread_id,
      direction,
      phone_number,
      from_date,
      to_date
    } = body;

    let query = supabaseClient
      .from("sms_messages")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (thread_id) {
      query = query.eq("thread_id", thread_id);
    }

    if (direction) {
      query = query.eq("direction", direction);
    }

    if (phone_number) {
      query = query.or(`from_number.eq.${phone_number},to_number.eq.${phone_number}`);
    }

    if (from_date) {
      query = query.gte("created_at", from_date);
    }

    if (to_date) {
      query = query.lte("created_at", to_date);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      console.error("Error listing messages:", error);
      return new Response(
        JSON.stringify({ error: { code: "query_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      thread_id: msg.thread_id,
      from_number: msg.from_number,
      to_number: msg.to_number,
      body: msg.body,
      direction: msg.direction,
      status: msg.status || "delivered",
      is_ai_generated: msg.is_ai_generated || false,
      created_at: msg.created_at,
    }));

    return new Response(
      JSON.stringify({
        messages: formattedMessages,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-messages:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
