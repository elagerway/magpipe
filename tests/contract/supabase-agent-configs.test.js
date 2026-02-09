import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Agent Configs Contract', () => {
  let supabase;
  let testUserId;
  let testAgentConfigId;

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create and authenticate test user
    const testEmail = `agent-config-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'Agent Config Test User' },
      },
    });

    testUserId = authData.user?.id;
  });

  afterAll(async () => {
    // Cleanup agent config
    if (testAgentConfigId) {
      await supabase.from('agent_configs').delete().eq('id', testAgentConfigId);
    }
  });

  it('should create agent config with default values', async () => {
    const configData = {
      user_id: testUserId,
      system_prompt: 'You are Maggie, a helpful AI assistant.',
      voice_id: 'kate',
    };

    const { data, error } = await supabase
      .from('agent_configs')
      .insert(configData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.system_prompt).toBe(configData.system_prompt);
    expect(data.voice_id).toBe('kate');
    expect(data.transfer_unknown_callers).toBe(false); // Default value
    expect(data.vetting_strategy).toBe('name-and-purpose'); // Default value
    expect(data.response_style).toBe('professional'); // Default value
    expect(data.temperature).toBe(0.7); // Default value
    expect(data.max_tokens).toBe(150); // Default value
    expect(data.created_at).toBeDefined();
    expect(data.updated_at).toBeDefined();

    testAgentConfigId = data.id;
  });

  it('should enforce unique constraint for user_id', async () => {
    // Attempt to create second config for same user
    const { data, error } = await supabase
      .from('agent_configs')
      .insert({
        user_id: testUserId,
        system_prompt: 'Another prompt',
        voice_id: 'alloy',
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23505'); // PostgreSQL unique violation
    expect(data).toBeNull();
  });

  it('should update agent config with PATCH', async () => {
    const updates = {
      voice_id: 'nova',
      transfer_unknown_callers: true,
      response_style: 'friendly',
      temperature: 0.8,
    };

    const { data, error } = await supabase
      .from('agent_configs')
      .update(updates)
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.voice_id).toBe('nova');
    expect(data.transfer_unknown_callers).toBe(true);
    expect(data.response_style).toBe('friendly');
    expect(data.temperature).toBe(0.8);
    expect(data.updated_at).not.toBe(data.created_at);
  });

  it('should validate system_prompt is not empty', async () => {
    const { data, error } = await supabase
      .from('agent_configs')
      .update({ system_prompt: '   ' })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
  });

  it('should validate voice_id enum values', async () => {
    const { data, error } = await supabase
      .from('agent_configs')
      .update({ voice_id: 'invalid_voice' })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
  });

  it('should validate vetting_strategy enum values', async () => {
    const validStrategies = ['name-and-purpose', 'strict', 'permissive'];

    for (const strategy of validStrategies) {
      const { data, error } = await supabase
        .from('agent_configs')
        .update({ vetting_strategy: strategy })
        .eq('id', testAgentConfigId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.vetting_strategy).toBe(strategy);
    }

    // Test invalid strategy
    const { data: invalidData, error: invalidError } = await supabase
      .from('agent_configs')
      .update({ vetting_strategy: 'invalid_strategy' })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(invalidError).toBeDefined();
    expect(invalidError.code).toBe('23514');
  });

  it('should validate response_style enum values', async () => {
    const validStyles = ['professional', 'friendly', 'casual', 'formal'];

    for (const style of validStyles) {
      const { data, error } = await supabase
        .from('agent_configs')
        .update({ response_style: style })
        .eq('id', testAgentConfigId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.response_style).toBe(style);
    }

    // Test invalid style
    const { data: invalidData, error: invalidError } = await supabase
      .from('agent_configs')
      .update({ response_style: 'invalid_style' })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(invalidError).toBeDefined();
    expect(invalidError.code).toBe('23514');
  });

  it('should validate temperature range (0.0 to 1.0)', async () => {
    // Valid temperatures
    const validTemps = [0.0, 0.5, 1.0];
    for (const temp of validTemps) {
      const { data, error } = await supabase
        .from('agent_configs')
        .update({ temperature: temp })
        .eq('id', testAgentConfigId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.temperature).toBe(temp);
    }

    // Invalid temperature (too low)
    const { data: lowData, error: lowError } = await supabase
      .from('agent_configs')
      .update({ temperature: -0.1 })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(lowError).toBeDefined();
    expect(lowError.code).toBe('23514');

    // Invalid temperature (too high)
    const { data: highData, error: highError } = await supabase
      .from('agent_configs')
      .update({ temperature: 1.1 })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(highError).toBeDefined();
    expect(highError.code).toBe('23514');
  });

  it('should validate max_tokens is positive', async () => {
    // Valid max_tokens
    const { data: validData, error: validError } = await supabase
      .from('agent_configs')
      .update({ max_tokens: 200 })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(validError).toBeNull();
    expect(validData.max_tokens).toBe(200);

    // Invalid max_tokens (zero)
    const { data: zeroData, error: zeroError } = await supabase
      .from('agent_configs')
      .update({ max_tokens: 0 })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(zeroError).toBeDefined();
    expect(zeroError.code).toBe('23514');

    // Invalid max_tokens (negative)
    const { data: negativeData, error: negativeError } = await supabase
      .from('agent_configs')
      .update({ max_tokens: -50 })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(negativeError).toBeDefined();
    expect(negativeError.code).toBe('23514');
  });

  it('should store and retrieve custom_instructions as JSONB', async () => {
    const customInstructions = {
      greeting: 'Hello! This is Maggie.',
      closing: 'Thank you for calling.',
      special_rules: ['Always be polite', 'Ask clarifying questions'],
      preferred_topics: {
        allowed: ['work', 'family', 'appointments'],
        blocked: ['politics', 'religion'],
      },
    };

    const { data, error } = await supabase
      .from('agent_configs')
      .update({ custom_instructions: customInstructions })
      .eq('id', testAgentConfigId)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.custom_instructions).toEqual(customInstructions);
    expect(data.custom_instructions.greeting).toBe('Hello! This is Pat.');
    expect(Array.isArray(data.custom_instructions.special_rules)).toBe(true);
    expect(data.custom_instructions.preferred_topics.allowed).toContain('work');
  });

  it('should enforce RLS - only return config for authenticated user', async () => {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data.user_id).toBe(testUserId);
    expect(data.id).toBe(testAgentConfigId);
  });
});