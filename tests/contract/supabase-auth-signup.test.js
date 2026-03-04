import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Auth Signup Contract', () => {
  let supabase;

  beforeAll(() => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);
  });

  it('should sign up a new user with email, password, and name', async () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';
    const testName = 'Test User';

    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          name: testName,
        },
      },
    });

    // Should return user object
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(testEmail);
    expect(data.user.user_metadata.name).toBe(testName);

    // Should receive session or require email confirmation
    // In dev mode, might auto-confirm; in prod, requires email confirmation
    expect(data.session !== null || data.user.confirmation_sent_at !== null).toBe(true);
  });

  it('should reject signup with invalid email format', async () => {
    const { data, error } = await supabase.auth.signUp({
      email: 'invalid-email',
      password: 'SecurePass123!',
      options: {
        data: { name: 'Test User' },
      },
    });

    expect(error).toBeDefined();
    expect(error.message).toContain('email');
  });

  it('should reject signup with weak password', async () => {
    const { data, error } = await supabase.auth.signUp({
      email: `test-${Date.now()}@example.com`,
      password: '123', // Too short
      options: {
        data: { name: 'Test User' },
      },
    });

    expect(error).toBeDefined();
    expect(error.message.toLowerCase()).toContain('password');
  });

  it('should reject duplicate email registration', async () => {
    const testEmail = `duplicate-${Date.now()}@example.com`;
    const testPassword = 'SecurePass123!';

    // First signup
    await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: { name: 'First User' },
      },
    });

    // Attempt duplicate signup
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: { name: 'Second User' },
      },
    });

    // Should either return error or return existing user with no new session
    expect(error !== null || data.session === null).toBe(true);
  });
});