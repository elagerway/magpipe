import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Contacts Create Contract', () => {
  let supabase;
  let testUserId;
  let createdContactIds = [];

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create and authenticate test user
    const testEmail = `contact-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'Contact Test User' },
      },
    });

    testUserId = authData.user?.id;
  });

  afterEach(async () => {
    // Cleanup created contacts
    if (createdContactIds.length > 0) {
      await supabase.from('contacts').delete().in('id', createdContactIds);
      createdContactIds = [];
    }
  });

  it('should create contact with valid name and phone_number', async () => {
    const contactData = {
      user_id: testUserId,
      name: 'John Smith',
      phone_number: '+14155551234',
      is_whitelisted: true,
    };

    const { data, error } = await supabase.from('contacts').insert(contactData).select().single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.name).toBe(contactData.name);
    expect(data.phone_number).toBe(contactData.phone_number);
    expect(data.is_whitelisted).toBe(true);
    expect(data.created_at).toBeDefined();

    createdContactIds.push(data.id);
  });

  it('should return 201 status with complete contact object', async () => {
    const contactData = {
      user_id: testUserId,
      name: 'Jane Doe',
      phone_number: '+14155555678',
      notes: 'Test contact notes',
    };

    const { data, error, status } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('user_id');
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('phone_number');
    expect(data).toHaveProperty('is_whitelisted');
    expect(data).toHaveProperty('notes');
    expect(data).toHaveProperty('created_at');
    expect(data).toHaveProperty('updated_at');

    createdContactIds.push(data.id);
  });

  it('should reject duplicate phone number for same user (409 conflict)', async () => {
    const phoneNumber = '+14155559999';

    // Create first contact
    const { data: firstContact } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'First Contact',
        phone_number: phoneNumber,
      })
      .select()
      .single();

    createdContactIds.push(firstContact.id);

    // Attempt to create duplicate
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'Duplicate Contact',
        phone_number: phoneNumber,
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23505'); // PostgreSQL unique violation
    expect(data).toBeNull();
  });

  it('should reject invalid phone number format', async () => {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'Invalid Phone',
        phone_number: '123-456-7890', // Invalid E.164 format
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
    expect(data).toBeNull();
  });

  it('should reject contact with empty name', async () => {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: '   ', // Empty/whitespace only
        phone_number: '+14155558888',
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(data).toBeNull();
  });
});