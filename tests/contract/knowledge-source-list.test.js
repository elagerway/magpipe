/**
 * Contract Test: GET /knowledge-source-list
 *
 * Tests the knowledge source list endpoint contract
 * MUST FAIL until supabase/functions/knowledge-source-list/index.ts is implemented
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('GET /knowledge-source-list - Contract', () => {
  let supabase;
  let authToken;

  beforeAll(async () => {
    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create test user and get auth token
    const { data, error } = await supabase.auth.signUp({
      email: `test-kb-list-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    if (error) throw error;
    authToken = data.session.access_token;
  });

  it('should return empty array for new user', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    // Contract: Should return 200 status
    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Response schema
    expect(data).toHaveProperty('sources');
    expect(Array.isArray(data.sources)).toBe(true);

    // Contract: New user should have no sources
    expect(data.sources).toHaveLength(0);
  });

  it('should return array of sources with correct schema', async () => {
    // First, add a knowledge source
    await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com',
        sync_period: '7d',
      }),
    });

    // Now list sources
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.sources.length).toBeGreaterThan(0);

    // Contract: Each source must have required fields
    const source = data.sources[0];
    expect(source).toHaveProperty('id');
    expect(source).toHaveProperty('url');
    expect(source).toHaveProperty('title');
    expect(source).toHaveProperty('sync_status');
    expect(source).toHaveProperty('sync_period');
    expect(source).toHaveProperty('chunk_count');
    expect(source).toHaveProperty('created_at');

    // Contract: Types
    expect(typeof source.id).toBe('string');
    expect(typeof source.url).toBe('string');
    expect(typeof source.title).toBe('string');
    expect(typeof source.sync_status).toBe('string');
    expect(typeof source.sync_period).toBe('string');
    expect(typeof source.chunk_count).toBe('number');
    expect(typeof source.created_at).toBe('string');

    // Contract: sync_status must be valid enum
    expect(['pending', 'syncing', 'completed', 'failed']).toContain(source.sync_status);

    // Contract: sync_period must be valid enum
    expect(['24h', '7d', '1mo', '3mo']).toContain(source.sync_period);
  });

  it('should include optional fields when present', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();

    if (data.sources.length > 0) {
      const source = data.sources[0];

      // Contract: Optional fields should be present (may be null)
      expect(source).toHaveProperty('description');
      expect(source).toHaveProperty('last_synced_at');
      expect(source).toHaveProperty('next_sync_at');
      expect(source).toHaveProperty('error_message');

      // Contract: If sync_status is 'failed', error_message should be present
      if (source.sync_status === 'failed') {
        expect(source.error_message).toBeTruthy();
        expect(typeof source.error_message).toBe('string');
      }
    }
  });

  it('should return 401 on missing auth token', async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
    });

    // Contract: Must return 401 Unauthorized
    expect(response.status).toBe(401);
  });

  it('should return sources ordered by created_at DESC', async () => {
    // Add multiple sources
    await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/first',
      }),
    });

    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

    await fetch(`${supabaseUrl}/functions/v1/knowledge-source-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        url: 'https://example.com/second',
      }),
    });

    const response = await fetch(`${supabaseUrl}/functions/v1/knowledge-source-list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();

    // Contract: Sources should be ordered newest first
    if (data.sources.length >= 2) {
      const firstDate = new Date(data.sources[0].created_at);
      const secondDate = new Date(data.sources[1].created_at);
      expect(firstDate.getTime()).toBeGreaterThanOrEqual(secondDate.getTime());
    }
  });
});
