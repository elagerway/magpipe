/**
 * Privacy Policy Page
 */

import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';

export default class PrivacyPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="legal-page">
        <!-- Header Navigation -->
        <header class="legal-header">
          <div class="legal-header-content">
            <a href="/" class="legal-logo" onclick="event.preventDefault(); navigateTo('/');">
              MAGPIPE
            </a>
            <nav class="legal-nav">
              <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.magpipe.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
              <a href="/signup" class="btn btn-primary" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
            </nav>
          </div>
        </header>

        <!-- Main Content -->
        <main class="legal-main">
          <div class="legal-container">
            <h1>Privacy Policy</h1>
            <p class="legal-updated">Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

            <section class="legal-section">
              <h2>1. Introduction</h2>
              <p>MAGPIPE ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered voice and text platform service.</p>
            </section>

            <section class="legal-section">
              <h2>2. Information We Collect</h2>
              <h3>Personal Information</h3>
              <p>We may collect personal information that you provide directly to us, including:</p>
              <ul>
                <li>Name and email address</li>
                <li>Phone number</li>
                <li>Payment and billing information</li>
                <li>Account credentials</li>
              </ul>

              <h3>Usage Information</h3>
              <p>We automatically collect certain information when you use our service:</p>
              <ul>
                <li>Call logs and recordings (when enabled)</li>
                <li>Text message content and metadata</li>
                <li>Device and browser information</li>
                <li>IP address and location data</li>
                <li>Usage patterns and preferences</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul>
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices, updates, and support messages</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Train and improve our AI models</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, investigate, and prevent fraudulent or unauthorized activities</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>4. Information Sharing</h2>
              <p>We may share your information in the following circumstances:</p>
              <ul>
                <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf</li>
                <li><strong>Legal Requirements:</strong> When required by law or to respond to legal process</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> When you have given us permission to share</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>5. Data Security</h2>
              <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure.</p>
            </section>

            <section class="legal-section">
              <h2>6. Data Retention</h2>
              <p>We retain your personal information for as long as necessary to fulfill the purposes for which it was collected, including to satisfy legal, accounting, or reporting requirements. Call recordings and message content may be retained for a limited period as specified in your account settings.</p>
            </section>

            <section class="legal-section">
              <h2>7. Your Rights</h2>
              <p>Depending on your location, you may have certain rights regarding your personal information:</p>
              <ul>
                <li>Access and receive a copy of your data</li>
                <li>Rectify inaccurate or incomplete data</li>
                <li>Request deletion of your data</li>
                <li>Object to or restrict processing of your data</li>
                <li>Data portability</li>
                <li>Withdraw consent at any time</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>8. Children's Privacy</h2>
              <p>Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.</p>
            </section>

            <section class="legal-section">
              <h2>9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>
            </section>

            <section class="legal-section">
              <h2>10. Contact Us</h2>
              <p>If you have questions about this Privacy Policy, please contact us at:</p>
              <p><a href="mailto:privacy@magpipe.ai">privacy@magpipe.ai</a></p>
            </section>
          </div>
        </main>

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>
        .legal-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .legal-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 0.75rem 0;
        }

        .legal-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .legal-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .legal-nav {
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

        .btn-ghost {
          background: transparent;
          color: var(--text-primary);
          border: none;
        }

        .btn-ghost:hover {
          background: var(--bg-secondary);
        }

        /* Main Content */
        .legal-main {
          flex: 1;
          padding: 3rem 1.5rem;
        }

        .legal-container {
          max-width: 800px;
          margin: 0 auto;
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 3rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .legal-container h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .legal-updated {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-size: 0.875rem;
        }

        .legal-section {
          margin-bottom: 2rem;
        }

        .legal-section h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .legal-section h3 {
          font-size: 1rem;
          font-weight: 600;
          margin: 1.5rem 0 0.75rem;
          color: var(--text-primary);
        }

        .legal-section p {
          color: var(--text-secondary);
          line-height: 1.7;
          margin-bottom: 1rem;
        }

        .legal-section ul {
          color: var(--text-secondary);
          line-height: 1.7;
          margin-bottom: 1rem;
          padding-left: 1.5rem;
        }

        .legal-section li {
          margin-bottom: 0.5rem;
        }

        .legal-section a {
          color: var(--primary-color);
          text-decoration: none;
        }

        .legal-section a:hover {
          text-decoration: underline;
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* Mobile */
        @media (max-width: 768px) {
          .legal-nav .nav-link {
            display: none;
          }

          .legal-container {
            padding: 1.5rem;
          }

          .legal-container h1 {
            font-size: 1.75rem;
          }

          .footer-content {
            flex-direction: column;
            gap: 2rem;
          }

          .footer-links {
            gap: 2rem;
          }
        }
      </style>
    `;
  }
}
