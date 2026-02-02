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

    const { phone_number, name, email, company, notes, tags, metadata } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "phone_number is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabaseClient
      .from("contacts")
      .select("id")
      .eq("user_id", user.id)
      .eq("phone_number", phone_number)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: { code: "duplicate", message: "A contact with this phone number already exists" } }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: contact, error } = await supabaseClient
      .from("contacts")
      .insert({
        user_id: user.id,
        phone_number,
        name: name || null,
        email: email || null,
        company: company || null,
        notes: notes || null,
        tags: tags || [],
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating contact:", error);
      return new Response(
        JSON.stringify({ error: { code: "create_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(contact), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in create-contact:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
