import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { SMS_MESSAGE_COLUMNS, rowToMessageDto } from '../_shared/message-dto.ts'
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

    const { message_id } = await req.json().catch(() => ({}));

    const queryClient = user.authMethod === "api_key"
      ? createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        )
      : supabaseClient;

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: { code: "missing_param", message: "message_id is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: message, error } = await queryClient
      .from("sms_messages")
      .select(SMS_MESSAGE_COLUMNS)
      .eq("id", message_id)
      .eq("user_id", user.id)
      .single();

    if (error || !message) {
      return new Response(
        JSON.stringify({ error: { code: "not_found", message: "Message not found" } }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Re-sign attachments from their durable storage path (service role) and
    // compute the stable thread id. Rows are already scoped to user.id above.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const [media, thread_id] = await Promise.all([
      signRowMedia(serviceClient, message.metadata),
      computeThreadId(user.id, message.sender_number, message.recipient_number),
    ]);
    const response = rowToMessageDto(message, { media, thread_id });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-message:", error);
    return new Response(
      JSON.stringify({ error: { code: "server_error", message: error.message } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
