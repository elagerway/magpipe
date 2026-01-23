/**
 * OutboundTemplate Model
 * Handles CRUD operations for outbound call templates
 */

import { supabase } from '../lib/supabase.js';

export class OutboundTemplate {
  /**
   * List all templates for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{templates: Array|null, error: Error|null}>}
   */
  static async list(userId) {
    const { data, error } = await supabase
      .from('outbound_call_templates')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    return { templates: data, error };
  }

  /**
   * Get a single template by ID
   * @param {string} templateId - Template UUID
   * @returns {Promise<{template: Object|null, error: Error|null}>}
   */
  static async getById(templateId) {
    const { data, error } = await supabase
      .from('outbound_call_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    return { template: data, error };
  }

  /**
   * Get the default template for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{template: Object|null, error: Error|null}>}
   */
  static async getDefault(userId) {
    const { data, error } = await supabase
      .from('outbound_call_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single();

    return { template: data, error };
  }

  /**
   * Create a new template
   * @param {string} userId - User's UUID
   * @param {Object} templateData - {name, purpose, goal, is_default?}
   * @returns {Promise<{template: Object|null, error: Error|null}>}
   */
  static async create(userId, templateData) {
    // If setting as default, clear existing default first
    if (templateData.is_default) {
      await supabase
        .from('outbound_call_templates')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data, error } = await supabase
      .from('outbound_call_templates')
      .insert({
        user_id: userId,
        name: templateData.name,
        purpose: templateData.purpose,
        goal: templateData.goal,
        is_default: templateData.is_default || false
      })
      .select()
      .single();

    return { template: data, error };
  }

  /**
   * Update an existing template
   * @param {string} templateId - Template UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{template: Object|null, error: Error|null}>}
   */
  static async update(templateId, updates) {
    // Get the template first to know the user_id
    const { template: existing } = await this.getById(templateId);

    // If setting as default, clear existing default first
    if (updates.is_default && existing) {
      await supabase
        .from('outbound_call_templates')
        .update({ is_default: false })
        .eq('user_id', existing.user_id);
    }

    const { data, error } = await supabase
      .from('outbound_call_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', templateId)
      .select()
      .single();

    return { template: data, error };
  }

  /**
   * Delete a template
   * @param {string} templateId - Template UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(templateId) {
    const { error } = await supabase
      .from('outbound_call_templates')
      .delete()
      .eq('id', templateId);

    return { error };
  }

  /**
   * Set a template as the default
   * @param {string} userId - User's UUID
   * @param {string} templateId - Template UUID to set as default
   * @returns {Promise<{template: Object|null, error: Error|null}>}
   */
  static async setDefault(userId, templateId) {
    // Clear existing default
    await supabase
      .from('outbound_call_templates')
      .update({ is_default: false })
      .eq('user_id', userId);

    // Set new default
    const { data, error } = await supabase
      .from('outbound_call_templates')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .select()
      .single();

    return { template: data, error };
  }

  /**
   * Clear the default template for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async clearDefault(userId) {
    const { error } = await supabase
      .from('outbound_call_templates')
      .update({ is_default: false })
      .eq('user_id', userId);

    return { error };
  }
}
