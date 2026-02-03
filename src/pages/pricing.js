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
          <h2>Estimate Your Cost</h2>
          <p class="calculator-subtitle">Adjust your usage, LLM, voice engine, and telephony to see real-time pricing</p>

          <div class="calculator-container">
            <!-- Left side: Controls -->
            <div class="calculator-controls">
              <div class="calculator-slider-group">
                <div class="slider-header">
                  <label>Minutes per Month</label>
                  <span class="slider-value" id="minutes-value">500</span>
                </div>
                <input type="range" id="minutes-slider" min="0" max="10000" value="500" step="50">
                <div class="slider-range">
                  <span>0</span>
                  <span>10,000</span>
                </div>
              </div>

              <div class="calculator-select-group">
                <label>LLM Model</label>
                <select id="llm-select">
                  <option value="0.025">GPT-5 ($0.025/min)</option>
                  <option value="0.015">GPT-5 mini ($0.015/min)</option>
                  <option value="0.008">GPT-5 nano ($0.008/min)</option>
                  <option value="0.003" selected>GPT-4o mini ($0.003/min)</option>
                  <option value="0.01">GPT-4o ($0.01/min)</option>
                  <option value="0.012">GPT-4.1 ($0.012/min)</option>
                  <option value="0.008">GPT-4.1 mini ($0.008/min)</option>
                  <option value="0.005">GPT-4.1 nano ($0.005/min)</option>
                  <option value="0.015">GPT-4 Turbo ($0.015/min)</option>
                </select>
              </div>

              <div class="calculator-select-group">
                <label>Voice Engine</label>
                <select id="voice-select">
                  <option value="0.03" selected>ElevenLabs ($0.03/min)</option>
                  <option value="0.025">Cartesia ($0.025/min)</option>
                  <option value="0.02">OpenAI TTS ($0.02/min)</option>
                  <option value="0.015">Deepgram ($0.015/min)</option>
                </select>
              </div>

              <div class="calculator-select-group">
                <label>Telephony</label>
                <select id="telephony-select">
                  <option value="0.015" selected>Solo Mobile Telephony ($0.015/min)</option>
                  <option value="0.02">Twilio ($0.02/min)</option>
                  <option value="0">Bring your own ($0.00/min)</option>
                </select>
              </div>
            </div>

            <!-- Right side: Cost breakdown -->
            <div class="calculator-result">
              <div class="cost-per-minute">
                <h3>Cost Per Minute</h3>
                <div class="result-breakdown">
                  <div class="breakdown-item">
                    <span>LLM</span>
                    <span id="llm-cost">$0.005</span>
                  </div>
                  <div class="breakdown-item">
                    <span>Voice</span>
                    <span id="voice-cost">$0.030</span>
                  </div>
                  <div class="breakdown-item">
                    <span>Telephony</span>
                    <span id="telephony-cost">$0.015</span>
                  </div>
                  <div class="breakdown-item total-per-min">
                    <span>Total per minute</span>
                    <span id="per-minute-cost">$0.050</span>
                  </div>
                </div>
              </div>
              <div class="result-total">
                <span>Estimated Monthly Cost</span>
                <span class="total-amount" id="total-cost">$25.00</span>
              </div>
              <p class="calculator-note">Over $2,000/mo? <a href="/custom-plan" onclick="event.preventDefault(); navigateTo('/custom-plan');">Talk to us for enterprise pricing</a></p>
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
          max-width: 900px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
          text-align: center;
        }

        .pricing-calculator h2 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .calculator-subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
        }

        .calculator-container {
          background: var(--bg-secondary);
          border-radius: 1rem;
          padding: 2rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          text-align: left;
        }

        .calculator-controls {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .calculator-slider-group {
          margin-bottom: 0;
        }

        .slider-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .slider-header label {
          font-weight: 500;
          color: var(--text-primary);
        }

        .slider-value {
          font-weight: 600;
          color: #10b981;
          font-size: 1.1rem;
        }

        .calculator-slider-group input[type="range"] {
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: var(--border-color);
          outline: none;
          -webkit-appearance: none;
          appearance: none;
        }

        .calculator-slider-group input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .calculator-select-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .calculator-select-group label {
          font-weight: 500;
          color: var(--text-primary);
          font-size: 0.9rem;
        }

        .calculator-select-group select {
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 0.9rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .calculator-select-group select:focus {
          outline: none;
          border-color: var(--primary-color);
        }

        .calculator-slider-group input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.5);
        }

        .calculator-slider-group input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
        }

        .slider-range {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.5rem;
        }

        .calculator-result {
          background: var(--bg-primary);
          border-radius: 0.75rem;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .cost-per-minute h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .result-breakdown {
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .breakdown-item {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .breakdown-item.highlight {
          color: var(--success-color);
        }

        .breakdown-item.total-per-min {
          font-weight: 600;
          color: var(--text-primary);
          padding-top: 0.75rem;
          margin-top: 0.5rem;
          border-top: 1px solid var(--border-color);
        }

        .result-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1rem;
          margin-top: auto;
        }

        .result-total span:first-child {
          font-weight: 500;
          color: var(--text-primary);
        }

        .total-amount {
          font-size: 2rem;
          font-weight: 700;
          color: var(--primary-color);
        }

        .calculator-note {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 1rem;
          text-align: center;
        }

        .calculator-note a {
          color: var(--primary-color);
          text-decoration: none;
        }

        .calculator-note a:hover {
          text-decoration: underline;
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
            padding: 1.5rem;
            grid-template-columns: 1fr;
          }

          .calculator-result {
            margin-top: 1rem;
          }

          .total-amount {
            font-size: 1.5rem;
          }

          .pricing-comparison h2,
          .pricing-breakdown h2,
          .pricing-faq h2,
          .pricing-cta h2 {
            font-size: 1.5rem;
          }

          .comparison-table {
            font-size: 0.875rem;
          }

          .comparison-table th,
          .comparison-table td {
            padding: 0.75rem 0.5rem;
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
    return `$${amount.toFixed(2)}`;
  }

  formatCostPerMin(amount) {
    return `$${amount.toFixed(3)}`;
  }

  updateCalculator() {
    const minutesSlider = document.getElementById('minutes-slider');
    const llmSelect = document.getElementById('llm-select');
    const voiceSelect = document.getElementById('voice-select');
    const telephonySelect = document.getElementById('telephony-select');

    if (!minutesSlider || !llmSelect || !voiceSelect || !telephonySelect) return;

    const minutes = parseInt(minutesSlider.value);
    const llmRate = parseFloat(llmSelect.value);
    const voiceRate = parseFloat(voiceSelect.value);
    const telephonyRate = parseFloat(telephonySelect.value);

    // Calculate cost per minute
    const totalPerMinute = llmRate + voiceRate + telephonyRate;
    const totalMonthlyCost = minutes * totalPerMinute;

    // Update display values
    document.getElementById('minutes-value').textContent = this.formatNumber(minutes);

    // Update cost breakdown
    document.getElementById('llm-cost').textContent = this.formatCostPerMin(llmRate);
    document.getElementById('voice-cost').textContent = this.formatCostPerMin(voiceRate);
    document.getElementById('telephony-cost').textContent = this.formatCostPerMin(telephonyRate);
    document.getElementById('per-minute-cost').textContent = this.formatCostPerMin(totalPerMinute);
    document.getElementById('total-cost').textContent = this.formatCurrency(totalMonthlyCost);
  }

  attachEventListeners() {
    // Calculator controls
    const minutesSlider = document.getElementById('minutes-slider');
    const llmSelect = document.getElementById('llm-select');
    const voiceSelect = document.getElementById('voice-select');
    const telephonySelect = document.getElementById('telephony-select');

    if (minutesSlider) {
      minutesSlider.addEventListener('input', () => this.updateCalculator());
    }

    if (llmSelect) {
      llmSelect.addEventListener('change', () => this.updateCalculator());
    }

    if (voiceSelect) {
      voiceSelect.addEventListener('change', () => this.updateCalculator());
    }

    if (telephonySelect) {
      telephonySelect.addEventListener('change', () => this.updateCalculator());
    }

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
  }
}
