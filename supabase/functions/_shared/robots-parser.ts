/**
 * Robots.txt Parser
 * Parses robots.txt and checks URL allowance
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelay: number | null;
  sitemaps: string[];
}

/**
 * Fetch and parse robots.txt for a domain
 */
export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsRules> {
  const defaultRules: RobotsRules = {
    allow: [],
    disallow: [],
    crawlDelay: null,
    sitemaps: [],
  };

  try {
    const origin = new URL(baseUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;

    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MagpipeBot/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // No robots.txt means everything is allowed
      return defaultRules;
    }

    const text = await response.text();
    return parseRobotsTxt(text);
  } catch (error) {
    console.error('Error fetching robots.txt:', error);
    // On error, allow everything (fail open)
    return defaultRules;
  }
}

/**
 * Parse robots.txt content
 * Extracts rules for all user-agents (uses * rules)
 */
export function parseRobotsTxt(content: string): RobotsRules {
  const rules: RobotsRules = {
    allow: [],
    disallow: [],
    crawlDelay: null,
    sitemaps: [],
  };

  const lines = content.split('\n');
  let currentUserAgent: string | null = null;
  let isRelevantUserAgent = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    // Parse directive
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = trimmedLine.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmedLine.slice(colonIndex + 1).trim();

    switch (directive) {
      case 'user-agent':
        currentUserAgent = value.toLowerCase();
        // We match against * (all bots) or our specific bot name
        isRelevantUserAgent = currentUserAgent === '*' ||
                             currentUserAgent.includes('magpipe') ||
                             currentUserAgent.includes('bot');
        break;

      case 'disallow':
        if (isRelevantUserAgent && value) {
          rules.disallow.push(value);
        }
        break;

      case 'allow':
        if (isRelevantUserAgent && value) {
          rules.allow.push(value);
        }
        break;

      case 'crawl-delay':
        if (isRelevantUserAgent) {
          const delay = parseFloat(value);
          if (!isNaN(delay) && delay > 0) {
            // Cap crawl delay at 10 seconds to prevent abuse
            rules.crawlDelay = Math.min(delay, 10);
          }
        }
        break;

      case 'sitemap':
        // Sitemaps are global, not user-agent specific
        if (value && isValidUrl(value)) {
          rules.sitemaps.push(value);
        }
        break;
    }
  }

  return rules;
}

/**
 * Check if a URL is allowed by robots.txt rules
 * Returns true if allowed, false if disallowed
 */
export function isUrlAllowed(url: string, rules: RobotsRules): boolean {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname + parsedUrl.search;

    // Check allow rules first (more specific rules take precedence)
    for (const allowRule of rules.allow) {
      if (matchesRule(path, allowRule)) {
        return true;
      }
    }

    // Check disallow rules
    for (const disallowRule of rules.disallow) {
      if (matchesRule(path, disallowRule)) {
        return false;
      }
    }

    // Default: allow if no matching rule
    return true;
  } catch {
    return true;  // On error, allow
  }
}

/**
 * Check if a path matches a robots.txt rule
 * Supports * wildcard and $ end anchor
 */
function matchesRule(path: string, rule: string): boolean {
  if (!rule) return false;

  // Convert robots.txt pattern to regex
  let pattern = rule
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars except * and $
    .replace(/\*/g, '.*');  // * matches any sequence

  // Handle $ end anchor
  if (pattern.endsWith('\\$')) {
    pattern = pattern.slice(0, -2) + '$';
  } else {
    // If no $, rule matches path prefix
    pattern = '^' + pattern;
  }

  try {
    const regex = new RegExp(pattern);
    return regex.test(path);
  } catch {
    // If regex fails, do simple prefix match
    return path.startsWith(rule.replace(/\*/g, ''));
  }
}

/**
 * Get the crawl delay from rules (with minimum of 1 second)
 */
export function getCrawlDelay(rules: RobotsRules, defaultDelay = 1): number {
  if (rules.crawlDelay !== null) {
    return Math.max(rules.crawlDelay, defaultDelay);
  }
  return defaultDelay;
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
 * Cache for robots.txt rules by domain
 */
const robotsCache = new Map<string, { rules: RobotsRules; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get robots.txt rules with caching
 */
export async function getRobotsRules(baseUrl: string): Promise<RobotsRules> {
  const domain = new URL(baseUrl).origin;
  const cached = robotsCache.get(domain);

  if (cached && cached.expires > Date.now()) {
    return cached.rules;
  }

  const rules = await fetchRobotsTxt(baseUrl);
  robotsCache.set(domain, {
    rules,
    expires: Date.now() + CACHE_TTL,
  });

  return rules;
}
