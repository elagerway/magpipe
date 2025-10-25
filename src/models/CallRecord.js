/**
 * CallRecord Model
 * Handles all call record database operations
 */

import { supabase } from '../lib/supabase.js';

export class CallRecord {
  /**
   * Create a new call record
   * @param {Object} callData - Call data {user_id, contact_id, direction, status, signalwire_call_sid, etc.}
   * @returns {Promise<{callRecord: Object|null, error: Error|null}>}
   */
  static async create(callData) {
    const { data, error } = await supabase
      .from('call_records')
      .insert(callData)
      .select()
      .single();

    if (error) {
      return { callRecord: null, error };
    }

    return { callRecord: data, error: null };
  }

  /**
   * Get all call records for a user (alias for list with no limit)
   * @param {string} userId - User's UUID
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async getAll(userId) {
    return await this.list(userId, { limit: null });
  }

  /**
   * Get all call records for a user
   * @param {string} userId - User's UUID
   * @param {Object} options - Query options {orderBy, ascending, limit, offset, direction, status}
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async list(userId, options = {}) {
    const {
      orderBy = 'started_at',
      ascending = false,
      limit = null,
      offset = 0,
      direction = null,
      status = null,
    } = options;

    let query = supabase
      .from('call_records')
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
      return { callRecords: [], error };
    }

    return { callRecords: data, error: null };
  }

  /**
   * Get a single call record by ID
   * @param {string} callRecordId - Call record's UUID
   * @returns {Promise<{callRecord: Object|null, error: Error|null}>}
   */
  static async getById(callRecordId) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*, contacts(name, phone_number)')
      .eq('id', callRecordId)
      .single();

    if (error) {
      return { callRecord: null, error };
    }

    return { callRecord: data, error: null };
  }

  /**
   * Get call record by vendor call ID (SignalWire CallSid, Twilio CallSid, etc.)
   * @param {string} callSid - Vendor call ID
   * @returns {Promise<{callRecord: Object|null, error: Error|null}>}
   */
  static async getByCallSid(callSid) {
    // Try vendor_call_id first (new multi-vendor architecture)
    let { data, error } = await supabase
      .from('call_records')
      .select('*')
      .eq('vendor_call_id', callSid)
      .limit(1);

    // Fallback to call_sid for backward compatibility
    if ((!data || data.length === 0) && error?.code !== 'PGRST116') {
      ({ data, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('call_sid', callSid)
        .limit(1));
    }

    if (error && error.code !== 'PGRST116') {
      return { callRecord: null, error };
    }

    return { callRecord: data && data.length > 0 ? data[0] : null, error: null };
  }

  /**
   * Update a call record
   * @param {string} callRecordId - Call record's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{callRecord: Object|null, error: Error|null}>}
   */
  static async update(callRecordId, updates) {
    const { data, error } = await supabase
      .from('call_records')
      .update(updates)
      .eq('id', callRecordId)
      .select()
      .single();

    if (error) {
      return { callRecord: null, error };
    }

    return { callRecord: data, error: null };
  }

  /**
   * Update call record by vendor call ID (for webhook updates)
   * @param {string} callSid - Vendor call ID (SignalWire CallSid, Twilio CallSid, etc.)
   * @param {Object} updates - Fields to update
   * @returns {Promise<{callRecord: Object|null, error: Error|null}>}
   */
  static async updateByCallSid(callSid, updates) {
    // Update by vendor_call_id or call_sid (for backward compatibility)
    const { data, error } = await supabase
      .from('call_records')
      .update(updates)
      .or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)
      .select()
      .limit(1);

    if (error) {
      return { callRecord: null, error };
    }

    return { callRecord: data && data.length > 0 ? data[0] : null, error: null };
  }

  /**
   * Get call records for a specific contact
   * @param {string} contactId - Contact's UUID
   * @param {Object} options - Query options {limit, offset}
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async getByContact(contactId, options = {}) {
    const { limit = null, offset = 0 } = options;

    let query = supabase
      .from('call_records')
      .select('*')
      .eq('contact_id', contactId)
      .order('started_at', { ascending: false });

    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { callRecords: [], error };
    }

    return { callRecords: data, error: null };
  }

  /**
   * Get recent calls (last N calls)
   * @param {string} userId - User's UUID
   * @param {number} limit - Number of recent calls to retrieve
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async getRecent(userId, limit = 10) {
    return await this.list(userId, {
      orderBy: 'started_at',
      ascending: false,
      limit,
    });
  }

  /**
   * Get missed calls (no-answer or failed)
   * @param {string} userId - User's UUID
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async getMissed(userId) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .in('status', ['no-answer', 'failed'])
      .order('started_at', { ascending: false });

    if (error) {
      return { callRecords: [], error };
    }

    return { callRecords: data, error: null };
  }

  /**
   * Get completed calls with recordings
   * @param {string} userId - User's UUID
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async getWithRecordings(userId) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('recording_url', 'is', null)
      .order('started_at', { ascending: false });

    if (error) {
      return { callRecords: [], error };
    }

    return { callRecords: data, error: null };
  }

  /**
   * Search call transcripts
   * @param {string} userId - User's UUID
   * @param {string} searchTerm - Search term
   * @returns {Promise<{callRecords: Array, error: Error|null}>}
   */
  static async searchTranscripts(userId, searchTerm) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*, contacts(name, phone_number)')
      .eq('user_id', userId)
      .ilike('transcript', `%${searchTerm}%`)
      .order('started_at', { ascending: false });

    if (error) {
      return { callRecords: [], error };
    }

    return { callRecords: data, error: null };
  }

  /**
   * Delete a call record
   * @param {string} callRecordId - Call record's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(callRecordId) {
    const { error } = await supabase.from('call_records').delete().eq('id', callRecordId);

    return { error };
  }

  /**
   * Get call statistics for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{stats: Object|null, error: Error|null}>}
   */
  static async getStats(userId) {
    // Get total calls, completed calls, missed calls, and total duration
    const { data, error } = await supabase
      .from('call_records')
      .select('status, duration_seconds')
      .eq('user_id', userId);

    if (error) {
      return { stats: null, error };
    }

    const stats = {
      total: data.length,
      completed: data.filter((call) => call.status === 'completed').length,
      missed: data.filter((call) => ['no-answer', 'failed'].includes(call.status)).length,
      totalDuration: data.reduce((sum, call) => sum + (call.duration_seconds || 0), 0),
    };

    return { stats, error: null };
  }
}