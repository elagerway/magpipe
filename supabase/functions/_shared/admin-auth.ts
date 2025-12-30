/**
 * Admin Authentication Utilities
 * Handles admin/support role verification and audit logging
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'support'
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

  // Check if user has admin or support role
  if (userData.role !== 'admin' && userData.role !== 'support') {
    throw new Error('Forbidden: Admin or support role required')
  }

  return {
    id: userData.id,
    email: userData.email,
    role: userData.role as 'admin' | 'support'
  }
}

/**
 * Check if user is specifically an admin (not just support)
 */
export function isAdmin(adminUser: AdminUser): boolean {
  return adminUser.role === 'admin'
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

/**
 * CORS headers for admin endpoints
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Create a JSON error response
 */
export function errorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Create a JSON success response
 */
export function successResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Handle CORS preflight request
 */
export function handleCors(): Response {
  return new Response('ok', { headers: corsHeaders })
}
