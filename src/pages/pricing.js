/**
 * Public Pricing Page
 */

import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';

export default class PricingPage {
  constructor() {
    this.voiceRate = 0.07; // per minute
    this.messageRate = 0.001; // per message
    this.freeCredits = 20; // $20/month free
    this.expandedFaqs = new Set();
  }

  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="pricing-page">
        <!-- Header Navigation -->
        <header class="pricing-header">
          <div class="pricing-header-content">
            <a href="/" class="pricing-logo" onclick="event.preventDefault(); navigateTo('/');">
              Solo Mobile
            </a>
            <nav class="pricing-nav">
              <a href="/pricing" class="nav-link nav-link-active" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.solomobile.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
              <a href="/signup" class="btn btn-primary" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
            </nav>
          </div>
        </header>

        <!-- Hero Section -->
        <section class="pricing-hero">
          <!-- Decorative elements -->
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="hero-content">
            <h1>Transparent Pricing</h1>
            <p>Pay only for what you use. No hidden fees, no surprises.</p>
          </div>
        </section>

        <!-- Pricing Cards -->
        <section class="pricing-tiers">
          <div class="pricing-cards">
            <!-- Pay As You Go -->
            <div class="pricing-card">
              <div class="pricing-card-header">
                <span class="pricing-tier-label">PAY AS YOU GO</span>
                <h2>Pay for usage</h2>
                <div class="pricing-tier-price">
                  <span class="price-amount">$0</span>
                  <span class="price-suffix">to start</span>
                </div>
                <p class="pricing-tier-desc">Start instantly, scale as you grow</p>
              </div>

              <div class="pricing-card-body">
                <ul class="pricing-features-list">
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>$0.07</strong> per voice minute</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>$0.001</strong> per SMS message</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>$20</strong> free credits on signup</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Up to <strong>20</strong> concurrent calls</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>20</strong> Knowledge Bases included</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Email & Chat Support</span>
                  </li>
                </ul>
              </div>

              <div class="pricing-card-footer">
                <button class="btn btn-primary btn-full" onclick="navigateTo('/signup')">
                  Get Started Free
                </button>
              </div>
            </div>

            <!-- Custom Plan -->
            <div class="pricing-card pricing-card-featured">
              <div class="pricing-card-badge">ENTERPRISE</div>
              <div class="pricing-card-header">
                <span class="pricing-tier-label">HIGH VOLUME</span>
                <h2>Custom</h2>
                <div class="pricing-tier-price">
                  <span class="price-custom">Custom pricing</span>
                </div>
                <p class="pricing-tier-desc">For teams with 50+ concurrent calls</p>
              </div>

              <div class="pricing-card-body">
                <ul class="pricing-features-list">
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>Volume discounts</strong> on all usage</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>50+</strong> concurrent calls</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>Unlimited</strong> Knowledge Bases</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>Dedicated</strong> account manager</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span><strong>Priority</strong> support SLA</span>
                  </li>
                  <li>
                    <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Custom integrations</span>
                  </li>
                </ul>
              </div>

              <div class="pricing-card-footer">
                <button class="btn btn-primary btn-full" onclick="navigateTo('/custom-plan')">
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Interactive Calculator -->
        <section class="pricing-calculator">
          <div class="calculator-container">
            <!-- Left side: Controls -->
            <div class="calculator-controls">
              <!-- Minutes Input -->
              <div class="calculator-minutes-row">
                <label>How many minutes of calls do you have per month?</label>
                <input type="number" id="minutes-input" min="0" max="1000000" value="500" step="100">
              </div>
              <div class="calculator-slider-row">
                <input type="range" id="minutes-slider" min="0" max="10000" value="500" step="50">
                <div class="slider-range">
                  <span>0</span>
                  <span>10,000+</span>
                </div>
              </div>

              <!-- LLM Selection -->
              <div class="calculator-option-group">
                <label>LLM Agent</label>
                <div class="pill-group" id="llm-pills">
                  <button class="pill-btn" data-value="0.04">GPT 5</button>
                  <button class="pill-btn" data-value="0.012">GPT 5 mini</button>
                  <button class="pill-btn" data-value="0.003">GPT 5 nano</button>
                  <button class="pill-btn" data-value="0.045">GPT 4.1</button>
                  <button class="pill-btn" data-value="0.016">GPT 4.1 mini</button>
                  <button class="pill-btn" data-value="0.004">GPT 4.1 nano</button>
                  <button class="pill-btn" data-value="0.05">GPT 4o</button>
                  <button class="pill-btn active" data-value="0.006">GPT 4o mini</button>
                </div>
              </div>

