/**
 * Admin Authentication Utilities
 * Handles admin/support/god role verification and audit logging
 */

import { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Superuser account - protected from modification
export const SUPERUSER_EMAIL = 'erik@snapsonic.com'

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'support' | 'god'
}

export interface AuditLogEntry {
  adminUserId: string
  targetUserId?: string
  action: string
  details?: Record<string, unknown>
}

/**
 * Verify that the request is from an admin or support user
 * Returns the admin user data if authorized, throws error if not
 */
export async function requireAdmin(
  supabase: SupabaseClient,
  authToken: string
): Promise<AdminUser> {
  // Get authenticated user from token
  const { data: { user }, error: userError } = await supabase.auth.getUser(authToken)

  if (userError || !user) {
    throw new Error('Unauthorized: Invalid authentication token')
  }

  // Get user's role from database
  const { data: userData, error: roleError } = await supabase
    .from('users')
    .select('id, email, role, account_status')
    .eq('id', user.id)
    .single()

  if (roleError || !userData) {
    throw new Error('Unauthorized: User not found')
  }

  // Check account status
  if (userData.account_status !== 'active') {
    throw new Error(`Unauthorized: Account is ${userData.account_status}`)
  }

  // Check if user has admin, support, or god role
  if (userData.role !== 'admin' && userData.role !== 'support' && userData.role !== 'god') {
    throw new Error('Forbidden: Admin, support, or god role required')
  }

  return {
    id: userData.id,
    email: userData.email,
    role: userData.role as 'admin' | 'support' | 'god'
  }
}

/**
 * Check if user is specifically an admin (not just support)
 */
export function isAdmin(adminUser: AdminUser): boolean {
  return adminUser.role === 'admin' || adminUser.role === 'god'
}

/**
 * Check if user is god (highest privilege)
 */
export function isGod(adminUser: AdminUser): boolean {
  return adminUser.role === 'god'
}

/**
 * Check if target email is the superuser (protected account)
 */
export function isSuperuser(email: string): boolean {
  return email === SUPERUSER_EMAIL
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  const { error } = await supabase
    .from('admin_audit_log')
    .insert({
      admin_user_id: entry.adminUserId,
      target_user_id: entry.targetUserId || null,
      action: entry.action,
      details: entry.details || {}
    })

  if (error) {
    console.error('Failed to log admin action:', error)
    // Don't throw - audit logging failure shouldn't break the operation
  }
}

/**
 * Generate a cryptographically secure impersonation token
 */
export function generateSecureToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Calculate token expiry (1 hour from now)
 */
export function getTokenExpiry(): Date {
  const expiry = new Date()
  expiry.setHours(expiry.getHours() + 1)
  return expiry
}

// Re-export shared CORS and response utilities for backwards compatibility
export { corsHeaders, handleCors } from './cors.ts'
export { jsonResponse as successResponse, errorResponse } from './response.ts'
