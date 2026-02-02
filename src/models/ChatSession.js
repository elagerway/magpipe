/**
 * ChatSession Model
 * Handles chat session database operations
 */

import { supabase } from '../lib/supabase.js';

export class ChatSession {
  /**
   * Get all chat sessions for a user
   * @param {string} userId - User's UUID
   * @param {Object} options - Query options {status, limit, offset}
   * @returns {Promise<{sessions: Array, error: Error|null}>}
   */
  static async list(userId, options = {}) {
    const { status = null, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('chat_sessions')
      .select('*, chat_widgets(name, primary_color), agent_configs(name)')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { sessions: [], error };
    }

    return { sessions: data || [], error: null };
  }

  /**
   * Get a session by ID with messages
   * @param {string} sessionId - Session's UUID
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  static async getById(sessionId) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*, chat_widgets(name, primary_color), agent_configs(name)')
      .eq('id', sessionId)
      .single();

    if (error) {
      return { session: null, error };
    }

    return { session: data, error: null };
  }

  /**
   * Get messages for a session
   * @param {string} sessionId - Session's UUID
   * @param {Object} options - Query options {limit, offset}
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  static async getMessages(sessionId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return { messages: [], error };
    }

    return { messages: data || [], error: null };
  }

  /**
   * Get session with its messages
   * @param {string} sessionId - Session's UUID
   * @returns {Promise<{session: Object|null, messages: Array, error: Error|null}>}
   */
  static async getWithMessages(sessionId) {
    const [sessionResult, messagesResult] = await Promise.all([
      this.getById(sessionId),
      this.getMessages(sessionId)
    ]);

    return {
      session: sessionResult.session,
      messages: messagesResult.messages,
      error: sessionResult.error || messagesResult.error
    };
  }

  /**
   * Add a message to a session (owner reply)
   * @param {string} sessionId - Session's UUID
   * @param {string} content - Message content
   * @param {boolean} isAI - Whether this is an AI-generated message
   * @returns {Promise<{message: Object|null, error: Error|null}>}
   */
  static async addMessage(sessionId, content, isAI = false) {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role: 'agent',
        content: content,
        is_ai_generated: isAI,
      })
      .select()
      .single();

    if (error) {
      return { message: null, error };
    }

    return { message: data, error: null };
  }

  /**
   * Pause AI responses for a session (human handoff)
   * @param {string} sessionId - Session's UUID
   * @param {number} minutes - Minutes to pause AI (default: 5)
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  static async pauseAI(sessionId, minutes = 5) {
    const pauseUntil = new Date(Date.now() + minutes * 60 * 1000);

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ ai_paused_until: pauseUntil.toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return { session: null, error };
    }

    return { session: data, error: null };
  }

  /**
   * Resume AI responses for a session
   * @param {string} sessionId - Session's UUID
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  static async resumeAI(sessionId) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ ai_paused_until: null })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return { session: null, error };
    }

    return { session: data, error: null };
  }

  /**
   * Update session status
   * @param {string} sessionId - Session's UUID
   * @param {string} status - New status (active, closed)
   * @returns {Promise<{session: Object|null, error: Error|null}>}
   */
  static async updateStatus(sessionId, status) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ status })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return { session: null, error };
    }

    return { session: data, error: null };
  }

  /**
   * Get recent sessions with last message preview
   * @param {string} userId - User's UUID
   * @param {number} limit - Number of sessions to return
   * @returns {Promise<{sessions: Array, error: Error|null}>}
   */
  static async getRecentWithPreview(userId, limit = 20) {
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        chat_widgets(name, primary_color),
        agent_configs(name)
      `)
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { sessions: [], error };
    }

    // Get last message for each session
    const sessionsWithPreview = await Promise.all(
      (sessions || []).map(async (session) => {
        const { data: lastMessage } = await supabase
          .from('chat_messages')
          .select('content, role, created_at')
          .eq('session_id', session.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ...session,
          lastMessage: lastMessage?.content || null,
          lastMessageRole: lastMessage?.role || null,
          lastMessageAt: lastMessage?.created_at || session.last_message_at,
        };
      })
    );

    return { sessions: sessionsWithPreview, error: null };
  }

  /**
   * Mark messages as read
   * @param {string} sessionId - Session's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async markAsRead(sessionId) {
    const { error } = await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('role', 'visitor')
      .is('read_at', null);

    return { error };
  }

  /**
   * Get unread message count for user
   * @param {string} userId - User's UUID
   * @returns {Promise<{count: number, error: Error|null}>}
   */
  static async getUnreadCount(userId) {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*, chat_sessions!inner(user_id)', { count: 'exact', head: true })
      .eq('chat_sessions.user_id', userId)
      .eq('role', 'visitor')
      .is('read_at', null);

    if (error) {
      return { count: 0, error };
    }

    return { count: count || 0, error: null };
  }
}
