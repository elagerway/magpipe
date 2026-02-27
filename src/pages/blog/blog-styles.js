/**
 * Blog page styles
 */

import { getPublicHeaderStyles } from '../../components/PublicHeader.js';
import { getPublicFooterStyles } from '../../components/PublicFooter.js';

export function getBlogStyles() {
  return `
    ${getPublicHeaderStyles()}
    ${getPublicFooterStyles()}
    /* ── Blog List Page ── */
    .blog-page {
      background: #ffffff;
      min-height: 100vh;
    }

    .blog-hero {
      position: relative;
      padding: 10rem 1.5rem 4rem;
      text-align: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .blog-hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 30% 50%, rgba(99, 102, 241, 0.15), transparent 60%),
                  radial-gradient(ellipse at 70% 50%, rgba(168, 85, 247, 0.1), transparent 60%);
    }

    .blog-hero-content {
      position: relative;
      max-width: 700px;
      margin: 0 auto;
    }

    .blog-hero-badge {
      display: inline-block;
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 0.375rem 1rem;
      border-radius: 999px;
      border: 1px solid rgba(99, 102, 241, 0.3);
      margin-bottom: 1.5rem;
    }

    .blog-hero h1 {
      font-size: 3rem;
      font-weight: 800;
      color: white;
      margin: 0 0 1rem;
      line-height: 1.15;
    }

    .blog-hero-subtitle {
      font-size: 1.15rem;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0;
    }

    .blog-rss-link {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      margin-top: 1.5rem;
      color: #94a3b8;
      font-size: 0.85rem;
      text-decoration: none;
      transition: color 0.2s;
    }

    .blog-rss-link:hover {
      color: #f97316;
    }

    /* ── Post List Grid ── */
    .blog-list-section {
      max-width: 1100px;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
    }

    .blog-list-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.5rem;
    }

    .blog-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }

    .blog-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
    }

    .blog-card-image {
      width: 100%;
      height: 200px;
      object-fit: cover;
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    }

    .blog-card-gradient-band {
      width: 100%;
      height: 120px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .blog-card-gradient-band .blog-card-tag {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .blog-card-body {
      padding: 1.25rem;
    }

    .blog-card-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: #64748b;
      margin-bottom: 0.625rem;
    }

    .blog-card-meta-dot {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #cbd5e1;
    }

    .blog-card h2 {
      font-size: 1.15rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.5rem;
      line-height: 1.4;
    }

    .blog-card-excerpt {
      font-size: 0.9rem;
      color: #64748b;
      line-height: 1.6;
      margin: 0 0 1rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .blog-card-tags {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }

    .blog-card-tag {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      background: #eef2ff;
      color: #4f46e5;
    }

    .blog-card-readmore {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: #4f46e5;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 0.75rem;
      transition: gap 0.2s;
    }

    .blog-card:hover .blog-card-readmore {
      gap: 0.5rem;
    }

    /* ── Featured Card (first post) ── */
    .blog-featured-card {
      display: flex;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .blog-featured-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
    }

    .blog-featured-card-image {
      width: 40%;
      min-height: 280px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .blog-featured-card-gradient {
      width: 40%;
      min-height: 280px;
      flex-shrink: 0;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .blog-featured-card-gradient .blog-card-tag {
      font-size: 0.85rem;
      padding: 0.35rem 0.85rem;
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .blog-featured-card-body {
      padding: 2rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .blog-featured-card-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: #64748b;
      margin-bottom: 0.75rem;
    }

    .blog-featured-card h2 {
      font-size: 1.6rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.75rem;
      line-height: 1.35;
    }

    .blog-featured-card-excerpt {
      font-size: 0.95rem;
      color: #475569;
      line-height: 1.7;
      margin: 0 0 1.25rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .blog-empty-state {
      text-align: center;
      padding: 4rem 1.5rem;
      color: #64748b;
    }

    .blog-empty-state h2 {
      font-size: 1.5rem;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    /* ── Single Post Article ── */
    .blog-article-header {
      position: relative;
      padding: 10rem 1.5rem 3rem;
      text-align: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .blog-article-header::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 30% 50%, rgba(99, 102, 241, 0.15), transparent 60%);
    }

    .blog-article-header-content {
      position: relative;
      max-width: 780px;
      margin: 0 auto;
    }

    .blog-article-header h1 {
      font-size: 2.5rem;
      font-weight: 800;
      color: white;
      margin: 0 0 1rem;
      line-height: 1.2;
    }

    .blog-article-meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      font-size: 0.9rem;
      color: #94a3b8;
      flex-wrap: wrap;
    }

    .blog-article-meta-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #475569;
    }

    .blog-article-tags {
      display: flex;
      gap: 0.375rem;
      justify-content: center;
      margin-top: 1rem;
    }

    .blog-article-tag {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      background: rgba(99, 102, 241, 0.2);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    /* Article body - styled Quill HTML output */
    .blog-article {
      max-width: 780px;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
    }

    .blog-article-content {
      font-size: 1.05rem;
      line-height: 1.8;
      color: #1e293b;
    }

    .blog-article-content h2 {
      font-size: 1.6rem;
      font-weight: 700;
      color: #0f172a;
      margin: 2.5rem 0 1rem;
      line-height: 1.3;
    }

    .blog-article-content h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #0f172a;
      margin: 2rem 0 0.75rem;
      line-height: 1.4;
    }

    .blog-article-content p {
      margin: 0 0 1.25rem;
    }

    .blog-article-content a {
      color: #4f46e5;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .blog-article-content a:hover {
      color: #3730a3;
    }

    .blog-article-content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5rem 0;
    }

    .blog-article-content blockquote {
      border-left: 4px solid #4f46e5;
      margin: 1.5rem 0;
      padding: 0.75rem 1.25rem;
      background: #f8fafc;
      border-radius: 0 8px 8px 0;
      color: #475569;
      font-style: italic;
    }

    .blog-article-content blockquote p:last-child {
      margin-bottom: 0;
    }

    .blog-article-content ul,
    .blog-article-content ol {
      margin: 0 0 1.25rem;
      padding-left: 1.5rem;
    }

    .blog-article-content li {
      margin-bottom: 0.5rem;
    }

    .blog-article-content pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1.5rem 0;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .blog-article-content code {
      background: #f1f5f9;
      color: #e11d48;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .blog-article-content pre code {
      background: none;
      color: inherit;
      padding: 0;
      border-radius: 0;
      font-size: inherit;
    }

    .blog-article-content strong {
      font-weight: 700;
      color: #0f172a;
    }

    /* ── Blog CTA Section ── */
    .blog-cta-section {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      padding: 4rem 1.5rem;
      text-align: center;
    }

    .blog-cta-content {
      max-width: 600px;
      margin: 0 auto;
    }

    .blog-cta-section h2 {
      font-size: 2rem;
      font-weight: 800;
      color: white;
      margin: 0 0 0.75rem;
    }

    .blog-cta-section p {
      font-size: 1.1rem;
      color: rgba(255, 255, 255, 0.8);
      margin: 0 0 2rem;
      line-height: 1.6;
    }

    .blog-cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .blog-cta-buttons .btn-cta-primary {
      background: white;
      color: #4f46e5;
      font-weight: 700;
      padding: 0.875rem 2rem;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .blog-cta-buttons .btn-cta-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .blog-cta-buttons .btn-cta-secondary {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      font-weight: 600;
      padding: 0.875rem 2rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }

    .blog-cta-buttons .btn-cta-secondary:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .blog-hero h1 {
        font-size: 2rem;
      }

      .blog-hero {
        padding: 8rem 1rem 3rem;
      }

      .blog-list-grid {
        grid-template-columns: 1fr;
      }

      .blog-featured-card {
        flex-direction: column;
      }

      .blog-featured-card-image,
      .blog-featured-card-gradient {
        width: 100%;
        min-height: 200px;
      }

      .blog-article-header h1 {
        font-size: 1.75rem;
      }

      .blog-article-header {
        padding: 8rem 1rem 2rem;
      }

      .blog-article {
        padding: 2rem 1rem 3rem;
      }

      .blog-article-content {
        font-size: 1rem;
      }

      .blog-cta-section h2 {
        font-size: 1.5rem;
      }
    }
  `;
}