              <!-- Voice Selection -->
              <div class="calculator-option-group">
                <label>Voice Engine</label>
                <div class="pill-group" id="voice-pills">
                  <button class="pill-btn active" data-value="0.07">Elevenlabs/Cartesia Voices</button>
                  <button class="pill-btn" data-value="0.08">OpenAI Voices</button>
                </div>
              </div>

              <!-- Telephony Selection -->
              <div class="calculator-option-group">
                <label>Telephony</label>
                <div class="pill-group" id="telephony-pills">
                  <button class="pill-btn" data-value="0">Custom Telephony</button>
                  <button class="pill-btn active" data-value="0.015">Solo Mobile Telephony</button>
                </div>
              </div>
            </div>

            <!-- Right side: Cost Card -->
            <div class="calculator-cost-card">
              <div class="cost-per-minute-row">
                <span class="cost-card-label">Cost Per Minute</span>
                <span class="cost-card-value" id="per-minute-cost">$ 0.091</span>
              </div>
              <div class="cost-breakdown-list">
                <div class="cost-breakdown-item">
                  <span class="breakdown-bullet"></span>
                  <span class="breakdown-label">LLM Cost</span>
                  <span class="breakdown-value" id="llm-cost">$ 0.006</span>
                </div>
                <div class="cost-breakdown-item">
                  <span class="breakdown-bullet"></span>
                  <span class="breakdown-label">Voice Engine Cost</span>
                  <span class="breakdown-value" id="voice-cost">$ 0.070</span>
                </div>
                <div class="cost-breakdown-item">
                  <span class="breakdown-bullet"></span>
                  <span class="breakdown-label">Telephony Cost</span>
                  <span class="breakdown-value" id="telephony-cost">$ 0.015</span>
                </div>
              </div>
              <div class="cost-total-row">
                <span class="total-label">Total</span>
                <span class="total-amount">$<span id="total-cost">45.50</span></span>
              </div>
            </div>
          </div>
          <p class="calculator-note">Over $2,000/mo? <a href="/custom-plan" onclick="event.preventDefault(); navigateTo('/custom-plan');">Talk to us for enterprise pricing</a></p>
        </section>

        <!-- Detailed Component Pricing -->
        <section class="component-pricing">
          <h2>Detailed Component Pricing</h2>

          <!-- Tabs -->
          <div class="component-tabs">
            <button class="component-tab active" data-tab="call-agent">Call Agent Pricing</button>
            <button class="component-tab" data-tab="add-ons">Add-ons</button>
            <button class="component-tab" data-tab="monthly">Monthly</button>
          </div>

