/**
 * SmsMessage Model
 * Handles all SMS message database operations
 */

import { supabase } from '../lib/supabase.js';

export class SmsMessage {
  /**
   * Create a new SMS message record
   * @param {Object} messageData - Message data {user_id, contact_id, direction, body, status, signalwire_message_sid}
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async create(messageData) {
    const { data, error } = await supabase
      .from('sms_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Get all SMS messages for a user (alias for list with no limit)
   * @param {string} userId - User's UUID
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getAll(userId) {
    return await this.list(userId, { limit: null });
  }

  /**
   * Get all SMS messages for a user
   * @param {string} userId - User's UUID
   * @param {Object} options - Query options {orderBy, ascending, limit, offset, direction, status}
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async list(userId, options = {}) {
    const {
      orderBy = 'created_at',
      ascending = false,
      limit = null,
      offset = 0,
      direction = null,
      status = null,
    } = options;

    let query = supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId);

    if (direction) {
      query = query.eq('direction', direction);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order(orderBy, { ascending });

    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { messages: [], error };
    }

    return { messages: data, error: null };
  }

  /**
   * Get a single SMS message by ID
   * @param {string} messageId - Message's UUID
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async getById(messageId) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('id', messageId)
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Get SMS message by SignalWire MessageSid
   * @param {string} messageSid - SignalWire MessageSid
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async getByMessageSid(messageSid) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('signalwire_message_sid', messageSid)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Update an SMS message
   * @param {string} messageId - Message's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async update(messageId, updates) {
    const { data, error } = await supabase
      .from('sms_messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Update SMS message by SignalWire MessageSid (for webhook updates)
   * @param {string} messageSid - SignalWire MessageSid
   * @param {Object} updates - Fields to update
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async updateByMessageSid(messageSid, updates) {
    const { data, error } = await supabase
      .from('sms_messages')
      .update(updates)
      .eq('signalwire_message_sid', messageSid)
      .select()
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Get SMS conversation thread with a contact on a specific service number
   * @param {string} contactId - Contact's UUID
   * @param {Object} options - Query options {serviceNumber, limit, offset}
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getThread(contactId, options = {}) {
    const { serviceNumber = null, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('sms_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by service number if provided (for multi-number threading)
    if (serviceNumber) {
      query = query.eq('recipient_number', serviceNumber);
    }

    const { data, error } = await query;

    if (error) {
      return { messages: [], error };
    }

    return { messages: data, error: null };
  }

  /**
   * Get recent SMS messages (last N messages)
   * @param {string} userId - User's UUID
   * @param {number} limit - Number of recent messages to retrieve
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getRecent(userId, limit = 20) {
    return await this.list(userId, {
      orderBy: 'created_at',
      ascending: false,
      limit,
    });
  }

  /**
   * Search SMS messages by content
   * @param {string} userId - User's UUID
   * @param {string} searchTerm - Search term
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async search(userId, searchTerm) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .ilike('body', `%${searchTerm}%`)
      .order('created_at', { ascending: false });

    if (error) {
      return { messages: [], error };
    }

    return { messages: data, error: null };
  }

  /**
   * Get unread/received messages
   * @param {string} userId - User's UUID
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getReceived(userId) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .eq('status', 'received')
      .order('created_at', { ascending: false });

    if (error) {
      return { messages: [], error };
    }

    return { messages: data, error: null };
  }

  /**
   * Get failed messages
   * @param {string} userId - User's UUID
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getFailed(userId) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false });

    if (error) {
      return { messages: [], error };
    }

    return { messages: data, error: null };
  }

  /**
   * Delete an SMS message
   * @param {string} messageId - Message's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(messageId) {
    const { error } = await supabase.from('sms_messages').delete().eq('id', messageId);

    return { error };
  }

  /**
   * Get SMS statistics for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{stats: Object|null, error: Error|null}>}
   */
  static async getStats(userId) {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('direction, status')
      .eq('user_id', userId);

    if (error) {
      return { stats: null, error };
    }

    const stats = {
      total: data.length,
      sent: data.filter((msg) => msg.direction === 'outbound' && msg.status === 'delivered').length,
      received: data.filter((msg) => msg.direction === 'inbound').length,
      failed: data.filter((msg) => msg.status === 'failed').length,
    };

    return { stats, error: null };
  }

  /**
   * Get latest message from each contact (for conversation list view)
   * Grouped by contact_id AND recipient_number (service number) to support multiple numbers
   * @param {string} userId - User's UUID
   * @returns {Promise<{conversations: Array, error: Error|null}>}
   */
  static async getConversations(userId) {
    // This is a complex query that requires grouping by contact_id AND recipient_number
    // We'll use a simplified approach: get all messages, then group client-side
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { conversations: [], error };
    }

    // Group by contact_id AND recipient_number (service number), keeping only the latest message
    // This creates separate conversation threads when the same contact texts different service numbers
    const conversationMap = new Map();
    data.forEach((message) => {
      // Create unique key combining contact_id and recipient_number (service number)
      const conversationKey = `${message.contact_id}:${message.recipient_number}`;
      if (!conversationMap.has(conversationKey)) {
        conversationMap.set(conversationKey, message);
      }
    });

    const conversations = Array.from(conversationMap.values());

    return { conversations, error: null };
  }
}