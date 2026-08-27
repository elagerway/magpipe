/**
 * Knowledge Crawl Process Worker
 * Processes pending crawl jobs in batches
 * Designed to be called every minute via cron or manual trigger
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractLinks } from '../_shared/link-extractor.ts';
import { isUrlAllowed, RobotsRules } from '../_shared/robots-parser.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { extractContent, chunkText, fetchJsFallbacks } from '../_shared/js-content-fetcher.ts';

// Configuration
const BATCH_SIZE = 10;  // URLs to process per job per run
const MIN_DELAY_MS = 1000;  // Minimum delay between requests to same domain
const REQUEST_TIMEOUT_MS = 10000;
const MAX_CONTENT_SIZE = 1024 * 1024;  // 1MB per page

// Track last request time per domain for rate limiting
const domainLastRequest = new Map<string, number>();

interface UrlQueueItem {
  url: string;
  depth: number;
}

interface CrawlJob {
  id: string;
  knowledge_source_id: string;
  status: string;
  pages_discovered: number;
  pages_crawled: number;
  pages_failed: number;
  current_url: string | null;
  url_queue: UrlQueueItem[];
  processed_urls: string[];
  robots_rules: RobotsRules;
  errors: Array<{ url: string; error: string; timestamp: string }>;
  started_at: string | null;
  knowledge_sources?: {
    crawl_mode: string;
    max_pages: number;
    crawl_depth: number;
    respect_robots_txt: boolean;
    auth_headers: Record<string, string> | null;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Find active crawl jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('crawl_jobs')
      .select(`
        *,
        knowledge_sources!inner (
          crawl_mode,
          max_pages,
          crawl_depth,
          respect_robots_txt,
          auth_headers
        )
      `)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(5);  // Process up to 5 jobs per run

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active crawl jobs', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{
      jobId: string;
      pagesProcessed: number;
      pagesFailed: number;
      completed: boolean;
    }> = [];

    // Process each job
    for (const job of jobs as CrawlJob[]) {
      const result = await processJob(supabase, job, openaiApiKey);
      results.push(result);
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} crawl jobs`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in knowledge-crawl-process:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Process a single crawl job
 */
