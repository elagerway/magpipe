/**
 * Best AI for X Listicle Page Component
 * Renders "Best AI Phone, SMS & Email Agents for {Industry}" pages from best-data.js
 */

import { renderPublicHeader } from '../../components/PublicHeader.js';
import { renderPublicFooter } from '../../components/PublicFooter.js';
import { getBestStyles } from './best-styles.js';
import { bestPages } from './best-data.js';
import { injectSEO, cleanupSEO, buildOrganizationSchema, buildProductSchema, buildFAQSchema, buildBreadcrumbSchema, buildItemListSchema } from '../../lib/seo.js';

export default class BestPage {
  constructor(params) {
    this.slug = params?.slug || params?.id || '';
    this.pageData = bestPages[this.slug] || null;
  }

  async render() {
    const appElement = document.getElementById('app');

    if (!this.pageData) {
      appElement.innerHTML = `
        <div class="best-page">
          ${renderPublicHeader()}
          <div style="text-align: center; padding: 12rem 1.5rem 6rem; min-height: 60vh;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">Page Not Found</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">The page you're looking for doesn't exist.</p>
            <button class="btn btn-primary" onclick="navigateTo('/')">Go Home</button>
          </div>
          ${renderPublicFooter()}
        </div>
        <style>${getBestStyles()}</style>
      `;
      return;
    }

    const data = this.pageData;
    const canonicalUrl = `https://magpipe.ai/best/${this.slug}`;

    const breadcrumbs = buildBreadcrumbSchema([
      { name: 'Home', url: 'https://magpipe.ai/' },
      { name: 'Best AI Agents', url: 'https://magpipe.ai/best' },
      { name: data.intro.title, url: canonicalUrl },
    ]);

    const itemList = buildItemListSchema(
      data.tools.map((tool, i) => ({
        position: i + 1,
        name: tool.name,
        url: tool.url.startsWith('http') ? tool.url : `https://magpipe.ai${tool.url}`,
      }))
    );

    injectSEO({
      title: data.meta.title,
      description: data.meta.description,
      url: canonicalUrl,
      jsonLd: [
        buildOrganizationSchema(),
        buildProductSchema(),
        buildFAQSchema(data.faq),
        breadcrumbs,
        itemList,
      ],
    });

    const checkSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
    const crossSvg = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';

    const toolNames = data.comparisonTable.tools;
    const toolKeys = Object.keys(toolNames);

    appElement.innerHTML = `
      <div class="best-page">
        ${renderPublicHeader()}

        <!-- Hero Section -->
        <section class="bp-hero">
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-gradient-orb hero-orb-3"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="bp-hero-content">
            <span class="bp-hero-badge">BEST OF 2026</span>
            <h1>${data.intro.title}</h1>
            <p class="bp-hero-subtitle">${data.intro.subtitle}</p>
            <p class="bp-hero-description">${data.intro.description}</p>
            <div class="bp-hero-cta">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Try Magpipe Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/custom-plan')">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>

        <!-- Tool Cards -->
        <section class="bp-tools-section">
          <div class="bp-section-header">
            <h2>Top ${data.tools.length} AI Communication Tools for ${data.industry}</h2>
            <p>We evaluated dozens of AI phone, SMS, and email platforms. Here are the best for ${data.industry.toLowerCase()} businesses in 2026.</p>
          </div>

          ${data.tools.map((tool, i) => `
            <div class="bp-tool-card ${i === 0 ? 'bp-tool-highlighted' : ''}">
              <div class="bp-tool-header">
                <div class="bp-tool-rank">${i + 1}</div>
                <div class="bp-tool-title-area">
                  <div class="bp-tool-name-row">
                    <h3 class="bp-tool-name">${tool.name}</h3>
                    <span class="bp-badge ${i === 0 ? 'bp-badge-primary' : 'bp-badge-secondary'}">${tool.badge}</span>
                  </div>
                  <span class="bp-tool-url">
                    <a href="${tool.url}" ${tool.url.startsWith('http') ? 'target="_blank" rel="noopener nofollow"' : `onclick="event.preventDefault(); navigateTo('${tool.url}')"`}>${tool.url.replace('https://', '')}</a>
                  </span>
                </div>
              </div>

              <p class="bp-tool-description">${tool.description}</p>

              <div class="bp-pros-cons">
                <div class="bp-pros">
                  <h4>Pros</h4>
                  <ul>
                    ${tool.pros.map(p => `<li>${p}</li>`).join('')}
                  </ul>
                </div>
                <div class="bp-cons">
                  <h4>Cons</h4>
                  <ul>
                    ${tool.cons.map(c => `<li>${c}</li>`).join('')}
                  </ul>
                </div>
              </div>

              <div class="bp-tool-footer">
                <div class="bp-tool-pricing"><strong>Pricing:</strong> ${tool.pricing}</div>
                <div class="bp-tool-best-for">${tool.bestFor}</div>
              </div>
            </div>
          `).join('')}
        </section>

        <!-- Quick Comparison Table -->
        <section class="bp-table-section">
          <div class="bp-section-header">
            <h2>Quick Comparison</h2>
            <p>Feature-by-feature breakdown across all ${data.tools.length} platforms</p>
          </div>
          <div class="bp-table-wrapper">
            <table class="bp-quick-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  ${toolKeys.map((name, i) => `<th ${i === 0 ? 'class="bp-col-magpipe"' : ''}>${name}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${data.comparisonTable.features.map((feature, fi) => `
                  <tr>
                    <td>${feature}</td>
                    ${toolKeys.map((name, ti) => {
                      const val = toolNames[name][fi];
                      let cell;
                      if (val === true) cell = `<span class="bp-check">${checkSvg}</span>`;
                      else if (val === false) cell = `<span class="bp-cross">${crossSvg}</span>`;
                      else cell = `<span class="bp-text-value">${val}</span>`;
                      return `<td ${ti === 0 ? 'class="bp-col-magpipe"' : ''}>${cell}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Buying Guide -->
        <section class="bp-guide-section">
          <div class="bp-section-header">
            <h2>What to Look for in AI Communication Tools for ${data.industry}</h2>
            <p>Key considerations when choosing an AI phone, SMS, and email agent</p>
          </div>
          <div class="bp-guide-grid">
            ${data.buyingGuide.map((item, i) => `
              <div class="bp-guide-card">
                <div class="bp-guide-number">${i + 1}</div>
                <h3>${item.title}</h3>
                <p>${item.description}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- FAQ Section -->
        <section class="bp-faq-section">
          <div class="bp-section-header">
            <h2>Frequently Asked Questions</h2>
          </div>
          <div class="bp-faq-list">
            ${data.faq.map((item, i) => `
              <div class="lp-faq-item" data-faq="${i}">
                <button class="lp-faq-question" onclick="this.parentElement.classList.toggle('open')">
                  <span>${item.question}</span>
                  <svg class="lp-faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div class="lp-faq-answer">
                  <p>${item.answer}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- Final CTA Section -->
        <section class="bp-final-cta">
          <div class="cta-decoration">
            <div class="cta-orb-1"></div>
            <div class="cta-orb-2"></div>
            <div class="cta-grid"></div>
          </div>
          <div class="bp-cta-content">
            <h2>Ready to transform ${data.industry.toLowerCase()} communication?</h2>
            <p>Start free with $20 in credits. No monthly fees, no contracts.</p>
            <div class="bp-cta-buttons">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/custom-plan')">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>${getBestStyles()}</style>
    `;
  }

  cleanup() {
    cleanupSEO();
  }
}
