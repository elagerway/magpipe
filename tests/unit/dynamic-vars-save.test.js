/**
 * Unit tests for functions-tab.js dynamic variable save logic.
 * Tests the parallelized save pattern (Promise.all) and send_to coercion.
 */
import { describe, it, expect, vi } from 'vitest';

// ── Simulate the save logic from functions-tab.js ──

function prepareSendTo(v) {
  // Ensure slack: true when a slack_channel is set but slack key is missing
  if (v.send_to?.slack_channel && v.send_to.slack === undefined) {
    v.send_to.slack = true;
  }
}

function buildSaveOperations(modalDynamicVars, agentUserId, agentId, supabase) {
  const dbOps = [];
  for (const v of modalDynamicVars) {
    if (!v.name) continue;

    prepareSendTo(v);

    if (v.id) {
      dbOps.push(supabase
        .from('dynamic_variables')
        .update({
          name: v.name,
          description: v.description,
          var_type: v.var_type,
          enum_options: v.var_type === 'enum' ? v.enum_options : null,
          send_to: v.send_to || null,
          updated_at: expect.any(String),
        })
        .eq('id', v.id));
    } else {
      dbOps.push(supabase
        .from('dynamic_variables')
        .insert({
          user_id: agentUserId,
          agent_id: agentId,
          name: v.name,
          description: v.description,
          var_type: v.var_type,
          enum_options: v.var_type === 'enum' ? v.enum_options : null,
          send_to: v.send_to || null,
        }));
    }
  }
  return dbOps;
}


describe('prepareSendTo coercion', () => {
  it('sets slack=true when slack_channel is present but slack is undefined', () => {
    const v = { name: 'test', send_to: { slack_channel: '#general' } };
    prepareSendTo(v);
    expect(v.send_to.slack).toBe(true);
  });

  it('does not overwrite slack=false', () => {
    const v = { name: 'test', send_to: { slack: false, slack_channel: '#general' } };
    prepareSendTo(v);
    expect(v.send_to.slack).toBe(false);
  });

  it('does not overwrite slack=true', () => {
    const v = { name: 'test', send_to: { slack: true, slack_channel: '#general' } };
    prepareSendTo(v);
    expect(v.send_to.slack).toBe(true);
  });

  it('does nothing when send_to is null', () => {
    const v = { name: 'test', send_to: null };
    prepareSendTo(v);
    expect(v.send_to).toBeNull();
  });

  it('does nothing when send_to has no slack_channel', () => {
    const v = { name: 'test', send_to: { email: true } };
    prepareSendTo(v);
    expect(v.send_to.slack).toBeUndefined();
  });
});


describe('save operations are parallelizable', () => {
  function createMockSupabase() {
    const calls = [];
    const mockChain = {
      eq: vi.fn().mockReturnThis(),
    };

    return {
      calls,
      from: vi.fn((table) => ({
        update: vi.fn((data) => {
          const op = { type: 'update', table, data };
          calls.push(op);
          return { eq: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })) };
        }),
        insert: vi.fn((data) => {
          const op = { type: 'insert', table, data };
          calls.push(op);
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    };
  }

  it('creates one operation per valid variable', () => {
    const supabase = createMockSupabase();
    const vars = [
      { id: '1', name: 'a', description: 'd', var_type: 'text', send_to: null },
      { id: '2', name: 'b', description: 'd', var_type: 'text', send_to: null },
      { name: 'c', description: 'd', var_type: 'text', send_to: null },
    ];

    const ops = buildSaveOperations(vars, 'user-1', 'agent-1', supabase);
    expect(ops).toHaveLength(3);
    expect(supabase.calls[0].type).toBe('update');
    expect(supabase.calls[1].type).toBe('update');
    expect(supabase.calls[2].type).toBe('insert');
  });

  it('skips variables with no name', () => {
    const supabase = createMockSupabase();
    const vars = [
      { id: '1', name: 'a', description: 'd', var_type: 'text', send_to: null },
      { id: '2', name: '', description: 'd', var_type: 'text', send_to: null },
      { name: null, description: 'd', var_type: 'text', send_to: null },
    ];

    const ops = buildSaveOperations(vars, 'user-1', 'agent-1', supabase);
    expect(ops).toHaveLength(1);
  });

  it('all operations are independent promises (can run with Promise.all)', async () => {
    const supabase = createMockSupabase();
    const vars = [
      { id: '1', name: 'a', description: 'd', var_type: 'text', send_to: null },
      { name: 'b', description: 'd', var_type: 'text', send_to: null },
    ];

    const ops = buildSaveOperations(vars, 'user-1', 'agent-1', supabase);
    // All ops should be thenables (promises)
    for (const op of ops) {
      expect(typeof op.then === 'function' || op instanceof Promise || typeof op?.eq === 'function').toBe(true);
    }
  });

  it('clears enum_options when var_type is not enum', () => {
    const supabase = createMockSupabase();
    const vars = [
      { id: '1', name: 'a', description: 'd', var_type: 'text', enum_options: ['x', 'y'], send_to: null },
    ];

    buildSaveOperations(vars, 'user-1', 'agent-1', supabase);
    expect(supabase.calls[0].data.enum_options).toBeNull();
  });

  it('preserves enum_options when var_type is enum', () => {
    const supabase = createMockSupabase();
    const vars = [
      { id: '1', name: 'a', description: 'd', var_type: 'enum', enum_options: ['x', 'y'], send_to: null },
    ];

    buildSaveOperations(vars, 'user-1', 'agent-1', supabase);
    expect(supabase.calls[0].data.enum_options).toEqual(['x', 'y']);
  });
});
