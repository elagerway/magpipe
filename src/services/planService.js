/**
 * Plan Service - Feature gating and plan limit checking
 */

import { supabase } from '../lib/supabase.js';

// Plan limits configuration (mirrors database)
const PLAN_LIMITS = {
  free: {
    maxPhoneNumbers: 1,
    maxCallsPerMonth: 100,
    maxMinutesPerMonth: 100,
    maxSmsPerMonth: 100,
    voiceCloningEnabled: false,
    advancedAnalyticsEnabled: false,
    prioritySupportEnabled: false
  },
  pro: {
    maxPhoneNumbers: null, // unlimited
    maxCallsPerMonth: null, // unlimited
    maxMinutesPerMonth: null, // unlimited
    maxSmsPerMonth: null, // unlimited
    voiceCloningEnabled: true,
    advancedAnalyticsEnabled: true,
    prioritySupportEnabled: true
  }
};

/**
 * Get the current user's plan
 * @param {string} userId
 * @returns {Promise<string>} 'free' or 'pro'
 */
export async function getUserPlan(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching user plan:', error);
    return 'free'; // Default to free
  }

  return data.plan || 'free';
}

/**
 * Get plan limits for a given plan
 * @param {string} plan 'free' or 'pro'
 * @returns {Object}
 */
export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Check if a feature is enabled for a user
 * @param {string} userId
 * @param {string} feature 'voiceCloning', 'advancedAnalytics', 'prioritySupport'
 * @returns {Promise<boolean>}
 */
export async function isFeatureEnabled(userId, feature) {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);

  const featureMap = {
    voiceCloning: limits.voiceCloningEnabled,
    advancedAnalytics: limits.advancedAnalyticsEnabled,
    prioritySupport: limits.prioritySupportEnabled
  };

  return featureMap[feature] || false;
}

/**
 * Check if user can add more phone numbers
 * @param {string} userId
 * @returns {Promise<{canAdd: boolean, current: number, limit: number|null}>}
 */
export async function canAddPhoneNumber(userId) {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);

  // Get current phone number count
  const { data, error } = await supabase
    .from('service_numbers')
    .select('id', { count: 'exact' })
    .eq('user_id', userId);

  const current = data?.length || 0;
  const limit = limits.maxPhoneNumbers;

  return {
    canAdd: limit === null || current < limit,
    current,
    limit,
    isUnlimited: limit === null
  };
}

/**
 * Check usage limits for calls, minutes, or SMS
 * @param {string} userId
 * @param {'calls'|'minutes'|'sms'} type
 * @returns {Promise<{hasExceeded: boolean, current: number, limit: number|null, remaining: number|null}>}
 */
export async function checkUsageLimit(userId, type) {
  const { data: user, error } = await supabase
    .from('users')
    .select('plan, usage_calls_count, usage_minutes_count, usage_sms_count, usage_period_end')
    .eq('id', userId)
    .single();

  if (error || !user) {
    console.error('Error fetching user usage:', error);
    return { hasExceeded: false, current: 0, limit: null, remaining: null };
  }

  // Check if period has ended and needs reset
  if (user.usage_period_end && new Date(user.usage_period_end) < new Date()) {
    // Trigger period reset by calling the database function
    await supabase.rpc('check_usage_limit', { p_user_id: userId, p_limit_type: type });
    // Re-fetch
    const { data: refreshed } = await supabase
      .from('users')
      .select('plan, usage_calls_count, usage_minutes_count, usage_sms_count')
      .eq('id', userId)
      .single();
    if (refreshed) Object.assign(user, refreshed);
  }

  const limits = getPlanLimits(user.plan || 'free');

  const usageMap = {
    calls: { current: user.usage_calls_count || 0, limit: limits.maxCallsPerMonth },
    minutes: { current: user.usage_minutes_count || 0, limit: limits.maxMinutesPerMonth },
    sms: { current: user.usage_sms_count || 0, limit: limits.maxSmsPerMonth }
  };

  const usage = usageMap[type];
  const hasExceeded = usage.limit !== null && usage.current >= usage.limit;
  const remaining = usage.limit !== null ? Math.max(0, usage.limit - usage.current) : null;

  return {
    hasExceeded,
    current: usage.current,
    limit: usage.limit,
    remaining,
    isUnlimited: usage.limit === null
  };
}

/**
 * Increment usage counter (should be called after each call/SMS)
 * @param {string} userId
 * @param {'calls'|'minutes'|'sms'} type
 * @param {number} amount
 * @returns {Promise<boolean>} true if increment was successful, false if limit exceeded
 */
export async function incrementUsage(userId, type, amount = 1) {
  const check = await checkUsageLimit(userId, type);

  if (check.hasExceeded) {
    return false;
  }

  const columnMap = {
    calls: 'usage_calls_count',
    minutes: 'usage_minutes_count',
    sms: 'usage_sms_count'
  };

  const column = columnMap[type];

  const { error } = await supabase
    .from('users')
    .update({ [column]: (check.current || 0) + amount })
    .eq('id', userId);

  return !error;
}

/**
 * Get full usage summary for a user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getUsageSummary(userId) {
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);

  const [callsCheck, minutesCheck, smsCheck, phoneCheck] = await Promise.all([
    checkUsageLimit(userId, 'calls'),
    checkUsageLimit(userId, 'minutes'),
    checkUsageLimit(userId, 'sms'),
    canAddPhoneNumber(userId)
  ]);

  return {
    plan,
    calls: callsCheck,
    minutes: minutesCheck,
    sms: smsCheck,
    phoneNumbers: phoneCheck,
    features: {
      voiceCloning: limits.voiceCloningEnabled,
      advancedAnalytics: limits.advancedAnalyticsEnabled,
      prioritySupport: limits.prioritySupportEnabled
    }
  };
}

export default {
  getUserPlan,
  getPlanLimits,
  isFeatureEnabled,
  canAddPhoneNumber,
  checkUsageLimit,
  incrementUsage,
  getUsageSummary
};
