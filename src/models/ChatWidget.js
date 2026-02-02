/**
 * ChatWidget Model
 * Handles chat widget configuration database operations
 */

import { supabase } from '../lib/supabase.js';

export class ChatWidget {
  /**
   * Create a new chat widget
   * @param {Object} widgetData - Widget data {user_id, agent_id, name, primary_color, etc.}
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async create(widgetData) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .insert(widgetData)
      .select()
      .single();

    if (error) {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }

  /**
   * Get all widgets for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{widgets: Array, error: Error|null}>}
   */
  static async list(userId) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .select('*, agent_configs(id, name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { widgets: [], error };
    }

    return { widgets: data || [], error: null };
  }

  /**
   * Get a widget by ID
   * @param {string} widgetId - Widget's UUID
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async getById(widgetId) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .select('*, agent_configs(id, name, system_prompt)')
      .eq('id', widgetId)
      .single();

    if (error) {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }

  /**
   * Get widget by widget_key (for public access)
   * @param {string} widgetKey - Widget's public key
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async getByKey(widgetKey) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .select('*, agent_configs(id, name)')
      .eq('widget_key', widgetKey)
      .single();

    if (error) {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }

  /**
   * Get widget for an agent
   * @param {string} agentId - Agent's UUID
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async getByAgentId(agentId) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }

  /**
   * Update a chat widget
   * @param {string} widgetId - Widget's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async update(widgetId, updates) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .update(updates)
      .eq('id', widgetId)
      .select()
      .single();

    if (error) {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }

  /**
   * Delete a chat widget
   * @param {string} widgetId - Widget's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(widgetId) {
    const { error } = await supabase
      .from('chat_widgets')
      .delete()
      .eq('id', widgetId);

    return { error };
  }

  /**
   * Toggle widget active status
   * @param {string} widgetId - Widget's UUID
   * @param {boolean} isActive - New active status
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async setActive(widgetId, isActive) {
    return await this.update(widgetId, { is_active: isActive });
  }

  /**
   * Assign an agent to a widget
   * @param {string} widgetId - Widget's UUID
   * @param {string} agentId - Agent's UUID
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async assignAgent(widgetId, agentId) {
    return await this.update(widgetId, { agent_id: agentId });
  }

  /**
   * Get portal widget for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{widget: Object|null, error: Error|null}>}
   */
  static async getPortalWidget(userId) {
    const { data, error } = await supabase
      .from('chat_widgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_portal_widget', true)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { widget: null, error };
    }

    return { widget: data, error: null };
  }
}
