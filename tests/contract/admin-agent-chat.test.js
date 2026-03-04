/**
 * Contract Test: POST /admin-agent-chat
 *
 * Tests the admin agent chat endpoint contract
 * MUST FAIL until supabase/functions/admin-agent-chat/index.ts is implemented
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('POST /admin-agent-chat - Contract', () => {
  let supabase;
  let authToken;
  let userId;

  beforeAll(async () => {
    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create test user and get auth token
    const { data, error } = await supabase.auth.signUp({
      email: `test-admin-chat-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    if (error) throw error;
    authToken = data.session.access_token;
    userId = data.user.id;
  });

  it('should accept valid request with message only', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: 'Make my agent more friendly',
      }),
    });

    // Contract: Should return 200 status
    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Response schema
    expect(data).toHaveProperty('conversation_id');
    expect(data).toHaveProperty('response');
    expect(data).toHaveProperty('requires_confirmation');

    // Contract: Types
    expect(typeof data.conversation_id).toBe('string');
    expect(typeof data.response).toBe('string');
    expect(typeof data.requires_confirmation).toBe('boolean');

    // Contract: conversation_id should be valid UUID
    expect(data.conversation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should accept valid request with conversation_id', async () => {
    // First request to create conversation
    const firstResponse = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: 'Hello',
      }),
    });

    const firstData = await firstResponse.json();
    const conversationId = firstData.conversation_id;

    // Second request with conversation_id
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: 'Add more context',
        conversation_id: conversationId,
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Same conversation_id returned
    expect(data.conversation_id).toBe(conversationId);
  });

  it('should return 401 on missing auth token', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Test message',
      }),
    });

    // Contract: Must return 401 Unauthorized
    expect(response.status).toBe(401);
  });

  it('should return 400 on empty message', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: '',
      }),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(typeof data.error).toBe('string');
  });

  it('should return 400 on missing message field', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);
  });

  it('should include pending_action when requires_confirmation is true', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: 'Update my system prompt to be more casual',
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: If requires_confirmation is true, pending_action must exist
    if (data.requires_confirmation) {
      expect(data).toHaveProperty('pending_action');
      expect(data.pending_action).toHaveProperty('type');
      expect(data.pending_action).toHaveProperty('preview');
      expect(data.pending_action).toHaveProperty('parameters');

      // Contract: Action type must be valid enum
      expect(['update_system_prompt', 'add_knowledge_source', 'remove_knowledge_source']).toContain(
        data.pending_action.type
      );
    }
  });

  it('should reject message longer than 2000 characters', async () => {
    const longMessage = 'a'.repeat(2001);

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-agent-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        message: longMessage,
      }),
    });

    // Contract: Should return 400 for too long message
    expect(response.status).toBe(400);
  });
});
