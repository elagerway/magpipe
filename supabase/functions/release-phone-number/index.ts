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

    const { number_id } = await req.json();

    if (!number_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "number_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the number first
    const { data: number, error: fetchError } = await supabaseClient
      .from("service_numbers")
      .select("*")
      .eq("id", number_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !number) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Phone number not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Release number from SignalWire
    const signalwireProjectId = Deno.env.get("SIGNALWIRE_PROJECT_ID");
    const signalwireToken = Deno.env.get("SIGNALWIRE_API_TOKEN");
    const signalwireSpaceUrl = Deno.env.get("SIGNALWIRE_SPACE_URL");

    if (signalwireProjectId && signalwireToken && signalwireSpaceUrl && number.vendor_sid) {
      try {
        const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`);
        await fetch(
          `https://${signalwireSpaceUrl}/api/relay/rest/phone_numbers/${number.vendor_sid}`,
          {
            method: "DELETE",
            headers: { Authorization: `Basic ${signalwireAuth}` },
          }
        );
      } catch (e) {
        console.error("Failed to release number from SignalWire:", e);
        // Continue with database deletion anyway
      }
    }

    // Delete from database
    const { error: deleteError } = await supabaseClient
      .from("service_numbers")
      .delete()
      .eq("id", number_id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting number:", deleteError);
      return new Response(
        JSON.stringify({ error: { code: "delete_error", message: deleteError.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, phone_number: number.phone_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in release-phone-number:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
