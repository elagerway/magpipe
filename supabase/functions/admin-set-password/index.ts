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

interface SetPasswordRequest {
  user_id: string
  password: string
}

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

    // Setting a password lets the caller sign in as the target user — same
    // blast radius as account creation. Support cannot do this.
    if (!isAdmin(adminUser)) {
      return errorResponse('Only admins can set user passwords', 403)
    }

    const body: SetPasswordRequest = await req.json()
    const userId = (body.user_id || '').trim()
    const password = body.password || ''

    if (!userId) {
      return errorResponse('user_id is required', 400)
    }
    if (!password || password.length < 8) {
      return errorResponse('Password must be at least 8 characters', 400)
    }

    // Self-set blocked — admins should rotate their own password through the
    // normal account flow, not via the admin API. Keeps the audit log honest.
    if (userId === adminUser.id) {
      return errorResponse('Use account settings to change your own password', 400)
    }

    // Look up the target's email/role so we can apply privilege guards
    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .maybeSingle()

    if (targetError || !target) {
      return errorResponse('Target user not found', 404)
    }

    // Peer-admin protection: only god can set another admin/god's password,
    // or the superuser account's password. Stops admin A from silently taking
    // over admin B's account.
    const targetIsPrivileged =
      isSuperuser(target.email) ||
      target.role === 'god' ||
      target.role === 'admin'
    if (targetIsPrivileged && !isGod(adminUser)) {
      return errorResponse('Only god can set this account\'s password', 403)
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password
    })

    if (updateError) {
      console.error('Set password error:', updateError)
      return errorResponse(updateError.message || 'Failed to set password', 400)
    }

    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'set_password',
      details: { email: target.email }
    })

    return successResponse({
      success: true,
      message: `Password updated for ${target.email}`
    })
  } catch (error) {
    console.error('Error in admin-set-password:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
