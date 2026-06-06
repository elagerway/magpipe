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

interface CreateUserRequest {
  email: string
  name: string
  password: string
  role?: 'user' | 'viewer' | 'editor' | 'support' | 'admin' | 'god'
  phone_number?: string | null
  phone_verified?: boolean
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

    // Account creation is an admin-only action (support cannot create accounts)
    if (!isAdmin(adminUser)) {
      return errorResponse('Only admins can create user accounts', 403)
    }

    const body: CreateUserRequest = await req.json()

    const email = (body.email || '').trim().toLowerCase()
    const name = (body.name || '').trim()
    const password = body.password || ''
    const role = body.role || 'user'

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('Valid email is required', 400)
    }
    if (!name) {
      return errorResponse('Name is required', 400)
    }
    if (!password || password.length < 8) {
      return errorResponse('Password must be at least 8 characters', 400)
    }

    // Role authorization: only god can assign god role
    if (role === 'god' && !isGod(adminUser)) {
      return errorResponse('Only god can assign god role', 403)
    }

    // Protect the superuser account from being recreated
    if (isSuperuser(email) && !isGod(adminUser)) {
      return errorResponse('Cannot create the superuser account', 403)
    }

    // Optional phone validation
    let phoneNumber: string | null = null
    if (body.phone_number) {
      phoneNumber = body.phone_number.trim()
      if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
        return errorResponse('Invalid phone number format (E.164 required)', 400)
      }
    }

    // Create the auth user — email_confirm:true so they can sign in immediately
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    })

    if (createError || !created?.user) {
      console.error('Create user error:', createError)
      return errorResponse(createError?.message || 'Failed to create user', 400)
    }

    const newUserId = created.user.id

    // The handle_new_user trigger creates the public.users row with name from metadata.
    // Apply any follow-up fields (role, phone) that the trigger doesn't handle.
    const followUpUpdates: Record<string, unknown> = {}
    if (role !== 'user') followUpUpdates.role = role
    if (phoneNumber) {
      followUpUpdates.phone_number = phoneNumber
      followUpUpdates.phone_verified = !!body.phone_verified
    }

    if (Object.keys(followUpUpdates).length > 0) {
      // The handle_new_user trigger inserts the public.users row; wait briefly
      // until it's committed before applying follow-up fields. A silent no-op
      // here would lose role/phone data.
      let rowExists = false
      for (let attempt = 0; attempt < 10 && !rowExists; attempt++) {
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('id', newUserId)
          .maybeSingle()
        if (data) {
          rowExists = true
          break
        }
        await new Promise((r) => setTimeout(r, 200))
      }

      if (!rowExists) {
        return errorResponse(
          `User created but profile row did not appear; ${Object.keys(followUpUpdates).join(', ')} not applied`,
          500
        )
      }

      followUpUpdates.updated_at = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('users')
        .update(followUpUpdates)
        .eq('id', newUserId)

      if (updateError) {
        console.error('Follow-up update error:', updateError)
        return errorResponse(
          `User created but failed to apply ${Object.keys(followUpUpdates).join(', ')}: ${updateError.message}`,
          500
        )
      }
    }

    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: newUserId,
      action: 'create_user',
      details: {
        email,
        name,
        role,
        phone_number: phoneNumber,
        phone_verified: !!body.phone_verified
      }
    })

    const { data: newUser } = await supabase
      .from('users')
      .select('id, email, name, role, plan, account_status, phone_number, phone_verified, created_at')
      .eq('id', newUserId)
      .single()

    return successResponse({
      success: true,
      message: `User ${email} created successfully`,
      user: newUser
    })
  } catch (error) {
    console.error('Error in admin-create-user:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
