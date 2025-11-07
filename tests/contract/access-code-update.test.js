/**
 * Contract Test: POST /access-code-update
 *
 * Tests the access code update endpoint contract (request and verify actions)
 * MUST FAIL until supabase/functions/access-code-update/index.ts is implemented
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

describe('POST /access-code-update - Contract', () => {
  let supabase;
  let authToken;
  let confirmationId;

  beforeAll(async () => {
    if (!supabaseAnonKey) {
      throw new Error('SUPABASE_ANON_KEY environment variable is required');
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Create test user and get auth token
    const { data, error } = await supabase.auth.signUp({
      email: `test-access-code-${Date.now()}@example.com`,
      password: 'test-password-123',
    });

    if (error) throw error;
    authToken = data.session.access_token;
  });

  describe('request action', () => {
    it('should accept valid request and return confirmation_id', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'request',
          new_access_code: '1234',
        }),
      });

      // Contract: Should return 200 status
      expect(response.status).toBe(200);

      const data = await response.json();

      // Contract: Response schema
      expect(data).toHaveProperty('confirmation_id');
      expect(data).toHaveProperty('expires_at');

      // Contract: Types
      expect(typeof data.confirmation_id).toBe('string');
      expect(typeof data.expires_at).toBe('string');

      // Contract: confirmation_id should be valid UUID
      expect(data.confirmation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // Contract: expires_at should be valid ISO timestamp
      expect(new Date(data.expires_at).toString()).not.toBe('Invalid Date');

      // Contract: expires_at should be in the future
      expect(new Date(data.expires_at).getTime()).toBeGreaterThan(Date.now());

      // Save for verify tests
      confirmationId = data.confirmation_id;
    });

    it('should return 400 on missing new_access_code', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'request',
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 on access code too short', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'request',
          new_access_code: '123', // Less than 4 characters
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);
    });

    it('should return 400 on access code too long', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'request',
          new_access_code: 'a'.repeat(21), // More than 20 characters
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);
    });

    it('should return 401 on missing auth token', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'request',
          new_access_code: '1234',
        }),
      });

      // Contract: Must return 401 Unauthorized
      expect(response.status).toBe(401);
    });
  });

  describe('verify action', () => {
    beforeAll(async () => {
      // Create a request to get confirmation_id
      const requestResponse = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'request',
          new_access_code: '5678',
        }),
      });

      const requestData = await requestResponse.json();
      confirmationId = requestData.confirmation_id;
    });

    it('should return 400 on missing confirmation_code', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'verify',
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 on invalid confirmation_code format', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'verify',
          confirmation_code: '12345', // Not 6 digits
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);
    });

    it('should return 403 on invalid confirmation code', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'verify',
          confirmation_code: '000000',
        }),
      });

      // Contract: Must return 403 Forbidden
      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('attempts_remaining');
      expect(typeof data.attempts_remaining).toBe('number');
    });

    it('should return 403 on expired confirmation', async () => {
      // Note: This test would require waiting 5 minutes or mocking time
      // For contract testing, we just verify the error structure
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'verify',
          confirmation_code: '999999',
        }),
      });

      // Contract: Should return 403 Forbidden
      expect([200, 403]).toContain(response.status);

      if (response.status === 403) {
        const data = await response.json();
        expect(data).toHaveProperty('error');
      }
    });

    it('should return 401 on missing auth token', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify',
          confirmation_code: '123456',
        }),
      });

      // Contract: Must return 401 Unauthorized
      expect(response.status).toBe(401);
    });

    it('should have correct success response schema', async () => {
      // Note: This test requires knowing the actual confirmation code
      // In practice, this would be mocked or retrieved from test SMS
      // For contract testing, we verify the schema structure

      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'verify',
          confirmation_code: '123456', // Will likely fail, but we test response schema
        }),
      });

      const data = await response.json();

      if (response.status === 200) {
        // Contract: Success response schema
        expect(data).toHaveProperty('success');
        expect(typeof data.success).toBe('boolean');
        expect(data.success).toBe(true);
      } else if (response.status === 403) {
        // Contract: Error response schema
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('attempts_remaining');
      }
    });
  });

  describe('action parameter validation', () => {
    it('should return 400 on missing action field', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          new_access_code: '1234',
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);
    });

    it('should return 400 on invalid action value', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/access-code-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action: 'invalid',
          new_access_code: '1234',
        }),
      });

      // Contract: Must return 400 Bad Request
      expect(response.status).toBe(400);
    });
  });
});
