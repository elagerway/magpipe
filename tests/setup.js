// Test setup file
import { beforeAll, afterAll, afterEach } from 'vitest';

// Load environment variables for testing
if (!process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = 'http://localhost:54321';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
}

// Global test setup
beforeAll(() => {
  // Setup code that runs once before all tests
});

// Cleanup after each test
afterEach(() => {
  // Cleanup code that runs after each test
});

// Global test teardown — delete any @example.com test users created during contract tests
afterAll(async () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl || supabaseUrl.includes('localhost')) return;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const testUsers = (users || []).filter(u => u.email?.endsWith('@example.com'));
    if (!testUsers.length) return;
    await Promise.all(testUsers.map(u => admin.auth.admin.deleteUser(u.id)));
  } catch {
    // Best-effort cleanup — don't fail tests if this errors
  }
});