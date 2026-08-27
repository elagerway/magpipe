/**
 * cal-com-cancel-booking — cancel a Cal.com booking.
 *
 * Was calling `api.cal.com/v1/bookings/{id}/cancel`. **API v1 is decommissioned**
 * — it now answers every request with `410 API v1 has been decommissioned`, so
 * cancellation has been failing outright. v2 is `POST /v2/bookings/{uid}/cancel`.
 *
 * The `cal-api-version` header is mandatory. Without it the API doesn't take the
 * authenticated host path at all — it falls through to the attendee flow and
 * answers "Booking with UID=… does not exist" instead of checking the token,
 * which makes an auth problem look like a missing booking.
 *
 * It also read tokens from a table called `integrations`, which does not exist
 * in this database (it's `users.cal_com_*`), and never refreshed the token. Both
 * now go through getCalAccessToken().
 *
 * POST { uid } | { booking_id }, optional { reason }
 * Deploy: ./scripts/deploy-functions.sh cal-com-cancel-booking
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from '../_shared/api-auth.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { CalTokenError, getCalAccessToken } from '../_shared/cal-com.ts'

// Pinned like fetchCalEventTypes: the response shape is version-dependent, and
// an unpinned call silently changes behaviour when Cal ships a new default.
const CAL_BOOKINGS_API_VERSION = '2024-08-13'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors()

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const user = await resolveUser(req, anonClient);
    if (!user) return err("unauthorized", "Unauthorized", 401);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { booking_id, uid, reason } = await req.json().catch(() => ({}));
    // v2 identifies bookings by uid. A numeric id is accepted and passed through
    // for callers that only have one, but Cal may not resolve it.
    const identifier = uid || booking_id;
    if (!identifier) return err("missing_param", "Provide the booking's uid (or booking_id).");

    let accessToken: string | null;
    try {
      accessToken = await getCalAccessToken(supabase, user.id);
    } catch (e) {
      const reconnect = e instanceof CalTokenError && e.invalidGrant;
      return err(
        reconnect ? "reconnect_required" : "cal_auth_error",
        reconnect
          ? "Your Cal.com connection has expired. Reconnect Cal.com and try again."
          : "Could not authenticate with Cal.com. Try again shortly.",
        reconnect ? 401 : 502,
      );
    }
    if (!accessToken) return err("no_calendar", "No Cal.com calendar connected");

    const response = await fetch(
      `https://api.cal.com/v2/bookings/${encodeURIComponent(identifier)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "cal-api-version": CAL_BOOKINGS_API_VERSION,
        },
        body: JSON.stringify({ cancellationReason: reason || "Cancelled via API" }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Cal.com cancel error (${response.status}):`, detail.slice(0, 400));
      let message = "Failed to cancel the booking";
      try {
        const parsed = JSON.parse(detail);
        message = parsed?.error?.message || parsed?.message || message;
      } catch { /* keep the default */ }
      return err("cancel_error", message, response.status);
    }

    const result = await response.json().catch(() => ({}));
    return json({
      success: true,
      booking_id: booking_id || uid,
      uid: result?.data?.uid ?? uid ?? null,
      status: result?.data?.status ?? "cancelled",
    });
  } catch (error) {
    console.error("Error in cal-com-cancel-booking:", error);
    return err("server_error", String((error as Error).message || error), 500);
  }
});
