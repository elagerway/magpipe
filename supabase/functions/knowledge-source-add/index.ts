import { createClient } from 'npm:@supabase/supabase-js@2';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts';
import { parseSitemapWithIndex, discoverSitemap } from '../_shared/sitemap-parser.ts';
import { extractLinks } from '../_shared/link-extractor.ts';
import { fetchRobotsTxt, isUrlAllowed } from '../_shared/robots-parser.ts';
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface AddSourceRequest {
  url: string;
  sync_period?: '24h' | '7d' | '1mo' | '3mo';
  auth_headers?: Record<string, string>;
  crawl_mode?: 'single' | 'sitemap' | 'recursive';
  max_pages?: number;
  crawl_depth?: number;
  respect_robots_txt?: boolean;
}

// Simple text chunking (500-1000 tokens ~= 2000-4000 characters)
function chunkText(text: string, maxChunkSize = 3000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Extract readable content from HTML
function extractContent(html: string): { title: string; description: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }

  // Extract title
  const titleEl = doc.querySelector('title');
  const title = titleEl?.textContent?.trim() || 'Untitled';

  // Extract meta description
  const metaDesc = doc.querySelector('meta[name="description"]');
  const description = metaDesc?.getAttribute('content')?.trim() || '';

  // Extract main content (simple approach - get all text from body)
  const body = doc.querySelector('body');
  let text = '';

  if (body) {
    // Remove script and style tags
    const scripts = body.querySelectorAll('script, style, nav, header, footer');
    scripts.forEach(el => el.remove());

    text = body.textContent || '';
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
  }

  return { title, description, text };
}

