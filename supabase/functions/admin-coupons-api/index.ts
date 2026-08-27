/**
 * Admin Coupons API
 * CRUD for coupon codes (Admin > Marketing > Coupon codes)
 *
 * Actions:
 * - list_coupons: Get all coupons
 * - create_coupon: Create a new coupon (admin/god only)
 * - update_coupon: Update fields by ID (admin/god only)
 * - delete_coupon: Delete by ID, only if never redeemed (admin/god only)
 * - list_redemptions: Get redemptions for a coupon
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, isAdmin, logAdminAction, errorResponse, successResponse, handleCors } from '../_shared/admin-auth.ts'

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    const token = authHeader.replace('Bearer ', '')
    const adminUser = await requireAdmin(supabase, token)

    const body = await req.json()
    const { action } = body

    // Support role can view; only admin/god can create or change coupons
    const mutating = ['create_coupon', 'update_coupon', 'delete_coupon'].includes(action)
    if (mutating && !isAdmin(adminUser)) {
      return errorResponse('Forbidden: Admin role required', 403)
    }

    switch (action) {
      case 'list_coupons':
        return await handleListCoupons(supabase)
      case 'create_coupon':
        return await handleCreateCoupon(supabase, body, adminUser)
      case 'update_coupon':
        return await handleUpdateCoupon(supabase, body, adminUser)
      case 'delete_coupon':
        return await handleDeleteCoupon(supabase, body, adminUser)
      case 'list_redemptions':
        return await handleListRedemptions(supabase, body)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error('Error in admin-coupons-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

async function handleListCoupons(supabase: any) {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return errorResponse('Failed to list coupons: ' + error.message, 500)
  return successResponse({ coupons: data })
}

async function handleCreateCoupon(supabase: any, body: any, adminUser: any) {
  const { code, description, credit_amount, max_redemptions, expires_at, requires_payment_method } = body

  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!CODE_PATTERN.test(normalizedCode)) {
    return errorResponse('Code must be 3-32 characters: letters, numbers, hyphens')
  }

  const amount = Number(credit_amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return errorResponse('credit_amount must be between $0.01 and $1000')
  }

  const maxRedemptions = max_redemptions == null || max_redemptions === '' ? null : parseInt(max_redemptions, 10)
  if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
    return errorResponse('max_redemptions must be a positive integer or empty for unlimited')
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      code: normalizedCode,
      description: description?.trim() || null,
      credit_amount: amount,
      max_redemptions: maxRedemptions,
      expires_at: expires_at || null,
      // Defaults to true at the DB; only override when explicitly waived
      requires_payment_method: requires_payment_method === false ? false : true,
      created_by: adminUser.id,
    })
    .select()
    .single()

  if (error) {
    if (error.message?.includes('duplicate')) {
      return errorResponse(`Coupon code "${normalizedCode}" already exists`)
    }
    return errorResponse('Failed to create coupon: ' + error.message, 500)
  }

  await logAdminAction(supabase, {
    adminUserId: adminUser.id,
    action: 'create_coupon',
    details: { coupon_id: data.id, code: normalizedCode, credit_amount: amount, max_redemptions: maxRedemptions, expires_at: expires_at || null },
  })

  return successResponse({ coupon: data })
}

async function handleUpdateCoupon(supabase: any, body: any, adminUser: any) {
  const { id } = body
  if (!id) return errorResponse('Missing coupon id')

  // Only these fields are editable; code and counters are immutable
  const updates: Record<string, unknown> = {}
  if ('description' in body) updates.description = body.description?.trim() || null
  if ('active' in body) updates.active = !!body.active
  if ('requires_payment_method' in body) updates.requires_payment_method = !!body.requires_payment_method
  if ('expires_at' in body) updates.expires_at = body.expires_at || null
  if ('max_redemptions' in body) {
    const maxRedemptions = body.max_redemptions == null || body.max_redemptions === '' ? null : parseInt(body.max_redemptions, 10)
    if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
      return errorResponse('max_redemptions must be a positive integer or empty for unlimited')
    }
    updates.max_redemptions = maxRedemptions
  }
  if ('credit_amount' in body) {
    const amount = Number(body.credit_amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return errorResponse('credit_amount must be between $0.01 and $1000')
    }
    updates.credit_amount = amount
  }

  if (Object.keys(updates).length === 0) return errorResponse('No editable fields provided')
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update coupon: ' + error.message, 500)

  await logAdminAction(supabase, {
    adminUserId: adminUser.id,
    action: 'update_coupon',
    details: { coupon_id: id, updates },
  })

  return successResponse({ coupon: data })
}

async function handleDeleteCoupon(supabase: any, body: any, adminUser: any) {
  const { id } = body
  if (!id) return errorResponse('Missing coupon id')

  const { count, error: countError } = await supabase
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', id)

  if (countError) return errorResponse('Failed to check redemptions: ' + countError.message, 500)
  if ((count ?? 0) > 0) {
    return errorResponse('This coupon has been redeemed — deactivate it instead of deleting')
  }

  const { error } = await supabase
    .from('coupons')
    .delete()
    .eq('id', id)

  if (error) {
    // FK is ON DELETE RESTRICT — a redemption landing after the count check hits this
    if (error.code === '23503') {
      return errorResponse('This coupon has been redeemed — deactivate it instead of deleting')
    }
    return errorResponse('Failed to delete coupon: ' + error.message, 500)
  }

  await logAdminAction(supabase, {
    adminUserId: adminUser.id,
    action: 'delete_coupon',
    details: { coupon_id: id },
  })

  return successResponse({ deleted: true })
}

async function handleListRedemptions(supabase: any, body: any) {
  const { coupon_id } = body
  if (!coupon_id) return errorResponse('Missing coupon_id')

  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select('id, user_id, amount, created_at, users(email)')
    .eq('coupon_id', coupon_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return errorResponse('Failed to list redemptions: ' + error.message, 500)
  return successResponse({ redemptions: data })
}
