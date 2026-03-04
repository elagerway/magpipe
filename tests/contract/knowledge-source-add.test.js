/**
 * Contract Test: POST /knowledge-source-add
 *
 * Tests the knowledge source addition endpoint contract
 * MUST FAIL until supabase/functions/knowledge-source-add/index.ts is implemented
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('POST /knowledge-source-add - Contract', () => {
  let supabase;
  let authToken;

  beforeAll(async () => {
    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create test user and get auth token
    const { data, error } = await supabase.auth.signUp({
      email: `test-kb-add-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    if (error) throw error;
    authToken = data.session.access_token;
  });

  it('should accept valid URL and return source metadata', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com',
      }),
    });

    // Contract: Should return 200 status
    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Response schema
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('url');
    expect(data).toHaveProperty('title');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('chunk_count');
    expect(data).toHaveProperty('sync_period');

    // Contract: Types
    expect(typeof data.id).toBe('string');
    expect(typeof data.url).toBe('string');
    expect(typeof data.title).toBe('string');
    expect(typeof data.status).toBe('string');
    expect(typeof data.chunk_count).toBe('number');
    expect(typeof data.sync_period).toBe('string');

    // Contract: id should be valid UUID
    expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Contract: status must be valid enum
    expect(['completed', 'pending', 'failed']).toContain(data.status);

    // Contract: sync_period must be valid enum
    expect(['24h', '7d', '1mo', '3mo']).toContain(data.sync_period);

    // Contract: chunk_count should be non-negative
    expect(data.chunk_count).toBeGreaterThanOrEqual(0);
  });

  it('should accept custom sync_period', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/docs',
        sync_period: '1mo',
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.sync_period).toBe('1mo');
  });

  it('should return 400 on invalid URL format', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'not-a-valid-url',
      }),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(typeof data.error).toBe('string');
  });

  it('should return 400 on non-http(s) protocol', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'ftp://example.com',
      }),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);
  });

  it('should return 401 on missing auth token', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.com',
      }),
    });

    // Contract: Must return 401 Unauthorized
    expect(response.status).toBe(401);
  });

  it('should return 422 on inaccessible URL', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://this-domain-definitely-does-not-exist-12345.com',
      }),
    });

    // Contract: Must return 422 Unprocessable Entity
    expect(response.status).toBe(422);

    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('should return 400 on missing URL field', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
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

  it('should return 400 on URL longer than 2048 characters', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2050);

    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: longUrl,
      }),
    });

    // Contract: Should return 400 for too long URL
    expect(response.status).toBe(400);
  });

  it('should return 400 on invalid sync_period', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com',
        sync_period: 'invalid',
      }),
    });

    // Contract: Must return 400 Bad Request
    expect(response.status).toBe(400);
  });
});
