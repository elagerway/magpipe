/**
 * Home/Landing Page
 */

import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';
import { renderPublicHeader, getPublicHeaderStyles } from '../components/PublicHeader.js';

// Store the install prompt for later use
let deferredPrompt = null;

// Listen for the beforeinstallprompt event (Chrome/Android)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install button if it exists
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

// Global install handler
window._installApp = async () => {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (deferredPrompt) {
    // Android/Chrome - use native prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
      const btn = document.getElementById('install-app-btn');
      if (btn) btn.style.display = 'none';
    }
  } else if (isIos) {
    // iOS - show instructions modal
    const modal = document.getElementById('ios-install-modal');
    if (modal) modal.classList.add('show');
  }
};

export default class HomePage {
  async render() {
    const appElement = document.getElementById('app');

    // Check if running as installed PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    appElement.innerHTML = `
      <div class="landing-page">
        ${renderPublicHeader({ activePage: 'home' })}

        <!-- Hero Section -->
        <section class="landing-hero">
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-gradient-orb hero-orb-3"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="hero-content">
            <p class="hero-byline">AI-Powered Communications Platform</p>
            <h1>Every Conversation<br>Answered.</h1>
            <p class="hero-subtitle">Intelligent conversation handling that works 24/7.</p>
            <div class="hero-cta">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
              <button class="btn btn-cta-secondary btn-lg" onclick="navigateTo('/pricing')">
                View Pricing
              </button>
            </div>
            ${!isStandalone ? `
              <button class="btn btn-install-app" id="install-app-btn" onclick="window._installApp()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Install Mobile App
              </button>
            ` : ''}
            <p class="hero-note">$20 in free credits on signup, credit card and verification required.</p>
          </div>
        </section>

        <!-- Features Section -->
        <section class="landing-features">
          <div class="features-header">
            <h2>Everything you need to manage your business communications</h2>
            <p>Powered by advanced AI to handle calls, texts, and emails naturally</p>
          </div>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <h3>Smart Call Handling</h3>
              <p>AI answers calls, screens unknown callers, takes messages, and transfers important calls to you.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3>Intelligent SMS</h3>
              <p>Context-aware text responses that understand conversation history and respond appropriately.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h3>Email AI</h3>
              <p>Automatically respond to emails with context-aware AI replies, drafts for review, or fully autonomous mode.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3>24/7 Availability</h3>
              <p>Your assistant never sleeps. Handle calls and messages around the clock.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3>Contact Management</h3>
              <p>Whitelist VIPs, block spam, and set custom rules for different callers.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
              <h3>Knowledge Base</h3>
              <p>Train your assistant with custom information to answer questions accurately.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3>Privacy First</h3>
              <p>Your data is encrypted and secure. Full control over what information is shared.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
                  <path d="M20 12a8 8 0 0 0-8-8v8h8z"/>
                </svg>
              </div>
              <h3>Analytics & Insights</h3>
              <p>Real-time dashboards with call volume, sentiment analysis, and conversation trends at a glance.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3>Real-Time Translation</h3>
              <p>Speak to callers in their language. Automatic translation across 30+ languages during live calls.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </div>
              <h3>Conversation Memory</h3>
              <p>Your agent remembers past interactions, caller preferences, and context across every conversation.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="8" height="8" rx="1"/>
                  <rect x="14" y="2" width="8" height="8" rx="1"/>
                  <rect x="2" y="14" width="8" height="8" rx="1"/>
                  <rect x="14" y="14" width="8" height="8" rx="1"/>
                </svg>
              </div>
              <h3>Integrations</h3>
              <p>Connect with HubSpot, Google Workspace, Zapier, and more. Sync contacts, log calls, and automate workflows.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <polyline points="17 11 19 13 23 9"/>
                </svg>
              </div>
              <h3>Warm Transfer</h3>
              <p>Seamlessly hand off live calls to you or your team when the AI detects a conversation needs a human touch.</p>
            </div>
          </div>
        </section>

        <!-- How It Works Section -->
        <section class="landing-how-it-works">
          <div class="how-header">
            <h2>Get started in minutes</h2>
            <p>Simple setup, powerful results</p>
          </div>
          <div class="how-steps">
            <div class="how-step">
              <div class="step-number">1</div>
              <h3>Sign Up</h3>
              <p>Create your account and get a dedicated phone number instantly.</p>
            </div>
            <div class="step-connector"></div>
            <div class="how-step">
              <div class="step-number">2</div>
              <h3>Configure</h3>
              <p>Customize how your AI assistant handles calls and messages.</p>
            </div>
            <div class="step-connector"></div>
            <div class="how-step">
              <div class="step-number">3</div>
              <h3>Go Live</h3>
              <p>Start receiving calls and let AI handle the rest.</p>
            </div>
          </div>
        </section>

        <!-- Pricing Preview Section -->
        <section class="landing-pricing-preview">
          <div class="pricing-preview-content">
            <h2>Simple, transparent pricing</h2>
            <p>Pay only for what you use. Start with $20 in free credits on signup.</p>
            <div class="pricing-highlights">
              <div class="pricing-highlight">
                <span class="highlight-price">$0.07</span>
                <span class="highlight-label">per voice minute</span>
              </div>
              <div class="pricing-highlight">
                <span class="highlight-price">$0.01</span>
                <span class="highlight-label">per SMS message</span>
              </div>
              <div class="pricing-highlight">
                <span class="highlight-price">$20</span>
                <span class="highlight-label">free credits on signup</span>
              </div>
            </div>
            <button class="btn btn-secondary btn-lg" onclick="navigateTo('/pricing')">
              View Full Pricing
            </button>
          </div>
        </section>

        <!-- CTA Section -->
        <section class="landing-cta">
          <div class="cta-decoration">
            <div class="cta-gradient-orb cta-orb-1"></div>
            <div class="cta-gradient-orb cta-orb-2"></div>
            <div class="cta-grid"></div>
          </div>
          <div class="cta-content">
            <h2>Ready to get started?</h2>
            <p>Join thousands using AI to manage their calls smarter.</p>
            <div class="cta-buttons">
              <button class="btn btn-cta-primary btn-lg" onclick="navigateTo('/signup')">
                Get Started Free
              </button>
            </div>
          </div>
        </section>

        <!-- Footer -->
        ${renderPublicFooter()}

        <!-- iOS Install Instructions Modal -->
        <div id="ios-install-modal" class="ios-modal-overlay">
          <div class="ios-modal">
            <h3>Install MAGPIPE</h3>
            <p>To install this app on your iPhone:</p>
            <ol>
              <li>Tap the <strong>Share</strong> button <span class="share-icon">↑</span></li>
              <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top right</li>
            </ol>
            <button id="close-ios-modal" class="btn btn-primary" style="width: 100%;">Got it</button>
          </div>
        </div>
      </div>

      <style>
        .landing-page {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        /* Header */
        ${getPublicHeaderStyles()}

        /* Hero Section */
        .landing-hero {
          position: relative;
          min-height: 90vh;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 12rem 1.5rem 20rem;
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
          filter: blur(140px);
          opacity: 0.5;
          will-change: transform;
          --mouse-x: 0px;
          --mouse-y: 0px;
        }

        .hero-orb-1 {
          width: 900px;
          height: 900px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
          top: -350px;
          left: -250px;
          animation: float1 20s ease-in-out infinite;
        }

        .hero-orb-2 {
          width: 800px;
          height: 800px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
          bottom: -300px;
          right: -200px;
          animation: float2 25s ease-in-out infinite;
        }

        .hero-orb-3 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
          top: 15%;
          right: 0%;
          opacity: 0.6;
          animation: float3 18s ease-in-out infinite;
        }

        @keyframes float1 {
          0% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
          25% {
            transform: translate(calc(300px + var(--mouse-x)), calc(200px + var(--mouse-y)));
          }
          50% {
            transform: translate(calc(500px + var(--mouse-x)), calc(400px + var(--mouse-y)));
          }
          75% {
            transform: translate(calc(250px + var(--mouse-x)), calc(200px + var(--mouse-y)));
          }
          100% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
        }

        @keyframes float2 {
          0% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
          25% {
            transform: translate(calc(-300px + var(--mouse-x)), calc(-200px + var(--mouse-y)));
          }
          50% {
            transform: translate(calc(-500px + var(--mouse-x)), calc(-350px + var(--mouse-y)));
          }
          75% {
            transform: translate(calc(-250px + var(--mouse-x)), calc(-150px + var(--mouse-y)));
          }
          100% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
        }

        @keyframes float3 {
          0% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
          25% {
            transform: translate(calc(-200px + var(--mouse-x)), calc(-150px + var(--mouse-y)));
          }
          50% {
            transform: translate(calc(-350px + var(--mouse-x)), calc(100px + var(--mouse-y)));
          }
          75% {
            transform: translate(calc(-150px + var(--mouse-x)), calc(200px + var(--mouse-y)));
          }
          100% {
            transform: translate(var(--mouse-x), var(--mouse-y));
          }
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
          max-width: 800px;
        }

        .hero-byline {
          font-size: 0.875rem;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 1rem;
        }

        .landing-hero h1 {
          font-size: 4rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.1;
          margin-bottom: 1.5rem;
          letter-spacing: -0.03em;
        }

        .hero-subtitle {
          font-size: 1.35rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 2.5rem;
          line-height: 1.6;
        }

        .hero-cta {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-bottom: 1.5rem;
        }

        .btn-cta-primary {
          background: #ffffff;
          color: #0f172a;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-cta-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(255, 255, 255, 0.25);
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
          padding: 1rem 2rem;
          font-size: 1rem;
        }

        .hero-note {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0;
        }

        .btn-install-app {
          display: none;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 1rem;
          padding: 0.7rem 1.5rem;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 0.75rem;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-install-app:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.4);
        }

