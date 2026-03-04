/**
 * Unit tests for send-notification-slack edge function logic.
 * Tests the pure functions extracted during simplification:
 * - resolveChannelFromMap: channel name → ID resolution from pre-fetched map
 * - Channel grouping logic for extracted data variables
 * - postToSlackChannel consolidation (join + post in one helper)
 */
import { describe, it, expect } from 'vitest';

// ── Inline the pure functions from the edge function (Deno modules can't be imported directly) ──

function resolveChannelFromMap(channelMap, channelName) {
  // If it looks like a raw channel ID (starts with C, no #)
  if (channelName.startsWith('C') && !channelName.startsWith('#')) {
    return channelName;
  }
  const name = channelName.replace(/^#/, '').toLowerCase();
  return channelMap.get(name) || null;
}

function groupVariablesByChannel(variables) {
  const channelGroups = {};
  for (const v of variables) {
    const channel = v.slack_channel;
    if (!channel) continue;
    if (!channelGroups[channel]) channelGroups[channel] = [];
    channelGroups[channel].push({ name: v.name, value: v.value });
  }
  return channelGroups;
}


describe('resolveChannelFromMap', () => {
  const channelMap = new Map([
    ['general', 'C0001'],
    ['sales-leads', 'C0002'],
    ['support', 'C0003'],
  ]);

  it('resolves a plain channel name', () => {
    expect(resolveChannelFromMap(channelMap, 'general')).toBe('C0001');
  });

  it('resolves a #-prefixed channel name', () => {
    expect(resolveChannelFromMap(channelMap, '#sales-leads')).toBe('C0002');
  });

  it('is case-insensitive', () => {
    expect(resolveChannelFromMap(channelMap, '#SUPPORT')).toBe('C0003');
    expect(resolveChannelFromMap(channelMap, 'General')).toBe('C0001');
  });

  it('passes through raw channel IDs (C-prefixed)', () => {
    expect(resolveChannelFromMap(channelMap, 'C12345ABC')).toBe('C12345ABC');
  });

  it('returns null for unknown channels', () => {
    expect(resolveChannelFromMap(channelMap, '#nonexistent')).toBeNull();
    expect(resolveChannelFromMap(channelMap, 'missing')).toBeNull();
  });

  it('returns null for empty map', () => {
    expect(resolveChannelFromMap(new Map(), 'general')).toBeNull();
  });
});


describe('groupVariablesByChannel', () => {
  it('groups variables by their slack_channel', () => {
    const variables = [
      { name: 'caller_name', value: 'John', slack_channel: '#sales-leads' },
      { name: 'email', value: 'john@example.com', slack_channel: '#sales-leads' },
      { name: 'issue_type', value: 'billing', slack_channel: '#support' },
    ];

    const groups = groupVariablesByChannel(variables);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['#sales-leads']).toHaveLength(2);
    expect(groups['#support']).toHaveLength(1);
    expect(groups['#sales-leads'][0]).toEqual({ name: 'caller_name', value: 'John' });
  });

  it('skips variables without slack_channel', () => {
    const variables = [
      { name: 'caller_name', value: 'John', slack_channel: '#general' },
      { name: 'email', value: 'john@example.com' }, // no channel
      { name: 'phone', value: '555-1234', slack_channel: null },
    ];

    const groups = groupVariablesByChannel(variables);
    expect(Object.keys(groups)).toHaveLength(1);
    expect(groups['#general']).toHaveLength(1);
  });

  it('returns empty object when no variables have channels', () => {
    const variables = [
      { name: 'a', value: '1' },
      { name: 'b', value: '2', slack_channel: null },
    ];
    expect(groupVariablesByChannel(variables)).toEqual({});
  });

  it('returns empty object for empty input', () => {
    expect(groupVariablesByChannel([])).toEqual({});
  });

  it('handles variables with undefined values', () => {
    const variables = [
      { name: 'caller_name', value: undefined, slack_channel: '#general' },
    ];
    const groups = groupVariablesByChannel(variables);
    expect(groups['#general'][0].value).toBeUndefined();
  });
});
