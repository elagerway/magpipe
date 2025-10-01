/**
 * User Model
 * Handles all user-related database operations
 */

import { supabase } from '../lib/supabase.js';

export class User {
  /**
   * Sign up a new user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @param {string} name - User's full name
   * @returns {Promise<{user: Object|null, error: Error|null}>}
   */
  static async signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  }

  /**
   * Sign in a user with email and password
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<{user: Object|null, session: Object|null, error: Error|null}>}
   */
  static async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
  }

  /**
   * Sign in with OAuth provider (Google, Apple, Microsoft)
   * @param {string} provider - OAuth provider name ('google', 'apple', 'azure')
   * @param {string} redirectTo - Optional redirect URL after authentication
   * @returns {Promise<{error: Error|null}>}
   */
  static async signInWithOAuth(provider, redirectTo = null) {
    const options = {};

    if (redirectTo) {
      options.redirectTo = redirectTo;
    } else {
      // Default redirect to dashboard
      options.redirectTo = `${window.location.origin}/dashboard`;
    }

    // Add query parameters for session management
    options.queryParams = {
      access_type: 'offline',
      prompt: 'consent',
    };

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  }

  /**
   * Handle OAuth callback and exchange code for session
   * This is called automatically by Supabase Auth
   */
  static async handleOAuthCallback() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return { user: null, session: null, error };
    }

    return { user: data.session?.user, session: data.session, error: null };
  }

  /**
   * Send password reset email
   * @param {string} email - User's email address
   * @param {string} redirectTo - URL to redirect to after clicking reset link
   * @returns {Promise<{error: Error|null}>}
   */
  static async resetPasswordForEmail(email, redirectTo = null) {
    const options = {};

    if (redirectTo) {
      options.redirectTo = redirectTo;
    } else {
      // Default redirect to reset password page
      options.redirectTo = `${window.location.origin}/reset-password`;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, options);

    if (error) {
      return { error };
    }

    return { error: null };
  }

  /**
   * Update user's password (after clicking reset link)
   * @param {string} newPassword - New password
   * @returns {Promise<{user: Object|null, error: Error|null}>}
   */
  static async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { user: null, error };
    }

    return { user: data.user, error: null };
  }

  /**
   * Verify email with OTP code
   * @param {string} email - User's email address
   * @param {string} token - 6-digit OTP code
   * @returns {Promise<{user: Object|null, session: Object|null, error: Error|null}>}
   */
  static async verifyEmail(email, token) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });

    if (error) {
      return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
  }

  /**
   * Get user profile from users table
   * @param {string} userId - User's UUID
   * @returns {Promise<{profile: Object|null, error: Error|null}>}
   */
  static async getProfile(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data, error: null };
  }

  /**
   * Update user profile
   * @param {string} userId - User's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{profile: Object|null, error: Error|null}>}
   */
  static async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data, error: null };
  }

  /**
   * Mark user's phone as verified and store phone number
   * @param {string} userId - User's UUID
   * @param {string} phoneNumber - Verified phone number in E.164 format
   * @returns {Promise<{profile: Object|null, error: Error|null}>}
   */
  static async verifyPhone(userId, phoneNumber) {
    return await this.updateProfile(userId, {
      phone_number: phoneNumber,
      phone_verified: true,
    });
  }

  /**
   * Set user's selected service number
   * @param {string} userId - User's UUID
   * @param {string} serviceNumber - Selected service number in E.164 format
   * @returns {Promise<{profile: Object|null, error: Error|null}>}
   */
  static async setServiceNumber(userId, serviceNumber) {
    return await this.updateProfile(userId, {
      service_number: serviceNumber,
    });
  }

  /**
   * Check if user exists by email
   * @param {string} email - Email address to check
   * @returns {Promise<{exists: boolean, error: Error|null}>}
   */
  static async existsByEmail(email) {
    const { data, error } = await supabase.from('users').select('id').eq('email', email).single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected
      return { exists: false, error };
    }

    return { exists: !!data, error: null };
  }

  /**
   * Create user profile record (called after auth.signUp)
   * @param {string} userId - User's UUID from auth.users
   * @param {string} email - User's email address
   * @param {string} name - User's full name
   * @returns {Promise<{profile: Object|null, error: Error|null}>}
   */
  static async createProfile(userId, email, name) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        name,
      })
      .select()
      .single();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data, error: null };
  }
}