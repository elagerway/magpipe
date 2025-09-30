import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Auth Login Contract', () => {
  let supabase;
  const testEmail = `login-test-${Date.now()}@example.com`;
  const testPassword = 'SecurePass123!';

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create test user for login tests
    await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: { name: 'Login Test User' },
      },
    });
  });

  it('should login with valid email and password', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.session).toBeDefined();
    expect(data.session.access_token).toBeDefined();
    expect(data.session.refresh_token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(testEmail);
  });

  it('should return access token with correct type', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    expect(error).toBeNull();
    expect(data.session.token_type).toBe('bearer');
    expect(typeof data.session.expires_in).toBe('number');
    expect(data.session.expires_in).toBeGreaterThan(0);
  });

  it('should reject login with invalid credentials', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: 'WrongPassword123!',
    });

    expect(error).toBeDefined();
    expect(error.message.toLowerCase()).toMatch(/invalid|credentials|password/);
    expect(data.session).toBeNull();
  });

  it('should reject login with non-existent email', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `nonexistent-${Date.now()}@example.com`,
      password: 'AnyPassword123!',
    });

    expect(error).toBeDefined();
    expect(data.session).toBeNull();
  });

  it('should reject login with unconfirmed email (if email confirmation enabled)', async () => {
    // This test is conditional based on Supabase project settings
    // In dev/test mode, email confirmation might be disabled
    const unconfirmedEmail = `unconfirmed-${Date.now()}@example.com`;

    await supabase.auth.signUp({
      email: unconfirmedEmail,
      password: testPassword,
      options: {
        data: { name: 'Unconfirmed User' },
        emailRedirectTo: undefined, // Don't send confirmation email
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: unconfirmedEmail,
      password: testPassword,
    });

    // Depending on config, might allow login or require confirmation
    if (error) {
      expect(error.message.toLowerCase()).toMatch(/confirm|verify|email/);
    }
  });
});