          <!-- Tab Content -->
          <div class="component-tab-content">
            <!-- Call Agent Pricing Tab -->
            <div class="tab-panel active" id="tab-call-agent">
              <!-- Voice Engine Section -->
              <div class="pricing-section">
                <div class="pricing-section-header" data-section="voice">
                  <h3>Conversation Voice Engine</h3>
                  <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="pricing-section-content expanded" id="section-voice">
                  <table class="component-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Elevenlabs / Cartesia voices</td>
                        <td>$0.07/minute</td>
                      </tr>
                      <tr>
                        <td>OpenAI voices</td>
                        <td>$0.08/minute</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- LLM Section -->
              <div class="pricing-section">
                <div class="pricing-section-header" data-section="llm">
                  <h3>LLM</h3>
                  <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="pricing-section-content expanded" id="section-llm">
                  <table class="component-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Price</th>
                        <th>Fast Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>GPT 5</td>
                        <td>$0.04/minute</td>
                        <td>$0.08/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 5 mini</td>
                        <td>$0.012/minute</td>
                        <td>$0.024/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 5 nano</td>
                        <td>$0.003/minute</td>
                        <td>$0.006/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 4.1</td>
                        <td>$0.045/minute</td>
                        <td>$0.0675/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 4.1 mini</td>
                        <td>$0.016/minute</td>
                        <td>$0.024/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 4.1 nano</td>
                        <td>$0.004/minute</td>
                        <td>$0.006/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 4o</td>
                        <td>$0.05/minute</td>
                        <td>$0.075/minute</td>
                      </tr>
                      <tr>
                        <td>GPT 4o mini</td>
                        <td>$0.006/minute</td>
                        <td>$0.009/minute</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Telephony Section -->
              <div class="pricing-section">
                <div class="pricing-section-header" data-section="telephony">
                  <h3>Telephony</h3>
                  <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="pricing-section-content expanded" id="section-telephony">
                  <table class="component-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Solo Mobile Telephony</td>
                        <td>$0.015/min</td>
                      </tr>
                      <tr>
                        <td>SIP Trunking / Custom Telephony</td>
                        <td>No charge</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Add-ons Tab -->
            <div class="tab-panel" id="tab-add-ons">
              <div class="pricing-section">
                <div class="pricing-section-header" data-section="addons">
                  <h3>Call Agent Add-ons</h3>
                  <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="pricing-section-content expanded" id="section-addons">
                  <table class="component-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Knowledge Base</td>
                        <td>$0.005/minute</td>
                      </tr>
                      <tr>
                        <td>Batch Call</td>
                        <td>$0.005/dial</td>
                      </tr>
                      <tr>
                        <td>Branded Call</td>
                        <td>$0.10/outbound call</td>
                      </tr>
                      <tr>
                        <td>Advanced Denoising</td>
                        <td>$0.005/min</td>
                      </tr>
                      <tr>
                        <td>PII Removal</td>
                        <td>$0.01/min</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Monthly Tab -->
            <div class="tab-panel" id="tab-monthly">
              <div class="pricing-section">
                <div class="pricing-section-header" data-section="monthly">
                  <h3>Monthly Subscriptions</h3>
                  <svg class="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="pricing-section-content expanded" id="section-monthly">
                  <table class="component-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Phone Number</td>
                        <td>$2.00/month</td>
                      </tr>
                      <tr>
                        <td>Additional Concurrency (per slot)</td>
                        <td>$5.00/month</td>
                      </tr>
                      <tr>
                        <td>Additional Knowledge Base</td>
                        <td>$5.00/month</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Detailed Pricing Breakdown -->
        <section class="pricing-breakdown">
          <h2>Detailed Pricing</h2>
          <div class="breakdown-grid">
            <div class="breakdown-card">
              <div class="breakdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <h3>Voice Calls</h3>
              <div class="breakdown-price">$0.07<span>/minute</span></div>
              <p>AI-powered voice calls with natural conversation, call recording, and transcription included.</p>
            </div>

            <div class="breakdown-card">
              <div class="breakdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3>SMS Messages</h3>
              <div class="breakdown-price">$0.001<span>/message</span></div>
              <p>Intelligent SMS responses with context-aware AI and conversation threading.</p>
            </div>

            <div class="breakdown-card">
              <div class="breakdown-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <h3>Knowledge Bases</h3>
              <div class="breakdown-price">$5<span>/month each</span></div>
              <p>First 20 included free. Additional knowledge bases for expanded AI context.</p>
            </div>
          </div>
        </section>

        <!-- Feature Comparison Table -->
        <section class="pricing-comparison">
          <h2>Feature Comparison</h2>
          <div class="comparison-table-wrapper">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Pay as you go</th>
                  <th>Custom</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Free credits on signup</td>
                  <td>$20 (one-time)</td>
                  <td>Custom</td>
                </tr>
                <tr>
                  <td>Voice rate</td>
                  <td>$0.07/min</td>
                  <td>Volume discount</td>
                </tr>
                <tr>
                  <td>SMS rate</td>
                  <td>$0.001/msg</td>
                  <td>Volume discount</td>
                </tr>
                <tr>
                  <td>Concurrent calls</td>
                  <td>Up to 20</td>
                  <td>50+</td>
                </tr>
                <tr>
                  <td>Knowledge Bases</td>
                  <td>20 included (+$5/mo)</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Phone numbers</td>
                  <td>Included</td>
                  <td>Included</td>
                </tr>
                <tr>
                  <td>Call recording</td>
                  <td class="feature-included">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </td>
                  <td class="feature-included">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </td>
                </tr>
                <tr>
                  <td>Transcription</td>
                  <td class="feature-included">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </td>
                  <td class="feature-included">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </td>
                </tr>
                <tr>
                  <td>Support</td>
                  <td>Email & Chat</td>
                  <td>Dedicated + Priority SLA</td>
                </tr>
                <tr>
                  <td>Custom integrations</td>
                  <td class="feature-not-included">-</td>
                  <td class="feature-included">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- FAQ Section -->
        <section class="pricing-faq">
          <h2>Frequently Asked Questions</h2>
          <div class="faq-list" id="faq-list">
            ${this.renderFaqItems()}
          </div>
        </section>

