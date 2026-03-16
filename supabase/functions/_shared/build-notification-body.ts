/**
 * Build notification content based on user-configured content_config.
 * Used by send-notification-sms, send-notification-email, send-notification-slack.
 *
 * If content_config is null/empty, callers fall back to their existing default templates.
 */

export interface ContentConfig {
  /** Which fields to include (caller_info, agent_name, session_id, sentiment, summary) */
  fields?: ContentField[];
  /** Optional custom text prepended to the message */
  custom_text?: string;
}

export type ContentField = 'caller_info' | 'agent_name' | 'session_id' | 'sentiment' | 'summary' | 'recording_url';

export const CONTENT_FIELD_LABELS: Record<ContentField, string> = {
  caller_info: 'Caller info',
  agent_name: 'Agent name',
  session_id: 'Session ID',
  sentiment: 'Caller sentiment',
  summary: 'Call summary',
  recording_url: 'Recording URL',
};

function hasField(config: ContentConfig, field: ContentField): boolean {
  return (config.fields || []).includes(field);
}

function buildLines(data: Record<string, unknown>, config: ContentConfig): string[] {
  const lines: string[] = [];
  if (config.custom_text?.trim()) lines.push(config.custom_text.trim());
  if (hasField(config, 'caller_info') && data.callerNumber) lines.push(`From: ${data.callerNumber}`);
  if (hasField(config, 'agent_name') && data.agentName) lines.push(`Agent: ${data.agentName}`);
  if (hasField(config, 'sentiment') && data.sentiment) lines.push(`Sentiment: ${data.sentiment}`);
  if (hasField(config, 'session_id') && data.sessionId) lines.push(`Session: ${data.sessionId}`);
  if (hasField(config, 'summary') && data.summary) lines.push(`\nSummary:\n${data.summary}`);
  if (hasField(config, 'recording_url') && data.recordingUrl) lines.push(`Recording: ${data.recordingUrl}`);
  return lines;
}

function isActive(config: ContentConfig | null | undefined): boolean {
  if (!config) return false;
  return !!(config.fields?.length || config.custom_text?.trim());
}

/**
 * Build SMS body. Returns null if content_config not set — use default template.
 */
export function buildSmsBody(
  data: Record<string, unknown>,
  config: ContentConfig | null | undefined,
  notificationId: string,
  optOutSuffix = '',
): string | null {
  if (!isActive(config)) return null;
  const lines = buildLines(data, config!);
  if (lines.length === 0) return null;
  return `${lines.join('\n')}\n\nNotification ID: ${notificationId}${optOutSuffix}`;
}

/**
 * Build email subject + HTML + text. Returns null if content_config not set.
 */
export function buildEmailBody(
  type: string,
  data: Record<string, unknown>,
  config: ContentConfig | null | undefined,
  notificationId: string,
): { subject: string; htmlBody: string; textBody: string } | null {
  if (!isActive(config)) return null;
  const lines = buildLines(data, config!);
  if (lines.length === 0) return null;

  const subject =
    type === 'missed_call' ? `Missed Call${data.callerNumber ? ` from ${data.callerNumber}` : ''}`
    : type === 'completed_call' ? `Call ${data.successful ? 'Completed' : 'Ended'}${data.callerNumber ? ` — ${data.callerNumber}` : ''}`
    : type === 'new_message' ? `New Message${data.senderNumber ? ` from ${data.senderNumber}` : ''}`
    : 'Notification';

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlLines = lines.map(line =>
    line === '' ? '<br>' : `<p style="margin: 0.25rem 0;">${esc(line)}</p>`
  );

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto; line-height: 1.6; color: #1f2937;">
      ${htmlLines.join('\n')}
      <p style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ccc; color: #666; font-size: 0.75rem;">Notification ID: ${notificationId}</p>
    </div>
  `;
  const textBody = lines.join('\n') + `\n\n---\nNotification ID: ${notificationId}`;

  return { subject, htmlBody, textBody };
}

/**
 * Build Slack message. Returns null if content_config not set.
 */
export function buildSlackBody(
  data: Record<string, unknown>,
  config: ContentConfig | null | undefined,
): { text: string; blocks: unknown[] } | null {
  if (!isActive(config)) return null;
  const lines = buildLines(data, config!);
  if (lines.length === 0) return null;
  const text = lines[0].substring(0, 200);
  const fullText = lines.join('\n');
  return {
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: fullText.substring(0, 2900) } }],
  };
}
