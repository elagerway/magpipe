/**
 * Blog List Page (Public)
 * Displays all published blog posts in a card grid
 */

import { renderPublicHeader } from '../../components/PublicHeader.js';
import { renderPublicFooter } from '../../components/PublicFooter.js';
import { getBlogStyles } from './blog-styles.js';
import { injectSEO, cleanupSEO, buildOrganizationSchema, buildBreadcrumbSchema } from '../../lib/seo.js';
import { supabase } from '../../lib/supabase.js';

export default class BlogListPage {
  constructor() {
    this.posts = [];
  }

  async render() {
    const appElement = document.getElementById('app');

    // Hide main nav
    const persistentNav = document.getElementById('persistent-nav');
    if (persistentNav) persistentNav.style.display = 'none';

    // Show loading (include styles immediately to prevent FOUC)
    appElement.innerHTML = `
      <div class="blog-page">
        ${renderPublicHeader({ activePage: 'blog' })}
        <div style="text-align: center; padding: 12rem 1.5rem 6rem; min-height: 60vh;">
          <div class="loading-spinner">Loading blog posts...</div>
        </div>
      </div>
      <style>${getBlogStyles()}</style>
    `;

    // Fetch published posts
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('slug, title, excerpt, meta_description, author_name, published_at, tags, featured_image_url')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error loading blog posts:', error);
    }

    this.posts = posts || [];

    // SEO
    const canonicalUrl = 'https://magpipe.ai/blog';
    injectSEO({
      title: 'Magpipe Blog - AI Communication Insights',
      description: 'Explore insights on AI-powered voice, SMS, and email communication. Tips, guides, and industry analysis from the Magpipe team.',
      url: canonicalUrl,
      jsonLd: [
        buildOrganizationSchema(),
        buildBreadcrumbSchema([
          { name: 'Home', url: 'https://magpipe.ai/' },
          { name: 'Blog', url: canonicalUrl },
        ]),
      ],
    });

    // Add RSS link to head
    let rssLink = document.querySelector('link[type="application/rss+xml"]');
    if (!rssLink) {
      rssLink = document.createElement('link');
      rssLink.rel = 'alternate';
      rssLink.type = 'application/rss+xml';
      rssLink.title = 'Magpipe Blog RSS Feed';
      rssLink.href = 'https://magpipe.ai/functions/v1/blog-rss';
      document.head.appendChild(rssLink);
    }

    this.renderPage(appElement);
  }

  renderPage(appElement) {
    const postsHtml = this.posts.length > 0
      ? `
        <div class="blog-list-grid">
          ${this.posts.map(post => this.renderCard(post)).join('')}
        </div>
      `
      : `
        <div class="blog-empty-state">
          <h2>Coming Soon</h2>
          <p>We're working on great content. Check back soon!</p>
        </div>
      `;

    appElement.innerHTML = `
      <div class="blog-page">
        ${renderPublicHeader({ activePage: 'blog' })}

        <section class="blog-hero">
          <div class="blog-hero-content">
            <span class="blog-hero-badge">BLOG</span>
            <h1>Magpipe Blog</h1>
            <p class="blog-hero-subtitle">Insights on AI-powered communication, automation strategies, and business growth.</p>
            <a href="https://magpipe.ai/functions/v1/blog-rss" class="blog-rss-link" target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
              RSS Feed
            </a>
          </div>
        </section>

        <section class="blog-list-section">
          ${postsHtml}
        </section>

        <!-- CTA -->
        <section class="blog-cta-section">
          <div class="blog-cta-content">
            <h2>Ready to automate your communication?</h2>
            <p>Join businesses using Magpipe to handle calls, texts, and emails with AI agents.</p>
            <div class="blog-cta-buttons">
              <button class="btn-cta-primary" onclick="navigateTo('/signup')">Get Started Free</button>
              <button class="btn-cta-secondary" onclick="navigateTo('/custom-plan')">Talk to Sales</button>
            </div>
          </div>
        </section>

        ${renderPublicFooter()}
      </div>
      <style>${getBlogStyles()}</style>
    `;
  }

  renderCard(post) {
    const date = post.published_at
      ? new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const excerpt = post.excerpt || post.meta_description || '';
    const tags = post.tags || [];

    const imageHtml = post.featured_image_url
      ? `<img class="blog-card-image" src="${this.escapeAttr(post.featured_image_url)}" alt="${this.escapeAttr(post.title)}" loading="lazy">`
      : `<div class="blog-card-image-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>`;

    return `
      <article class="blog-card" onclick="navigateTo('/blog/${this.escapeAttr(post.slug)}')">
        ${imageHtml}
        <div class="blog-card-body">
          <div class="blog-card-meta">
            <span>${this.escape(post.author_name || 'Magpipe Team')}</span>
            <span class="blog-card-meta-dot"></span>
            <span>${date}</span>
          </div>
          <h2>${this.escape(post.title)}</h2>
          ${excerpt ? `<p class="blog-card-excerpt">${this.escape(excerpt)}</p>` : ''}
          ${tags.length > 0 ? `
            <div class="blog-card-tags">
              ${tags.slice(0, 3).map(t => `<span class="blog-card-tag">${this.escape(t)}</span>`).join('')}
            </div>
          ` : ''}
          <span class="blog-card-readmore">Read More &rarr;</span>
        </div>
      </article>
    `;
  }

  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  cleanup() {
    cleanupSEO();
    const rssLink = document.querySelector('link[type="application/rss+xml"]');
    if (rssLink) rssLink.remove();
  }
}
