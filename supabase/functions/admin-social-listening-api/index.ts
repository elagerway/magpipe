/**
 * Admin Social Listening API
 * CRUD for social listening results and keyword management.
 * Deploy with: npx supabase functions deploy admin-social-listening-api
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireAdmin, corsHeaders, handleCors, errorResponse, successResponse } from '../_shared/admin-auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)
    await requireAdmin(supabase, authHeader.replace('Bearer ', ''))

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'list_results':   return await handleListResults(supabase, body)
      case 'update_result':  return await handleUpdateResult(supabase, body)
      case 'delete_result':  return await handleDeleteResult(supabase, body)
      case 'get_stats':      return await handleGetStats(supabase)
      case 'run_scan':       return await handleRunScan(body)
      case 'list_keywords':  return await handleListKeywords(supabase)
      case 'add_keyword':    return await handleAddKeyword(supabase, body)
      case 'update_keyword': return await handleUpdateKeyword(supabase, body)
      case 'delete_keyword': return await handleDeleteKeyword(supabase, body)
      default:               return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    console.error('admin-social-listening-api error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})


// --- Result Handlers ---

async function handleListResults(supabase: any, body: any) {
  const { platform, keyword, status, limit = 50, offset = 0 } = body

  let query = supabase
    .from('social_listening_results')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (platform) query = query.eq('platform', platform)
  if (keyword) query = query.eq('keyword_matched', keyword)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query

  if (error) return errorResponse('Failed to list results: ' + error.message, 500)
  return successResponse({ results: data, total: count })
}


async function handleUpdateResult(supabase: any, body: any) {
  const { id, status, notes } = body
  if (!id) return errorResponse('id is required')

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (status) updates.status = status
  if (notes !== undefined) updates.notes = notes

  const { data, error } = await supabase
    .from('social_listening_results')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update result: ' + error.message, 500)
  return successResponse({ result: data })
}


async function handleDeleteResult(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('id is required')

  const { error } = await supabase
    .from('social_listening_results')
    .delete()
    .eq('id', id)

  if (error) return errorResponse('Failed to delete result: ' + error.message, 500)
  return successResponse({ deleted: true })
}


async function handleGetStats(supabase: any) {
  // Total by status
  const { data: statusCounts } = await supabase
    .from('social_listening_results')
    .select('status', { count: 'exact', head: false })

  // Count by platform
  const { data: allResults } = await supabase
    .from('social_listening_results')
    .select('platform, status, found_at')

  const stats = {
    total: allResults?.length || 0,
    new_count: 0,
    seen_count: 0,
    responded_count: 0,
    archived_count: 0,
    reddit_count: 0,
    hackernews_count: 0,
    google_count: 0,
    this_week: 0,
  }

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  if (allResults) {
    for (const r of allResults) {
      // Status counts
      if (r.status === 'new') stats.new_count++
      else if (r.status === 'seen') stats.seen_count++
      else if (r.status === 'responded') stats.responded_count++
      else if (r.status === 'archived') stats.archived_count++

      // Platform counts
      if (r.platform === 'reddit') stats.reddit_count++
      else if (r.platform === 'hackernews') stats.hackernews_count++
      else if (r.platform === 'google') stats.google_count++

      // This week
      if (new Date(r.found_at) >= oneWeekAgo) stats.this_week++
    }
  }

  return successResponse({ stats })
}


async function handleRunScan(body: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const scanBody: Record<string, any> = {}
  if (body.platforms && Array.isArray(body.platforms)) {
    scanBody.platforms = body.platforms
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/process-social-listening`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(scanBody),
  })

  const result = await resp.json()

  if (!resp.ok) {
    return errorResponse('Scan failed: ' + (result.error || 'Unknown error'), 500)
  }

  return successResponse({ scan_result: result })
}


// --- Keyword Handlers ---

async function handleListKeywords(supabase: any) {
  const { data, error } = await supabase
    .from('social_listening_keywords')
    .select('*')
    .order('category', { ascending: true })
    .order('keyword', { ascending: true })

  if (error) return errorResponse('Failed to list keywords: ' + error.message, 500)
  return successResponse({ keywords: data })
}


async function handleAddKeyword(supabase: any, body: any) {
  const { keyword, category = 'general' } = body
  if (!keyword) return errorResponse('keyword is required')

  const { data, error } = await supabase
    .from('social_listening_keywords')
    .insert({ keyword: keyword.trim(), category })
    .select()
    .single()

  if (error) {
    if (error.message?.includes('duplicate') || error.code === '23505') {
      return errorResponse('Keyword already exists')
    }
    return errorResponse('Failed to add keyword: ' + error.message, 500)
  }

  return successResponse({ keyword: data })
}


async function handleUpdateKeyword(supabase: any, body: any) {
  const { id, is_active, category, keyword } = body
  if (!id) return errorResponse('id is required')

  const updates: Record<string, any> = {}
  if (is_active !== undefined) updates.is_active = is_active
  if (category !== undefined) updates.category = category
  if (keyword !== undefined) updates.keyword = keyword.trim()

  const { data, error } = await supabase
    .from('social_listening_keywords')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update keyword: ' + error.message, 500)
  return successResponse({ keyword: data })
}


async function handleDeleteKeyword(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('id is required')

  const { error } = await supabase
    .from('social_listening_keywords')
    .delete()
    .eq('id', id)

  if (error) return errorResponse('Failed to delete keyword: ' + error.message, 500)
  return successResponse({ deleted: true })
}
