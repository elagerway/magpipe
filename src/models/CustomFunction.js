/**
 * CustomFunction Model
 * Handles CRUD operations for custom webhook functions
 */

import { supabase } from '../lib/supabase.js';

export class CustomFunction {
  /**
   * List all custom functions for an agent
   * @param {string} agentId - Agent's UUID
   * @returns {Promise<{functions: Array|null, error: Error|null}>}
   */
  static async listByAgent(agentId) {
    const { data, error } = await supabase
      .from('custom_functions')
      .select('*')
      .eq('agent_id', agentId)
      .order('name', { ascending: true });

    return { functions: data, error };
  }

  /**
   * List all custom functions for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{functions: Array|null, error: Error|null}>}
   */
  static async listByUser(userId) {
    const { data, error } = await supabase
      .from('custom_functions')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    return { functions: data, error };
  }

  /**
   * Get a single custom function by ID
   * @param {string} functionId - Function UUID
   * @returns {Promise<{function: Object|null, error: Error|null}>}
   */
  static async getById(functionId) {
    const { data, error } = await supabase
      .from('custom_functions')
      .select('*')
      .eq('id', functionId)
      .single();

    return { function: data, error };
  }

  /**
   * Create a new custom function
   * @param {string} userId - User's UUID
   * @param {string} agentId - Agent's UUID
   * @param {Object} functionData - Function configuration
   * @returns {Promise<{function: Object|null, error: Error|null}>}
   */
  static async create(userId, agentId, functionData) {
    const { data, error } = await supabase
      .from('custom_functions')
      .insert({
        user_id: userId,
        agent_id: agentId,
        name: functionData.name,
        description: functionData.description,
        http_method: functionData.http_method,
        endpoint_url: functionData.endpoint_url,
        headers: functionData.headers || [],
        query_params: functionData.query_params || [],
        body_schema: functionData.body_schema || [],
        response_variables: functionData.response_variables || [],
        timeout_ms: functionData.timeout_ms || 120000,
        max_retries: functionData.max_retries || 2,
        is_active: functionData.is_active !== false
      })
      .select()
      .single();

    return { function: data, error };
  }

  /**
   * Update an existing custom function
   * @param {string} functionId - Function UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{function: Object|null, error: Error|null}>}
   */
  static async update(functionId, updates) {
    const { data, error } = await supabase
      .from('custom_functions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', functionId)
      .select()
      .single();

    return { function: data, error };
  }

  /**
   * Delete a custom function
   * @param {string} functionId - Function UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(functionId) {
    const { error } = await supabase
      .from('custom_functions')
      .delete()
      .eq('id', functionId);

    return { error };
  }

  /**
   * Toggle a custom function's active status
   * @param {string} functionId - Function UUID
   * @param {boolean} isActive - New active state
   * @returns {Promise<{function: Object|null, error: Error|null}>}
   */
  static async toggleActive(functionId, isActive) {
    return await this.update(functionId, { is_active: isActive });
  }

  /**
   * Validate function name format (snake_case)
   * @param {string} name - Function name to validate
   * @returns {boolean}
   */
  static isValidName(name) {
    return /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 64;
  }

  /**
   * Convert a display name to snake_case
   * @param {string} displayName - Human-readable name
   * @returns {string}
   */
  static toSnakeCase(displayName) {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }
}
