import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  isAdmin,
  isGod,
  isSuperuser,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface UpdateUserRequest {
  userId: string
  role?: 'user' | 'viewer' | 'editor' | 'support' | 'admin' | 'god'
  action?: 'suspend' | 'ban' | 'reactivate'
  reason?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify admin access
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

    // Parse request body
    const body: UpdateUserRequest = await req.json()

    if (!body.userId) {
      return errorResponse('userId is required', 400)
    }

    // Prevent admin from modifying themselves for critical actions
    if (body.userId === adminUser.id && (body.action === 'ban' || body.action === 'suspend')) {
      return errorResponse('Cannot suspend or ban yourself', 400)
    }

    // Only full admins can change roles
    if (body.role && !isAdmin(adminUser)) {
      return errorResponse('Only admins can change user roles', 403)
    }

    // Get current user state
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email, role, plan, account_status')
      .eq('id', body.userId)
      .single()

    if (userError || !targetUser) {
      return errorResponse('User not found', 404)
    }

    // Protect superuser/god account - only god can modify god
    if (isSuperuser(targetUser.email) || targetUser.role === 'god') {
      if (!isGod(adminUser)) {
        return errorResponse('Cannot modify the superuser account', 403)
      }
    }

    // Prevent demoting another admin unless you're also an admin
    if (targetUser.role === 'admin' && body.role && body.role !== 'admin' && !isAdmin(adminUser)) {
      return errorResponse('Only admins can demote other admins', 403)
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    // Handle role change
    if (body.role && body.role !== targetUser.role) {
      // Only god can assign or remove god role
      if ((body.role === 'god' || targetUser.role === 'god') && !isGod(adminUser)) {
        return errorResponse('Only god can assign or remove god role', 403)
      }
      updates.role = body.role
    }

    // Handle account status actions
    if (body.action) {
      switch (body.action) {
        case 'suspend':
          if (!body.reason) {
            return errorResponse('Reason is required for suspension', 400)
          }
          updates.account_status = 'suspended'
          updates.suspended_at = new Date().toISOString()
          updates.suspended_reason = body.reason
          break

        case 'ban':
          if (!body.reason) {
            return errorResponse('Reason is required for ban', 400)
          }
          updates.account_status = 'banned'
          updates.banned_at = new Date().toISOString()
          updates.banned_reason = body.reason
          break

        case 'reactivate':
          updates.account_status = 'active'
          // Clear suspension/ban data
          updates.suspended_at = null
          updates.suspended_reason = null
          updates.banned_at = null
          updates.banned_reason = null
          break

        default:
          return errorResponse('Invalid action', 400)
      }
    }

    // Only proceed if there are actual updates
    if (Object.keys(updates).length === 1) { // only updated_at
      return errorResponse('No changes specified', 400)
    }

    // Perform update
    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', body.userId)

    if (updateError) {
      console.error('Update error:', updateError)
      return errorResponse('Failed to update user', 500)
    }

    // Log admin action
    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: body.userId,
      action: body.action || 'update_user',
      details: {
        previousState: {
          role: targetUser.role,
          status: targetUser.account_status
        },
        changes: updates,
        reason: body.reason
      }
    })

    // Fetch updated user
    const { data: updatedUser } = await supabase
      .from('users')
      .select('id, email, name, role, plan, account_status, suspended_at, suspended_reason, banned_at, banned_reason')
      .eq('id', body.userId)
      .single()

    return successResponse({
      success: true,
      message: `User ${body.action || 'updated'} successfully`,
      user: updatedUser
    })
  } catch (error) {
    console.error('Error in admin-update-user:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
