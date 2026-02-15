/**
 * Blog Post Page (Public)
 * Displays a single published blog post by slug
 */

import { renderPublicHeader } from '../../components/PublicHeader.js';
import { renderPublicFooter } from '../../components/PublicFooter.js';
import { getBlogStyles } from './blog-styles.js';
import { injectSEO, cleanupSEO, buildOrganizationSchema, buildBreadcrumbSchema, buildBlogPostingSchema } from '../../lib/seo.js';
import { supabase } from '../../lib/supabase.js';

export default class BlogPage {
  constructor(params) {
    this.slug = params?.slug || params?.id || '';
    this.post = null;
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
          <div class="loading-spinner">Loading article...</div>
        </div>
      </div>
      <style>${getBlogStyles()}</style>
    `;

    // Fetch post by slug
    const { data: post, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', this.slug)
      .eq('status', 'published')
      .single();

    if (error || !post) {
      appElement.innerHTML = `
        <div class="blog-page">
          ${renderPublicHeader({ activePage: 'blog' })}
          <div style="text-align: center; padding: 12rem 1.5rem 6rem; min-height: 60vh;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem; color: #0f172a;">Post Not Found</h1>
            <p style="color: #64748b; margin-bottom: 2rem;">The blog post you're looking for doesn't exist or isn't published yet.</p>
            <button class="btn btn-primary" onclick="navigateTo('/blog')">Back to Blog</button>
          </div>
          ${renderPublicFooter()}
        </div>
        <style>${getBlogStyles()}</style>
      `;
      return;
    }

    this.post = post;

    // SEO
    const canonicalUrl = `https://magpipe.ai/blog/${post.slug}`;
    injectSEO({
      title: `${post.title} | Magpipe Blog`,
      description: post.meta_description || post.excerpt || '',
      url: canonicalUrl,
      ogImage: post.featured_image_url || undefined,
      jsonLd: [
        buildBlogPostingSchema(post),
        buildOrganizationSchema(),
        buildBreadcrumbSchema([
          { name: 'Home', url: 'https://magpipe.ai/' },
          { name: 'Blog', url: 'https://magpipe.ai/blog' },
          { name: post.title, url: canonicalUrl },
        ]),
      ],
    });

    const date = post.published_at
      ? new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const tags = post.tags || [];

    appElement.innerHTML = `
      <div class="blog-page">
        ${renderPublicHeader({ activePage: 'blog' })}

        <header class="blog-article-header">
          <div class="blog-article-header-content">
            <h1>${this.escape(post.title)}</h1>
            <div class="blog-article-meta">
              <span>${this.escape(post.author_name || 'Magpipe Team')}</span>
              <span class="blog-article-meta-dot"></span>
              <span>${date}</span>
            </div>
            ${tags.length > 0 ? `
              <div class="blog-article-tags">
                ${tags.map(t => `<span class="blog-article-tag">${this.escape(t)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </header>

        <article class="blog-article">
          <div class="blog-article-content">
            ${post.content}
          </div>
        </article>

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

  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  cleanup() {
    cleanupSEO();
  }
}
