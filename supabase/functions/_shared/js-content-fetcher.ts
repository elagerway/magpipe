/**
 * Shared content fetching utilities for knowledge base pipeline.
 * Handles JS-rendered pages via Firecrawl → Jina Reader → Microlink cascade.
 * Used by: knowledge-source-add, knowledge-source-sync, knowledge-crawl-process
 */

import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts';

/** Extract readable content from HTML using DOMParser */
export function extractContent(html: string): { title: string; description: string; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }

  const titleEl = doc.querySelector('title');
  const title = titleEl?.textContent?.trim() || 'Untitled';

  const metaDesc = doc.querySelector('meta[name="description"]');
  const description = metaDesc?.getAttribute('content')?.trim() || '';

  const body = doc.querySelector('body');
  let text = '';

  if (body) {
    const scripts = body.querySelectorAll('script, style, nav, header, footer');
    scripts.forEach(el => el.remove());
    text = body.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
  }

  return { title, description, text };
}

/** Paragraph-based text chunking (500-1000 tokens ~= 2000-4000 characters) */
export function chunkText(text: string, maxChunkSize = 3000): string[] {
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

/**
 * Fetch content using Firecrawl API (500 free credits/month, great JS rendering).
 * Forwards auth headers via Firecrawl's headers param for authenticated sources.
 */
export async function fetchWithFirecrawl(
  url: string,
  authHeaders?: Record<string, string>
): Promise<{ title: string; text: string } | null> {
  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      console.log('Firecrawl API key not configured, skipping');
      return null;
    }

    console.log('Trying Firecrawl for JS-rendered page:', url);

    const bodyPayload: Record<string, unknown> = {
      url,
      formats: ['markdown'],
    };

    // Forward auth headers so Firecrawl can access authenticated pages
    if (authHeaders && Object.keys(authHeaders).length > 0) {
      bodyPayload.headers = authHeaders;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(60000),
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

/** Fetch content using Jina Reader API (free, handles JS-rendered pages) */
export async function fetchWithJinaReader(url: string): Promise<{ title: string; text: string } | null> {
  try {
    console.log('Trying Jina Reader for JS-rendered page:', url);
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log('Jina Reader failed:', response.status, response.statusText);
      return null;
    }

    const content = await response.text();

    const titleMatch = content.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    const textContent = content
      .replace(/^Title:.*$/m, '')
      .replace(/^URL Source:.*$/m, '')
      .replace(/^Warning:.*$/m, '')
      .replace(/^Markdown Content:$/m, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
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

/** Fetch content using Microlink API (free 250 req/day, handles JS rendering) */
export async function fetchWithMicrolink(url: string): Promise<{ title: string; text: string } | null> {
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

    if (data.data.text) {
      text = data.data.text;
    }

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
 * Orchestrator: fetch page content with JS rendering fallback cascade.
 *
 * 1. Direct fetch() + DOMParser extractContent
 * 2. If no text → Firecrawl (with forwarded auth headers) → Jina → Microlink
 *
 * @param url - The URL to fetch
 * @param fetchHeaders - Headers for direct fetch (User-Agent + any auth headers)
 * @param authHeaders - Auth-only headers to forward to Firecrawl (without User-Agent)
 * @returns Extracted content or null if all methods fail
 */
/**
 * JS rendering fallback cascade only (Firecrawl → Jina → Microlink).
 * Use when you already attempted a direct fetch and got no content.
 */
export async function fetchJsFallbacks(
  url: string,
  authHeaders?: Record<string, string>,
): Promise<{ title: string; description: string; text: string } | null> {
  let fallbackResult = await fetchWithFirecrawl(url, authHeaders);

  if (!fallbackResult) {
    fallbackResult = await fetchWithJinaReader(url);
  }

  if (!fallbackResult) {
    fallbackResult = await fetchWithMicrolink(url);
  }

  if (fallbackResult) {
    return {
      title: fallbackResult.title,
      description: fallbackResult.text.substring(0, 200),
      text: fallbackResult.text,
    };
  }

  return null;
}

export async function fetchPageContent(
  url: string,
  fetchHeaders?: Record<string, string>,
  authHeaders?: Record<string, string>,
): Promise<{ title: string; description: string; text: string; usedFallback: boolean } | null> {
  const headers = fetchHeaders || { 'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)' };

  // Step 1: Direct fetch + DOMParser
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`Direct fetch failed for ${url}: ${response.status} ${response.statusText}`);
    } else {
      const html = await response.text();

      if (html.length > 1024 * 1024) {
        console.log(`Content too large for ${url}: ${html.length} bytes`);
        return null;
      }

      const extracted = extractContent(html);
      const chunks = chunkText(extracted.text);

      if (chunks.length > 0) {
        return { ...extracted, usedFallback: false };
      }

      console.log('No content from direct fetch, trying JS rendering fallbacks for:', url);
    }
  } catch (error) {
    console.log(`Direct fetch error for ${url}:`, error.message);
  }

  // Step 2: JS rendering fallback cascade
  const fallback = await fetchJsFallbacks(url, authHeaders);
  if (fallback) {
    return { ...fallback, usedFallback: true };
  }

  return null;
}
