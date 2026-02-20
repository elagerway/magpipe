/**
 * Lookup Phone Number — carrier/linetype check via SignalWire Lookup API
 *
 * Returns carrier info (linetype, name) for a given E.164 phone number.
 * Primary use: determine if a number is wireless (SMS-capable) before sending SMS.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SIGNALWIRE_SPACE_URL = Deno.env.get("SIGNALWIRE_SPACE_URL") || "erik.signalwire.com";
const SIGNALWIRE_PROJECT_ID = Deno.env.get("SIGNALWIRE_PROJECT_ID")!;
const SIGNALWIRE_API_TOKEN = Deno.env.get("SIGNALWIRE_API_TOKEN")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors();
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

    const { phone_number } = await req.json();

    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "phone_number is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: ensure E.164 format
    const normalized = phone_number.startsWith("+") ? phone_number : `+${phone_number}`;

    // Call SignalWire Lookup API
    const lookupUrl = `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest/lookup/phone_number/${encodeURIComponent(normalized)}?include=carrier`;
    const auth = btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

    const swResponse = await fetch(lookupUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
    });

    if (!swResponse.ok) {
      const errText = await swResponse.text();
      console.error(`SignalWire lookup failed (${swResponse.status}):`, errText);
      return new Response(
        JSON.stringify({
          error: { code: "lookup_failed", message: `Lookup failed: ${swResponse.status}` },
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const swData = await swResponse.json();

    // Build response in the shape the caller expects
    const carrier = swData.carrier || {};
    const response = {
      phone_number: swData.e164 || normalized,
      carrier: {
        linetype: carrier.linetype || null,   // "wireless" | "landline" | "voip" | null
        name: carrier.lec || carrier.name || null,
      },
      valid: swData.e164 ? true : false,
      location: swData.location || null,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in lookup-phone-number:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
