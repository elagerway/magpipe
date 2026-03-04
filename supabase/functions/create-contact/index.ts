import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

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

    const { phone_number, name, first_name, last_name, email, company, notes } = await req.json();

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "phone_number is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate
    const { data: existing } = await queryClient
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

    const { data: contact, error } = await queryClient
      .from("contacts")
      .insert({
        user_id: user.id,
        phone_number,
        name: name || phone_number,
        first_name: first_name || name || phone_number,
        last_name: last_name || null,
        email: email || null,
        company: company || null,
        notes: notes || null,
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
