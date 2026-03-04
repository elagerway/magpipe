/**
 * Admin Directories API
 * CRUD operations for directory submission tracker
 *
 * Actions:
 * - list_directories: Get all directory submissions
 * - create_directory: Add a new directory entry
 * - update_directory: Update fields by ID
 * - delete_directory: Delete by ID
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Require admin auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    const token = authHeader.replace('Bearer ', '')
    await requireAdmin(supabase, token)

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'list_directories':
        return await handleListDirectories(supabase)
      case 'create_directory':
        return await handleCreateDirectory(supabase, body)
      case 'update_directory':
        return await handleUpdateDirectory(supabase, body)
      case 'delete_directory':
        return await handleDeleteDirectory(supabase, body)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error('Error in admin-directories-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

async function handleListDirectories(supabase: any) {
  const { data, error } = await supabase
    .from('directory_submissions')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return errorResponse('Failed to list directories: ' + error.message, 500)
  return successResponse({ directories: data })
}

async function handleCreateDirectory(supabase: any, body: any) {
  const { directory_name, directory_url, submit_url, cost, priority, notes } = body
  if (!directory_name || !directory_url) {
    return errorResponse('directory_name and directory_url are required')
  }

  const { data, error } = await supabase
    .from('directory_submissions')
    .insert({
      directory_name,
      directory_url,
      submit_url: submit_url || null,
      cost: cost || 'Free',
      priority: priority || 'medium',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return errorResponse('Failed to create directory: ' + error.message, 500)
  return successResponse({ directory: data })
}

async function handleUpdateDirectory(supabase: any, body: any) {
  const { id, ...updates } = body
  if (!id) return errorResponse('Missing directory id')

  // Remove action from updates
  delete updates.action

  // If status changed to submitted, set submitted_at
  if (updates.status === 'submitted' && !updates.submitted_at) {
    updates.submitted_at = new Date().toISOString()
  }
  // If status changed to approved/live, set approved_at
  if ((updates.status === 'approved' || updates.status === 'live') && !updates.approved_at) {
    updates.approved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('directory_submissions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update directory: ' + error.message, 500)
  return successResponse({ directory: data })
}

async function handleDeleteDirectory(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('Missing directory id')

  const { error } = await supabase
    .from('directory_submissions')
    .delete()
    .eq('id', id)

  if (error) return errorResponse('Failed to delete directory: ' + error.message, 500)
  return successResponse({ deleted: true })
}
