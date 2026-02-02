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

    const body = await req.json();
    const { contact_id, add_tags, remove_tags, ...updates } = body;

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "contact_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current contact for tag manipulation
    const { data: currentContact, error: fetchError } = await supabaseClient
      .from("contacts")
      .select("tags, metadata")
      .eq("id", contact_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !currentContact) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Contact not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    const allowedFields = ["name", "email", "company", "notes", "tags", "metadata"];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Handle tag operations
    if (add_tags || remove_tags) {
      let currentTags = currentContact.tags || [];

      if (add_tags) {
        currentTags = [...new Set([...currentTags, ...add_tags])];
      }

      if (remove_tags) {
        currentTags = currentTags.filter((t: string) => !remove_tags.includes(t));
      }

      updateData.tags = currentTags;
    }

    // Merge metadata
    if (updates.metadata) {
      updateData.metadata = { ...(currentContact.metadata || {}), ...updates.metadata };
    }

    updateData.updated_at = new Date().toISOString();

    const { data: contact, error } = await supabaseClient
      .from("contacts")
      .update(updateData)
      .eq("id", contact_id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating contact:", error);
      return new Response(
        JSON.stringify({ error: { code: "update_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(contact), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in update-contact:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
