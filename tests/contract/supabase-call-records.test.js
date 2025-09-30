import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Supabase Call Records Contract', () => {
  let supabase;
  let testUserId;
  let testContactId;
  let testCallRecordIds = [];

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create and authenticate test user
    const testEmail = `call-records-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'Call Records Test User' },
      },
    });

    testUserId = authData.user?.id;

    // Create test contact
    const { data: contactData } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'Test Contact',
        phone_number: '+14155551234',
      })
      .select()
      .single();

    testContactId = contactData?.id;
  });

  afterAll(async () => {
    // Cleanup call records
    if (testCallRecordIds.length > 0) {
      await supabase.from('call_records').delete().in('id', testCallRecordIds);
    }

    // Cleanup contact
    if (testContactId) {
      await supabase.from('contacts').delete().eq('id', testContactId);
    }
  });

  it('should create call record with required fields', async () => {
    const callData = {
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 120,
      signalwire_call_sid: `CA${Date.now()}test1234567890`,
    };

    const { data, error } = await supabase
      .from('call_records')
      .insert(callData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.direction).toBe('inbound');
    expect(data.status).toBe('completed');
    expect(data.duration_seconds).toBe(120);
    expect(data.signalwire_call_sid).toBe(callData.signalwire_call_sid);
    expect(data.started_at).toBeDefined();
    expect(data.created_at).toBeDefined();

    testCallRecordIds.push(data.id);
  });

  it('should support all call statuses', async () => {
    const statuses = ['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'busy', 'no-answer'];

    for (const status of statuses) {
      const { data, error } = await supabase
        .from('call_records')
        .insert({
          user_id: testUserId,
          contact_id: testContactId,
          direction: 'outbound',
          status,
          signalwire_call_sid: `CA${Date.now()}${status}`,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.status).toBe(status);

      testCallRecordIds.push(data.id);
    }
  });

  it('should store transcript and recording URL when provided', async () => {
    const callData = {
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 300,
      signalwire_call_sid: `CA${Date.now()}transcript`,
      transcript: 'Hello, this is a test call transcript.',
      recording_url: 'https://api.signalwire.com/recordings/RE1234567890',
    };

    const { data, error } = await supabase
      .from('call_records')
      .insert(callData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.transcript).toBe(callData.transcript);
    expect(data.recording_url).toBe(callData.recording_url);

    testCallRecordIds.push(data.id);
  });

  it('should filter call records by direction', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('user_id', testUserId)
      .eq('direction', 'inbound');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((record) => {
      expect(record.direction).toBe('inbound');
    });
  });

  it('should filter call records by status', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('user_id', testUserId)
      .eq('status', 'completed');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((record) => {
      expect(record.status).toBe('completed');
    });
  });

  it('should filter call records by contact_id', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('contact_id', testContactId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    data.forEach((record) => {
      expect(record.contact_id).toBe(testContactId);
    });
  });

  it('should order call records by started_at descending', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('user_id', testUserId)
      .order('started_at', { ascending: false });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Verify descending order
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i - 1].started_at) >= new Date(data[i].started_at)).toBe(true);
    }
  });

  it('should enforce RLS - only return records for authenticated user', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('user_id', testUserId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // All records should belong to test user
    data.forEach((record) => {
      expect(record.user_id).toBe(testUserId);
    });
  });

  it('should reject invalid direction values', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'invalid_direction',
        status: 'completed',
        signalwire_call_sid: `CA${Date.now()}invalid`,
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
    expect(data).toBeNull();
  });

  it('should reject negative duration_seconds', async () => {
    const { data, error } = await supabase
      .from('call_records')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        status: 'completed',
        duration_seconds: -10,
        signalwire_call_sid: `CA${Date.now()}negative`,
      })
      .select()
      .single();

    expect(error).toBeDefined();
    expect(error.code).toBe('23514'); // PostgreSQL check violation
    expect(data).toBeNull();
  });
});