// Calculate next sync time based on period
function calculateNextSync(syncPeriod: string): Date {
  const nextSync = new Date();
  switch (syncPeriod) {
    case '24h':
      nextSync.setHours(nextSync.getHours() + 24);
      break;
    case '7d':
      nextSync.setDate(nextSync.getDate() + 7);
      break;
    case '1mo':
      nextSync.setMonth(nextSync.getMonth() + 1);
      break;
    case '3mo':
      nextSync.setMonth(nextSync.getMonth() + 3);
      break;
  }
  return nextSync;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: AddSourceRequest = await req.json();

    // Validate URL
    if (!body.url || typeof body.url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.url.length > 2048) {
      return new Response(
        JSON.stringify({ error: 'URL too long (max 2048 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(body.url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: 'URL must start with http:// or https://' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate sync_period if provided
    const validPeriods = ['24h', '7d', '1mo', '3mo'];
    const syncPeriod = body.sync_period || '7d';
    if (!validPeriods.includes(syncPeriod)) {
      return new Response(
        JSON.stringify({ error: 'Invalid sync_period. Must be one of: 24h, 7d, 1mo, 3mo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate crawl mode
    const validCrawlModes = ['single', 'sitemap', 'recursive'];
    const crawlMode = body.crawl_mode || 'single';
    if (!validCrawlModes.includes(crawlMode)) {
      return new Response(
        JSON.stringify({ error: 'Invalid crawl_mode. Must be one of: single, sitemap, recursive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate max_pages (1-500)
    const maxPages = Math.min(Math.max(body.max_pages || 100, 1), 500);

    // Validate crawl_depth (1-5)
    const crawlDepth = Math.min(Math.max(body.crawl_depth || 2, 1), 5);

    // Respect robots.txt (default true)
    const respectRobotsTxt = body.respect_robots_txt !== false;

    // Check user's knowledge source count (max 50)
    const { count } = await supabase
      .from('knowledge_sources')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 knowledge sources allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build fetch headers
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)',
    };
    if (body.auth_headers && typeof body.auth_headers === 'object') {
      Object.assign(fetchHeaders, body.auth_headers);
    }

    // Handle different crawl modes
    if (crawlMode === 'single') {
      // SINGLE MODE: Process immediately (existing behavior)
      return await handleSingleMode(supabase, user, body.url, syncPeriod, fetchHeaders);
    } else {
      // SITEMAP or RECURSIVE MODE: Create crawl job for async processing
      return await handleAsyncCrawl(
        supabase,
        user,
        body.url,
        crawlMode,
        syncPeriod,
        maxPages,
        crawlDepth,
        respectRobotsTxt,
        fetchHeaders
      );
    }

  } catch (error) {
    console.error('Error in knowledge-source-add:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Fetch content using Jina Reader API (handles JS-rendered pages)
 */
async function fetchWithJinaReader(url: string): Promise<{ title: string; text: string } | null> {
  try {
    console.log('Trying Jina Reader for JS-rendered page:', url);
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(30000), // Longer timeout for JS rendering
    });

    if (!response.ok) {
      console.log('Jina Reader failed:', response.status, response.statusText);
      return null;
    }

    const content = await response.text();

    // Parse the Jina response - it returns markdown with Title and content
    const titleMatch = content.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    // Remove metadata lines and get the actual content
    const textContent = content
      .replace(/^Title:.*$/m, '')
      .replace(/^URL Source:.*$/m, '')
      .replace(/^Warning:.*$/m, '')
      .replace(/^Markdown Content:$/m, '')
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove image markdown
      .trim();

    if (textContent.length < 100) {
      console.log('Jina Reader returned too little content:', textContent.length);
      return null;
    }

    console.log('Jina Reader extracted content:', textContent.length, 'chars');
    return { title, text: textContent };
  } catch (error) {
    console.error('Jina Reader error:', error);
    return null;
  }
}

/**
 * Fetch content using Microlink API (free 250 req/day, handles JS rendering)
 */
async function fetchWithMicrolink(url: string): Promise<{ title: string; text: string } | null> {
  try {
    console.log('Trying Microlink for JS-rendered page:', url);
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=true`;

    const response = await fetch(microlinkUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log('Microlink failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'success' || !data.data) {
      console.log('Microlink returned error:', data.status, data.message);
      return null;
    }

    const title = data.data.title || 'Untitled';
    let text = data.data.description || '';

    // Microlink's free tier doesn't include full page content, but we can
    // try to get any available text from the metadata
    if (data.data.text) {
      text = data.data.text;
    }

    // If we got reasonable content, return it
    if (text.length >= 50) {
      console.log('Microlink extracted content:', text.length, 'chars');
      return { title, text };
    }

    console.log('Microlink returned insufficient content:', text.length);
    return null;
  } catch (error) {
    console.error('Microlink error:', error);
    return null;
  }
}

/**
 * Fetch content using Firecrawl API (500 free credits/month, great JS rendering)
 */
async function fetchWithFirecrawl(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.log('Firecrawl API key not configured, skipping');
      return null;
    }

    console.log('Trying Firecrawl for JS-rendered page:', url);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
      }),
      signal: AbortSignal.timeout(60000), // Longer timeout for full rendering
    });

    if (!response.ok) {
      console.log('Firecrawl failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.success || !data.data) {
      console.log('Firecrawl returned error:', data.error);
      return null;
    }

    const title = data.data.metadata?.title || 'Untitled';
    const text = data.data.markdown || data.data.content || '';

    if (text.length >= 100) {
      console.log('Firecrawl extracted content:', text.length, 'chars');
      return { title, text };
    }

    console.log('Firecrawl returned insufficient content:', text.length);
    return null;
  } catch (error) {
    console.error('Firecrawl error:', error);
    return null;
  }
}

/**
 * Handle single page mode (existing immediate processing)
 */
async function handleSingleMode(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  url: string,
  syncPeriod: string,
  fetchHeaders: Record<string, string>
): Promise<Response> {
  // Fetch URL
  let htmlContent: string;
  let useJinaFallback = false;

  try {
    const fetchResponse = await fetch(url, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(10000),
    });

    if (!fetchResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Could not access that URL (${fetchResponse.status} ${fetchResponse.statusText})` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    htmlContent = await fetchResponse.text();

    if (htmlContent.length > 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Content too large (max 1MB)' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Could not fetch URL: ${error.message}` }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Extract content
  let { title, description, text } = extractContent(htmlContent);
  let chunks = chunkText(text);

  // If no content extracted, try JS rendering fallbacks in order
  if (chunks.length === 0) {
    console.log('No content from direct fetch, trying JS rendering fallbacks');

    // Try Firecrawl first (best quality, if API key configured)
    let fallbackResult = await fetchWithFirecrawl(url);

    // Try Jina Reader second
    if (!fallbackResult) {
      fallbackResult = await fetchWithJinaReader(url);
    }

    // Try Microlink last (free, no key needed)
    if (!fallbackResult) {
      fallbackResult = await fetchWithMicrolink(url);
    }

    if (fallbackResult) {
      title = fallbackResult.title;
      text = fallbackResult.text;
      description = text.substring(0, 200);
      chunks = chunkText(text);
      useJinaFallback = true; // Keep the flag for logging
    }
  }

  if (chunks.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'No content extracted from URL. This may be a JavaScript-rendered page. Try using "Paste Content" to manually add the content.'
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Extracted ${chunks.length} chunks from ${url}${useJinaFallback ? ' (via Jina Reader)' : ''}`)

  // Create knowledge source record
  const { data: source, error: sourceError } = await supabase
    .from('knowledge_sources')
    .insert({
      user_id: user.id,
      url,
      title,
      description: description || text.substring(0, 200),
      sync_period: syncPeriod,
      sync_status: 'syncing',
      crawl_mode: 'single',
    })
    .select()
    .single();

  if (sourceError) throw sourceError;

  // Generate embeddings for each chunk
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const chunkRecords = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: chunk,
      }),
    });

    if (!embeddingResponse.ok) {
      console.error('OpenAI embedding error:', await embeddingResponse.text());
      throw new Error('Failed to generate embeddings');
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    chunkRecords.push({
      knowledge_source_id: source.id,
      content: chunk,
      embedding,
      chunk_index: i,
      token_count: Math.ceil(chunk.length / 4),
      metadata: { source_url: url, page_title: title },
    });
  }

  // Insert all chunks
  const { error: chunksError } = await supabase
    .from('knowledge_chunks')
    .insert(chunkRecords);

  if (chunksError) throw chunksError;

  const now = new Date();
  const nextSync = calculateNextSync(syncPeriod);

  // Update source with completed status
  const { data: updatedSource } = await supabase
    .from('knowledge_sources')
    .update({
      sync_status: 'completed',
      chunk_count: chunks.length,
      last_synced_at: now.toISOString(),
      next_sync_at: nextSync.toISOString(),
    })
    .eq('id', source.id)
    .select()
    .single();

  // Log action
  await supabase.from('admin_action_logs').insert({
    user_id: user.id,
    action_type: 'add_knowledge_source',
    description: `Added knowledge source: ${title}`,
    new_value: { url, chunk_count: chunks.length, crawl_mode: 'single' },
    source: 'web_chat',
    success: true,
  });

  return new Response(
    JSON.stringify({
      id: updatedSource.id,
      url: updatedSource.url,
      title: updatedSource.title,
      description: updatedSource.description,
      status: updatedSource.sync_status,
      chunk_count: updatedSource.chunk_count,
      sync_period: updatedSource.sync_period,
      crawl_mode: 'single',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * Handle sitemap or recursive crawl mode (async processing)
 */
async function handleAsyncCrawl(
  supabase: ReturnType<typeof createClient>,
  user: { id: string },
  url: string,
  crawlMode: 'sitemap' | 'recursive',
  syncPeriod: string,
  maxPages: number,
  crawlDepth: number,
  respectRobotsTxt: boolean,
  fetchHeaders: Record<string, string>
): Promise<Response> {
  // Initialize URL queue based on mode
  let urlQueue: Array<{ url: string; depth: number }> = [];
  let robotsRules = {};
  let pagesDiscovered = 0;

  // Fetch robots.txt if respecting it
  if (respectRobotsTxt) {
    try {
      robotsRules = await fetchRobotsTxt(url);
    } catch (error) {
      console.error('Error fetching robots.txt:', error);
    }
  }

  if (crawlMode === 'sitemap') {
    // SITEMAP MODE: Discover and parse sitemap
    let sitemapUrl = url;

    // If URL doesn't look like a sitemap, try to discover it
    if (!url.toLowerCase().includes('sitemap')) {
      const discovered = await discoverSitemap(url);
      if (discovered) {
        sitemapUrl = discovered;
      } else {
        // Try common sitemap location
        sitemapUrl = new URL('/sitemap.xml', url).toString();
      }
    }

    // Parse sitemap and get URLs
    const sitemapResult = await parseSitemapWithIndex(sitemapUrl, maxPages, fetchHeaders);

    if (sitemapResult.urls.length === 0 && sitemapResult.errors.length > 0) {
      return new Response(
        JSON.stringify({ error: `Could not parse sitemap: ${sitemapResult.errors[0]}` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter URLs by robots.txt if enabled
    for (const sitemapUrl of sitemapResult.urls) {
      if (respectRobotsTxt && !isUrlAllowed(sitemapUrl.loc, robotsRules as any)) {
        continue;
      }
      urlQueue.push({ url: sitemapUrl.loc, depth: 0 });
    }

    pagesDiscovered = urlQueue.length;

  } else {
    // RECURSIVE MODE: Start with the provided URL
    urlQueue.push({ url, depth: 0 });
    pagesDiscovered = 1;
  }

  if (urlQueue.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No crawlable URLs found' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get title from first URL for the source record
  let title = 'Crawled Source';
  let description = '';
  try {
    const firstResponse = await fetch(urlQueue[0].url, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(10000),
    });
    if (firstResponse.ok) {
      const html = await firstResponse.text();
      const extracted = extractContent(html);
      title = extracted.title || title;
      description = extracted.description || extracted.text.substring(0, 200);

      // For recursive mode, extract links from first page
      if (crawlMode === 'recursive') {
        const links = extractLinks(html, {
          baseUrl: urlQueue[0].url,
          currentDepth: 0,
          sameDomainOnly: true,
        });

        // Add discovered links to queue (respecting depth limit and robots.txt)
        for (const link of links) {
          if (link.depth <= crawlDepth && urlQueue.length < maxPages) {
            if (respectRobotsTxt && !isUrlAllowed(link.url, robotsRules as any)) {
              continue;
            }
            // Check for duplicates
            if (!urlQueue.some(q => q.url === link.url)) {
              urlQueue.push({ url: link.url, depth: link.depth });
            }
          }
        }
        pagesDiscovered = urlQueue.length;
      }
    }
  } catch (error) {
    console.error('Error fetching first URL:', error);
  }

  // Create knowledge source record
  const { data: source, error: sourceError } = await supabase
    .from('knowledge_sources')
    .insert({
      user_id: user.id,
      url,
      title: `${title} (${crawlMode} crawl)`,
      description,
      sync_period: syncPeriod,
      sync_status: 'syncing',
      crawl_mode: crawlMode,
      max_pages: maxPages,
      crawl_depth: crawlDepth,
      respect_robots_txt: respectRobotsTxt,
    })
    .select()
    .single();

  if (sourceError) throw sourceError;

  // Create crawl job for async processing
  const { data: crawlJob, error: jobError } = await supabase
    .from('crawl_jobs')
    .insert({
      knowledge_source_id: source.id,
      status: 'pending',
      pages_discovered: pagesDiscovered,
      pages_crawled: 0,
      pages_failed: 0,
      url_queue: urlQueue,
      processed_urls: [],
      robots_rules: robotsRules,
    })
    .select()
    .single();

  if (jobError) throw jobError;

  // Log action
  await supabase.from('admin_action_logs').insert({
    user_id: user.id,
    action_type: 'add_knowledge_source',
    description: `Started ${crawlMode} crawl: ${title}`,
    new_value: {
      url,
      crawl_mode: crawlMode,
      max_pages: maxPages,
      crawl_depth: crawlDepth,
      pages_discovered: pagesDiscovered,
    },
    source: 'web_chat',
    success: true,
  });

  return new Response(
    JSON.stringify({
      id: source.id,
      url: source.url,
      title: source.title,
      description: source.description,
      status: 'crawling',
      crawl_mode: crawlMode,
      crawl_job_id: crawlJob.id,
      pages_discovered: pagesDiscovered,
      pages_crawled: 0,
      sync_period: source.sync_period,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
