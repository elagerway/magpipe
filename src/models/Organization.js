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
    // A user can have more than one approved membership (they own their own
    // solo org AND belong to a team they were invited to). Resolve via the
    // user's explicitly-selected current_organization_id — the field the
    // invite-acceptance flow maintains — so callers agree on which org is
    // "active". Fall back to the first approved membership deterministically.
    const { data: userRow } = await supabase
      .from('users')
      .select('current_organization_id')
      .eq('id', userId)
      .single();
    const currentOrgId = userRow?.current_organization_id || null;

    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(*)')
      .eq('user_id', userId)
      .eq('status', 'approved');

    if (error) {
      return { organization: null, error };
    }

    if (!data || data.length === 0) {
      return { organization: null, error: null };
    }

    const chosen =
      (currentOrgId && data.find((m) => m.organization_id === currentOrgId)) || data[0];
    return { organization: chosen?.organizations, error: null };
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

    // Create owner membership record so getForUser() and team page work
    await supabase
      .from('organization_members')
      .insert({
        organization_id: data.id,
        user_id: ownerId,
        email: '', // Will be filled by trigger or manually
        role: 'owner',
        status: 'approved',
        approved_at: new Date().toISOString(),
      });

    // Set user's current organization
    await supabase
      .from('users')
      .update({ current_organization_id: data.id })
      .eq('id', ownerId);

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
