import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  requireAdmin,
  logAdminAction,
  corsHeaders,
  handleCors,
  errorResponse,
  successResponse
} from '../_shared/admin-auth.ts'

interface UserListParams {
  page?: number
  limit?: number
  search?: string
  plan?: 'free' | 'pro' | 'all'
  status?: 'active' | 'suspended' | 'banned' | 'all'
  role?: 'user' | 'admin' | 'support' | 'all'
  sortBy?: 'created_at' | 'email' | 'name'
  sortOrder?: 'asc' | 'desc'
}

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

    // Parse query parameters
    const url = new URL(req.url)
    const params: UserListParams = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: Math.min(parseInt(url.searchParams.get('limit') || '20'), 100),
      search: url.searchParams.get('search') || undefined,
      plan: (url.searchParams.get('plan') as UserListParams['plan']) || 'all',
      status: (url.searchParams.get('status') as UserListParams['status']) || 'all',
      role: (url.searchParams.get('role') as UserListParams['role']) || 'all',
      sortBy: (url.searchParams.get('sortBy') as UserListParams['sortBy']) || 'created_at',
      sortOrder: (url.searchParams.get('sortOrder') as UserListParams['sortOrder']) || 'desc'
    }

    // Build query
    let query = supabase
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
        created_at,
        updated_at
      `, { count: 'exact' })

    // Apply filters
    if (params.search) {
      query = query.or(`email.ilike.%${params.search}%,name.ilike.%${params.search}%,phone_number.ilike.%${params.search}%`)
    }

    if (params.plan && params.plan !== 'all') {
      query = query.eq('plan', params.plan)
    }

    if (params.status && params.status !== 'all') {
      query = query.eq('account_status', params.status)
    }

    if (params.role && params.role !== 'all') {
      query = query.eq('role', params.role)
    }

    // Apply sorting
    query = query.order(params.sortBy || 'created_at', {
      ascending: params.sortOrder === 'asc'
    })

    // Apply pagination
    const offset = ((params.page || 1) - 1) * (params.limit || 20)
    query = query.range(offset, offset + (params.limit || 20) - 1)

    // Execute query
    const { data: users, count, error } = await query

    if (error) {
      console.error('Database error:', error)
      return errorResponse('Failed to fetch users', 500)
    }

    // Log admin action
    await logAdminAction(supabase, {
      adminUserId: adminUser.id,
      action: 'list_users',
      details: {
        search: params.search,
        filters: { plan: params.plan, status: params.status, role: params.role },
        page: params.page,
        resultCount: users?.length || 0
      }
    })

    return successResponse({
      users: users || [],
      pagination: {
        page: params.page || 1,
        limit: params.limit || 20,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / (params.limit || 20))
      }
    })
  } catch (error) {
    console.error('Error in admin-list-users:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
