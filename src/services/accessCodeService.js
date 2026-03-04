/**
 * Access Code Service
 * Handles phone admin access code management
 */

import { supabase } from '../lib/supabase.js';

/**
 * Request access code change (sends SMS confirmation)
 * @param {string} newAccessCode - The new access code (4-20 characters)
 * @returns {Promise<{confirmationId: string, expiresAt: string, devCode?: string}>}
 */
export async function requestChange(newAccessCode) {
  if (!newAccessCode || typeof newAccessCode !== 'string') {
    throw new Error('Access code is required');
  }

  if (newAccessCode.length < 4 || newAccessCode.length > 20) {
    throw new Error('Access code must be 4-20 characters');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function to request change
    const { data, error } = await supabase.functions.invoke('access-code-update', {
      body: {
        action: 'request',
        new_access_code: newAccessCode,
      },
    });

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('No phone number')) {
        throw new Error('No phone number associated with your account. Please add one in settings.');
      } else {
        throw new Error('Failed to send confirmation code. Please try again.');
      }
    }

    return {
      confirmationId: data.confirmation_id,
      expiresAt: data.expires_at,
      message: data.message,
      devCode: data.dev_code, // Only present in development
    };

  } catch (error) {
    console.error('Request access code change error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Verify access code change with SMS confirmation code
 * @param {string} confirmationCode - The 6-digit SMS confirmation code
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function verifyChange(confirmationCode) {
  if (!confirmationCode || typeof confirmationCode !== 'string') {
    throw new Error('Confirmation code is required');
  }

  // Validate 6-digit format
  if (!/^[0-9]{6}$/.test(confirmationCode)) {
    throw new Error('Confirmation code must be 6 digits');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function to verify
    const { data, error } = await supabase.functions.invoke('access-code-update', {
      body: {
        action: 'verify',
        confirmation_code: confirmationCode,
      },
    });

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('Invalid confirmation code')) {
        // Parse attempts remaining if available
        throw new Error(errorMsg);
      } else if (errorMsg.includes('Too many verification attempts')) {
        throw new Error('Too many failed attempts. Please request a new code.');
      } else if (errorMsg.includes('expired')) {
        throw new Error('Confirmation code expired. Please request a new one.');
      } else if (errorMsg.includes('No pending confirmation')) {
        throw new Error('No pending confirmation found. Please request a new code.');
      } else {
        throw new Error('Verification failed. Please try again.');
      }
    }

    return {
      success: data.success,
      message: data.message || 'Access code updated successfully',
    };

  } catch (error) {
    console.error('Verify access code change error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Check if user has access code configured
 * @returns {Promise<boolean>}
 */
export async function hasAccessCode() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('users')
      .select('phone_admin_access_code')
      .eq('id', user.id)
      .single();

    if (error) {
      throw error;
    }

    return !!data.phone_admin_access_code;

  } catch (error) {
    console.error('Check access code error:', error);
    return false;
  }
}

/**
 * Check if account is locked
 * @returns {Promise<{isLocked: boolean, lockedAt?: string}>}
 */
export async function isLocked() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('users')
      .select('phone_admin_locked, phone_admin_locked_at')
      .eq('id', user.id)
      .single();

    if (error) {
      throw error;
    }

    return {
      isLocked: data.phone_admin_locked || false,
      lockedAt: data.phone_admin_locked_at,
    };

  } catch (error) {
    console.error('Check lock status error:', error);
    return { isLocked: false };
  }
}
