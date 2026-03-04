/**
 * Comparison Page Component
 * Renders "Magpipe vs X" competitor comparison pages from compare-data.js
 */

import { renderPublicHeader } from '../../components/PublicHeader.js';
import { renderPublicFooter } from '../../components/PublicFooter.js';
import { getCompareStyles } from './compare-styles.js';
import { comparePages } from './compare-data.js';
import { injectSEO, cleanupSEO, buildOrganizationSchema, buildProductSchema, buildFAQSchema, buildBreadcrumbSchema } from '../../lib/seo.js';

export default class ComparePage {
  constructor(params) {
    this.slug = params?.slug || params?.id || '';
    this.pageData = comparePages[this.slug] || null;
  }

  async render() {
    const appElement = document.getElementById('app');

    if (!this.pageData) {
      appElement.innerHTML = `
        <div class="compare-page">
          ${renderPublicHeader()}
          <div style="text-align: center; padding: 12rem 1.5rem 6rem; min-height: 60vh;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">Page Not Found</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">The comparison page you're looking for doesn't exist.</p>
            <button class="btn btn-primary" onclick="navigateTo('/')">Go Home</button>
          </div>
          ${renderPublicFooter()}
        </div>
        <style>${getCompareStyles()}</style>
      `;
      return;
    }

    const data = this.pageData;
    const canonicalUrl = `https://magpipe.ai/compare/${this.slug}`;

    const breadcrumbs = buildBreadcrumbSchema([
      { name: 'Home', url: 'https://magpipe.ai/' },
      { name: 'Compare', url: 'https://magpipe.ai/compare' },
      { name: `Magpipe vs ${data.competitor.name}`, url: canonicalUrl },
    ]);

    injectSEO({
      title: data.meta.title,
      description: data.meta.description,
      url: canonicalUrl,
      jsonLd: [
        buildOrganizationSchema(),
        buildProductSchema(),
        buildFAQSchema(data.faq),
        breadcrumbs,
      ],
    });

    appElement.innerHTML = `
      <div class="compare-page">
        ${renderPublicHeader()}

        <!-- Hero Section -->
        <section class="cp-hero">
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-gradient-orb hero-orb-3"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="cp-hero-content">
            <span class="cp-hero-badge">COMPARISON</span>
            <h1>Magpipe vs ${data.competitor.name}</h1>
            <p class="cp-hero-subtitle">${data.heroSubtitle}</p>
            <div class="cp-hero-cta">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/custom-plan')">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>

        <!-- Quick Verdict -->
        <section class="cp-verdict-section">
          <div class="cp-verdict-card">
            <div class="cp-verdict-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <h2>The Verdict</h2>
            <p>${data.verdict}</p>
          </div>
        </section>

        <!-- Feature Comparison Table -->
        <section class="cp-features-section">
          <div class="cp-section-header">
            <h2>Feature-by-Feature Comparison</h2>
            <p>See how Magpipe and ${data.competitor.name} stack up across key capabilities</p>
          </div>
          <div class="cp-table-wrapper">
            <table class="cp-comparison-table">
              <thead>
                <tr>
                  <th class="cp-feature-col">Feature</th>
                  <th class="cp-magpipe-col">Magpipe</th>
                  <th class="cp-competitor-col">${data.competitor.name}</th>
                </tr>
              </thead>
              <tbody>
                ${data.features.map(f => `
                  <tr>
                    <td class="cp-feature-name">
                      ${f.name}
                      ${f.note ? `<span class="cp-feature-note">${f.note}</span>` : ''}
                    </td>
                    <td class="cp-magpipe-col">${this.renderFeatureValue(f.magpipe, true)}</td>
                    <td class="cp-competitor-col">${this.renderFeatureValue(f.competitor, false)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Pricing Comparison -->
        <section class="cp-pricing-section">
          <div class="cp-section-header">
            <h2>Pricing Comparison</h2>
            <p>Real costs, no hidden fees</p>
          </div>
          <div class="cp-pricing-cards">
            ${this.renderPricingCard(data.pricing.magpipe, true)}
            ${this.renderPricingCard(data.pricing.competitor, false)}
          </div>
        </section>

        <!-- Key Differences -->
        <section class="cp-differentiators-section">
          <div class="cp-section-header">
            <h2>Why Businesses Choose Magpipe</h2>
            <p>Key advantages over ${data.competitor.name}</p>
          </div>
          <div class="cp-diff-grid">
            ${data.differentiators.map((d, i) => `
              <div class="cp-diff-card">
                <div class="cp-diff-number">${i + 1}</div>
                <h3>${d.title}</h3>
                <p>${d.description}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- FAQ Section -->
        <section class="cp-faq-section">
          <div class="cp-section-header">
            <h2>Frequently Asked Questions</h2>
          </div>
          <div class="cp-faq-list">
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
        <section class="cp-final-cta">
          <div class="cta-decoration">
            <div class="cta-orb-1"></div>
            <div class="cta-orb-2"></div>
            <div class="cta-grid"></div>
          </div>
          <div class="cp-cta-content">
            <h2>Ready to switch from ${data.competitor.name}?</h2>
            <p>Start free with $20 in credits. No monthly fees, no contracts.</p>
            <div class="cp-cta-buttons">
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

      <style>${getCompareStyles()}</style>
    `;
  }

  renderFeatureValue(value, isMagpipe) {
    if (value === true) {
      return `<span class="cp-check">${isMagpipe ? '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>'}</span>`;
    }
    if (value === false) {
      return `<span class="cp-cross"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></span>`;
    }
    // String value (partial support, specific text)
    return `<span class="cp-text-value">${value}</span>`;
  }

  renderPricingCard(pricing, isMagpipe) {
    return `
      <div class="cp-pricing-card ${isMagpipe ? 'cp-pricing-highlighted' : ''}">
        ${isMagpipe ? '<div class="cp-pricing-badge">RECOMMENDED</div>' : ''}
        <div class="cp-pricing-card-header">
          <h3>${pricing.name}</h3>
          <span class="cp-pricing-model">${pricing.model}</span>
        </div>
        <div class="cp-pricing-highlight">${pricing.highlight}</div>
        <ul class="cp-pricing-details">
          ${pricing.details.map(d => `<li>${d}</li>`).join('')}
        </ul>
        ${isMagpipe ? '<button class="btn btn-primary" onclick="navigateTo(\'/signup\')">Start Free</button>' : `<a href="${this.pageData.competitor.url}" class="btn btn-secondary" target="_blank" rel="noopener nofollow">Visit ${pricing.name}</a>`}
      </div>
    `;
  }

  cleanup() {
    cleanupSEO();
  }
}
