/**
 * Admin Blog API
 * CRUD operations for blog posts
 *
 * Actions:
 * - list_posts: All posts (admin sees drafts too)
 * - get_post: Single post by ID
 * - create_post: Insert new post (auto-generates slug from title)
 * - update_post: Update fields by ID
 * - delete_post: Delete by ID
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
      case 'list_posts':
        return await handleListPosts(supabase)
      case 'get_post':
        return await handleGetPost(supabase, body)
      case 'create_post':
        return await handleCreatePost(supabase, body)
      case 'update_post':
        return await handleUpdatePost(supabase, body)
      case 'delete_post':
        return await handleDeletePost(supabase, body)
      case 'check_twitter':
        return await handleCheckTwitter(supabase)
      default:
        return errorResponse(`Unknown action: ${action}`)
    }
  } catch (error: any) {
    console.error('Error in admin-blog-api:', error)
    if (error.message?.includes('Unauthorized') || error.message?.includes('Forbidden')) {
      return errorResponse(error.message, 403)
    }
    return errorResponse(error.message || 'Internal server error', 500)
  }
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200)
}

async function handleListPosts(supabase: any) {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, status, author_name, published_at, scheduled_at, updated_at, tags, excerpt, tweeted_at, tweet_id')
    .order('updated_at', { ascending: false })

  if (error) return errorResponse('Failed to list posts: ' + error.message, 500)
  return successResponse({ posts: data })
}

async function handleGetPost(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('Missing post id')

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return errorResponse('Post not found: ' + error.message, 404)
  return successResponse({ post: data })
}

async function handleCreatePost(supabase: any, body: any) {
  const { title, content, meta_description, excerpt, author_name, status, tags, featured_image_url, scheduled_at } = body

  if (!title || !content) return errorResponse('Title and content are required')

  let slug = body.slug || slugify(title)

  // Ensure slug is unique
  const { data: existing } = await supabase
    .from('blog_posts')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`
  }

  // Validate scheduled status
  if (status === 'scheduled' && !scheduled_at) {
    return errorResponse('scheduled_at is required when status is scheduled')
  }

  const postData: Record<string, any> = {
    slug,
    title,
    content,
    meta_description: meta_description || null,
    excerpt: excerpt || null,
    author_name: author_name || 'Magpipe Team',
    status: status || 'draft',
    tags: tags || [],
    featured_image_url: featured_image_url || null,
    scheduled_at: status === 'scheduled' ? scheduled_at : null,
  }

  if (postData.status === 'published') {
    postData.published_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .insert(postData)
    .select()
    .single()

  if (error) return errorResponse('Failed to create post: ' + error.message, 500)

  // Fire-and-forget: tweet if published
  if (data.status === 'published') {
    fireTweet(data.id)
  }

  return successResponse({ post: data })
}

async function handleUpdatePost(supabase: any, body: any) {
  const { id, ...fields } = body
  if (!id) return errorResponse('Missing post id')

  // Remove action from fields
  delete fields.action

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  const allowedFields = [
    'title', 'slug', 'content', 'meta_description', 'excerpt',
    'author_name', 'status', 'tags', 'featured_image_url', 'scheduled_at',
  ]

  for (const field of allowedFields) {
    if (fields[field] !== undefined) {
      updates[field] = fields[field]
    }
  }

  // Validate scheduled status
  if (updates.status === 'scheduled' && !updates.scheduled_at) {
    return errorResponse('scheduled_at is required when status is scheduled')
  }

  // Clear scheduled_at when not in scheduled status
  if (updates.status && updates.status !== 'scheduled') {
    updates.scheduled_at = null
  }

  // Auto-set published_at when publishing for first time
  if (updates.status === 'published') {
    const { data: current } = await supabase
      .from('blog_posts')
      .select('published_at')
      .eq('id', id)
      .single()

    if (!current?.published_at) {
      updates.published_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('blog_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return errorResponse('Failed to update post: ' + error.message, 500)

  // Fire-and-forget: tweet if just published (not already tweeted)
  if (updates.status === 'published' && !data.tweeted_at) {
    fireTweet(data.id)
  }

  return successResponse({ post: data })
}

async function handleCheckTwitter(supabase: any) {
  const { data, error } = await supabase
    .from('twitter_oauth_tokens')
    .select('id, expires_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return successResponse({ connected: false })
  }

  return successResponse({ connected: true })
}

/**
 * Fire-and-forget call to publish-blog-to-twitter for a single post
 */
function fireTweet(postId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  fetch(`${supabaseUrl}/functions/v1/publish-blog-to-twitter`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mode: 'single', post_id: postId }),
  }).catch(err => console.error('Fire-and-forget tweet failed:', err))
}

async function handleDeletePost(supabase: any, body: any) {
  const { id } = body
  if (!id) return errorResponse('Missing post id')

  const { error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('id', id)

  if (error) return errorResponse('Failed to delete post: ' + error.message, 500)
  return successResponse({ success: true })
}
