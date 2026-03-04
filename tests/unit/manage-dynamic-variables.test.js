/**
 * Unit tests for manage-dynamic-variables edge function logic.
 * Tests the PATCH allowlist includes send_to, and the field filtering logic.
 */
import { describe, it, expect } from 'vitest';

// ── Inline the allowlist logic from the edge function ──

const ALLOWED_PATCH_FIELDS = ["name", "description", "var_type", "enum_options", "send_to"];

function filterPatchBody(body) {
  const updates = { updated_at: new Date().toISOString() };
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field];
  }
  return updates;
}


describe('PATCH field allowlist', () => {
  it('includes send_to in allowed fields', () => {
    expect(ALLOWED_PATCH_FIELDS).toContain('send_to');
  });

  it('passes through send_to when present in body', () => {
    const body = {
      name: 'caller_name',
      send_to: { slack: true, slack_channel: '#leads' },
    };
    const result = filterPatchBody(body);
    expect(result.name).toBe('caller_name');
    expect(result.send_to).toEqual({ slack: true, slack_channel: '#leads' });
  });

  it('does not include send_to when not in body', () => {
    const body = { name: 'caller_name' };
    const result = filterPatchBody(body);
    expect(result.name).toBe('caller_name');
    expect(result).not.toHaveProperty('send_to');
  });

  it('strips unknown fields', () => {
    const body = {
      name: 'caller_name',
      send_to: { slack: true },
      malicious_field: 'drop tables',
      agent_id: 'should-not-be-updatable',
    };
    const result = filterPatchBody(body);
    expect(result).not.toHaveProperty('malicious_field');
    expect(result).not.toHaveProperty('agent_id');
    expect(result.name).toBe('caller_name');
    expect(result.send_to).toEqual({ slack: true });
  });

  it('allows send_to with null value (clearing routing)', () => {
    const body = { send_to: null };
    const result = filterPatchBody(body);
    // null is not undefined, so it should be included
    expect(result.send_to).toBeNull();
  });

  it('always adds updated_at timestamp', () => {
    const result = filterPatchBody({});
    expect(result).toHaveProperty('updated_at');
    expect(typeof result.updated_at).toBe('string');
  });
});
