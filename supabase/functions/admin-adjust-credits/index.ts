import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  isAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Unauthorized', 401)
    }
    const token = authHeader.replace('Bearer ', '')

    let adminUser
    try {
      adminUser = await requireAdmin(supabase, token)
    } catch (error) {
      return errorResponse(error.message, 403)
    }

    // Only admin and god can adjust credits
    if (!isAdmin(adminUser)) {
      return errorResponse('Only admins can adjust credits', 403)
    }

    const { userId, amount, reason } = await req.json()

    if (!userId) return errorResponse('userId is required', 400)
    if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
      return errorResponse('amount must be a non-zero number', 400)
    }
    if (!reason?.trim()) return errorResponse('reason is required', 400)

    // Verify target user exists
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email, credits_balance')
      .eq('id', userId)
      .single()

    if (userError || !targetUser) {
      return errorResponse('User not found', 404)
    }

    const description = `Admin adjustment by ${adminUser.email}: ${reason}`
    const metadata = { admin_id: adminUser.id, admin_email: adminUser.email, reason }
    const referenceId = `admin_${adminUser.id}_${Date.now()}`

    let result
    if (amount > 0) {
      const { data, error } = await supabase.rpc('add_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_transaction_type: 'adjustment',
        p_description: description,
        p_reference_type: 'admin_adjustment',
        p_reference_id: referenceId,
        p_metadata: metadata
      })
      if (error) {
        console.error('add_credits error:', error)
        return errorResponse('Failed to add credits', 500)
      }
      result = data
    } else {
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: Math.abs(amount),
        p_description: description,
        p_reference_type: 'admin_adjustment',
        p_reference_id: referenceId,
        p_metadata: metadata
      })
      if (error) {
        console.error('deduct_credits error:', error)
        return errorResponse('Failed to deduct credits', 500)
      }
      result = data
    }

    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'adjust_credits',
      details: { amount, reason, balance_before: targetUser.credits_balance }
    })

    const { data: updatedUser } = await supabase
      .from('users')
      .select('credits_balance, credits_used_this_period')
      .eq('id', userId)
      .single()

    return successResponse({
      success: true,
      balance: updatedUser?.credits_balance,
      used_this_period: updatedUser?.credits_used_this_period
    })
  } catch (error) {
    console.error('Error in admin-adjust-credits:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
