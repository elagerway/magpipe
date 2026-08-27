/**
 * Build notification content based on user-configured content_config.
 * Used by send-notification-sms, send-notification-email, send-notification-slack.
 *
 * If content_config is null/empty, callers fall back to their existing default templates.
 */

import { describeBridge } from './languages.ts';

export interface ContentConfig {
  /** Which fields to include (caller_info, agent_name, session_id, sentiment, summary) */
  fields?: ContentField[];
  /** Optional custom text prepended to the message */
  custom_text?: string;
}

export type ContentField = 'caller_info' | 'agent_name' | 'session_id' | 'sentiment' | 'summary' | 'recording_url' | 'caller_lookup';

export const CONTENT_FIELD_LABELS: Record<ContentField, string> = {
  caller_info: 'Caller info',
  agent_name: 'Agent name',
  session_id: 'Session ID',
  sentiment: 'Caller sentiment',
  summary: 'Call summary',
  recording_url: 'Recording URL',
  caller_lookup: 'Unknown-caller lookup',
};

/**
 * Channels where the unknown-caller lookup is on unless the user turned it off.
 * A Slack channel is a shared work queue and carrier detail is noise there; SMS
 * and email go to the owner, who is the one deciding whether to call back.
 */
export const CALLER_LOOKUP_DEFAULT_ON: Record<string, boolean> = { sms: true, email: true, slack: false };

function hasField(config: ContentConfig, field: ContentField): boolean {
  return (config.fields || []).includes(field);
}

/**
 * Summary line for the notification. A silent caller (instant hang-up) produces
 * no call_summary — without a fallback the alert was just a caller number and a
 * session id, with no indication of what happened. Say what happened rather
 * than that a summary is missing; "hung up immediately" only for calls short
 * enough for that to be true.
 */
const INSTANT_HANGUP_MAX_S = 30;

export function callSummaryLine(data: Record<string, unknown>): string {
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  if (summary) return summary;

  const secs = Number(data.duration) || 0;
  if (data.successful === false) return 'Call was not answered.';
  if (secs > 0 && secs <= INSTANT_HANGUP_MAX_S) return 'Agent greeted caller, caller hung up immediately.';
  // A held-open silent line is its own problem — it burns minutes and can mean
  // the caller couldn't hear the agent — so it must not read as a quick drop.
  return `Agent greeted caller, caller stayed on the line${secs ? ` for ${secs}s` : ''} without ever speaking.`;
}

const CALL_TYPES = new Set(['missed_call', 'completed_call']);

function buildLines(data: Record<string, unknown>, config: ContentConfig, type?: string): string[] {
  const lines: string[] = [];
  if (config.custom_text?.trim()) lines.push(config.custom_text.trim());
  if (hasField(config, 'caller_info')) {
    // On an inbound call callerNumber is the caller and serviceNumber is the
    // number they dialled; on outbound it's the other way round. Showing both
    // answers "which of my numbers did this come in on?" — with several service
    // numbers on one account the caller alone doesn't say.
    const outbound = data.direction === 'outbound';
    if (data.callerNumber) lines.push(`${outbound ? 'To' : 'From'}: ${data.callerNumber}`);
    if (data.serviceNumber) lines.push(`${outbound ? 'From' : 'To'}: ${data.serviceNumber}`);
  }
  // Translation bridge — shown whenever the conversation was translated, regardless of
  // configured fields (it only appears when there's a real source→target bridge).
  const bridge = describeBridge(data.sourceLanguage as string | null, data.targetLanguage as string | null);
  if (bridge) lines.push(`🌐 Translated ${bridge}`);
  if (hasField(config, 'agent_name') && data.agentName) lines.push(`Agent: ${data.agentName}`);
  if (hasField(config, 'sentiment') && data.sentiment) lines.push(`Sentiment: ${data.sentiment}`);
  if (hasField(config, 'session_id') && data.sessionId) lines.push(`Session: ${data.sessionId}`);
  if (hasField(config, 'summary')) {
    // Only call notifications get the "no summary" fallback — a message
    // notification legitimately has no summary and must not grow a stub line.
    if (data.summary) lines.push(`\nSummary:\n${String(data.summary).trim()}`);
    else if (type && CALL_TYPES.has(type)) lines.push(`\nSummary:\n${callSummaryLine(data)}`);
  }
  // Only present when the caller wasn't in the user's contacts — a known
  // contact needs no carrier lookup, and the producer skips the billed query.
  if (hasField(config, 'caller_lookup') && data.callerLookup) lines.push(`\n${data.callerLookup}`);
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
  type?: string,
): string | null {
  if (!isActive(config)) return null;
  const lines = buildLines(data, config!, type);
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
  const lines = buildLines(data, config!, type);
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
  type?: string,
): { text: string; blocks: unknown[] } | null {
  if (!isActive(config)) return null;
  const lines = buildLines(data, config!, type);
  if (lines.length === 0) return null;
  const text = lines[0].substring(0, 200);
  const fullText = lines.join('\n');
  return {
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: fullText.substring(0, 2900) } }],
  };
}
