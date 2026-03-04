/**
 * Blog RSS Feed
 * Public endpoint returning RSS 2.0 XML of published blog posts
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const SITE_URL = 'https://magpipe.ai'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, meta_description, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const items = (posts || []).map((post: any) => {
      const description = post.excerpt || post.meta_description || ''
      const pubDate = post.published_at ? new Date(post.published_at).toUTCString() : ''
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${escapeXml(post.slug)}</link>
      <description>${escapeXml(description)}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${SITE_URL}/blog/${escapeXml(post.slug)}</guid>
    </item>`
    }).join('\n')

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Magpipe Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>AI-powered voice, SMS, and email communication insights from Magpipe.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/functions/v1/blog-rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

    return new Response(rss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error: any) {
    console.error('Error generating RSS:', error)
    return new Response('Internal server error', { status: 500 })
  }
})
