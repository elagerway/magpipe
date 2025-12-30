import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface ConsumeTokenRequest {
  token: string
}

serve(async (req) => {
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
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: {
        redirectTo: '/'
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

    // Return the magic link properties for client-side session creation
    // The client will use these to sign in as the target user
    return successResponse({
      success: true,
      session: {
        // Use the token from the generated link
        access_token: linkData.properties?.hashed_token,
        // Include user info for the impersonation banner
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name
        },
        impersonatedBy: {
          email: adminUser?.email
        }
      },
      // The magic link URL - client can navigate to this or extract the token
      magicLinkUrl: linkData.properties?.action_link
    })
  } catch (error) {
    console.error('Error in admin-consume-impersonation:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
