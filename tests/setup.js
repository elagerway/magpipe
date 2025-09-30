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

// Global test teardown
afterAll(() => {
  // Teardown code that runs once after all tests
});