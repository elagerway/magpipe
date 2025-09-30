import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { User, Contact, CallRecord, ConversationContext } from '../../src/models/index.js';
import { supabase } from '../../src/lib/supabase.js';

describe('Call Handling Integration Test', () => {
  let testUserId;
  let whitelistedContactId;
  let unknownContactId;
  let createdRecordIds = [];

  beforeAll(async () => {
    // Create test user
    const testEmail = `integration-calls-${Date.now()}@example.com`;
    const { user } = await User.signUp(testEmail, 'TestPass123!', 'Call Test User');
    testUserId = user.id;

    await User.createProfile(testUserId, testEmail, 'Call Test User');

    // Create whitelisted contact
    const { contact: whitelistedContact } = await Contact.create(testUserId, {
      name: 'Whitelisted Friend',
      phone_number: '+14155551111',
      is_whitelisted: true,
    });
    whitelistedContactId = whitelistedContact.id;

    // Create unknown contact (not whitelisted)
    const { contact: unknownContact } = await Contact.create(testUserId, {
      name: 'Unknown Caller',
      phone_number: '+14155552222',
      is_whitelisted: false,
    });
    unknownContactId = unknownContact.id;
  });

  afterAll(async () => {
    // Cleanup
    if (createdRecordIds.length > 0) {
      await supabase.from('call_records').delete().in('id', createdRecordIds);
    }
    await supabase.from('contacts').delete().in('id', [whitelistedContactId, unknownContactId]);
    await supabase.from('users').delete().eq('id', testUserId);
  });

  it('should handle inbound call from whitelisted contact', async () => {
    // Create call record for whitelisted contact
    const { callRecord, error } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 180,
      signalwire_call_sid: `CA${Date.now()}whitelisted`,
    });

    expect(error).toBeNull();
    expect(callRecord).toBeDefined();
    expect(callRecord.direction).toBe('inbound');
    expect(callRecord.status).toBe('completed');

    createdRecordIds.push(callRecord.id);

    // Verify can retrieve call with contact info
    const { callRecord: retrievedCall } = await CallRecord.getById(callRecord.id);

    expect(retrievedCall.contacts.name).toBe('Whitelisted Friend');
  });

  it('should handle inbound call from unknown contact with vetting', async () => {
    // Create call record for unknown contact
    const { callRecord, error } = await CallRecord.create({
      user_id: testUserId,
      contact_id: unknownContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 45,
      signalwire_call_sid: `CA${Date.now()}unknown`,
      transcript: 'Caller provided name: John from Acme Corp. Purpose: Discuss project proposal.',
    });

    expect(error).toBeNull();
    expect(callRecord).toBeDefined();
    expect(callRecord.transcript).toContain('John from Acme Corp');

    createdRecordIds.push(callRecord.id);
  });

  it('should update call status from initiated to completed', async () => {
    const callSid = `CA${Date.now()}status`;

    // Create initial call record (initiated)
    const { callRecord: initiatedCall } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'initiated',
      signalwire_call_sid: callSid,
    });

    expect(initiatedCall.status).toBe('initiated');
    createdRecordIds.push(initiatedCall.id);

    // Update to ringing
    await CallRecord.updateByCallSid(callSid, { status: 'ringing' });

    // Update to in-progress
    await CallRecord.updateByCallSid(callSid, { status: 'in-progress' });

    // Update to completed with duration
    const { callRecord: completedCall } = await CallRecord.updateByCallSid(callSid, {
      status: 'completed',
      duration_seconds: 120,
    });

    expect(completedCall.status).toBe('completed');
    expect(completedCall.duration_seconds).toBe(120);
  });

  it('should store call recording and transcript', async () => {
    const { callRecord, error } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 240,
      signalwire_call_sid: `CA${Date.now()}recording`,
      recording_url: 'https://api.signalwire.com/recordings/RE123456789.mp3',
      transcript: 'Hello, this is a test call. How are you doing today?',
    });

    expect(error).toBeNull();
    expect(callRecord.recording_url).toBeDefined();
    expect(callRecord.transcript).toContain('test call');

    createdRecordIds.push(callRecord.id);

    // Verify can search by transcript
    const { callRecords: searchResults } = await CallRecord.searchTranscripts(
      testUserId,
      'test call'
    );

    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].id).toBe(callRecord.id);
  });

  it('should handle missed/no-answer calls', async () => {
    const { callRecord, error } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'no-answer',
      duration_seconds: 0,
      signalwire_call_sid: `CA${Date.now()}missed`,
    });

    expect(error).toBeNull();
    expect(callRecord.status).toBe('no-answer');
    expect(callRecord.duration_seconds).toBe(0);

    createdRecordIds.push(callRecord.id);

    // Retrieve missed calls
    const { callRecords: missedCalls } = await CallRecord.getMissed(testUserId);

    expect(missedCalls.length).toBeGreaterThan(0);
    expect(missedCalls.some((call) => call.id === callRecord.id)).toBe(true);
  });

  it('should filter calls by direction', async () => {
    // Create inbound call
    const { callRecord: inboundCall } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 60,
      signalwire_call_sid: `CA${Date.now()}inbound`,
    });

    createdRecordIds.push(inboundCall.id);

    // Create outbound call
    const { callRecord: outboundCall } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'outbound',
      status: 'completed',
      duration_seconds: 90,
      signalwire_call_sid: `CA${Date.now()}outbound`,
    });

    createdRecordIds.push(outboundCall.id);

    // Get only inbound calls
    const { callRecords: inboundCalls } = await CallRecord.list(testUserId, {
      direction: 'inbound',
    });

    expect(inboundCalls.every((call) => call.direction === 'inbound')).toBe(true);

    // Get only outbound calls
    const { callRecords: outboundCalls } = await CallRecord.list(testUserId, {
      direction: 'outbound',
    });

    expect(outboundCalls.every((call) => call.direction === 'outbound')).toBe(true);
  });

  it('should update conversation context after call', async () => {
    // Create call with transcript
    const { callRecord } = await CallRecord.create({
      user_id: testUserId,
      contact_id: whitelistedContactId,
      direction: 'inbound',
      status: 'completed',
      duration_seconds: 300,
      signalwire_call_sid: `CA${Date.now()}context`,
      transcript:
        'Discussed upcoming project deadline. Contact needs help with budget planning and resource allocation.',
    });

    createdRecordIds.push(callRecord.id);

    // Create or update conversation context
    const { context, error: contextError } = await ConversationContext.getOrCreate(
      whitelistedContactId,
      {
        summary: 'Discussed project deadline and budget planning.',
        key_topics: ['project deadline', 'budget', 'resources'],
      }
    );

    expect(contextError).toBeNull();
    expect(context).toBeDefined();
    expect(context.key_topics).toContain('budget');

    // Increment interaction count
    await ConversationContext.incrementInteractionCount(whitelistedContactId);

    const { context: updatedContext } = await ConversationContext.getByContactId(
      whitelistedContactId
    );

    expect(updatedContext.interaction_count).toBeGreaterThan(0);

    // Cleanup
    await supabase.from('conversation_contexts').delete().eq('id', context.id);
  });

  it('should get call statistics', async () => {
    const { stats, error } = await CallRecord.getStats(testUserId);

    expect(error).toBeNull();
    expect(stats).toBeDefined();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.missed).toBe('number');
    expect(typeof stats.totalDuration).toBe('number');
  });
});