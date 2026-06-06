// DB column → public API field mapping for sms_messages.
// DB uses: sender_number, recipient_number, content
// API uses: from_number, to_number, body (telco convention, matches webhook payloads)

export const SMS_MESSAGE_COLUMNS =
  "id, user_id, contact_id, sender_number, recipient_number, direction, content, status, is_ai_generated, sent_at, created_at, message_sid, delivered_at, sentiment, agent_id, translation";

export function rowToMessageDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    contact_id: row.contact_id ?? null,
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
  };
}

export function rowToMessageSummaryDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    from_number: row.sender_number,
    to_number: row.recipient_number,
    body: row.content,
    direction: row.direction,
    status: (row.status as string) ?? "sent",
    is_ai_generated: (row.is_ai_generated as boolean) ?? false,
    created_at: row.created_at,
  };
}
