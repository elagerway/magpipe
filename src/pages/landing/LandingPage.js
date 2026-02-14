/**
 * Landing Page Template Component
 * Renders industry and use-case marketing pages from landing-data.js
 */

import { renderPublicHeader } from '../../components/PublicHeader.js';
import { renderPublicFooter } from '../../components/PublicFooter.js';
import { getLandingStyles } from './landing-styles.js';
import { landingPages, getPageFeatures } from './landing-data.js';

export default class LandingPage {
  constructor(params) {
    // Extract slug from the route params
    // Router may pass { slug: 'healthcare' } or { id: 'healthcare' }
    this.slug = params?.slug || params?.id || '';
    this.pageData = landingPages[this.slug] || null;
  }

  async render() {
    const appElement = document.getElementById('app');

    if (!this.pageData) {
      // Invalid slug — show 404-style message
      appElement.innerHTML = `
        <div class="landing-page">
          ${renderPublicHeader()}
          <div style="text-align: center; padding: 12rem 1.5rem 6rem; min-height: 60vh;">
            <h1 style="font-size: 2rem; margin-bottom: 1rem;">Page Not Found</h1>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">The page you're looking for doesn't exist.</p>
            <button class="btn btn-primary" onclick="navigateTo('/')">Go Home</button>
          </div>
          ${renderPublicFooter()}
        </div>
        <style>${getLandingStyles()}</style>
      `;
      return;
    }

    const data = this.pageData;
    const pageFeatures = getPageFeatures(this.slug);

    // Set page title for SEO
    if (data.meta?.title) {
      document.title = data.meta.title;
    }

    // Set meta description
    if (data.meta?.description) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = data.meta.description;
    }

    appElement.innerHTML = `
      <div class="landing-page">
        ${renderPublicHeader()}

        <!-- Hero Section -->
        <section class="lp-hero">
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-gradient-orb hero-orb-3"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="lp-hero-content">
            <span class="lp-hero-badge">${data.hero.badge}</span>
            <h1>${data.hero.title}</h1>
            <p class="lp-hero-subtitle">${data.hero.subtitle}</p>
            <div class="lp-hero-cta">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/custom-plan')">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>

        <!-- Benefits Section -->
        <section class="lp-benefits">
          <div class="lp-section-header">
            <h2>Why ${data.type === 'industry' ? 'teams in ' + this.getIndustryLabel() : this.getUseCaseLabel() + ' teams'} choose Magpipe</h2>
            <p>Purpose-built AI communication tools for your specific needs</p>
          </div>
          <div class="lp-benefits-grid">
            ${data.benefits.map(b => `
              <div class="lp-benefit-card">
                <div class="lp-benefit-icon">${b.icon}</div>
                <h3>${b.title}</h3>
                <p>${b.description}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- How It Works Section -->
        <section class="lp-how-it-works">
          <div class="lp-section-header">
            <h2>Get started in minutes</h2>
            <p>Simple setup, powerful results</p>
          </div>
          <div class="lp-how-steps">
            ${data.howItWorks.map((step, i) => `
              ${i > 0 ? '<div class="lp-step-connector"></div>' : ''}
              <div class="lp-how-step">
                <div class="lp-step-number">${i + 1}</div>
                <h3>${step.title}</h3>
                <p>${step.description}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- Key Features Section -->
        <section class="lp-features">
          <div class="lp-section-header">
            <h2>Key features for ${data.type === 'industry' ? this.getIndustryLabel() : this.getUseCaseLabel()}</h2>
            <p>Powered by advanced AI to handle calls, texts, and emails naturally</p>
          </div>
          <div class="lp-features-grid">
            ${pageFeatures.map(f => `
              <div class="lp-feature-card">
                <div class="lp-feature-icon">${f.icon}</div>
                <h3>${f.title}</h3>
                <p>${f.description}</p>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- Pricing Preview Section -->
        <section class="lp-pricing">
          <div class="lp-pricing-content">
            <h2>Simple, transparent pricing</h2>
            <p>Pay only for what you use. No monthly minimums, no contracts.</p>
            <div class="lp-pricing-highlights">
              <div class="lp-pricing-item">
                <span class="lp-pricing-amount">$0.07</span>
                <span class="lp-pricing-label">per voice minute</span>
              </div>
              <div class="lp-pricing-item">
                <span class="lp-pricing-amount">$0.01</span>
                <span class="lp-pricing-label">per SMS message</span>
              </div>
              <div class="lp-pricing-item">
                <span class="lp-pricing-amount">$20</span>
                <span class="lp-pricing-label">free credits on signup</span>
              </div>
            </div>
            <button class="btn btn-secondary btn-lg" onclick="navigateTo('/pricing')">
              View Full Pricing
            </button>
          </div>
        </section>

        <!-- FAQ Section -->
        <section class="lp-faq">
          <div class="lp-section-header">
            <h2>Frequently asked questions</h2>
          </div>
          <div class="lp-faq-list">
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
        <section class="lp-final-cta">
          <div class="cta-decoration">
            <div class="cta-orb-1"></div>
            <div class="cta-orb-2"></div>
            <div class="cta-grid"></div>
          </div>
          <div class="lp-cta-content">
            <h2>${data.finalCta.title}</h2>
            <p>${data.finalCta.subtitle}</p>
            <div class="lp-cta-buttons">
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

      <style>${getLandingStyles()}</style>
    `;
  }

  getIndustryLabel() {
    const labels = {
      healthcare: 'healthcare',
      'financial-services': 'financial services',
      insurance: 'insurance',
      logistics: 'logistics',
      'home-services': 'home services',
      retail: 'retail',
      'travel-hospitality': 'travel & hospitality',
      'debt-collection': 'debt collection',
    };
    return labels[this.slug] || this.slug;
  }

  getUseCaseLabel() {
    const labels = {
      'lead-qualification': 'lead qualification',
      'customer-support': 'customer support',
      receptionists: 'virtual receptionist',
      dispatch: 'dispatch',
    };
    return labels[this.slug] || this.slug;
  }
}
