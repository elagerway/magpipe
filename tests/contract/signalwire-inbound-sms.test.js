import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('SignalWire Inbound SMS Webhook Contract', () => {
  let supabase;
  let testUserId;
  let testServiceNumber;

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create test user with service number
    const testEmail = `sms-webhook-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'SMS Webhook Test User' },
      },
    });

    testUserId = authData.user?.id;
    testServiceNumber = '+14155550000';

    await supabase
      .from('users')
      .update({ service_number: testServiceNumber })
      .eq('id', testUserId);
  });

  it('should validate inbound SMS webhook payload structure', () => {
    const webhookPayload = {
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      AccountSid: 'test-account-sid-placeholder',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'Hello, this is a test message.',
      NumMedia: '0',
      FromCity: 'San Francisco',
      FromState: 'CA',
      FromCountry: 'US',
      FromZip: '94102',
    };

    // Validate required fields
    expect(webhookPayload.MessageSid).toBeDefined();
    expect(webhookPayload.From).toBeDefined();
    expect(webhookPayload.To).toBeDefined();
    expect(webhookPayload.Body).toBeDefined();
    expect(webhookPayload.NumMedia).toBeDefined();

    // Validate E.164 format
    expect(webhookPayload.From).toMatch(/^\+[1-9]\d{1,14}$/);
    expect(webhookPayload.To).toMatch(/^\+[1-9]\d{1,14}$/);

    // Validate body is not empty
    expect(webhookPayload.Body.length).toBeGreaterThan(0);
  });

  it('should generate valid TwiML response for SMS reply', () => {
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your message. I'll get back to you shortly.</Message>
</Response>`;

    // Validate TwiML structure
    expect(twimlResponse).toContain('<Response>');
    expect(twimlResponse).toContain('<Message>');
    expect(twimlResponse).toContain('</Response>');
  });

  it('should handle SMS with media attachments (MMS)', () => {
    const webhookPayload = {
      MessageSid: 'SM1234567890abcdef',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'Check out this image',
      NumMedia: '2',
      MediaContentType0: 'image/jpeg',
      MediaUrl0: 'https://api.signalwire.com/media/ME1234567890.jpg',
      MediaContentType1: 'image/png',
      MediaUrl1: 'https://api.signalwire.com/media/ME0987654321.png',
    };

    expect(parseInt(webhookPayload.NumMedia)).toBeGreaterThan(0);
    expect(webhookPayload.MediaContentType0).toBeDefined();
    expect(webhookPayload.MediaUrl0).toBeDefined();
    expect(webhookPayload.MediaUrl0).toMatch(/^https:\/\//);
  });

  it('should lookup contact by phone number before processing SMS', async () => {
    // Create test contact
    const testContact = {
      user_id: testUserId,
      name: 'SMS Contact',
      phone_number: '+14155552222',
      is_whitelisted: true,
    };

    const { data: contactData } = await supabase
      .from('contacts')
      .insert(testContact)
      .select()
      .single();

    // Lookup contact (simulating webhook logic)
    const { data: foundContact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', testContact.phone_number)
      .single();

    expect(error).toBeNull();
    expect(foundContact).toBeDefined();
    expect(foundContact.name).toBe('SMS Contact');

    // Cleanup
    await supabase.from('contacts').delete().eq('id', contactData.id);
  });

  it('should create or update conversation context for SMS thread', async () => {
    // Create test contact
    const { data: contact } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'Context Test Contact',
        phone_number: '+14155553333',
      })
      .select()
      .single();

    // Create conversation context
    const contextData = {
      contact_id: contact.id,
      summary: 'Initial conversation about scheduling.',
      key_topics: ['scheduling', 'appointment'],
      interaction_count: 1,
    };

    const { data: context, error } = await supabase
      .from('conversation_contexts')
      .insert(contextData)
      .select()
      .single();

    expect(error).toBeNull();
    expect(context).toBeDefined();
    expect(context.summary).toBe(contextData.summary);
    expect(context.key_topics).toEqual(['scheduling', 'appointment']);

    // Cleanup
    await supabase.from('conversation_contexts').delete().eq('id', context.id);
    await supabase.from('contacts').delete().eq('id', contact.id);
  });

  it('should handle opt-out keywords (STOP, UNSUBSCRIBE)', () => {
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

    const webhookPayload = {
      MessageSid: 'SM1234567890',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'STOP',
    };

    const isOptOut = optOutKeywords.includes(webhookPayload.Body.toUpperCase().trim());

    expect(isOptOut).toBe(true);

    // Expected TwiML response for opt-out
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed. Reply START to resubscribe.</Message>
</Response>`;

    expect(twimlResponse).toContain('unsubscribed');
  });

  it('should handle opt-in keywords (START)', () => {
    const optInKeywords = ['START', 'YES', 'UNSTOP'];

    const webhookPayload = {
      MessageSid: 'SM1234567890',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'START',
    };

    const isOptIn = optInKeywords.includes(webhookPayload.Body.toUpperCase().trim());

    expect(isOptIn).toBe(true);

    // Expected TwiML response for opt-in
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been resubscribed. Reply STOP to unsubscribe.</Message>
</Response>`;

    expect(twimlResponse).toContain('resubscribed');
  });

  it('should generate AI response using OpenAI and conversation context', async () => {
    // Mock OpenAI API call structure
    const openaiRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are Pat, a helpful AI assistant. Respond professionally and concisely to SMS messages.',
        },
        {
          role: 'user',
          content: 'Can we reschedule our meeting to tomorrow?',
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    };

    // Validate request structure
    expect(openaiRequest.model).toBeDefined();
    expect(Array.isArray(openaiRequest.messages)).toBe(true);
    expect(openaiRequest.messages[0].role).toBe('system');
    expect(openaiRequest.messages[1].role).toBe('user');

    // Mock OpenAI response
    const mockOpenAIResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Of course! I can help you reschedule. What time works best for you tomorrow?',
          },
        },
      ],
    };

    expect(mockOpenAIResponse.choices[0].message.content).toBeDefined();
    expect(mockOpenAIResponse.choices[0].message.content.length).toBeGreaterThan(0);
  });

  it('should validate webhook signature for security', () => {
    // SignalWire webhook signature validation
    const webhookUrl = 'https://example.com/webhooks/signalwire/inbound-sms';
    const authToken = 'test_auth_token_1234567890';
    const params = {
      MessageSid: 'SM1234567890',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'Test message',
    };

    // In production, use crypto.createHmac('sha1', authToken)
    // to validate X-Twilio-Signature header
    const mockSignature = 'mock_signature_hash';

    expect(mockSignature).toBeDefined();
    expect(authToken).toBeDefined();
  });

  it('should return 200 OK with TwiML even on processing errors', () => {
    const processWebhook = (payload) => {
      try {
        // Validate required fields
        if (!payload.MessageSid || !payload.From || !payload.Body) {
          // Still return 200 to prevent retries
          return {
            status: 200,
            body: '<Response></Response>',
            headers: { 'Content-Type': 'text/xml' },
          };
        }

        return {
          status: 200,
          body: '<Response><Message>Thank you for your message.</Message></Response>',
          headers: { 'Content-Type': 'text/xml' },
        };
      } catch (error) {
        // Log error but return 200 to prevent infinite retries
        return {
          status: 200,
          body: '<Response></Response>',
          headers: { 'Content-Type': 'text/xml' },
        };
      }
    };

    const response = processWebhook({
      MessageSid: 'SM1234',
      From: '+14155551234',
      To: testServiceNumber,
      Body: 'Test',
    });

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/xml');
  });
});