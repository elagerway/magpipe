import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface ConsumeTokenRequest {
  token: string
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

    // Parse request body
    const body: ConsumeTokenRequest = await req.json()

    if (!body.token) {
      return errorResponse('Token is required', 400)
    }

    // Look up token
    const { data: tokenData, error: tokenError } = await supabase
      .from('admin_impersonation_tokens')
      .select(`
        id,
        admin_user_id,
        target_user_id,
        expires_at,
        used_at
      `)
      .eq('token', body.token)
      .single()

    if (tokenError || !tokenData) {
      return errorResponse('Invalid or expired token', 401)
    }

    // Check if token was already used
    if (tokenData.used_at) {
      return errorResponse('Token has already been used', 401)
    }

    // Check if token is expired
    const expiresAt = new Date(tokenData.expires_at)
    if (expiresAt < new Date()) {
      return errorResponse('Token has expired', 401)
    }

    // Get target user info
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id, email, name, account_status')
      .eq('id', tokenData.target_user_id)
      .single()

    if (userError || !targetUser) {
      return errorResponse('Target user not found', 404)
    }

    // Check if target user's account is still active
    if (targetUser.account_status === 'banned') {
      return errorResponse('Cannot impersonate a banned user', 403)
    }

    // Get admin user info for the banner
    const { data: adminUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', tokenData.admin_user_id)
      .single()

    // Mark token as used
    await supabase
      .from('admin_impersonation_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    // Generate a session for the target user using Supabase Admin API
    // We'll use the admin.generateLink to create a magic link that auto-signs in
    // Use baseUrl from request or origin header to construct proper redirect
    const baseUrl = body.baseUrl || req.headers.get('origin') || 'https://magpipe.ai'
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: {
        redirectTo: `${baseUrl}/`
      }
    })

    if (linkError || !linkData) {
      console.error('Failed to generate session link:', linkError)
      return errorResponse('Failed to create session', 500)
    }

    // Log the impersonation consumption
    await logAdminAction(supabase, {
      adminUserId: tokenData.admin_user_id,
      targetUserId: tokenData.target_user_id,
      action: 'impersonation_started',
      details: {
        targetEmail: targetUser.email,
        adminEmail: adminUser?.email
      }
    })

    // Return the OTP token for client-side session creation
    // The client will verify this OTP using sessionStorage to avoid affecting other tabs
    return successResponse({
      success: true,
      // OTP verification data - client uses this with verifyOtp()
      otpToken: linkData.properties?.email_otp,
      email: targetUser.email,
      // User info for the impersonation banner
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name
      },
      impersonatedBy: {
        email: adminUser?.email
      }
    })
  } catch (error) {
    console.error('Error in admin-consume-impersonation:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
