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

    const { booking_id, uid, reason } = await req.json();

    if (!booking_id && !uid) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "booking_id or uid is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's Cal.com integration
    const { data: integration, error: integrationError } = await supabaseClient
      .from("integrations")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "cal_com")
      .single();

    if (integrationError || !integration?.access_token) {
      return new Response(
        JSON.stringify({ error: { code: "no_calendar", message: "No Cal.com calendar connected" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel via Cal.com API
    const cancelUrl = uid
      ? `https://api.cal.com/v1/bookings/${uid}/cancel`
      : `https://api.cal.com/v1/bookings/${booking_id}/cancel`;

    const response = await fetch(cancelUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: reason || "Cancelled via API" }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Cal.com cancel error:", errorData);
      return new Response(
        JSON.stringify({ error: { code: "cancel_error", message: errorData.message || "Failed to cancel booking" } }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, booking_id: booking_id || uid }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in cal-com-cancel-booking:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
