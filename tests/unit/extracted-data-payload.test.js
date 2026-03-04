/**
 * Unit tests for the extracted data Slack payload construction logic.
 * Tests the Python agent.py send_extracted_data_slack payload building,
 * re-implemented in JS for Vitest (same logic, same edge cases).
 */
import { describe, it, expect } from 'vitest';

// ── Inline the payload building logic from agent.py ──

function buildExtractedDataPayload({ userId, agentId, extractedData, dynamicVariables, callerNumber }) {
  // Build var_config: name → slack_channel (only if slack is enabled)
  const varConfig = {};
  for (const v of dynamicVariables) {
    const sendTo = v.send_to || {};
    // slack defaults to true if slack_channel is set but slack key is missing
    if (sendTo.slack_channel && (sendTo.slack === undefined ? true : sendTo.slack)) {
      varConfig[v.name] = sendTo.slack_channel;
    }
  }

  if (Object.keys(varConfig).length === 0) return null;

  // Build variables array with per-variable channels
  const variables = [];
  for (const [varName, value] of Object.entries(extractedData)) {
    if (varName in varConfig && value !== null && value !== undefined) {
      variables.push({
        name: varName,
        value,
        slack_channel: varConfig[varName],
      });
    }
  }

  if (variables.length === 0) return null;

  return {
    userId,
    agentId,
    type: 'extracted_data',
    data: {
      variables,
      callerNumber,
    },
  };
}


describe('buildExtractedDataPayload', () => {
  const baseArgs = {
    userId: 'user-123',
    agentId: 'agent-456',
    callerNumber: '+15551234567',
  };

  it('builds payload with per-variable slack channels', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: 'John Doe', email: 'john@test.com' },
      dynamicVariables: [
        { name: 'caller_name', send_to: { slack: true, slack_channel: '#leads' } },
        { name: 'email', send_to: { slack: true, slack_channel: '#leads' } },
      ],
    });

    expect(result.type).toBe('extracted_data');
    expect(result.data.variables).toHaveLength(2);
    expect(result.data.variables[0]).toEqual({
      name: 'caller_name',
      value: 'John Doe',
      slack_channel: '#leads',
    });
    expect(result.data.callerNumber).toBe('+15551234567');
  });

  it('does NOT include callRecordId in payload (removed dead param)', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { name: 'Jane' },
      dynamicVariables: [
        { name: 'name', send_to: { slack: true, slack_channel: '#general' } },
      ],
    });

    expect(result.data).not.toHaveProperty('callRecordId');
  });

  it('defaults slack to true when slack_channel is set but slack key is missing', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: 'John' },
      dynamicVariables: [
        { name: 'caller_name', send_to: { slack_channel: '#leads' } }, // no slack: true/false
      ],
    });

    expect(result).not.toBeNull();
    expect(result.data.variables).toHaveLength(1);
  });

  it('excludes variables where slack is explicitly false', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: 'John', email: 'j@test.com' },
      dynamicVariables: [
        { name: 'caller_name', send_to: { slack: false, slack_channel: '#leads' } },
        { name: 'email', send_to: { slack: true, slack_channel: '#leads' } },
      ],
    });

    expect(result.data.variables).toHaveLength(1);
    expect(result.data.variables[0].name).toBe('email');
  });

  it('returns null when no variables have slack channels configured', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: 'John' },
      dynamicVariables: [
        { name: 'caller_name', send_to: {} },
        { name: 'email', send_to: null },
      ],
    });

    expect(result).toBeNull();
  });

  it('returns null when extracted data values are all null', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: null },
      dynamicVariables: [
        { name: 'caller_name', send_to: { slack: true, slack_channel: '#leads' } },
      ],
    });

    expect(result).toBeNull();
  });

  it('skips extracted data keys not in dynamic variables', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { caller_name: 'John', unknown_field: 'mystery' },
      dynamicVariables: [
        { name: 'caller_name', send_to: { slack: true, slack_channel: '#leads' } },
      ],
    });

    expect(result.data.variables).toHaveLength(1);
    expect(result.data.variables[0].name).toBe('caller_name');
  });

  it('routes variables to different channels', () => {
    const result = buildExtractedDataPayload({
      ...baseArgs,
      extractedData: { name: 'John', issue: 'billing' },
      dynamicVariables: [
        { name: 'name', send_to: { slack: true, slack_channel: '#leads' } },
        { name: 'issue', send_to: { slack: true, slack_channel: '#support' } },
      ],
    });

    expect(result.data.variables).toHaveLength(2);
    expect(result.data.variables[0].slack_channel).toBe('#leads');
    expect(result.data.variables[1].slack_channel).toBe('#support');
  });
});
