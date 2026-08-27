import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { SMS_MESSAGE_COLUMNS, rowToMessageSummaryDto } from '../_shared/message-dto.ts'
import { signRowMedia } from '../_shared/message-media.ts'
import { computeThreadId } from '../_shared/thread-id.ts'

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

    const body = await req.json().catch(() => ({}));
    const {
      limit = 50,
      offset = 0,
      direction,
      phone_number,
      from_date,
      to_date
    } = body;

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    let query = queryClient
      .from("sms_messages")
      .select(SMS_MESSAGE_COLUMNS, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (direction) {
      query = query.eq("direction", direction);
    }

    if (phone_number) {
      query = query.or(`sender_number.eq.${phone_number},recipient_number.eq.${phone_number}`);
    }

    if (from_date) {
      query = query.gte("created_at", from_date);
    }

    if (to_date) {
      query = query.lte("created_at", to_date);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      console.error("Error listing messages:", error);
      return new Response(
        JSON.stringify({ error: { code: "query_error", message: error.message } }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Re-sign attachments (durable path → fresh URL) and compute the stable
    // thread id per row. Service-role client for storage signing; rows are
    // already scoped to user.id by the query above. Per-row work runs in
    // parallel — only rows with media incur signing calls.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const formattedMessages = await Promise.all(
      (messages || []).map(async (row) => {
        const [media, thread_id] = await Promise.all([
          signRowMedia(serviceClient, row.metadata),
          computeThreadId(user.id, row.sender_number, row.recipient_number),
        ]);
        return rowToMessageSummaryDto(row, { media, thread_id });
      })
    );

    return new Response(
      JSON.stringify({
        messages: formattedMessages,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-messages:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
