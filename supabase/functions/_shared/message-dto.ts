// DB column → public API field mapping for sms_messages.
// DB uses: sender_number, recipient_number, content
// API uses: from_number, to_number, body (telco convention, matches webhook payloads)

export const SMS_MESSAGE_COLUMNS =
  "id, user_id, contact_id, sender_number, recipient_number, direction, content, status, is_ai_generated, sent_at, created_at, message_sid, delivered_at, sentiment, agent_id, translation, metadata";

// Expose ONLY the delivery_error sub-field of metadata, never the whole blob
// (metadata also holds internal/customer attribution that must not leak into
// the public API). Populated by the WhatsApp status webhook on a failed send:
// { code, reason, at }.
function deliveryError(row: Record<string, unknown>) {
  const md = row.metadata as Record<string, unknown> | null | undefined;
  return (md && typeof md === "object" ? (md.delivery_error ?? null) : null);
}

// Per-row extras the handler computes asynchronously (storage signing, hashing)
// and injects, keeping these mappers pure/sync.
export interface MessageDtoExtras {
  // Re-signed attachments: [{ url, mime_type, kind, caption }] (path stripped).
  media?: unknown[];
  // Deterministic stable conversation id (see _shared/thread-id.ts).
  thread_id?: string | null;
}

export function rowToMessageDto(row: Record<string, unknown>, extras: MessageDtoExtras = {}) {
  return {
    id: row.id,
    contact_id: row.contact_id ?? null,
    thread_id: extras.thread_id ?? null,
    from_number: row.sender_number,
    to_number: row.recipient_number,
    body: row.content,
    direction: row.direction,
    status: (row.status as string) ?? "sent",
    is_ai_generated: (row.is_ai_generated as boolean) ?? false,
    sent_at: row.sent_at,
    created_at: row.created_at,
    message_sid: row.message_sid ?? null,
    delivered_at: row.delivered_at ?? null,
    sentiment: row.sentiment ?? null,
    agent_id: row.agent_id ?? null,
    translation: row.translation ?? null,
    media: extras.media ?? [],
    delivery_error: deliveryError(row),
  };
}

export function rowToMessageSummaryDto(row: Record<string, unknown>, extras: MessageDtoExtras = {}) {
  return {
    id: row.id,
    thread_id: extras.thread_id ?? null,
    from_number: row.sender_number,
    to_number: row.recipient_number,
    body: row.content,
    direction: row.direction,
    status: (row.status as string) ?? "sent",
    is_ai_generated: (row.is_ai_generated as boolean) ?? false,
    created_at: row.created_at,
    media: extras.media ?? [],
    delivery_error: deliveryError(row),
  };
}
