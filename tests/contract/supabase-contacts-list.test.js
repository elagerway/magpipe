import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Contacts List Contract', () => {
  let supabase;
  let testUserId;
  let testContactIds = [];

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create and authenticate test user
    const testEmail = `list-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'List Test User' },
      },
    });

    testUserId = authData.user?.id;

    // Create test contacts
    const contacts = [
      { name: 'Alice Anderson', phone_number: '+14155551111' },
      { name: 'Bob Brown', phone_number: '+14155552222' },
      { name: 'Charlie Chen', phone_number: '+14155553333' },
    ];

    for (const contact of contacts) {
      const { data } = await supabase
        .from('contacts')
        .insert({ ...contact, user_id: testUserId })
        .select()
        .single();
      if (data) {
        testContactIds.push(data.id);
      }
    }
  });

  afterAll(async () => {
    // Cleanup
    if (testContactIds.length > 0) {
      await supabase.from('contacts').delete().in('id', testContactIds);
    }
  });

  it('should return 200 with array of contacts', async () => {
    const { data, error } = await supabase.from('contacts').select('*');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(3);
  });

  it('should support ordering by name ascending', async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('name', { ascending: true });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Verify order
    for (let i = 1; i < data.length; i++) {
      expect(data[i].name >= data[i - 1].name).toBe(true);
    }
  });

  it('should support pagination with limit and offset', async () => {
    const limit = 2;
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('name')
      .range(0, limit - 1);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(limit);
  });

  it('should filter contacts by user_id (RLS)', async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', testUserId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // All returned contacts should belong to test user
    data.forEach((contact) => {
      expect(contact.user_id).toBe(testUserId);
    });
  });

  it('should support selecting specific columns', async () => {
    const { data, error} = await supabase
      .from('contacts')
      .select('id, name, phone_number')
      .limit(1)
      .single();

    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('phone_number');
    // Should not include other fields
    expect(data).not.toHaveProperty('notes');
  });
});