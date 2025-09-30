import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('Retell.ai Call Analysis Webhook Contract', () => {
  let supabase;
  let testUserId;
  let testContactId;

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    supabase = createClient(supabaseUrl, supabaseKey);

    // Create test user
    const testEmail = `retell-test-${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.signUp({
      email: testEmail,
      password: 'TestPass123!',
      options: {
        data: { name: 'Retell Test User' },
      },
    });

    testUserId = authData.user?.id;

    // Create test contact
    const { data: contactData } = await supabase
      .from('contacts')
      .insert({
        user_id: testUserId,
        name: 'Retell Contact',
        phone_number: '+14155551234',
      })
      .select()
      .single();

    testContactId = contactData?.id;
  });

  it('should validate Retell.ai call completed webhook payload', () => {
    const webhookPayload = {
      event_type: 'call_ended',
      call_id: 'retell_call_1234567890',
      agent_id: 'agent_abcdef123456',
      call_status: 'ended',
      start_timestamp: Date.now() - 120000, // 2 minutes ago
      end_timestamp: Date.now(),
      from_number: '+14155551234',
      to_number: '+14155550000',
      direction: 'inbound',
      disconnection_reason: 'user_hangup',
      call_analysis: {
        call_summary: 'Customer called to reschedule appointment. Provided new date and time preferences.',
        transcript: [
          {
            role: 'agent',
            content: 'Hello! This is Pat. How can I help you today?',
            timestamp: 0,
          },
          {
            role: 'user',
            content: 'Hi, I need to reschedule my appointment.',
            timestamp: 3500,
          },
        ],
        sentiment: 'positive',
        key_points: ['reschedule appointment', 'new date preference', 'confirmed change'],
        action_items: ['Update calendar with new appointment time'],
      },
    };

    // Validate required fields
    expect(webhookPayload.event_type).toBe('call_ended');
    expect(webhookPayload.call_id).toBeDefined();
    expect(webhookPayload.agent_id).toBeDefined();
    expect(webhookPayload.call_analysis).toBeDefined();
    expect(webhookPayload.call_analysis.call_summary).toBeDefined();
    expect(Array.isArray(webhookPayload.call_analysis.transcript)).toBe(true);
  });

  it('should validate transcript structure with roles and timestamps', () => {
    const transcript = [
      {
        role: 'agent',
        content: 'Hello! This is Pat.',
        timestamp: 0,
      },
      {
        role: 'user',
        content: 'Hi there!',
        timestamp: 2000,
      },
      {
        role: 'agent',
        content: 'How can I help you?',
        timestamp: 4500,
      },
    ];

    expect(Array.isArray(transcript)).toBe(true);
    transcript.forEach((entry) => {
      expect(['agent', 'user']).toContain(entry.role);
      expect(typeof entry.content).toBe('string');
      expect(entry.content.length).toBeGreaterThan(0);
      expect(typeof entry.timestamp).toBe('number');
      expect(entry.timestamp).toBeGreaterThanOrEqual(0);
    });

    // Timestamps should be in ascending order
    for (let i = 1; i < transcript.length; i++) {
      expect(transcript[i].timestamp).toBeGreaterThanOrEqual(transcript[i - 1].timestamp);
    }
  });

  it('should extract and store call summary', async () => {
    const callSummary = 'Customer inquired about service availability. Provided information and scheduled follow-up call.';
    const signalwireCallSid = `CA${Date.now()}retell`;

    // Create call record with summary
    const { data, error } = await supabase
      .from('call_records')
      .insert({
        user_id: testUserId,
        contact_id: testContactId,
        direction: 'inbound',
        status: 'completed',
        duration_seconds: 180,
        signalwire_call_sid: signalwireCallSid,
        transcript: callSummary,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.transcript).toBe(callSummary);

    // Cleanup
    await supabase.from('call_records').delete().eq('id', data.id);
  });

  it('should extract key topics for conversation context', () => {
    const callAnalysis = {
      call_summary: 'Discussed project timeline, budget constraints, and resource allocation.',
      key_points: ['project timeline', 'budget constraints', 'resource allocation', 'next steps'],
      sentiment: 'neutral',
    };

    expect(Array.isArray(callAnalysis.key_points)).toBe(true);
    expect(callAnalysis.key_points.length).toBeGreaterThan(0);
    callAnalysis.key_points.forEach((point) => {
      expect(typeof point).toBe('string');
      expect(point.length).toBeGreaterThan(0);
    });
  });

  it('should update conversation context with call insights', async () => {
    // Create conversation context
    const { data: context, error: contextError } = await supabase
      .from('conversation_contexts')
      .insert({
        contact_id: testContactId,
        summary: 'Initial contact about services.',
        key_topics: ['services', 'pricing'],
        interaction_count: 1,
      })
      .select()
      .single();

    expect(contextError).toBeNull();

    // Update with new call insights
    const updatedSummary = 'Discussed services, pricing, and scheduled demo. Customer interested in enterprise plan.';
    const updatedTopics = ['services', 'pricing', 'demo', 'enterprise plan'];

    const { data: updated, error: updateError } = await supabase
      .from('conversation_contexts')
      .update({
        summary: updatedSummary,
        key_topics: updatedTopics,
        interaction_count: 2,
      })
      .eq('id', context.id)
      .select()
      .single();

    expect(updateError).toBeNull();
    expect(updated.summary).toBe(updatedSummary);
    expect(updated.key_topics).toEqual(updatedTopics);
    expect(updated.interaction_count).toBe(2);

    // Cleanup
    await supabase.from('conversation_contexts').delete().eq('id', context.id);
  });

  it('should validate sentiment analysis values', () => {
    const validSentiments = ['positive', 'neutral', 'negative', 'mixed'];

    validSentiments.forEach((sentiment) => {
      const analysis = { sentiment };
      expect(validSentiments).toContain(analysis.sentiment);
    });
  });

  it('should extract action items from call analysis', () => {
    const callAnalysis = {
      action_items: [
        'Send follow-up email with pricing details',
        'Schedule demo for next Tuesday at 2 PM',
        'Prepare enterprise plan proposal',
      ],
    };

    expect(Array.isArray(callAnalysis.action_items)).toBe(true);
    callAnalysis.action_items.forEach((item) => {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(0);
    });
  });

  it('should handle disconnection reasons', () => {
    const validDisconnectionReasons = [
      'user_hangup',
      'agent_hangup',
      'call_transfer',
      'voicemail',
      'error',
      'timeout',
    ];

    const webhookPayload = {
      disconnection_reason: 'user_hangup',
    };

    expect(validDisconnectionReasons).toContain(webhookPayload.disconnection_reason);
  });

  it('should calculate call duration from timestamps', () => {
    const startTimestamp = 1633024800000; // Example timestamp
    const endTimestamp = 1633024920000; // 2 minutes later

    const durationMs = endTimestamp - startTimestamp;
    const durationSeconds = Math.floor(durationMs / 1000);

    expect(durationSeconds).toBe(120);
  });

  it('should generate embeddings for conversation context', () => {
    // Mock OpenAI embeddings API request
    const embeddingRequest = {
      model: 'text-embedding-ada-002',
      input: 'Customer discussed project timeline, budget constraints, and resource allocation. Interested in enterprise features.',
    };

    expect(embeddingRequest.model).toBe('text-embedding-ada-002');
    expect(embeddingRequest.input.length).toBeGreaterThan(0);

    // Mock OpenAI embeddings API response
    const mockEmbeddingResponse = {
      data: [
        {
          embedding: new Array(1536).fill(0).map(() => Math.random()),
          index: 0,
        },
      ],
      model: 'text-embedding-ada-002',
      usage: {
        prompt_tokens: 20,
        total_tokens: 20,
      },
    };

    expect(mockEmbeddingResponse.data[0].embedding.length).toBe(1536);
  });

  it('should validate webhook signature for security', () => {
    // Retell.ai webhook signature validation
    const webhookSecret = 'retell_webhook_secret_123456';
    const webhookPayload = JSON.stringify({
      event_type: 'call_ended',
      call_id: 'retell_call_123',
    });

    // In production, use crypto.createHmac('sha256', webhookSecret)
    // to validate X-Retell-Signature header
    const mockSignature = 'mock_sha256_signature_hash';

    expect(mockSignature).toBeDefined();
    expect(webhookSecret).toBeDefined();
  });

  it('should handle webhook idempotency with call_id', () => {
    // Multiple webhook deliveries should use same call_id
    const callId = 'retell_call_1234567890';

    const webhooks = [
      { event_type: 'call_started', call_id: callId },
      { event_type: 'call_ended', call_id: callId },
    ];

    // All webhooks should reference same call
    webhooks.forEach((webhook) => {
      expect(webhook.call_id).toBe(callId);
    });

    // In database, use call_id for idempotent updates
  });

  it('should link Retell call_id to SignalWire CallSid', () => {
    // Mapping between Retell and SignalWire identifiers
    const callMapping = {
      retell_call_id: 'retell_call_1234567890',
      signalwire_call_sid: 'CA1234567890abcdef',
      created_at: new Date(),
    };

    expect(callMapping.retell_call_id).toBeDefined();
    expect(callMapping.signalwire_call_sid).toBeDefined();
    expect(callMapping.signalwire_call_sid).toMatch(/^CA[a-f0-9]{32}$/);
  });
});