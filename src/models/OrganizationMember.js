/**
 * OrganizationMember Model
 * Handles organization membership operations
 */

import { supabase } from '../lib/supabase.js';

export class OrganizationMember {
  /**
   * Get all members of an organization
   * @param {string} orgId - Organization UUID
   * @returns {Promise<{members: Array|null, error: Error|null}>}
   */
  static async getByOrganization(orgId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) {
      return { members: null, error };
    }

    return { members: data, error: null };
  }

  /**
   * Get membership for a specific user in an organization
   * @param {string} orgId - Organization UUID
   * @param {string} userId - User UUID
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async getMembership(orgId, userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Invite a new member to the organization
   * @param {string} orgId - Organization UUID
   * @param {string} email - Invitee's email
   * @param {string} fullName - Invitee's name
   * @param {string} role - Role (admin, member)
   * @param {string} invitedBy - UUID of user sending invite
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async invite(orgId, email, fullName, role, invitedBy) {
    const { data, error } = await supabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        email,
        full_name: fullName,
        role,
        status: 'pending',
        invited_by: invitedBy,
        invited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Update member's role
   * @param {string} memberId - Member record UUID
   * @param {string} role - New role
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async updateRole(memberId, role) {
    const { data, error } = await supabase
      .from('organization_members')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Approve a pending member
   * @param {string} memberId - Member record UUID
   * @param {string} userId - User UUID (after they sign up)
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async approve(memberId, userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .update({
        user_id: userId,
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Suspend a member
   * @param {string} memberId - Member record UUID
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async suspend(memberId) {
    const { data, error } = await supabase
      .from('organization_members')
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Remove a member from organization
   * @param {string} memberId - Member record UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async remove(memberId) {
    const { error } = await supabase
      .from('organization_members')
      .update({
        status: 'removed',
        removed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    return { error };
  }

  /**
   * Re-invite a removed member (reset status to pending)
   * @param {string} memberId - Member record UUID
   * @param {string} invitedBy - UUID of user sending invite
   * @returns {Promise<{member: Object|null, error: Error|null}>}
   */
  static async reinvite(memberId, invitedBy) {
    const { data, error } = await supabase
      .from('organization_members')
      .update({
        status: 'pending',
        invited_by: invitedBy,
        invited_at: new Date().toISOString(),
        removed_at: null,
        suspended_at: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      return { member: null, error };
    }

    return { member: data, error: null };
  }

  /**
   * Get pending invitations for an email
   * @param {string} email - Email to check
   * @returns {Promise<{invitations: Array|null, error: Error|null}>}
   */
  static async getPendingInvitations(email) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('email', email)
      .eq('status', 'pending');

    if (error) {
      return { invitations: null, error };
    }

    return { invitations: data, error: null };
  }
}
