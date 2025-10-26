/**
 * Contact Model
 * Handles all contact-related database operations
 */

import { supabase } from '../lib/supabase.js';

export class Contact {
  /**
   * Create a new contact
   * @param {string} userId - User's UUID
   * @param {Object} contactData - Contact data {first_name, last_name, phone_number, email, address, is_whitelisted, notes, avatar_url}
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async create(userId, contactData) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        ...contactData,
      })
      .select()
      .single();

    if (error) {
      return { contact: null, error };
    }

    return { contact: data, error: null };
  }

  /**
   * Get all contacts for a user
   * @param {string} userId - User's UUID
   * @param {Object} options - Query options {orderBy, ascending, limit, offset}
   * @returns {Promise<{contacts: Array, error: Error|null}>}
   */
  static async list(userId, options = {}) {
    const {
      orderBy = 'name',
      ascending = true,
      limit = null,
      offset = 0,
    } = options;

    let query = supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order(orderBy, { ascending });

    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { contacts: [], error };
    }

    return { contacts: data, error: null };
  }

  /**
   * Get a single contact by ID
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async getById(contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (error) {
      return { contact: null, error };
    }

    return { contact: data, error: null };
  }

  /**
   * Get a contact by phone number
   * @param {string} phoneNumber - Phone number in E.164 format
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async getByPhoneNumber(phoneNumber) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error
      return { contact: null, error };
    }

    return { contact: data, error: null };
  }

  /**
   * Update a contact
   * @param {string} contactId - Contact's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async update(contactId, updates) {
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId)
      .select()
      .single();

    if (error) {
      return { contact: null, error };
    }

    return { contact: data, error: null };
  }

  /**
   * Delete a contact
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(contactId) {
    const { error } = await supabase.from('contacts').delete().eq('id', contactId);

    return { error };
  }

  /**
   * Search contacts by name, phone number, or email
   * @param {string} userId - User's UUID
   * @param {string} searchTerm - Search term
   * @returns {Promise<{contacts: Array, error: Error|null}>}
   */
  static async search(userId, searchTerm) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .order('first_name', { ascending: true });

    if (error) {
      return { contacts: [], error };
    }

    return { contacts: data, error: null };
  }

  /**
   * Get whitelisted contacts only
   * @param {string} userId - User's UUID
   * @returns {Promise<{contacts: Array, error: Error|null}>}
   */
  static async getWhitelisted(userId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_whitelisted', true)
      .order('first_name', { ascending: true });

    if (error) {
      return { contacts: [], error };
    }

    return { contacts: data, error: null };
  }

  /**
   * Whitelist a contact
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async whitelist(contactId) {
    return await this.update(contactId, { is_whitelisted: true });
  }

  /**
   * Remove contact from whitelist
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{contact: Object|null, error: Error|null}>}
   */
  static async removeFromWhitelist(contactId) {
    return await this.update(contactId, { is_whitelisted: false });
  }

  /**
   * Check if a phone number is whitelisted
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - Phone number in E.164 format
   * @returns {Promise<{isWhitelisted: boolean, contact: Object|null, error: Error|null}>}
   */
  static async isWhitelisted(userId, phoneNumber) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('phone_number', phoneNumber)
      .eq('is_whitelisted', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { isWhitelisted: false, contact: null, error };
    }

    return { isWhitelisted: !!data, contact: data, error: null };
  }

  /**
   * Bulk import contacts
   * @param {string} userId - User's UUID
   * @param {Array} contacts - Array of contact objects
   * @returns {Promise<{contacts: Array, error: Error|null}>}
   */
  static async bulkImport(userId, contacts) {
    const contactsWithUserId = contacts.map((contact) => ({
      user_id: userId,
      ...contact,
    }));

    const { data, error } = await supabase
      .from('contacts')
      .insert(contactsWithUserId)
      .select();

    if (error) {
      return { contacts: [], error };
    }

    return { contacts: data, error: null };
  }
}