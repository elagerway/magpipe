import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors()
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

    // Get user ID from query params
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')

    if (!userId) {
      return errorResponse('userId is required', 400)
    }

    // Fetch user details
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        name,
        role,
        plan,
        account_status,
        phone_number,
        phone_verified,
        suspended_at,
        suspended_reason,
        banned_at,
        banned_reason,
        created_at,
        updated_at
      `)
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return errorResponse('User not found', 404)
    }

    // Fetch user's service numbers
    const { data: serviceNumbers, error: numbersError } = await supabase
      .from('service_numbers')
      .select(`
        id,
        phone_number,
        friendly_name,
        is_active,
        capabilities,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (numbersError) {
      console.error('Error fetching service numbers:', numbersError)
    }

    // Fetch user's agent config
    const { data: agentConfig, error: agentError } = await supabase
      .from('agent_configs')
      .select(`
        id,
        agent_name,
        voice_id,
        voice_ai_stack,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .single()

    if (agentError && agentError.code !== 'PGRST116') {
      console.error('Error fetching agent config:', agentError)
    }

    // Get some statistics
    const { count: callCount } = await supabase
      .from('call_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { count: messageCount } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { count: contactCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Log admin action
    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      targetUserId: userId,
      action: 'view_user_details',
      details: { email: user.email }
    })

    return successResponse({
      user,
      serviceNumbers: serviceNumbers || [],
      agentConfig: agentConfig || null,
      stats: {
        calls: callCount || 0,
        messages: messageCount || 0,
        contacts: contactCount || 0,
        phoneNumbers: serviceNumbers?.length || 0
      }
    })
  } catch (error) {
    console.error('Error in admin-get-user:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
