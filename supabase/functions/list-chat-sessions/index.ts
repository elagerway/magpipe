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
    const { limit = 50, offset = 0, widget_id, status, from_date } = body;

    let query = supabaseClient
      .from("chat_sessions")
      .select(`
        *,
        widget:chat_widgets(id, name),
        messages:chat_messages(content, created_at)
      `, { count: "exact" })
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (widget_id) {
      query = query.eq("widget_id", widget_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (from_date) {
      query = query.gte("created_at", from_date);
    }

    const { data: sessions, error, count } = await query;

    if (error) {
      console.error("Error listing sessions:", error);
      return new Response(
        JSON.stringify({ error: { code: "query_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format response
    const formattedSessions = (sessions || []).map(session => {
      const lastMessage = session.messages?.[session.messages.length - 1];
      return {
        id: session.id,
        widget_id: session.widget_id,
        widget_name: session.widget?.name,
        visitor_id: session.visitor_id,
        visitor_name: session.visitor_name,
        visitor_email: session.visitor_email,
        status: session.status,
        last_message: lastMessage?.content,
        last_message_at: session.last_message_at,
        message_count: session.messages?.length || 0,
        page_url: session.page_url,
        created_at: session.created_at,
      };
    });

    return new Response(
      JSON.stringify({
        sessions: formattedSessions,
        total: count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-chat-sessions:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
