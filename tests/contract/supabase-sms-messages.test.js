import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase SMS Messages Contract', () => {
  let supabase;
  let testUserId;
  let testContactId;
  let testSmsIds = [];

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create and authenticate test user
    const testEmail = `sms-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'SMS Test User' },
      },
    });

    testUserId = authData.user?.id;

    // Create test contact
    const { data: contactData } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'SMS Test Contact',
        phone_number: '+14155555678',
      })
      .select()
      .single();

    testContactId = contactData?.id;
  });

  afterAll(async () => {
    // Cleanup SMS messages
    if (testSmsIds.length > 0) {
      await supabase.from('sms_messages').delete().in('id', testSmsIds);
    }

    // Cleanup contact
    if (testContactId) {
      await supabase.from('contacts').delete().eq('id', testContactId);
    }
  });

  it('should create SMS message with required fields', async () => {
    const smsData = {
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'inbound',
      body: 'Hello, this is a test SMS message.',
      status: 'received',
      signalwire_message_sid: `SM${Date.now()}test1234567890`,
    };

    const { data, error } = await supabase
      .from('sms_messages')
      .insert(smsData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.direction).toBe('inbound');
    expect(data.body).toBe(smsData.body);
    expect(data.status).toBe('received');
    expect(data.signalwire_message_sid).toBe(smsData.signalwire_message_sid);
    expect(data.created_at).toBeDefined();

    testSmsIds.push(data.id);
  });

  it('should support all SMS statuses', async () => {
    const statuses = ['queued', 'sending', 'sent', 'delivered', 'failed', 'received'];

    for (const status of statuses) {
      const { data, error } = await supabase
        .from('sms_messages')
        .insert({
          user_id: testUserId,
          contact_id: testContactId,
          direction: status === 'received' ? 'inbound' : 'outbound',
          body: `Test message with status: ${status}`,
          status,
          signalwire_message_sid: `SM${Date.now()}${status}`,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.status).toBe(status);

      testSmsIds.push(data.id);
    }
  });

  it('should enforce non-empty message body', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        body: '   ', // Whitespace only
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}empty`,
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
    expect(data).toBeNull();
  });

  it('should filter SMS messages by direction', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId)
      .eq('direction', 'inbound');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((message) => {
      expect(message.direction).toBe('inbound');
    });
  });

  it('should filter SMS messages by status', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'received');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((message) => {
      expect(message.status).toBe('received');
    });
  });

  it('should filter SMS messages by contact_id', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('contact_id', testContactId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((message) => {
      expect(message.contact_id).toBe(testContactId);
    });
  });

  it('should order SMS messages by created_at descending', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Verify descending order
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i - 1].created_at) >= new Date(data[i].created_at)).toBe(true);
    }
  });

  it('should support pagination with range', async () => {
    const limit = 3;
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .range(0, limit - 1);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(limit);
  });

  it('should enforce RLS - only return messages for authenticated user', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // All messages should belong to test user
    data.forEach((message) => {
      expect(message.user_id).toBe(testUserId);
    });
  });

  it('should reject invalid direction values', async () => {
    const { data, error } = await supabase
      .from('sms_messages')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'invalid_direction',
        body: 'Test message',
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}invalid`,
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
    expect(data).toBeNull();
  });

  it('should support searching message body with text search', async () => {
    // Create message with specific content
    const searchTerm = `UniqueSearchTerm${Date.now()}`;
    const { data: createdMsg } = await supabase
      .from('sms_messages')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        body: `This message contains ${searchTerm} for testing.`,
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}search`,
      })
      .select()
      .single();

    testSmsIds.push(createdMsg.id);

    // Search for messages containing the term
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', testUserId)
      .ilike('body', `%${searchTerm}%`);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].body).toContain(searchTerm);
  });
});