/**
 * Link Extractor
 * Extracts and normalizes links from HTML content
 */

import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts';

export interface ExtractedLink {
  url: string;
  text: string;
  depth: number;
}

export interface LinkExtractionOptions {
  baseUrl: string;
  currentDepth: number;
  sameDomainOnly?: boolean;
  excludePatterns?: RegExp[];
  includePatterns?: RegExp[];
}

/**
 * Extract links from HTML content
 */
export function extractLinks(html: string, options: LinkExtractionOptions): ExtractedLink[] {
  const {
    baseUrl,
    currentDepth,
    sameDomainOnly = true,
    excludePatterns = [],
    includePatterns = [],
  } = options;

  const baseUrlParsed = new URL(baseUrl);
  const baseDomain = baseUrlParsed.hostname;
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc) return links;

    const anchors = doc.querySelectorAll('a[href]');

    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href) return;

      const normalizedUrl = normalizeUrl(href, baseUrl);
      if (!normalizedUrl) return;

      // Skip if already seen
      if (seenUrls.has(normalizedUrl)) return;
      seenUrls.add(normalizedUrl);

      // Skip non-http(s) protocols
      const parsedUrl = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;

      // Check same domain restriction
      if (sameDomainOnly && parsedUrl.hostname !== baseDomain) return;

      // Check exclude patterns
      if (excludePatterns.some(pattern => pattern.test(normalizedUrl))) return;

      // Check include patterns (if specified, URL must match at least one)
      if (includePatterns.length > 0 && !includePatterns.some(pattern => pattern.test(normalizedUrl))) return;

      // Skip common non-content URLs
      if (shouldSkipUrl(normalizedUrl)) return;

      links.push({
        url: normalizedUrl,
        text: anchor.textContent?.trim() || '',
        depth: currentDepth + 1,
      });
    });

    return links;
  } catch (error) {
    console.error('Link extraction error:', error);
    return links;
  }
}

/**
 * Normalize a URL relative to a base URL
 * Removes fragments, normalizes trailing slashes, handles relative URLs
 */
export function normalizeUrl(href: string, baseUrl: string): string | null {
  try {
    // Handle empty or invalid href
    if (!href || href.trim() === '') return null;
    if (href.startsWith('#')) return null;  // Fragment only
    if (href.startsWith('javascript:')) return null;
    if (href.startsWith('mailto:')) return null;
    if (href.startsWith('tel:')) return null;
    if (href.startsWith('data:')) return null;

    // Resolve relative URL against base
    const absoluteUrl = new URL(href, baseUrl);

    // Remove fragment
    absoluteUrl.hash = '';

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid',
    ];
    trackingParams.forEach(param => absoluteUrl.searchParams.delete(param));

    // Normalize path: remove trailing slash (except for root)
    let path = absoluteUrl.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    absoluteUrl.pathname = path;

    return absoluteUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Check if a URL should be skipped (non-content URLs)
 */
function shouldSkipUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Skip file downloads
  const skipExtensions = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.rar', '.tar', '.gz', '.7z',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
    '.css', '.js', '.json', '.xml', '.rss', '.atom',
  ];

  for (const ext of skipExtensions) {
    if (lowerUrl.endsWith(ext)) return true;
  }

  // Skip common non-content paths
  const skipPatterns = [
    '/login', '/logout', '/signin', '/signout', '/signup', '/register',
    '/admin', '/wp-admin', '/wp-login',
    '/cart', '/checkout', '/account', '/my-account',
    '/search', '/tag/', '/category/', '/author/',
    '/feed', '/rss', '/atom',
    '/print/', '/email/', '/share/',
    '?replytocom=', '#comment', '#respond',
  ];

  for (const pattern of skipPatterns) {
    if (lowerUrl.includes(pattern)) return true;
  }

  return false;
}

/**
 * Filter links to only include those within a specific path prefix
 */
export function filterLinksByPath(links: ExtractedLink[], pathPrefix: string): ExtractedLink[] {
  const normalizedPrefix = pathPrefix.endsWith('/') ? pathPrefix : pathPrefix + '/';

  return links.filter(link => {
    try {
      const url = new URL(link.url);
      const path = url.pathname;
      return path === pathPrefix || path.startsWith(normalizedPrefix);
    } catch {
      return false;
    }
  });
}

/**
 * Get the domain from a URL
 */
export function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs are on the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  const domain1 = getDomain(url1);
  const domain2 = getDomain(url2);
  return domain1 !== null && domain1 === domain2;
}
