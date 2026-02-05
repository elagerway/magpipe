/**
 * Sitemap Parser
 * Parses XML and text sitemaps, handles sitemap indexes
 * Uses regex-based parsing for XML (deno_dom doesn't support text/xml)
 */

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface SitemapParseResult {
  urls: SitemapUrl[];
  sitemapUrls: string[];  // Nested sitemaps from sitemap index
  errors: string[];
}

/**
 * Parse a sitemap from URL
 * Handles both XML sitemaps and plain text URL lists
 */
export async function parseSitemap(
  url: string,
  maxUrls = 500,
  fetchHeaders: Record<string, string> = {}
): Promise<SitemapParseResult> {
  const result: SitemapParseResult = {
    urls: [],
    sitemapUrls: [],
    errors: [],
  };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)',
        ...fetchHeaders,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      result.errors.push(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
      return result;
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Determine if XML or plain text
    if (contentType.includes('xml') || text.trim().startsWith('<?xml') || text.trim().startsWith('<')) {
      return parseXmlSitemap(text, maxUrls, result);
    } else {
      return parseTextSitemap(text, maxUrls, result);
    }
  } catch (error) {
    result.errors.push(`Error fetching sitemap: ${error.message}`);
    return result;
  }
}

/**
 * Extract text content from an XML tag using regex
 */
function extractTagContent(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Parse XML sitemap content using regex (deno_dom doesn't support text/xml)
 */
function parseXmlSitemap(xml: string, maxUrls: number, result: SitemapParseResult): SitemapParseResult {
  try {
    // Check if this is a sitemap index
    if (xml.includes('<sitemapindex') || xml.includes('</sitemapindex>')) {
      // Extract all <sitemap> blocks
      const sitemapRegex = /<sitemap[^>]*>([\s\S]*?)<\/sitemap>/gi;
      let match;
      while ((match = sitemapRegex.exec(xml)) !== null) {
        const sitemapBlock = match[1];
        const loc = extractTagContent(sitemapBlock, 'loc');
        if (loc && isValidUrl(loc)) {
          result.sitemapUrls.push(loc);
        }
      }
      return result;
    }

    // Regular sitemap - extract all <url> blocks
    const urlRegex = /<url[^>]*>([\s\S]*?)<\/url>/gi;
    let match;
    let count = 0;

    while ((match = urlRegex.exec(xml)) !== null && count < maxUrls) {
      const urlBlock = match[1];
      const loc = extractTagContent(urlBlock, 'loc');

      if (!loc || !isValidUrl(loc)) continue;

      const sitemapUrl: SitemapUrl = { loc };

      const lastmod = extractTagContent(urlBlock, 'lastmod');
      if (lastmod) sitemapUrl.lastmod = lastmod;

      const changefreq = extractTagContent(urlBlock, 'changefreq');
      if (changefreq) sitemapUrl.changefreq = changefreq;

      const priority = extractTagContent(urlBlock, 'priority');
      if (priority) sitemapUrl.priority = parseFloat(priority);

      result.urls.push(sitemapUrl);
      count++;
    }

    return result;
  } catch (error) {
    result.errors.push(`XML parsing error: ${error.message}`);
    return result;
  }
}

/**
 * Parse plain text sitemap (one URL per line)
 */
function parseTextSitemap(text: string, maxUrls: number, result: SitemapParseResult): SitemapParseResult {
  const lines = text.split('\n');
  let count = 0;

  for (const line of lines) {
    if (count >= maxUrls) break;

    const url = line.trim();
    if (!url || url.startsWith('#')) continue;  // Skip empty lines and comments

    if (isValidUrl(url)) {
      result.urls.push({ loc: url });
      count++;
    }
  }

  return result;
}

/**
 * Recursively fetch and parse all sitemaps from a sitemap index
 */
export async function parseSitemapWithIndex(
  url: string,
  maxUrls = 500,
  fetchHeaders: Record<string, string> = {}
): Promise<SitemapParseResult> {
  const allUrls: SitemapUrl[] = [];
  const allErrors: string[] = [];
  const processedSitemaps = new Set<string>();
  const sitemapQueue = [url];

  while (sitemapQueue.length > 0 && allUrls.length < maxUrls) {
    const currentUrl = sitemapQueue.shift()!;
    if (processedSitemaps.has(currentUrl)) continue;
    processedSitemaps.add(currentUrl);

    const result = await parseSitemap(currentUrl, maxUrls - allUrls.length, fetchHeaders);

    // Add URLs from this sitemap
    allUrls.push(...result.urls);
    allErrors.push(...result.errors);

    // Queue any nested sitemaps
    for (const nestedUrl of result.sitemapUrls) {
      if (!processedSitemaps.has(nestedUrl)) {
        sitemapQueue.push(nestedUrl);
      }
    }

    // Rate limit between sitemap fetches
    if (sitemapQueue.length > 0) {
      await sleep(500);
    }
  }

  return {
    urls: allUrls.slice(0, maxUrls),
    sitemapUrls: [],  // All nested sitemaps have been processed
    errors: allErrors,
  };
}

/**
 * Try to discover sitemap URL for a domain
 * Checks common locations: /sitemap.xml, /sitemap_index.xml, robots.txt
 */
export async function discoverSitemap(baseUrl: string): Promise<string | null> {
  const parsedUrl = new URL(baseUrl);
  const origin = parsedUrl.origin;

  // Common sitemap locations to check
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/sitemaps.xml`,
  ];

  // Try each candidate
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return url;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Try to find sitemap in robots.txt
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const text = await response.text();
      const sitemapMatch = text.match(/Sitemap:\s*(.+)/i);
      if (sitemapMatch && sitemapMatch[1]) {
        const sitemapUrl = sitemapMatch[1].trim();
        if (isValidUrl(sitemapUrl)) {
          return sitemapUrl;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
