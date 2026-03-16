/**
 * Publish Blog Post to LinkedIn
 *
 * Posts blog content as an article share to LinkedIn.
 * Auto-refreshes access token if expired.
 *
 * Two modes:
 * - auto_batch: tweets all untweeted published posts
 * - single: posts one specific post by id
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BLOG_BASE_URL = 'https://magpipe.ai/blog'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()
    const { mode, post_id } = body

    if (mode === 'single' && post_id) {
      const { data: post, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, content, status, linkedin_posted_at, featured_image_url, tags')
        .eq('id', post_id)
        .single()

      if (error || !post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404, headers: corsHeaders })
      }

      if (post.status !== 'published') {
        return new Response(JSON.stringify({ error: 'Post must be published before posting to LinkedIn' }), { status: 400, headers: corsHeaders })
      }

      const result = await postToLinkedIn(supabase, post)
      return new Response(JSON.stringify(result), { status: result.error ? 500 : 200, headers: corsHeaders })

    } else if (mode === 'auto_batch') {
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, content, status, featured_image_url, tags')
        .eq('status', 'published')
        .is('linkedin_posted_at', null)
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: true })
        .limit(5)

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
      }

      if (!posts || posts.length === 0) {
        return new Response(JSON.stringify({ message: 'No posts to publish' }), { headers: corsHeaders })
      }

      const results = []
      for (const post of posts) {
        const result = await postToLinkedIn(supabase, post)
        results.push({ post_id: post.id, ...result })
        if (posts.length > 1) await new Promise(r => setTimeout(r, 1000))
      }

      return new Response(JSON.stringify({ results }), { headers: corsHeaders })

    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode. Use "single" with post_id or "auto_batch"' }), {
        status: 400, headers: corsHeaders,
      })
    }
  } catch (err: any) {
    console.error('publish-blog-to-linkedin error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})

async function getAccessToken(supabase: any): Promise<{ token: string; authorUrn: string }> {
  const { data: tokenRow, error } = await supabase
    .from('linkedin_oauth_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !tokenRow) {
    throw new Error('No LinkedIn OAuth tokens found. Please connect to LinkedIn from the admin blog tab.')
  }

  const authorUrn = tokenRow.org_id
    ? `urn:li:organization:${tokenRow.org_id}`
    : `urn:li:person:${tokenRow.person_id}`

  // Check if token is still valid (with 60s buffer)
  const expiresAt = new Date(tokenRow.expires_at)
  if (expiresAt.getTime() - 60000 > Date.now()) {
    return { token: tokenRow.access_token, authorUrn }
  }

  // Token expired — refresh if we have a refresh token
  if (!tokenRow.refresh_token) {
    throw new Error('LinkedIn access token expired and no refresh token available. Please reconnect LinkedIn.')
  }

  console.log('LinkedIn access token expired, refreshing...')

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    console.error('LinkedIn token refresh failed:', data)
    throw new Error('Failed to refresh LinkedIn token. Please reconnect LinkedIn.')
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in || 5183944) * 1000).toISOString()

  await supabase
    .from('linkedin_oauth_tokens')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokenRow.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenRow.id)

  const authorUrn = tokenRow.org_id
    ? `urn:li:organization:${tokenRow.org_id}`
    : `urn:li:person:${tokenRow.person_id}`
  return { token: data.access_token, authorUrn }
}

async function uploadImageToLinkedIn(token: string, authorUrn: string, imageUrl: string): Promise<string | null> {
  try {
    // Step 1: Register upload
    const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: authorUrn,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    })
    const registerData = await registerRes.json()
    if (!registerRes.ok) {
      console.error('Failed to register LinkedIn image upload:', registerData)
      return null
    }
    const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl
    const assetUrn = registerData.value?.asset
    if (!uploadUrl || !assetUrn) return null

    // Step 2: Download image and upload to LinkedIn
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return null
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer())
    const contentType: string = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: imgBytes,
    })
    if (!uploadRes.ok) {
      console.error('LinkedIn image upload failed:', uploadRes.status)
      return null
    }
    return assetUrn
  } catch (e) {
    console.error('Error uploading image to LinkedIn:', e)
    return null
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function postToLinkedIn(supabase: any, post: any): Promise<{ success?: boolean; post_id?: string; error?: string }> {
  try {
    const { token, authorUrn } = await getAccessToken(supabase)

    if (!authorUrn) {
      throw new Error('LinkedIn author URN not found. Please reconnect LinkedIn.')
    }

    const postUrl = `${BLOG_BASE_URL}/${post.slug}`
    const excerpt = post.excerpt || stripHtml(post.content || '').substring(0, 300)
    const hashtags = (post.tags || []).map((t: string) => `#${t.replace(/\s+/g, '')}`).join(' ')
    const commentaryText = hashtags
      ? `${post.title}\n\n${excerpt}\n\n${hashtags}\n\n${postUrl}`
      : `${post.title}\n\n${excerpt}\n\n${postUrl}`

    // Upload featured image if available
    let imageAsset: string | null = null
    if (post.featured_image_url) {
      imageAsset = await uploadImageToLinkedIn(token, authorUrn, post.featured_image_url)
    }

    let shareMediaCategory: string
    let media: any[]
    if (imageAsset) {
      shareMediaCategory = 'IMAGE'
      media = [{ status: 'READY', description: { text: excerpt.substring(0, 256) }, media: imageAsset, title: { text: post.title } }]
    } else {
      shareMediaCategory = 'ARTICLE'
      media = [{ status: 'READY', description: { text: excerpt.substring(0, 256) }, originalUrl: postUrl, title: { text: post.title } }]
    }

    const ugcBody: any = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: commentaryText },
          shareMediaCategory,
          media,
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(ugcBody),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error(`Failed to post to LinkedIn for post ${post.id}:`, data)
      return { error: data.message || data.serviceErrorCode?.toString() || 'LinkedIn API error' }
    }

    // LinkedIn returns the post URN in the X-RestLi-Id header or response body
    const postId = res.headers.get('x-restli-id') || data.id || null
    console.log(`Posted to LinkedIn for post ${post.id} -> ${postId}`)

    await supabase
      .from('blog_posts')
      .update({
        linkedin_posted_at: new Date().toISOString(),
        linkedin_post_id: postId,
      })
      .eq('id', post.id)

    return { success: true, post_id: postId }
  } catch (err: any) {
    console.error(`Error posting to LinkedIn for post ${post.id}:`, err)
    return { error: err.message }
  }
}
