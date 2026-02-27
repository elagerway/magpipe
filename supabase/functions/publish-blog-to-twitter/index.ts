/**
 * Publish Blog Post to Twitter/X
 *
 * Uses OAuth 2.0 Bearer tokens (with auto-refresh) to post tweets.
 *
 * Two modes:
 * - auto_batch: Called by pg_cron, tweets all untweeted published posts
 * - single: Called by admin UI or admin-blog-api for one specific post
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const TWITTER_CLIENT_ID = Deno.env.get('TWITTER_CLIENT_ID')!
const TWITTER_CLIENT_SECRET = Deno.env.get('TWITTER_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BLOG_BASE_URL = 'https://magpipe.ai/blog'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()
    const { mode, post_id } = body

    if (mode === 'single' && post_id) {
      // Single post mode — tweet one specific post
      const { data: post, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, content, status, tweeted_at')
        .eq('id', post_id)
        .single()

      if (error || !post) {
        return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404, headers: corsHeaders })
      }

      if (post.status !== 'published') {
        return new Response(JSON.stringify({ error: 'Post must be published before tweeting' }), { status: 400, headers: corsHeaders })
      }

      const result = await tweetPost(supabase, post)
      return new Response(JSON.stringify(result), { status: result.error ? 500 : 200, headers: corsHeaders })

    } else if (mode === 'auto_batch') {
      // Batch mode — tweet all untweeted published posts
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('id, slug, title, excerpt, content, status')
        .eq('status', 'published')
        .is('tweeted_at', null)
        .order('published_at', { ascending: true })
        .limit(5)

      if (error) {
        console.error('Failed to fetch untweeted posts:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
      }

      if (!posts || posts.length === 0) {
        return new Response(JSON.stringify({ message: 'No posts to tweet' }), { headers: corsHeaders })
      }

      const results = []
      for (const post of posts) {
        const result = await tweetPost(supabase, post)
        results.push({ post_id: post.id, ...result })
        // Small delay between tweets to be nice to the API
        if (posts.length > 1) await new Promise(r => setTimeout(r, 1000))
      }

      return new Response(JSON.stringify({ results }), { headers: corsHeaders })

    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode. Use "single" with post_id or "auto_batch"' }), {
        status: 400, headers: corsHeaders,
      })
    }
  } catch (err: any) {
    console.error('publish-blog-to-twitter error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
  }
})

/**
 * Strip HTML tags and decode entities for tweet text
 */
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

/**
 * Build tweet text: title + excerpt (or stripped content), truncated, + blog URL
 */
function buildTweetText(post: { title: string; slug: string; excerpt?: string; content?: string }): string {
  const url = `${BLOG_BASE_URL}/${post.slug}`
  // URL always takes 23 chars on Twitter (t.co wrapping) + 2 for \n\n = 25
  const maxTextLen = 280 - 25

  const title = post.title
  let body = post.excerpt || stripHtml(post.content || '')

  // Combine title + body; truncate body if needed to fit total within limit
  // title + \n\n + body
  const titlePart = `${title}\n\n`
  const remaining = maxTextLen - titlePart.length
  if (body.length > remaining) {
    body = body.substring(0, remaining - 1) + '\u2026'
  }

  const text = body ? `${titlePart}${body}` : title

  return `${text}\n\n${url}`
}

/**
 * Get a valid OAuth 2.0 access token, refreshing if expired
 */
async function getAccessToken(supabase: any): Promise<string> {
  const { data: tokenRow, error } = await supabase
    .from('twitter_oauth_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !tokenRow) {
    throw new Error('No Twitter OAuth tokens found. Please connect to X from the admin blog tab.')
  }

  // Check if token is still valid (with 60s buffer)
  const expiresAt = new Date(tokenRow.expires_at)
  if (expiresAt.getTime() - 60000 > Date.now()) {
    return tokenRow.access_token
  }

  // Token expired — refresh it
  console.log('Twitter access token expired, refreshing...')
  const basicAuth = btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`)

  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    console.error('Token refresh failed:', data)
    throw new Error('Failed to refresh Twitter token. Please reconnect to X.')
  }

  const newExpiresAt = new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString()

  // Update stored tokens
  await supabase
    .from('twitter_oauth_tokens')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tokenRow.id)

  return data.access_token
}

/**
 * Post a tweet and update the blog_posts record
 */
async function tweetPost(supabase: any, post: any): Promise<{ success?: boolean; tweet_id?: string; error?: string }> {
  try {
    const accessToken = await getAccessToken(supabase)
    const tweetText = buildTweetText(post)

    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error(`Failed to tweet post ${post.id}:`, data)
      return { error: data.detail || data.title || 'Twitter API error' }
    }

    const tweetId = data.data?.id
    console.log(`Tweeted post ${post.id} -> tweet ${tweetId}`)

    // Update blog post with tweet info
    await supabase
      .from('blog_posts')
      .update({
        tweeted_at: new Date().toISOString(),
        tweet_id: tweetId,
      })
      .eq('id', post.id)

    return { success: true, tweet_id: tweetId }
  } catch (err: any) {
    console.error(`Error tweeting post ${post.id}:`, err)
    return { error: err.message }
  }
}