async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: CrawlJob,
  openaiApiKey: string
): Promise<{ jobId: string; pagesProcessed: number; pagesFailed: number; completed: boolean }> {
  const source = job.knowledge_sources!;
  const robotsRules = job.robots_rules || { allow: [], disallow: [], crawlDelay: null, sitemaps: [] };

  // Mark job as processing if pending
  if (job.status === 'pending') {
    await supabase
      .from('crawl_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id);
  }

  let urlQueue: UrlQueueItem[] = [...(job.url_queue || [])];
  let processedUrls: string[] = [...(job.processed_urls || [])];
  let errors: Array<{ url: string; error: string; timestamp: string }> = [...(job.errors || [])];
  let pagesCrawled = job.pages_crawled || 0;
  let pagesFailed = job.pages_failed || 0;
  let pagesDiscovered = job.pages_discovered || urlQueue.length;
  let pagesProcessedThisRun = 0;

  // Build fetch headers with stored auth from parent source
  const storedAuth = source.auth_headers as Record<string, string> | null;
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)',
  };
  if (storedAuth && typeof storedAuth === 'object') {
    Object.assign(fetchHeaders, storedAuth);
  }

  // Process up to BATCH_SIZE URLs
  while (urlQueue.length > 0 && pagesProcessedThisRun < BATCH_SIZE) {
    // Check if we've hit max pages
    if (pagesCrawled >= source.max_pages) {
      break;
    }

    const item = urlQueue.shift()!;
    const url = item.url;
    const depth = item.depth;

    // Skip if already processed
    if (processedUrls.includes(url)) {
      continue;
    }

    // Mark as being processed
    await supabase
      .from('crawl_jobs')
      .update({ current_url: url })
      .eq('id', job.id);

    try {
      // Check robots.txt
      if (source.respect_robots_txt && !isUrlAllowed(url, robotsRules)) {
        console.log(`Skipping ${url} - blocked by robots.txt`);
        processedUrls.push(url);
        continue;
      }

      // Rate limit before fetching
      const domain = new URL(url).hostname;
      const lastRequest = domainLastRequest.get(domain) || 0;
      const now = Date.now();
      const elapsed = now - lastRequest;
      if (elapsed < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - elapsed);
      }
      domainLastRequest.set(domain, Date.now());

      // For recursive mode, we need raw HTML for link extraction,
      // so do a direct fetch first, then fall back to JS renderers for content
      let html: string | null = null;
      let contentResult: { title: string; text: string; description: string } | null = null;

      try {
        const response = await fetch(url, {
          headers: fetchHeaders,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.ok) {
          html = await response.text();
          if (html.length > MAX_CONTENT_SIZE) {
            throw new Error('Content too large (max 1MB)');
          }
          // Try to extract content from direct HTML
          const extracted = extractContent(html);
          const testChunks = chunkText(extracted.text);
          if (testChunks.length > 0) {
            contentResult = extracted;
          }
        }
      } catch (fetchErr) {
        console.log(`Direct fetch failed for ${url}:`, fetchErr.message);
      }

      // If no content from direct fetch, use JS rendering fallback cascade
      // Use fetchJsFallbacks directly (not fetchPageContent) to avoid re-fetching
      // the same URL we already fetched above
      if (!contentResult) {
        const fallback = await fetchJsFallbacks(url, storedAuth || undefined);
        if (fallback) {
          contentResult = { title: fallback.title, description: fallback.description, text: fallback.text };
        }
      }

      if (!contentResult) {
        throw new Error('No content extracted (tried direct fetch + JS rendering fallbacks)');
      }

      const { title } = contentResult;
      const chunks = chunkText(contentResult.text);

      if (chunks.length > 0) {
        // Generate embeddings and store chunks
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
            const errorText = await embeddingResponse.text();
            console.error('OpenAI embedding error:', errorText);
            throw new Error('Failed to generate embeddings');
          }

          const embeddingData = await embeddingResponse.json();
          const embedding = embeddingData.data[0].embedding;

          // Insert chunk
          await supabase.from('knowledge_chunks').insert({
            knowledge_source_id: job.knowledge_source_id,
            content: chunk,
            embedding,
            chunk_index: pagesCrawled * 100 + i,  // Offset by page to maintain ordering
            token_count: Math.ceil(chunk.length / 4),
            metadata: { source_url: url, page_title: title },
          });
        }
      }

      // For recursive mode, extract links from raw HTML (if we have it)
      if (source.crawl_mode === 'recursive' && depth < source.crawl_depth && html) {
        const links = extractLinks(html, {
          baseUrl: url,
          currentDepth: depth,
          sameDomainOnly: true,
        });

        // Add new links to queue
        for (const link of links) {
          if (link.depth <= source.crawl_depth &&
              !processedUrls.includes(link.url) &&
              !urlQueue.some(q => q.url === link.url)) {
            // Check robots.txt before adding
            if (!source.respect_robots_txt || isUrlAllowed(link.url, robotsRules)) {
              urlQueue.push({ url: link.url, depth: link.depth });
            }
          }
        }
        pagesDiscovered = processedUrls.length + urlQueue.length;
      }

      processedUrls.push(url);
      pagesCrawled++;
      pagesProcessedThisRun++;

    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      errors.push({
        url,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
      processedUrls.push(url);
      pagesFailed++;
      pagesProcessedThisRun++;
    }
  }

  // Determine if job is complete
  const isComplete = urlQueue.length === 0 || pagesCrawled >= source.max_pages;

  // Update job status
  const updateData: Record<string, unknown> = {
    url_queue: urlQueue,
    processed_urls: processedUrls,
    pages_discovered: pagesDiscovered,
    pages_crawled: pagesCrawled,
    pages_failed: pagesFailed,
    errors,
    current_url: null,
    updated_at: new Date().toISOString(),
  };

  if (isComplete) {
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();
  }

  await supabase
    .from('crawl_jobs')
    .update(updateData)
    .eq('id', job.id);

  // Update knowledge source
  if (isComplete) {
    const now = new Date();
    const syncPeriod = await getSyncPeriod(supabase, job.knowledge_source_id);
    const nextSync = calculateNextSync(syncPeriod);

    // Get total chunk count
    const { count: chunkCount } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_source_id', job.knowledge_source_id);

    await supabase
      .from('knowledge_sources')
      .update({
        sync_status: pagesFailed > 0 && pagesCrawled === 0 ? 'failed' : 'completed',
        chunk_count: chunkCount || 0,
        last_synced_at: now.toISOString(),
        next_sync_at: nextSync.toISOString(),
        error_message: pagesFailed > 0 ? `${pagesFailed} pages failed to crawl` : null,
      })
      .eq('id', job.knowledge_source_id);
  } else {
    // Update chunk count incrementally
    const { count: chunkCount } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_source_id', job.knowledge_source_id);

    await supabase
      .from('knowledge_sources')
      .update({ chunk_count: chunkCount || 0 })
      .eq('id', job.knowledge_source_id);
  }

  return {
    jobId: job.id,
    pagesProcessed: pagesProcessedThisRun,
    pagesFailed,
    completed: isComplete,
  };
}

async function getSyncPeriod(
  supabase: ReturnType<typeof createClient>,
  sourceId: string
): Promise<string> {
  const { data } = await supabase
    .from('knowledge_sources')
    .select('sync_period')
    .eq('id', sourceId)
    .single();
  return data?.sync_period || '7d';
}

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
