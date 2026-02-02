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

    const { contact_id, phone_number } = await req.json();

    if (!contact_id && !phone_number) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "contact_id or phone_number is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabaseClient
      .from("contacts")
      .select("*")
      .eq("user_id", user.id);

    if (contact_id) {
      query = query.eq("id", contact_id);
    } else {
      query = query.eq("phone_number", phone_number);
    }

    const { data: contact, error } = await query.single();

    if (error || !contact) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Contact not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get interaction stats
    const [callStats, messageStats] = await Promise.all([
      supabaseClient
        .from("call_records")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("caller_number", contact.phone_number),
      supabaseClient
        .from("sms_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .or(`from_number.eq.${contact.phone_number},to_number.eq.${contact.phone_number}`),
    ]);

    const response = {
      ...contact,
      stats: {
        total_calls: callStats.count || 0,
        total_messages: messageStats.count || 0,
        last_contact: contact.updated_at,
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-contact:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
