/**
 * Contract Test: DELETE /knowledge-source-delete
 *
 * Tests the knowledge source deletion endpoint contract
 * MUST FAIL until supabase/functions/knowledge-source-delete/index.ts is implemented
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('DELETE /knowledge-source-delete - Contract', () => {
  let supabase;
  let authToken;
  let testSourceId;

  beforeAll(async () => {
    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create test user and get auth token
    const { data, error } = await supabase.auth.signUp({
      email: `test-kb-delete-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    if (error) throw error;
    authToken = data.session.access_token;
  });

  beforeEach(async () => {
    // Create a test knowledge source before each test
    const addResponse = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: `https://example.com/test-${Date.now()}`,
      }),
    });

    const addData = await addResponse.json();
    testSourceId = addData.id;
  });

  it('should delete source and return success with deleted_chunks count', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: testSourceId,
      }),
    });

    // Contract: Should return 200 status
    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Response schema
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('deleted_chunks');

    // Contract: Types
    expect(typeof data.success).toBe('boolean');
    expect(typeof data.deleted_chunks).toBe('number');

    // Contract: success should be true
    expect(data.success).toBe(true);

    // Contract: deleted_chunks should be non-negative
    expect(data.deleted_chunks).toBeGreaterThanOrEqual(0);
  });

  it('should return 400 on missing id field', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(typeof data.error).toBe('string');
  });

  it('should return 400 on invalid UUID format', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: 'not-a-valid-uuid',
      }),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);
  });

  it('should return 404 on non-existent source', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: nonExistentId,
      }),
    });

    // Contract: Must return 404 Not Found
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('should return 404 when trying to delete another user\'s source', async () => {
    // Create another user
    const { data: otherUser } = await supabase.auth.signUp({
      email: `other-user-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    const otherAuthToken = otherUser.session.access_token;

    // Try to delete first user's source with second user's token
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otherAuthToken}`,
      },
      body: JSON.stringify({
        id: testSourceId,
      }),
    });

    // Contract: Must return 404 Not Found (not owned by user)
    expect(response.status).toBe(404);
  });

  it('should return 401 on missing auth token', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: testSourceId,
      }),
    });

    // Contract: Must return 401 Unauthorized
    expect(response.status).toBe(401);
  });

  it('should actually remove source from database', async () => {
    // Delete the source
    await fetch(`${supabaseUrl}/functions/v1/knowledge-source-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: testSourceId,
      }),
    });

    // Verify it's gone by listing sources
    const listResponse = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    const listData = await listResponse.json();

    // Contract: Deleted source should not appear in list
    const deletedSource = listData.sources.find(s => s.id === testSourceId);
    expect(deletedSource).toBeUndefined();
  });
});