        <!-- CTA Footer -->
        <section class="pricing-cta">
          <div class="cta-decoration">
            <div class="cta-gradient-orb cta-orb-1"></div>
            <div class="cta-gradient-orb cta-orb-2"></div>
            <div class="cta-grid"></div>
          </div>
          <div class="cta-content">
            <h2>Ready to get started?</h2>
            <p>Start with $20 in free credits on signup. Credit card required.</p>
            <div class="cta-buttons">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/custom-plan')">
                Contact Sales
              </button>
            </div>
          </div>
        </section>

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>
        .pricing-page {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        /* Header */
        .pricing-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 1rem 0;
        }

        .pricing-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pricing-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .pricing-nav {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-weight: 500;
          padding: 0.5rem 1rem;
          transition: color 0.15s;
        }

        .nav-link:hover {
          color: var(--primary-color);
        }

        .nav-link-active {
          color: var(--primary-color);
        }

        .btn-ghost {
          background: transparent;
          color: var(--text-primary);
          border: none;
        }

        .btn-ghost:hover {
          background: var(--bg-secondary);
        }

        /* Hero */
        .pricing-hero {
          position: relative;
          text-align: center;
          padding: 6rem 1.5rem;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          overflow: hidden;
        }

        .hero-decoration {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .hero-gradient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
        }