        @media (max-width: 768px) {
          .btn-install-app {
            display: inline-flex;
          }
        }

        /* Features Section */
        .landing-features {
          padding: 6rem 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .features-header {
          text-align: center;
          margin-bottom: 4rem;
        }

        .features-header h2 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .features-header p {
          font-size: 1.2rem;
          color: var(--text-secondary);
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 2rem;
        }

        .feature-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 1rem;
          padding: 2rem;
          transition: box-shadow 0.2s, transform 0.2s;
        }

        .feature-card:hover {
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
          transform: translateY(-4px);
        }

        .feature-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
        }

        .feature-icon svg {
          width: 24px;
          height: 24px;
          color: var(--primary-color);
        }

        .feature-card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }

        .feature-card p {
          font-size: 0.95rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0;
        }

        /* How It Works */
        .landing-how-it-works {
          padding: 6rem 1.5rem;
          background: var(--bg-secondary);
        }

        .how-header {
          text-align: center;
          margin-bottom: 4rem;
        }

        .how-header h2 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }

        .how-header p {
          font-size: 1.2rem;
          color: var(--text-secondary);
        }

        .how-steps {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          gap: 1rem;
          max-width: 900px;
          margin: 0 auto;
          flex-wrap: wrap;
        }

        .how-step {
          text-align: center;
          flex: 1;
          min-width: 200px;
          max-width: 280px;
        }

        .step-number {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, #4f7df3 0%, #6f8ef5 50%, #8b9ff7 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          margin: 0 auto 1.25rem;
        }

        .how-step h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
        }

        .how-step p {
          font-size: 0.95rem;
          color: var(--text-secondary);
          margin: 0;
        }

        .step-connector {
          width: 60px;
          height: 2px;
          background: var(--border-color);
          margin-top: 28px;
        }

        /* Pricing Preview */
        .landing-pricing-preview {
          padding: 6rem 1.5rem;
          text-align: center;
        }

        .pricing-preview-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .pricing-preview-content h2 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }

        .pricing-preview-content > p {
          font-size: 1.2rem;
          color: var(--text-secondary);
          margin-bottom: 3rem;
        }

        .pricing-highlights {
          display: flex;
          justify-content: center;
          gap: 3rem;
          margin-bottom: 2.5rem;
          flex-wrap: wrap;
        }

        .pricing-highlight {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .highlight-price {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--primary-color);
        }

        .highlight-label {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        /* CTA Section */
        .landing-cta {
          position: relative;
          text-align: center;
          padding: 6rem 1.5rem;
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

        .landing-cta h2 {
          font-size: 2.5rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 1rem;
        }

        .landing-cta p {
          font-size: 1.2rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 2rem;
        }

        .cta-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* iOS Modal */
        .ios-modal-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 9999;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .ios-modal-overlay.show {
          display: flex;
        }

        .ios-modal {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          max-width: 340px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .ios-modal h3 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
        }

        .ios-modal p {
          color: var(--text-secondary);
          margin-bottom: 1rem;
          font-size: 0.9rem;
        }

        .ios-modal ol {
          text-align: left;
          padding-left: 1.25rem;
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
          line-height: 2;
        }

        .share-icon {
          display: inline-block;
          background: #007AFF;
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          text-align: center;
          line-height: 22px;
          font-size: 14px;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .landing-hero {
            min-height: auto;
            padding: 7rem 1.5rem 4rem;
          }

          .landing-hero h1 {
            font-size: 2.5rem;
          }

          .hero-byline {
            font-size: 0.75rem;
          }

          .hero-subtitle {
            font-size: 1.1rem;
          }

          .hero-orb-1 {
            width: 500px;
            height: 500px;
            top: -200px;
            left: -200px;
          }

          .hero-orb-2 {
            width: 450px;
            height: 450px;
            bottom: -200px;
            right: -150px;
          }

          .hero-orb-3 {
            width: 350px;
            height: 350px;
            opacity: 0.4;
          }

          .features-header h2,
          .how-header h2,
          .pricing-preview-content h2,
          .landing-cta h2 {
            font-size: 1.75rem;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }

          .step-connector {
            display: none;
          }

          .how-steps {
            flex-direction: column;
            align-items: center;
          }

          .pricing-highlights {
            gap: 2rem;
          }

          .highlight-price {
            font-size: 2rem;
          }
        }

        @media (max-width: 480px) {
          .landing-hero {
            padding: 5rem 1rem 3rem;
          }

          .landing-hero h1 {
            font-size: 1.75rem;
          }

          .hero-subtitle {
            font-size: 1rem;
          }

          .hero-buttons {
            flex-direction: column;
            width: 100%;
          }

          .hero-buttons .btn {
            width: 100%;
          }

          .landing-nav .nav-link {
            display: none;
          }

          .features-header h2,
          .how-header h2,
          .pricing-preview-content h2,
          .landing-cta h2 {
            font-size: 1.5rem;
          }

          .features-section,
          .how-section,
          .pricing-preview,
          .landing-cta {
            padding: 3rem 1rem;
          }

          .feature-card,
          .step {
            padding: 1.5rem;
          }

          .pricing-highlights {
            flex-direction: column;
            gap: 1.5rem;
          }

          .highlight-price {
            font-size: 1.75rem;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const iosModal = document.getElementById('ios-install-modal');
    const closeModalBtn = document.getElementById('close-ios-modal');

    // Close iOS modal
    if (closeModalBtn && iosModal) {
      closeModalBtn.addEventListener('click', () => {
        iosModal.classList.remove('show');
      });

      // Close on backdrop click
      iosModal.addEventListener('click', (e) => {
        if (e.target === iosModal) {
          iosModal.classList.remove('show');
        }
      });
    }

    // Mouse parallax effect for hero orbs
    const heroSection = document.querySelector('.landing-hero');
    const orb1 = document.querySelector('.hero-orb-1');
    const orb2 = document.querySelector('.hero-orb-2');
    const orb3 = document.querySelector('.hero-orb-3');

    if (heroSection && orb1 && orb2 && orb3) {
      document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;

        // Each orb moves at different speeds for depth effect - dramatic movement
        // Using CSS custom properties so animation and mouse interaction combine
        orb1.style.setProperty('--mouse-x', `${x * 120}px`);
        orb1.style.setProperty('--mouse-y', `${y * 80}px`);

        orb2.style.setProperty('--mouse-x', `${x * -100}px`);
        orb2.style.setProperty('--mouse-y', `${y * -70}px`);

        orb3.style.setProperty('--mouse-x', `${x * 80}px`);
        orb3.style.setProperty('--mouse-y', `${y * -60}px`);
      });
    }
  }
}
