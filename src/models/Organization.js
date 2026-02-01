/**
 * Organization Model
 * Handles organization-related database operations
 */

import { supabase } from '../lib/supabase.js';

export class Organization {
  /**
   * Get organization by ID
   * @param {string} orgId - Organization UUID
   * @returns {Promise<{organization: Object|null, error: Error|null}>}
   */
  static async getById(orgId) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error) {
      return { organization: null, error };
    }

    return { organization: data, error: null };
  }

  /**
   * Get organization for a user (through membership)
   * @param {string} userId - User UUID
   * @returns {Promise<{organization: Object|null, error: Error|null}>}
   */
  static async getForUser(userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(*)')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .limit(1);

    if (error) {
      return { organization: null, error };
    }

    if (!data || data.length === 0) {
      return { organization: null, error: null };
    }

    return { organization: data[0]?.organizations, error: null };
  }

  /**
   * Create a new organization
   * @param {string} name - Organization name
   * @param {string} ownerId - Owner's user UUID
   * @returns {Promise<{organization: Object|null, error: Error|null}>}
   */
  static async create(name, ownerId) {
    const { data, error } = await supabase
      .from('organizations')
      .insert({
        name,
        owner_id: ownerId,
      })
      .select()
      .single();

    if (error) {
      return { organization: null, error };
    }

    return { organization: data, error: null };
  }

  /**
   * Update organization
   * @param {string} orgId - Organization UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{organization: Object|null, error: Error|null}>}
   */
  static async update(orgId, updates) {
    const { data, error } = await supabase
      .from('organizations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      return { organization: null, error };
    }

    return { organization: data, error: null };
  }

  /**
   * Delete organization
   * @param {string} orgId - Organization UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(orgId) {
    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    return { error };
  }
}
