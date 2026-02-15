/**
 * SEO Helper Module
 * Injects/removes meta tags, Open Graph, Twitter Cards, canonical URLs, and JSON-LD structured data.
 */

const SITE_NAME = 'Magpipe';
const SITE_URL = 'https://magpipe.ai';
const DEFAULT_TITLE = 'MAGPIPE';
const DEFAULT_DESCRIPTION = 'MAGPIPE - Your AI phone assistant';
const DEFAULT_OG_IMAGE = `${SITE_URL}/magpipe-bird.png`;

// Track injected elements for cleanup
let injectedElements = [];

/**
 * Set or create a <meta> tag in <head>
 */
function setMeta(attribute, value, content) {
  let el = document.querySelector(`meta[${attribute}="${value}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, value);
    document.head.appendChild(el);
    injectedElements.push(el);
  }
  el.content = content;
  return el;
}

/**
 * Inject all SEO tags for a page.
 * @param {Object} options
 * @param {string} options.title - Page title
 * @param {string} options.description - Meta description
 * @param {string} options.url - Canonical URL (full)
 * @param {string} [options.ogImage] - OG image URL
 * @param {Array<Object>} [options.jsonLd] - Array of JSON-LD schema objects
 */
export function injectSEO({ title, description, url, ogImage, jsonLd }) {
  // Clean up previous injection first
  cleanupSEO();

  // Title
  document.title = title || DEFAULT_TITLE;

  // Meta description (reuse existing or create)
  setMeta('name', 'description', description || DEFAULT_DESCRIPTION);

  // Canonical URL
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
    injectedElements.push(canonical);
  }
  canonical.href = url || SITE_URL;

  // Open Graph tags
  setMeta('property', 'og:title', title || DEFAULT_TITLE);
  setMeta('property', 'og:description', description || DEFAULT_DESCRIPTION);
  setMeta('property', 'og:url', url || SITE_URL);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', SITE_NAME);
  setMeta('property', 'og:image', ogImage || DEFAULT_OG_IMAGE);

  // Twitter Card tags
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title || DEFAULT_TITLE);
  setMeta('name', 'twitter:description', description || DEFAULT_DESCRIPTION);
  setMeta('name', 'twitter:image', ogImage || DEFAULT_OG_IMAGE);

  // JSON-LD structured data
  if (jsonLd && jsonLd.length > 0) {
    for (const schema of jsonLd) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
      injectedElements.push(script);
    }
  }
}

/**
 * Remove all injected SEO elements and reset defaults.
 */
export function cleanupSEO() {
  for (const el of injectedElements) {
    el.remove();
  }
  injectedElements = [];

  // Reset title
  document.title = DEFAULT_TITLE;

  // Reset meta description to default
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = DEFAULT_DESCRIPTION;
  }
}

// ========== Schema Builders ==========

/**
 * Build Organization schema for Magpipe.
 */
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Magpipe',
    url: SITE_URL,
    logo: `${SITE_URL}/magpipe-bird.png`,
    description: 'AI-powered voice, SMS, and email communication platform for businesses.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      url: `${SITE_URL}/custom-plan`,
    },
  };
}

/**
 * Build SoftwareApplication (Product) schema.
 */
export function buildProductSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Magpipe',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'AI phone agent, SMS, and email automation platform. Handle calls, texts, and emails with intelligent AI agents.',
    offers: [
      {
        '@type': 'Offer',
        name: 'Voice Calls',
        price: '0.07',
        priceCurrency: 'USD',
        description: 'Per voice minute',
      },
      {
        '@type': 'Offer',
        name: 'SMS Messages',
        price: '0.01',
        priceCurrency: 'USD',
        description: 'Per SMS message',
      },
    ],
  };
}

/**
 * Build FAQPage schema from FAQ items.
 * @param {Array<{question: string, answer: string}>} faqItems
 */
export function buildFAQSchema(faqItems) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * Build BreadcrumbList schema.
 * @param {Array<{name: string, url: string}>} items - Breadcrumb items in order
 */
export function buildBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
