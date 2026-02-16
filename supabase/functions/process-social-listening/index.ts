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
  published_at?: string
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

    // Parse optional platforms filter from request body
    let requestedPlatforms: string[] = []
    try {
      const body = await req.json()
      if (body.platforms && Array.isArray(body.platforms)) {
        requestedPlatforms = body.platforms
      }
    } catch { /* empty body is fine */ }

    const scanReddit = requestedPlatforms.length === 0 || requestedPlatforms.includes('reddit')
    const scanHN = requestedPlatforms.length === 0 || requestedPlatforms.includes('hackernews')
    const scanGoogle = requestedPlatforms.length === 0 || requestedPlatforms.includes('google')

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
    const platformsScanned: string[] = []

    // Search each keyword across selected platforms
    for (const kw of keywords) {
      const keyword = kw.keyword

      // Reddit (via Serper site:reddit.com or Reddit OAuth)
      if (scanReddit && (Deno.env.get('SERPER_API_KEY') || Deno.env.get('REDDIT_CLIENT_ID'))) {
        if (!platformsScanned.includes('reddit')) platformsScanned.push('reddit')
        try {
          const redditResults = await searchReddit(keyword)
          allResults.push(...redditResults)
        } catch (e: any) {
          console.error(`Reddit error for "${keyword}":`, e.message)
          errors.push(`Reddit/${keyword}: ${e.message}`)
        }
        await sleep(500)
      }

      // HackerNews
      if (scanHN) {
        if (!platformsScanned.includes('hackernews')) platformsScanned.push('hackernews')
        try {
          const hnResults = await searchHackerNews(keyword)
          allResults.push(...hnResults)
        } catch (e: any) {
          console.error(`HN error for "${keyword}":`, e.message)
          errors.push(`HN/${keyword}: ${e.message}`)
        }
        await sleep(500)
      }

      // Google (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID)
      if (scanGoogle && Deno.env.get('SERPER_API_KEY')) {
        if (!platformsScanned.includes('google')) platformsScanned.push('google')
        try {
          const googleResults = await searchGoogle(keyword)
          allResults.push(...googleResults)
        } catch (e: any) {
          console.error(`Google error for "${keyword}":`, e.message)
          errors.push(`Google/${keyword}: ${e.message}`)
        }
        await sleep(500)
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

    // Deduplicate within batch (same result can match multiple keywords)
    const seen = new Set<string>()
    const uniqueResults = newResults.filter(r => {
      const key = `${r.platform}:${r.external_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    console.log(`${uniqueResults.length} unique new results after dedup`)

    // Insert new results
    if (uniqueResults.length > 0) {
      const { error: insertError } = await supabase
        .from('social_listening_results')
        .upsert(uniqueResults.map(r => ({
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
          published_at: r.published_at || null,
          status: 'new',
          found_at: new Date().toISOString(),
        })), { onConflict: 'platform,external_id', ignoreDuplicates: true })

      if (insertError) {
        console.error('Insert error:', insertError)
        errors.push(`DB insert: ${insertError.message}`)
      }

      // Send email digest
      try {
        await sendEmailDigest(uniqueResults)
      } catch (e: any) {
        console.error('Email digest error:', e.message)
        errors.push(`Email: ${e.message}`)
      }

      // Ping admin notification
      try {
        await sendAdminPing(uniqueResults.length)
      } catch (e: any) {
        console.error('Admin notification error:', e.message)
        errors.push(`Notification: ${e.message}`)
      }
    }

    return jsonResponse({
      success: true,
      total_found: allResults.length,
      new_results: uniqueResults.length,
      platforms_scanned: platformsScanned,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Error in process-social-listening:', error)
    return jsonResponse({ error: error.message }, 500)
  }
})


// --- Platform Search Functions ---

async function searchReddit(keyword: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get('SERPER_API_KEY')
  if (!apiKey) {
    console.log('Reddit: SERPER_API_KEY not configured, skipping')
    return []
  }

  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: `${keyword} site:reddit.com`,
      num: 10,
      tbs: 'qdr:w',
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Serper/Reddit HTTP ${resp.status}: ${text.substring(0, 200)}`)
  }

  const data = await resp.json()
  return (data?.organic || [])
    .filter((item: any) => item.link?.includes('reddit.com'))
    .map((item: any) => {
      const subMatch = item.link.match(/reddit\.com\/r\/([^/]+)/)
      return {
        platform: 'reddit' as const,
        external_id: `reddit-${btoa(item.link).substring(0, 40)}`,
        url: item.link,
        title: item.title || 'Untitled',
        snippet: (item.snippet || '').substring(0, 500),
        subreddit: subMatch ? `r/${subMatch[1]}` : undefined,
        keyword_matched: keyword,
        published_at: parseRelativeDate(item.date),
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
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: hit.title || 'Untitled',
    snippet: (hit.story_text || '').substring(0, 500),
    author: hit.author,
    score: hit.points,
    comment_count: hit.num_comments,
    keyword_matched: keyword,
    published_at: hit.created_at_i ? new Date(hit.created_at_i * 1000).toISOString() : undefined,
  }))
}


async function searchGoogle(keyword: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get('SERPER_API_KEY')

  if (!apiKey) {
    console.log('Google: SERPER_API_KEY not configured, skipping')
    return []
  }

  const results: SearchResult[] = []

  // Web search
  const resp = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: keyword, num: 10, tbs: 'qdr:w' }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Serper API HTTP ${resp.status}: ${text.substring(0, 200)}`)
  }

  const data = await resp.json()
  for (const item of (data?.organic || [])) {
    const meta = parseUrlMeta(item.link)
    results.push({
      platform: 'google' as const,
      external_id: `google-${btoa(item.link).substring(0, 40)}`,
      url: item.link,
      title: item.title || 'Untitled',
      snippet: (item.snippet || '').substring(0, 500),
      subreddit: meta.subreddit,
      author: meta.author,
      keyword_matched: keyword,
      published_at: parseRelativeDate(item.date),
    })
  }

  // Video search (YouTube, etc.)
  try {
    const vResp = await fetch('https://google.serper.dev/videos', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: keyword, num: 5, tbs: 'qdr:w' }),
    })
    if (vResp.ok) {
      const vData = await vResp.json()
      for (const v of (vData?.videos || [])) {
        results.push({
          platform: 'google' as const,
          external_id: `google-${btoa(v.link).substring(0, 40)}`,
          url: v.link,
          title: v.title || 'Untitled',
          snippet: [v.channel, v.duration, v.source].filter(Boolean).join(' · '),
          author: v.channel || undefined,
          keyword_matched: keyword,
          published_at: parseRelativeDate(v.date),
        })
      }
    }
  } catch (e: any) {
    console.error('Serper videos error:', e.message)
  }

  return results
}

/** Extract subreddit, author, or channel from known URL patterns */
function parseUrlMeta(url: string): { subreddit?: string; author?: string } {
  try {
    const u = new URL(url)
    // Reddit: extract subreddit
    const redditMatch = u.pathname.match(/^\/r\/([^/]+)/)
    if (u.hostname.includes('reddit.com') && redditMatch) {
      return { subreddit: `r/${redditMatch[1]}` }
    }
    // YouTube: extract channel from URL if present
    const ytChannel = u.pathname.match(/^\/@([^/]+)/) || u.pathname.match(/^\/channel\/([^/]+)/)
    if (u.hostname.includes('youtube.com') && ytChannel) {
      return { author: ytChannel[1] }
    }
  } catch { /* ignore */ }
  return {}
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

/** Parse Serper relative dates like "4 days ago", "1 hour ago", "Feb 12, 2026" */
function parseRelativeDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined
  // Try relative format: "X days/hours/minutes ago"
  const relMatch = dateStr.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i)
  if (relMatch) {
    const n = parseInt(relMatch[1])
    const unit = relMatch[2].toLowerCase()
    const now = new Date()
    if (unit === 'minute') now.setMinutes(now.getMinutes() - n)
    else if (unit === 'hour') now.setHours(now.getHours() - n)
    else if (unit === 'day') now.setDate(now.getDate() - n)
    else if (unit === 'week') now.setDate(now.getDate() - n * 7)
    else if (unit === 'month') now.setMonth(now.getMonth() - n)
    return now.toISOString()
  }
  // Try absolute date
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()
  return undefined
}

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
