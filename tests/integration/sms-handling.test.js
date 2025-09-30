import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { User, Contact, SmsMessage, ConversationContext } from '../../src/models/index.js';
import { supabase } from '../../src/lib/supabase.js';

describe('SMS Handling Integration Test', () => {
  let testUserId;
  let testContactId;
  let createdMessageIds = [];

  beforeAll(async () => {
    // Create test user
    const testEmail = `integration-sms-${Date.now()}@example.com`;
    const { user } = await User.signUp(testEmail, 'TestPass123!', 'SMS Test User');
    testUserId = user.id;

    await User.createProfile(testUserId, testEmail, 'SMS Test User');

    // Create test contact
    const { contact } = await Contact.create(testUserId, {
      name: 'SMS Contact',
      phone_number: '+14155553333',
      is_whitelisted: true,
    });
    testContactId = contact.id;
  });

  afterAll(async () => {
    // Cleanup
    if (createdMessageIds.length > 0) {
      await supabase.from('sms_messages').delete().in('id', createdMessageIds);
    }
    await supabase.from('contacts').delete().eq('id', testContactId);
    await supabase.from('users').delete().eq('id', testUserId);
  });

  it('should handle inbound SMS message', async () => {
    const { message, error } = await SmsMessage.create({
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'inbound',
      body: 'Hey! Can we reschedule our meeting to tomorrow?',
      status: 'received',
      signalwire_message_sid: `SM${Date.now()}inbound`,
    });

    expect(error).toBeNull();
    expect(message).toBeDefined();
    expect(message.direction).toBe('inbound');
    expect(message.body).toContain('reschedule');

    createdMessageIds.push(message.id);
  });

  it('should handle outbound SMS message (AI response)', async () => {
    const { message, error } = await SmsMessage.create({
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'outbound',
      body: 'Of course! What time works best for you tomorrow?',
      status: 'delivered',
      signalwire_message_sid: `SM${Date.now()}outbound`,
    });

    expect(error).toBeNull();
    expect(message).toBeDefined();
    expect(message.direction).toBe('outbound');
    expect(message.status).toBe('delivered');

    createdMessageIds.push(message.id);
  });

  it('should retrieve SMS conversation thread', async () => {
    // Create conversation thread
    const messages = [
      {
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        body: 'Hi, is this still your number?',
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}thread1`,
      },
      {
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'outbound',
        body: 'Yes, this is still my number. How can I help you?',
        status: 'delivered',
        signalwire_message_sid: `SM${Date.now()}thread2`,
      },
      {
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        body: 'Great! I wanted to discuss the project.',
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}thread3`,
      },
    ];

    for (const msgData of messages) {
      const { message } = await SmsMessage.create(msgData);
      createdMessageIds.push(message.id);
    }

    // Retrieve thread
    const { messages: thread, error } = await SmsMessage.getThread(testContactId);

    expect(error).toBeNull();
    expect(thread.length).toBeGreaterThanOrEqual(3);
    expect(thread[0].created_at).toBeLessThanOrEqual(thread[thread.length - 1].created_at);
  });

  it('should search SMS messages by content', async () => {
    const uniqueTerm = `UniqueSearchTerm${Date.now()}`;

    // Create message with unique term
    const { message } = await SmsMessage.create({
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'inbound',
      body: `This message contains ${uniqueTerm} for testing.`,
      status: 'received',
      signalwire_message_sid: `SM${Date.now()}search`,
    });

    createdMessageIds.push(message.id);

    // Search for the term
    const { messages: searchResults, error } = await SmsMessage.search(testUserId, uniqueTerm);

    expect(error).toBeNull();
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].body).toContain(uniqueTerm);
  });

  it('should update message status via webhook', async () => {
    const messageSid = `SM${Date.now()}status`;

    // Create message in queued status
    const { message: queuedMessage } = await SmsMessage.create({
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'outbound',
      body: 'Test message for status update',
      status: 'queued',
      signalwire_message_sid: messageSid,
    });

    expect(queuedMessage.status).toBe('queued');
    createdMessageIds.push(queuedMessage.id);

    // Update to sending
    await SmsMessage.updateByMessageSid(messageSid, { status: 'sending' });

    // Update to sent
    await SmsMessage.updateByMessageSid(messageSid, { status: 'sent' });

    // Update to delivered
    const { message: deliveredMessage } = await SmsMessage.updateByMessageSid(messageSid, {
      status: 'delivered',
    });

    expect(deliveredMessage.status).toBe('delivered');
  });

  it('should handle failed message delivery', async () => {
    const { message, error } = await SmsMessage.create({
      user_id: testUserId,
      contact_id: testContactId,
      direction: 'outbound',
      body: 'This message failed to deliver',
      status: 'failed',
      signalwire_message_sid: `SM${Date.now()}failed`,
    });

    expect(error).toBeNull();
    expect(message.status).toBe('failed');

    createdMessageIds.push(message.id);

    // Retrieve failed messages
    const { messages: failedMessages } = await SmsMessage.getFailed(testUserId);

    expect(failedMessages.length).toBeGreaterThan(0);
    expect(failedMessages.some((msg) => msg.id === message.id)).toBe(true);
  });

  it('should update conversation context with SMS insights', async () => {
    // Create SMS conversation
    const messages = [
      'Hey, I need help with the budget report.',
      'Can you send me the latest financial projections?',
      'Also, when is the deadline for the quarterly review?',
    ];

    for (const body of messages) {
      const { message } = await SmsMessage.create({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        body,
        status: 'received',
        signalwire_message_sid: `SM${Date.now()}context${Math.random()}`,
      });
      createdMessageIds.push(message.id);
    }

    // Create conversation context
    const { context, error: contextError } = await ConversationContext.getOrCreate(testContactId, {
      summary: 'Contact needs help with budget report and financial projections.',
      key_topics: ['budget', 'financial projections', 'quarterly review'],
    });

    expect(contextError).toBeNull();
    expect(context.key_topics).toContain('budget');

    // Increment interaction count
    await ConversationContext.incrementInteractionCount(testContactId);

    // Cleanup
    await supabase.from('conversation_contexts').delete().eq('id', context.id);
  });

  it('should get SMS statistics', async () => {
    const { stats, error } = await SmsMessage.getStats(testUserId);

    expect(error).toBeNull();
    expect(stats).toBeDefined();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.sent).toBe('number');
    expect(typeof stats.received).toBe('number');
    expect(typeof stats.failed).toBe('number');
  });

  it('should get conversation list with latest message from each contact', async () => {
    const { conversations, error } = await SmsMessage.getConversations(testUserId);

    expect(error).toBeNull();
    expect(Array.isArray(conversations)).toBe(true);
    expect(conversations.length).toBeGreaterThan(0);

    // Each conversation should have contact info
    conversations.forEach((conversation) => {
      expect(conversation.contacts).toBeDefined();
      expect(conversation.body).toBeDefined();
    });
  });

  it('should filter messages by direction', async () => {
    // Get only inbound messages
    const { messages: inboundMessages } = await SmsMessage.list(testUserId, {
      direction: 'inbound',
    });

    expect(inboundMessages.every((msg) => msg.direction === 'inbound')).toBe(true);

    // Get only outbound messages
    const { messages: outboundMessages } = await SmsMessage.list(testUserId, {
      direction: 'outbound',
    });

    expect(outboundMessages.every((msg) => msg.direction === 'outbound')).toBe(true);
  });

  it('should get recent messages with pagination', async () => {
    const limit = 5;
    const { messages: recentMessages, error } = await SmsMessage.getRecent(testUserId, limit);

    expect(error).toBeNull();
    expect(recentMessages.length).toBeLessThanOrEqual(limit);

    // Messages should be ordered by created_at descending
    for (let i = 1; i < recentMessages.length; i++) {
      expect(new Date(recentMessages[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(
        new Date(recentMessages[i].created_at).getTime()
      );
    }
  });
});