/**
 * Knowledge Source Service
 * Handles management of knowledge sources for the AI agent
 */

import { supabase } from '../lib/supabase.js';

/**
 * Add a new knowledge source from URL
 * @param {string} url - The URL to fetch knowledge from
 * @param {string} syncPeriod - How often to sync: '24h', '7d', '1mo', '3mo'
 * @param {Object} authHeaders - Optional auth headers for protected pages (e.g., { Authorization: 'Bearer ...' })
 * @param {Object} crawlOptions - Optional crawl options for sitemap/recursive modes
 * @param {string} crawlOptions.crawlMode - 'single', 'sitemap', or 'recursive'
 * @param {number} crawlOptions.maxPages - Max pages to crawl (1-500, default 100)
 * @param {number} crawlOptions.crawlDepth - Max depth for recursive crawl (1-5, default 2)
 * @param {boolean} crawlOptions.respectRobotsTxt - Whether to respect robots.txt (default true)
 * @returns {Promise<{id: string, url: string, title: string, status: string, chunk_count: number, crawl_mode: string}>}
 */
export async function addSource(url, syncPeriod = '7d', authHeaders = null, crawlOptions = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (url.length > 2048) {
    throw new Error('URL too long (max 2048 characters)');
  }

  const validPeriods = ['24h', '7d', '1mo', '3mo'];
  if (!validPeriods.includes(syncPeriod)) {
    throw new Error('Invalid sync period. Must be one of: 24h, 7d, 1mo, 3mo');
  }

  // Validate crawl options
  const validCrawlModes = ['single', 'sitemap', 'recursive'];
  const crawlMode = crawlOptions.crawlMode || 'single';
  if (!validCrawlModes.includes(crawlMode)) {
    throw new Error('Invalid crawl mode. Must be one of: single, sitemap, recursive');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const requestBody = {
      url,
      sync_period: syncPeriod,
      crawl_mode: crawlMode,
    };

    // Include auth headers if provided
    if (authHeaders && typeof authHeaders === 'object') {
      requestBody.auth_headers = authHeaders;
    }

    // Include crawl options for non-single modes
    if (crawlMode !== 'single') {
      if (crawlOptions.maxPages !== undefined) {
        requestBody.max_pages = Math.min(Math.max(crawlOptions.maxPages, 1), 500);
      }
      if (crawlOptions.crawlDepth !== undefined && crawlMode === 'recursive') {
        requestBody.crawl_depth = Math.min(Math.max(crawlOptions.crawlDepth, 1), 5);
      }
      if (crawlOptions.respectRobotsTxt !== undefined) {
        requestBody.respect_robots_txt = crawlOptions.respectRobotsTxt;
      }
    }

    const response = await supabase.functions.invoke('knowledge-source-add', {
      body: requestBody,
    });

    const { data, error } = response;
    console.log('knowledge-source-add full response:', response);
    console.log('knowledge-source-add data:', data);
    console.log('knowledge-source-add error:', error);

    // Check for errors - supabase.functions.invoke puts error response body in data when status is non-2xx
    const errorMsg = error?.message || data?.error || '';

    if (error || data?.error) {
      console.log('Function error detected:', errorMsg);

      if (errorMsg.includes('401') || errorMsg.includes('Invalid authorization')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('Maximum 50')) {
        throw new Error('You have reached the maximum of 50 knowledge sources.');
      } else if (errorMsg.includes('Could not access') || errorMsg.includes('Could not fetch')) {
        throw new Error(errorMsg || 'Unable to access that URL. Please check the link and try again.');
      } else if (errorMsg.includes('Content too large')) {
        throw new Error('The page content is too large (max 1MB).');
      } else if (errorMsg.includes('No content extracted')) {
        throw new Error('No readable content found at that URL.');
      } else if (errorMsg.includes('Could not parse sitemap')) {
        throw new Error('Could not find or parse the sitemap. Please check the URL.');
      } else if (errorMsg.includes('No crawlable URLs')) {
        throw new Error('No pages found to crawl. Please check the URL and try again.');
      } else if (errorMsg) {
        // Show the actual error message from the function
        throw new Error(errorMsg);
      } else {
        throw new Error('Failed to add knowledge source. Please try again.');
      }
    }

    // Check if data is valid
    if (!data || !data.id) {
      console.error('Invalid response from knowledge-source-add:', data);
      throw new Error('Invalid response from server. Please try again.');
    }

    return {
      id: data.id,
      url: data.url,
      title: data.title,
      description: data.description,
      status: data.status,
      chunkCount: data.chunk_count,
      syncPeriod: data.sync_period,
      crawlMode: data.crawl_mode,
      crawlJobId: data.crawl_job_id,
      pagesDiscovered: data.pages_discovered,
      pagesCrawled: data.pages_crawled,
    };

  } catch (error) {
    console.error('Add knowledge source error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Get crawl job status for a knowledge source
 * @param {string} sourceId - The knowledge source ID
 * @returns {Promise<{status: string, pages_discovered: number, pages_crawled: number, pages_failed: number, current_url: string}>}
 */
export async function getCrawlStatus(sourceId) {
  if (!sourceId) {
    throw new Error('Source ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('crawl_jobs')
      .select('status, pages_discovered, pages_crawled, pages_failed, current_url, errors')
      .eq('knowledge_source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No crawl job found - likely a single page source
        return null;
      }
      throw error;
    }

    return {
      status: data.status,
      pagesDiscovered: data.pages_discovered,
      pagesCrawled: data.pages_crawled,
      pagesFailed: data.pages_failed,
      currentUrl: data.current_url,
      errors: data.errors || [],
    };

  } catch (error) {
    console.error('Get crawl status error:', error);
    throw new Error('Failed to get crawl status');
  }
}

/**
 * Get all parsed/crawled URLs for a knowledge source
 * @param {string} sourceId - The knowledge source ID
 * @returns {Promise<Array<{url: string, title: string, chunkCount: number}>>}
 */
export async function getCrawledUrls(sourceId) {
  if (!sourceId) {
    throw new Error('Source ID is required');
  }

  try {
    // Get unique URLs from knowledge_chunks metadata
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('metadata')
      .eq('knowledge_source_id', sourceId);

    if (error) throw error;

    // Extract unique URLs with their titles and count chunks per URL
    const urlMap = new Map();

    for (const chunk of chunks || []) {
      const sourceUrl = chunk.metadata?.source_url;
      const pageTitle = chunk.metadata?.page_title || 'Untitled';

      if (sourceUrl) {
        if (urlMap.has(sourceUrl)) {
          urlMap.get(sourceUrl).chunkCount++;
        } else {
          urlMap.set(sourceUrl, {
            url: sourceUrl,
            title: pageTitle,
            chunkCount: 1,
          });
        }
      }
    }

    return Array.from(urlMap.values());

  } catch (error) {
    console.error('Get crawled URLs error:', error);
    throw new Error('Failed to get crawled URLs');
  }
}

/**
 * List all knowledge sources for current user
 * @returns {Promise<Array<{id: string, url: string, title: string, status: string, chunk_count: number, created_at: string}>>}
 */
export async function listSources() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('knowledge-source-list');

    if (error) {
      if (error.message?.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else {
        throw new Error('Failed to load knowledge sources.');
      }
    }

    return data.sources || [];

  } catch (error) {
    console.error('List knowledge sources error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Delete a knowledge source
 * @param {string} id - The knowledge source ID
 * @returns {Promise<{success: boolean, deleted_chunks: number}>}
 */
export async function deleteSource(id) {
  if (!id) {
    throw new Error('Knowledge source ID is required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new Error('Invalid knowledge source ID');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('knowledge-source-delete', {
      body: { id },
    });

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        throw new Error('Knowledge source not found or you do not have permission to delete it.');
      } else {
        throw new Error('Failed to delete knowledge source.');
      }
    }

    return {
      success: data.success,
      deletedChunks: data.deleted_chunks,
    };

  } catch (error) {
    console.error('Delete knowledge source error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Get knowledge source details
 * @param {string} id - The knowledge source ID
 * @returns {Promise<object>}
 */
export async function getSourceDetails(id) {
  if (!id) {
    throw new Error('Knowledge source ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Knowledge source not found');
      }
      throw error;
    }

    return data;

  } catch (error) {
    console.error('Get source details error:', error);
    throw new Error('Failed to load knowledge source details');
  }
}

/**
 * Add a manual knowledge source (paste content or upload file)
 * @param {string} title - Title for the knowledge source
 * @param {Object} options - Options for the source
 * @param {string} options.content - Text content (for manual paste)
 * @param {string} options.fileData - Base64 encoded file data
 * @param {string} options.fileType - 'pdf' or 'text'
 * @param {string} options.fileName - Original file name
 * @param {string} options.url - Optional URL reference
 * @returns {Promise<{id: string, title: string, status: string, chunk_count: number}>}
 */
export async function addManualSource(title, options = {}) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required');
  }

  const { content, fileData, fileType, fileName, url } = options;

  if (!content && !fileData) {
    throw new Error('Either content or file is required');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    const requestBody = { title };

    if (fileData && fileType) {
      requestBody.file_data = fileData;
      requestBody.file_type = fileType;
      requestBody.file_name = fileName;
    } else {
      requestBody.content = content;
    }

    if (url) {
      requestBody.url = url;
    }

    const response = await supabase.functions.invoke('knowledge-source-manual', {
      body: requestBody,
    });

    const { data, error } = response;
    console.log('knowledge-source-manual response:', { data, error });

    const errorMsg = error?.message || data?.error || '';

    if (error || data?.error) {
      if (errorMsg.includes('401') || errorMsg.includes('Invalid authorization')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('Maximum 50')) {
        throw new Error('You have reached the maximum of 50 knowledge sources.');
      } else if (errorMsg.includes('Content must be')) {
        throw new Error(errorMsg);
      } else if (errorMsg.includes('Failed to parse PDF')) {
        throw new Error(errorMsg);
      } else if (errorMsg) {
        throw new Error(errorMsg);
      } else {
        throw new Error('Failed to add knowledge source. Please try again.');
      }
    }

    if (!data || !data.id) {
      throw new Error('Invalid response from server. Please try again.');
    }

    return {
      id: data.id,
      url: data.url,
      title: data.title,
      description: data.description,
      status: data.status,
      chunkCount: data.chunk_count,
      crawlMode: data.crawl_mode,
    };

  } catch (error) {
    console.error('Add manual source error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}
