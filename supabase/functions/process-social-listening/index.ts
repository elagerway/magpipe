/**
 * Process Social Listening
 * Scans Reddit, HackerNews, and Google for keyword mentions.
 * Called by pg_cron every 6 hours or manually from admin UI.
 * Deploy with: npx supabase functions deploy process-social-listening --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const USER_AGENT = 'Magpipe-SocialListening/1.0'
const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60

interface SearchResult {
  platform: 'reddit' | 'hackernews' | 'google'
  external_id: string
  url: string
  title: string
  snippet: string
  subreddit?: string
  author?: string
  score?: number
  comment_count?: number
  keyword_matched: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Load active keywords
    const { data: keywords, error: kwError } = await supabase
      .from('social_listening_keywords')
      .select('keyword, category')
      .eq('is_active', true)

    if (kwError) {
      console.error('Failed to load keywords:', kwError)
      return jsonResponse({ error: 'Failed to load keywords' }, 500)
    }

    if (!keywords || keywords.length === 0) {
      return jsonResponse({ message: 'No active keywords configured' })
    }

    const allResults: SearchResult[] = []
    const errors: string[] = []

    // Search each keyword across all platforms
    for (const kw of keywords) {
      const keyword = kw.keyword

      // Reddit
      try {
        const redditResults = await searchReddit(keyword)
        allResults.push(...redditResults)
      } catch (e: any) {
        console.error(`Reddit error for "${keyword}":`, e.message)
        errors.push(`Reddit/${keyword}: ${e.message}`)
      }

      // Rate limit pause
      await sleep(500)

      // HackerNews
      try {
        const hnResults = await searchHackerNews(keyword)
        allResults.push(...hnResults)
      } catch (e: any) {
        console.error(`HN error for "${keyword}":`, e.message)
        errors.push(`HN/${keyword}: ${e.message}`)
      }

      await sleep(500)

      // Google
      try {
        const googleResults = await searchGoogle(keyword)
        allResults.push(...googleResults)
      } catch (e: any) {
        console.error(`Google error for "${keyword}":`, e.message)
        errors.push(`Google/${keyword}: ${e.message}`)
      }

      // Pause between keyword groups
      await sleep(1000)
    }

    console.log(`Found ${allResults.length} total results across all platforms`)

    // Deduplicate against existing results
    const newResults: SearchResult[] = []
    for (const result of allResults) {
      const { data: existing } = await supabase
        .from('social_listening_results')
        .select('id')
        .eq('platform', result.platform)
        .eq('external_id', result.external_id)
        .maybeSingle()

      if (!existing) {
        newResults.push(result)
      }
    }

    console.log(`${newResults.length} new results after dedup`)

    // Insert new results
    if (newResults.length > 0) {
      const { error: insertError } = await supabase
        .from('social_listening_results')
        .insert(newResults.map(r => ({
          platform: r.platform,
          external_id: r.external_id,
          url: r.url,
          title: r.title,
          snippet: r.snippet || null,
          subreddit: r.subreddit || null,
          author: r.author || null,
          score: r.score || null,
          comment_count: r.comment_count || null,
          keyword_matched: r.keyword_matched,
          status: 'new',
          found_at: new Date().toISOString(),
        })))

      if (insertError) {
        console.error('Insert error:', insertError)
        errors.push(`DB insert: ${insertError.message}`)
      }

      // Send email digest
      try {
        await sendEmailDigest(newResults)
      } catch (e: any) {
        console.error('Email digest error:', e.message)
        errors.push(`Email: ${e.message}`)
      }

      // Ping admin notification
      try {
        await sendAdminPing(newResults.length)
      } catch (e: any) {
        console.error('Admin notification error:', e.message)
        errors.push(`Notification: ${e.message}`)
      }
    }

    return jsonResponse({
      success: true,
      total_found: allResults.length,
      new_results: newResults.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in process-social-listening:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


// --- Platform Search Functions ---

async function searchReddit(keyword: string): Promise<SearchResult[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=10&t=week`
  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!resp.ok) {
    throw new Error(`Reddit HTTP ${resp.status}`)
  }

  const data = await resp.json()
  const posts = data?.data?.children || []

  return posts.map((child: any) => {
    const post = child.data
    return {
      platform: 'reddit' as const,
      external_id: post.id,
      url: `https://reddit.com${post.permalink}`,
      title: post.title,
      snippet: (post.selftext || '').substring(0, 500),
      subreddit: post.subreddit_name_prefixed,
      author: post.author,
      score: post.score,
      comment_count: post.num_comments,
      keyword_matched: keyword,
    }
  })
}


async function searchHackerNews(keyword: string): Promise<SearchResult[]> {
  const oneWeekAgo = Math.floor(Date.now() / 1000) - ONE_WEEK_SECONDS
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(keyword)}&tags=story&numericFilters=created_at_i>${oneWeekAgo}&hitsPerPage=10`

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`HN HTTP ${resp.status}`)
  }

  const data = await resp.json()
  const hits = data?.hits || []

  return hits.map((hit: any) => ({
    platform: 'hackernews' as const,
    external_id: hit.objectID,
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: hit.title || 'Untitled',
    snippet: (hit.story_text || '').substring(0, 500),
    author: hit.author,
    score: hit.points,
    comment_count: hit.num_comments,
    keyword_matched: keyword,
  }))
}


async function searchGoogle(keyword: string): Promise<SearchResult[]> {
  try {
    // Search for recent results (past day)
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbs=qdr:d&num=5`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!resp.ok) {
      throw new Error(`Google HTTP ${resp.status}`)
    }

    const html = await resp.text()
    return parseGoogleResults(html, keyword)
  } catch (e: any) {
    // Google blocking is expected — gracefully skip
    console.log(`Google search skipped for "${keyword}": ${e.message}`)
    return []
  }
}


function parseGoogleResults(html: string, keyword: string): SearchResult[] {
  const results: SearchResult[] = []

  // Extract result blocks - look for <a href="/url?q=..." pattern
  const linkRegex = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  let index = 0

  while ((match = linkRegex.exec(html)) !== null && index < 5) {
    const url = decodeURIComponent(match[1])
    // Skip Google's own URLs
    if (url.includes('google.com') || url.includes('accounts.google') || url.startsWith('/')) continue

    // Extract title (strip HTML tags)
    const title = match[2].replace(/<[^>]*>/g, '').trim()
    if (!title || title.length < 5) continue

    // Try to extract a snippet from nearby text
    const snippetStart = match.index + match[0].length
    const snippetBlock = html.substring(snippetStart, snippetStart + 500)
    const snippetMatch = snippetBlock.match(/<span[^>]*>([\s\S]*?)<\/span>/i)
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 300)
      : ''

    results.push({
      platform: 'google',
      external_id: `google-${Buffer.from(url).toString('base64').substring(0, 40)}`,
      url,
      title,
      snippet,
      keyword_matched: keyword,
    })
    index++
  }

  return results
}


// --- Notification Functions ---

async function sendEmailDigest(results: SearchResult[]) {
  const postmarkApiKey = Deno.env.get('POSTMARK_API_KEY')
  if (!postmarkApiKey) {
    console.log('POSTMARK_API_KEY not configured, skipping email digest')
    return
  }

  // Group results by platform
  const grouped: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.platform]) grouped[r.platform] = []
    grouped[r.platform].push(r)
  }

  const platformLabels: Record<string, string> = {
    reddit: 'Reddit',
    hackernews: 'Hacker News',
    google: 'Google',
  }

  // Build HTML email
  let htmlSections = ''
  for (const [platform, items] of Object.entries(grouped)) {
    htmlSections += `
      <h3 style="color: #333; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
        ${platformLabels[platform] || platform} (${items.length})
      </h3>
    `
    for (const item of items) {
      htmlSections += `
        <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px;">
          <a href="${escapeHtml(item.url)}" style="color: #2563eb; font-weight: 600; text-decoration: none; font-size: 14px;">
            ${escapeHtml(item.title)}
          </a>
          ${item.subreddit ? `<span style="color: #6b7280; font-size: 12px; margin-left: 8px;">${escapeHtml(item.subreddit)}</span>` : ''}
          ${item.snippet ? `<p style="color: #555; font-size: 13px; margin: 6px 0 0; line-height: 1.4;">${escapeHtml(item.snippet.substring(0, 200))}</p>` : ''}
          <div style="margin-top: 6px; font-size: 12px; color: #9ca3af;">
            Keyword: <strong>${escapeHtml(item.keyword_matched)}</strong>
            ${item.score !== undefined ? ` | Score: ${item.score}` : ''}
            ${item.comment_count !== undefined ? ` | Comments: ${item.comment_count}` : ''}
            ${item.author ? ` | By: ${escapeHtml(item.author)}` : ''}
          </div>
        </div>
      `
    }
  }

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto;">
      <h2 style="color: #111; margin-bottom: 4px;">Social Listening Alert</h2>
      <p style="color: #6b7280; margin-top: 0; font-size: 14px;">${results.length} new mention${results.length !== 1 ? 's' : ''} found</p>
      ${htmlSections}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 12px;">
      <p style="color: #9ca3af; font-size: 11px;">
        Magpipe Social Listening | <a href="https://magpipe.ai/admin?tab=monitor" style="color: #6b7280;">View in Admin</a>
      </p>
    </div>
  `

  // Build plain text
  let textBody = `Social Listening Alert: ${results.length} new mentions\n\n`
  for (const [platform, items] of Object.entries(grouped)) {
    textBody += `--- ${platformLabels[platform] || platform} (${items.length}) ---\n`
    for (const item of items) {
      textBody += `${item.title}\n  ${item.url}\n  Keyword: ${item.keyword_matched}\n\n`
    }
  }

  // Send to admin email from notification config
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data: config } = await supabase
    .from('admin_notification_config')
    .select('email_address')
    .eq('id', '00000000-0000-0000-0000-000000000100')
    .single()

  const toEmail = config?.email_address || 'erik@snapsonic.com'

  const resp = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': postmarkApiKey,
    },
    body: JSON.stringify({
      From: 'notifications@snapsonic.com',
      To: toEmail,
      Subject: `[Social Listening] ${results.length} new mention${results.length !== 1 ? 's' : ''} found`,
      TextBody: textBody,
      HtmlBody: htmlBody,
      MessageStream: 'outbound',
    }),
  })

  if (!resp.ok) {
    throw new Error(`Postmark failed: HTTP ${resp.status}`)
  }

  console.log('Email digest sent successfully')
}


async function sendAdminPing(count: number) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  await fetch(`${supabaseUrl}/functions/v1/admin-send-notification`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: 'social_listening',
      title: 'Social Listening Alert',
      body: `${count} new mention${count !== 1 ? 's' : ''} found across Reddit, HackerNews, and Google. Check the Monitor tab in Admin.`,
    }),
  })
}


// --- Helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
