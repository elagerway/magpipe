import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from '../_shared/api-auth.ts'
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

    // Resolve user from JWT or API key
    const user = await resolveUser(req, supabaseClient);

    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for API key auth (no RLS context), anon client for JWT
    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    const { booking_id, uid, reason } = await req.json();

    if (!booking_id && !uid) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "booking_id or uid is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's Cal.com integration
    const { data: integration, error: integrationError } = await queryClient
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
