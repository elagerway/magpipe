import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  generateSecureToken,
  getTokenExpiry,
  isSuperuser,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface ImpersonateRequest {
  userId: string
  baseUrl?: string
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
    const body: ImpersonateRequest = await req.json()

    if (!body.userId) {
      return errorResponse('userId is required', 400)
    }

    // Cannot impersonate yourself
    if (body.userId === adminUser.id) {
      return errorResponse('Cannot impersonate yourself', 400)
    }

    // Verify target user exists and is not banned
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email, account_status')
      .eq('id', body.userId)
      .single()

    if (userError || !targetUser) {
      return errorResponse('User not found', 404)
    }

    // Never allow impersonation of the superuser account
    if (isSuperuser(targetUser.email)) {
      return errorResponse('Cannot impersonate the superuser account', 403)
    }

    // Generate secure token
    const impersonationToken = generateSecureToken()
    const expiresAt = getTokenExpiry()

    // Store token in database
    const { error: insertError } = await supabase
      .from('admin_impersonation_tokens')
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: body.userId,
        token: impersonationToken,
        expires_at: expiresAt.toISOString()
      })

    if (insertError) {
      console.error('Failed to create impersonation token:', insertError)
      return errorResponse('Failed to create impersonation token', 500)
    }

    // Log admin action
    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: body.userId,
      action: 'impersonate_user',
      details: {
        targetEmail: targetUser.email,
        expiresAt: expiresAt.toISOString()
      }
    })

    // Generate URL for new tab
    // The URL will be handled by the impersonate.js page
    // Prefer explicit baseUrl from request body, then origin header, then fallback
    const baseUrl = body.baseUrl || req.headers.get('origin') || 'https://magpipe.ai'
    const impersonateUrl = `${baseUrl}/impersonate?token=${impersonationToken}`

    return successResponse({
      success: true,
      url: impersonateUrl,
      expiresAt: expiresAt.toISOString(),
      targetUser: {
        id: targetUser.id,
        email: targetUser.email
      }
    })
  } catch (error) {
    console.error('Error in admin-impersonate:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