        .hero-orb-1 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          top: -150px;
          left: -100px;
        }

        .hero-orb-2 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
          bottom: -100px;
          right: -50px;
        }

        .hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }

        .pricing-hero h1 {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .pricing-hero p {
          font-size: 1.25rem;
          color: rgba(255, 255, 255, 0.7);
          max-width: 600px;
          margin: 0 auto;
        }

        /* Pricing Tiers */
        .pricing-tiers {
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 1.5rem 4rem;
        }

        .pricing-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 2rem;
        }

        .pricing-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 1rem;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s, transform 0.2s;
        }

        .pricing-card:hover {
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
          transform: translateY(-2px);
        }

        .pricing-card-featured {
          position: relative;
        }

        .pricing-card-badge {
          position: absolute;
          top: 0;
          right: 1.5rem;
          background: var(--primary-color);
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.25rem 0.75rem;
          border-radius: 0 0 0.5rem 0.5rem;
          letter-spacing: 0.05em;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .pricing-card-featured:hover .pricing-card-badge {
          opacity: 1;
        }

        .pricing-card-header {
          padding: 2rem 1.5rem 1.5rem;
          text-align: center;
          border-bottom: 1px solid var(--border-color);
          min-height: 200px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }

        .pricing-tier-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary-color);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .pricing-card-header h2 {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 0.5rem 0;
          color: var(--text-primary);
        }

        .pricing-tier-price {
          margin: 1rem 0;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .price-amount {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .price-suffix {
          font-size: 1rem;
          color: var(--text-secondary);
          margin-left: 0.25rem;
        }

        .price-custom {
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .pricing-tier-desc {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin: 0;
        }

        .pricing-card-body {
          padding: 1.5rem;
          flex: 1;
        }

        .pricing-features-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .pricing-features-list li {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.625rem 0;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .feature-check {
          width: 18px;
          height: 18px;
          color: var(--success-color);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .pricing-card-footer {
          padding: 1.5rem;
          border-top: 1px solid var(--border-color);
        }

        /* Calculator */
        .pricing-calculator {
          max-width: 1000px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
        }

        .calculator-container {
          background: linear-gradient(135deg, #4f7df3 0%, #6f8ef5 50%, #8b9ff7 100%);
          border-radius: 1.25rem;
          padding: 2.5rem;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 2.5rem;
        }

        /* Left side: Controls */
        .calculator-controls {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }

        /* Minutes Input */
        .calculator-minutes-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .calculator-minutes-row label {
          font-size: 0.95rem;
          font-weight: 400;
          color: #ffffff;
        }

        .calculator-minutes-row input[type="number"] {
          width: 100px;
          padding: 0.5rem 0.75rem;
          font-size: 1rem;
          font-weight: 500;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 0.375rem;
          background: transparent;
          color: #ffffff;
          text-align: right;
        }

        .calculator-minutes-row input[type="number"]:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.6);
        }

        .calculator-minutes-row input[type="number"]::-webkit-inner-spin-button,
        .calculator-minutes-row input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .calculator-minutes-row input[type="number"] {
          -moz-appearance: textfield;
        }

        /* Slider */
        .calculator-slider-row {
          margin-top: -0.5rem;
        }

        .calculator-slider-row input[type="range"] {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.3);
          outline: none;
          -webkit-appearance: none;
          appearance: none;
        }

        .calculator-slider-row input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: transform 0.15s;
        }

        .calculator-slider-row input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        .calculator-slider-row input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          border: none;
        }

        .slider-range {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.6);
          margin-top: 0.375rem;
        }

        /* Option Groups */
        .calculator-option-group {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .calculator-option-group label {
          font-size: 0.8rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Pill Buttons */
        .pill-group {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .pill-btn {
          padding: 0.5rem 0.875rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: #ffffff;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .pill-btn:hover {
          border-color: rgba(255, 255, 255, 0.6);
          background: rgba(255, 255, 255, 0.1);
        }

        .pill-btn.active {
          background: #ffffff;
          border-color: #ffffff;
          color: #4f7df3;
        }

        /* Cost Card */
        .calculator-cost-card {
          background: #ffffff;
          border-radius: 0.75rem;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
        }

        .cost-per-minute-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .cost-card-label {
          font-size: 0.9rem;
          font-weight: 500;
          color: #374151;
        }

        .cost-card-value {
          font-size: 1rem;
          font-weight: 600;
          color: #374151;
        }

        .cost-breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          margin-bottom: 1.5rem;
        }

        .cost-breakdown-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        .breakdown-bullet {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #9ca3af;
          flex-shrink: 0;
        }

        .breakdown-label {
          color: #6b7280;
          flex: 1;
        }

        .breakdown-value {
          color: #374151;
          font-weight: 500;
        }

        .cost-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
          margin-top: auto;
        }

        .total-label {
          font-size: 0.9rem;
          font-weight: 500;
          color: #374151;
        }

        .total-amount {
          font-size: 1.75rem;
          font-weight: 700;
          color: #4f7df3;
        }

        .calculator-note {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 1.25rem;
          text-align: center;
        }

        .calculator-note a {
          color: var(--primary-color);
          text-decoration: none;
        }

        .calculator-note a:hover {
          text-decoration: underline;
        }

        /* Component Pricing */
        .component-pricing {
          max-width: 900px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
        }

        .component-pricing h2 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 2rem;
          text-align: center;
        }

        /* Tabs */
        .component-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0;
        }

        .component-tab {
          background: none;
          border: none;
          padding: 0.75rem 1.25rem;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          position: relative;
          transition: color 0.15s;
        }

        .component-tab:hover {
          color: var(--text-primary);
        }

        .component-tab.active {
          color: var(--primary-color);
        }

        .component-tab.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--primary-color);
        }

        /* Tab Panels */
        .tab-panel {
          display: none;
        }

        .tab-panel.active {
          display: block;
        }

        /* Pricing Sections (Accordion) */
        .pricing-section {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 0.75rem;
          margin-bottom: 1rem;
          overflow: hidden;
        }

        .pricing-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          cursor: pointer;
          transition: background 0.15s;
        }

        .pricing-section-header:hover {
          background: var(--bg-secondary);
        }

        .pricing-section-header h3 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
        }

        .section-chevron {
          width: 20px;
          height: 20px;
          color: var(--text-secondary);
          transition: transform 0.2s;
        }

        .pricing-section-content.expanded + .pricing-section-header .section-chevron,
        .pricing-section-header.collapsed .section-chevron {
          transform: rotate(180deg);
        }

        .pricing-section-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
        }

        .pricing-section-content.expanded {
          max-height: 1000px;
        }

        /* Component Table */
        .component-table {
          width: 100%;
          border-collapse: collapse;
        }

        .component-table th,
        .component-table td {
          padding: 0.875rem 1.25rem;
          text-align: left;
          border-top: 1px solid var(--border-color);
        }

        .component-table th {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
          background: var(--bg-secondary);
        }

        .component-table td {
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .component-table tbody tr:hover {
          background: var(--bg-secondary);
        }

        .component-table td:not(:first-child) {
          font-weight: 500;
          color: var(--primary-color);
          text-align: right;
        }

        .component-table th:not(:first-child) {
          text-align: right;
        }

        /* Pricing Breakdown */
        .pricing-breakdown {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
          text-align: center;
        }

        .pricing-breakdown h2 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 2rem;
        }

        .breakdown-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .breakdown-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 1rem;
          padding: 2rem;
          text-align: center;
          transition: box-shadow 0.2s;
        }

        .breakdown-card:hover {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .breakdown-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 1rem;
          background: rgba(99, 102, 241, 0.1);
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .breakdown-icon svg {
          width: 24px;
          height: 24px;
          color: var(--primary-color);
        }

        .breakdown-card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .breakdown-price {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--primary-color);
          margin-bottom: 1rem;
        }

        .breakdown-price span {
          font-size: 0.875rem;
          font-weight: 400;
          color: var(--text-secondary);
        }

        .breakdown-card p {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.5;
        }

        /* Feature Comparison */
        .pricing-comparison {
          max-width: 900px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
          text-align: center;
        }

        .pricing-comparison h2 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 2rem;
        }

        .comparison-table-wrapper {
          overflow-x: auto;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .comparison-table th,
        .comparison-table td {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .comparison-table th {
          font-weight: 600;
          background: var(--bg-secondary);
        }

        .comparison-table th:first-child {
          border-radius: 0.5rem 0 0 0;
        }

        .comparison-table th:last-child {
          border-radius: 0 0.5rem 0 0;
        }

        .comparison-table th:not(:first-child),
        .comparison-table td:not(:first-child) {
          text-align: center;
        }

        .comparison-table th:first-child,
        .comparison-table td:first-child {
          text-align: left;
          width: 40%;
        }

        .comparison-table th:not(:first-child),
        .comparison-table td:not(:first-child) {
          width: 30%;
        }

        .feature-included svg {
          width: 20px;
          height: 20px;
          color: var(--success-color);
        }

        .feature-not-included {
          color: var(--text-secondary);
        }

        /* FAQ */
        .pricing-faq {
          max-width: 800px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
        }

        .pricing-faq h2 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 2rem;
          text-align: center;
        }

        .faq-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .faq-item {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 0.75rem;
          overflow: hidden;
        }

        .faq-question {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem;
          cursor: pointer;
          transition: background 0.15s;
        }

        .faq-question:hover {
          background: var(--bg-secondary);
        }

        .faq-question h3 {
          font-size: 1rem;
          font-weight: 500;
          margin: 0;
          color: var(--text-primary);
        }

        .faq-toggle {
          width: 24px;
          height: 24px;
          color: var(--text-secondary);
          transition: transform 0.2s;
        }

        .faq-item.expanded .faq-toggle {
          transform: rotate(180deg);
        }

        .faq-answer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease, padding 0.3s ease;
        }

        .faq-item.expanded .faq-answer {
          max-height: 500px;
        }

        .faq-answer-content {
          padding: 0 1.25rem 1.25rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* CTA */
        .pricing-cta {
          position: relative;
          text-align: center;
          padding: 5rem 1.5rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          overflow: hidden;
        }

        .cta-decoration {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .cta-gradient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
        }

        .cta-orb-1 {
          width: 350px;
          height: 350px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          top: -150px;
          right: 10%;
        }

        .cta-orb-2 {
          width: 250px;
          height: 250px;
          background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
          bottom: -100px;
          left: 15%;
        }

        .cta-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .cta-content {
          position: relative;
          z-index: 1;
        }

        .pricing-cta h2 {
          font-size: 2.25rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .pricing-cta p {
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 2rem;
        }

        .cta-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn-cta-primary {
          background: #ffffff;
          color: #0f172a;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(255, 255, 255, 0.2);
        }

        .btn-cta-secondary {
          background: transparent;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.3);
          transition: border-color 0.2s, background 0.2s;
        }

        .btn-cta-secondary:hover {
          border-color: rgba(255, 255, 255, 0.6);
          background: rgba(255, 255, 255, 0.1);
        }

        .btn-lg {
          padding: 0.875rem 2rem;
          font-size: 1rem;
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .pricing-hero {
            padding: 4rem 1.5rem;
          }

          .pricing-hero h1 {
            font-size: 2rem;
          }

          .pricing-hero p {
            font-size: 1rem;
          }

          .hero-orb-1 {
            width: 250px;
            height: 250px;
          }

          .hero-orb-2 {
            width: 200px;
            height: 200px;
          }

          .pricing-cta h2 {
            font-size: 1.5rem;
          }

          .pricing-cards {
            grid-template-columns: 1fr;
          }

          .price-amount {
            font-size: 2rem;
          }

          .calculator-container {
            grid-template-columns: 1fr;
            padding: 1.5rem;
            gap: 1.5rem;
          }

          .calculator-minutes-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .calculator-minutes-row input[type="number"] {
            width: 100%;
          }

          .pill-group {
            gap: 0.375rem;
          }

          .pill-btn {
            padding: 0.4rem 0.625rem;
            font-size: 0.75rem;
          }

          .calculator-cost-card {
            padding: 1.25rem;
          }

          .total-amount {
            font-size: 1.5rem;
          }

          .pricing-comparison h2,
          .pricing-breakdown h2,
          .pricing-faq h2,
          .pricing-cta h2,
          .component-pricing h2 {
            font-size: 1.5rem;
          }

          .component-tabs {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .component-tab {
            padding: 0.625rem 1rem;
            font-size: 0.85rem;
            white-space: nowrap;
          }

          .component-table th,
          .component-table td {
            padding: 0.75rem 1rem;
            font-size: 0.85rem;
          }

          .pricing-section-header {
            padding: 0.875rem 1rem;
          }

          .pricing-section-header h3 {
            font-size: 0.9rem;
          }

          .comparison-table {
            font-size: 0.875rem;
          }

          .comparison-table th,
          .comparison-table td {
            padding: 0.75rem 0.5rem;
          }
        }

        @media (max-width: 480px) {
          .pricing-hero {
            padding: 3rem 1rem;
          }

          .pricing-hero h1 {
            font-size: 1.75rem;
          }

          .calculator-container {
            padding: 1rem;
            gap: 1.25rem;
          }

          .calculator-option-group label {
            font-size: 0.7rem;
          }

          .pill-btn {
            padding: 0.375rem 0.5rem;
            font-size: 0.7rem;
          }

          .cost-per-minute-row,
          .cost-total-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }

          .total-amount {
            font-size: 1.25rem;
          }

          .pricing-tiers {
            padding: 0 1rem 3rem;
          }

          .pricing-breakdown,
          .pricing-comparison,
          .pricing-faq,
          .component-pricing {
            padding: 2.5rem 1rem;
          }

          .breakdown-grid {
            gap: 1rem;
          }

          .breakdown-card {
            padding: 1.5rem;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  renderFaqItems() {
    const faqs = [
      {
        question: 'How does billing work?',
        answer: "You're billed monthly based on actual usage. Voice calls are $0.07/minute and messages are $0.001 each. Your first $20 of usage each month is free."
      },
      {
        question: 'What counts as a minute?',
        answer: 'Voice minutes are billed per minute of call duration, rounded up to the nearest minute.'
      },
      {
        question: 'Can I upgrade or downgrade?',
        answer: 'You can switch between plans at any time. Contact us to discuss Custom plan options for high-volume usage.'
      },
      {
        question: 'Is there a free trial?',
        answer: "Yes! Every account gets $20 in free credits on signup. Credit card and phone verification required."
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards through Stripe, including Visa, Mastercard, American Express, and Discover.'
      }
    ];

    return faqs.map((faq, index) => `
      <div class="faq-item" data-faq-index="${index}">
        <div class="faq-question">
          <h3>${faq.question}</h3>
          <svg class="faq-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="faq-answer">
          <div class="faq-answer-content">${faq.answer}</div>
        </div>
      </div>
    `).join('');
  }

  formatNumber(num) {
    return num.toLocaleString();
  }

  formatCurrency(amount) {
    return amount.toFixed(2);
  }

  formatCostPerMin(amount) {
    return `$ ${amount.toFixed(3)}`;
  }

  getSelectedValue(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return 0;
    const activeBtn = group.querySelector('.pill-btn.active');
    return activeBtn ? parseFloat(activeBtn.dataset.value) : 0;
  }

  updateCalculator() {
    const minutesInput = document.getElementById('minutes-input');
    const minutesSlider = document.getElementById('minutes-slider');

    if (!minutesInput) return;

    const minutes = parseInt(minutesInput.value) || 0;
    const llmRate = this.getSelectedValue('llm-pills');
    const voiceRate = this.getSelectedValue('voice-pills');
    const telephonyRate = this.getSelectedValue('telephony-pills');

    // Calculate cost per minute
    const totalPerMinute = llmRate + voiceRate + telephonyRate;
    const totalMonthlyCost = minutes * totalPerMinute;

    // Update cost breakdown
    document.getElementById('llm-cost').textContent = this.formatCostPerMin(llmRate);
    document.getElementById('voice-cost').textContent = this.formatCostPerMin(voiceRate);
    document.getElementById('telephony-cost').textContent = this.formatCostPerMin(telephonyRate);
    document.getElementById('per-minute-cost').textContent = this.formatCostPerMin(totalPerMinute);
    document.getElementById('total-cost').textContent = this.formatCurrency(totalMonthlyCost);
  }

  attachEventListeners() {
    // Minutes input and slider
    const minutesInput = document.getElementById('minutes-input');
    const minutesSlider = document.getElementById('minutes-slider');

    if (minutesInput) {
      minutesInput.addEventListener('input', () => {
        // Sync slider (clamp to slider max)
        if (minutesSlider) {
          minutesSlider.value = Math.min(parseInt(minutesInput.value) || 0, 10000);
        }
        this.updateCalculator();
      });
    }

    if (minutesSlider) {
      minutesSlider.addEventListener('input', () => {
        // Sync input with slider
        if (minutesInput) {
          minutesInput.value = minutesSlider.value;
        }
        this.updateCalculator();
      });
    }

    // Pill button groups
    const pillGroups = ['llm-pills', 'voice-pills', 'telephony-pills'];
    pillGroups.forEach(groupId => {
      const group = document.getElementById(groupId);
      if (group) {
        group.addEventListener('click', (e) => {
          const btn = e.target.closest('.pill-btn');
          if (!btn) return;

          // Remove active from siblings
          group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
          // Add active to clicked
          btn.classList.add('active');

          this.updateCalculator();
        });
      }
    });

    // Initialize calculator
    this.updateCalculator();

    // FAQ accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      question.addEventListener('click', () => {
        const isExpanded = item.classList.contains('expanded');

        // Close all others
        faqItems.forEach(other => other.classList.remove('expanded'));

        // Toggle current
        if (!isExpanded) {
          item.classList.add('expanded');
        }
      });
    });

    // Component pricing tabs
    const tabs = document.querySelectorAll('.component-tab');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show corresponding panel
        tabPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `tab-${targetTab}`) {
            panel.classList.add('active');
          }
        });
      });
    });

    // Pricing section accordions
    const sectionHeaders = document.querySelectorAll('.pricing-section-header');
    sectionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const sectionId = header.dataset.section;
        const content = document.getElementById(`section-${sectionId}`);
        const chevron = header.querySelector('.section-chevron');

        if (content.classList.contains('expanded')) {
          content.classList.remove('expanded');
          chevron.style.transform = 'rotate(180deg)';
        } else {
          content.classList.add('expanded');
          chevron.style.transform = 'rotate(0deg)';
        }
      });
    });
  }
}
