/**
 * SemanticMatchAction Model
 * Handles CRUD operations for semantic match alert actions
 */

import { supabase } from '../lib/supabase.js';

export class SemanticMatchAction {
  /**
   * List all semantic match actions for an agent
   * @param {string} agentId - Agent's UUID
   * @returns {Promise<{actions: Array|null, error: Error|null}>}
   */
  static async listByAgent(agentId) {
    const { data, error } = await supabase
      .from('semantic_match_actions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });

    return { actions: data, error };
  }

  /**
   * Create a new semantic match action
   * @param {string} userId - User's UUID
   * @param {string} agentId - Agent's UUID
   * @param {Object} actionData - Action configuration
   * @returns {Promise<{action: Object|null, error: Error|null}>}
   */
  static async create(userId, agentId, actionData) {
    const { data, error } = await supabase
      .from('semantic_match_actions')
      .insert({
        user_id: userId,
        agent_id: agentId,
        name: actionData.name,
        monitored_topics: actionData.monitored_topics || [],
        match_threshold: actionData.match_threshold || 3,
        action_type: actionData.action_type,
        action_config: actionData.action_config || {},
        is_active: actionData.is_active !== false,
        cooldown_minutes: actionData.cooldown_minutes || 60
      })
      .select()
      .single();

    return { action: data, error };
  }

  /**
   * Update an existing semantic match action
   * @param {string} actionId - Action UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{action: Object|null, error: Error|null}>}
   */
  static async update(actionId, updates) {
    const { data, error } = await supabase
      .from('semantic_match_actions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', actionId)
      .select()
      .single();

    return { action: data, error };
  }

  /**
   * Delete a semantic match action
   * @param {string} actionId - Action UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(actionId) {
    const { error } = await supabase
      .from('semantic_match_actions')
      .delete()
      .eq('id', actionId);

    return { error };
  }

  /**
   * Toggle a semantic match action's active status
   * @param {string} actionId - Action UUID
   * @param {boolean} isActive - New active state
   * @returns {Promise<{action: Object|null, error: Error|null}>}
   */
  static async toggleActive(actionId, isActive) {
    return await this.update(actionId, { is_active: isActive });
  }
}
