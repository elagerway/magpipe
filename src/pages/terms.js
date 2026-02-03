/**
 * Terms of Use Page
 */

import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';

export default class TermsPage {
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
            <h1>Terms of Use</h1>
            <p class="legal-updated">Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

            <section class="legal-section">
              <h2>1. Acceptance of Terms</h2>
              <p>By accessing or using MAGPIPE's services ("Service"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, please do not use our Service.</p>
            </section>

            <section class="legal-section">
              <h2>2. Description of Service</h2>
              <p>MAGPIPE provides an AI-powered voice and text platform that handles phone calls and text messages on behalf of users. Our Service includes call answering, message handling, AI-generated responses, and related features.</p>
            </section>

            <section class="legal-section">
              <h2>3. Account Registration</h2>
              <p>To use our Service, you must:</p>
              <ul>
                <li>Create an account with accurate and complete information</li>
                <li>Be at least 18 years of age</li>
                <li>Verify your phone number and payment method</li>
                <li>Keep your account credentials secure</li>
              </ul>
              <p>You are responsible for all activities that occur under your account.</p>
            </section>

            <section class="legal-section">
              <h2>4. Acceptable Use</h2>
              <p>You agree not to use the Service to:</p>
              <ul>
                <li>Violate any applicable laws or regulations</li>
                <li>Engage in fraudulent, deceptive, or misleading activities</li>
                <li>Harass, abuse, or harm others</li>
                <li>Send spam, unsolicited messages, or make automated calls for marketing without consent</li>
                <li>Impersonate any person or entity</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use the Service for any illegal telemarketing or robocalling</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>5. Payment Terms</h2>
              <p>By using our paid services, you agree to:</p>
              <ul>
                <li>Pay all applicable fees as described in our pricing</li>
                <li>Provide accurate billing information</li>
                <li>Authorize us to charge your payment method</li>
              </ul>
              <p>Usage is billed based on voice minutes and text messages processed. New accounts receive $20 in free credits upon signup. All fees are non-refundable except as required by law.</p>
            </section>

            <section class="legal-section">
              <h2>6. AI-Generated Content</h2>
              <p>Our Service uses artificial intelligence to generate responses and handle communications. You acknowledge that:</p>
              <ul>
                <li>AI-generated responses may not always be accurate or appropriate</li>
                <li>You are responsible for configuring your AI assistant appropriately</li>
                <li>You should review and monitor AI-generated communications</li>
                <li>We are not liable for any consequences of AI-generated content</li>
              </ul>
            </section>

            <section class="legal-section">
              <h2>7. Intellectual Property</h2>
              <p>The Service, including all content, features, and functionality, is owned by MAGPIPE and is protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express permission.</p>
            </section>

            <section class="legal-section">
              <h2>8. Privacy</h2>
              <p>Your use of the Service is also governed by our <a href="/privacy" onclick="event.preventDefault(); navigateTo('/privacy');">Privacy Policy</a>, which describes how we collect, use, and protect your information.</p>
            </section>

            <section class="legal-section">
              <h2>9. Disclaimer of Warranties</h2>
              <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.</p>
            </section>

            <section class="legal-section">
              <h2>10. Limitation of Liability</h2>
              <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOLO MOBILE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.</p>
            </section>

            <section class="legal-section">
              <h2>11. Indemnification</h2>
              <p>You agree to indemnify and hold harmless MAGPIPE and its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the Service or violation of these Terms.</p>
            </section>

            <section class="legal-section">
              <h2>12. Termination</h2>
              <p>We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice. Upon termination, your right to use the Service will immediately cease.</p>
            </section>

            <section class="legal-section">
              <h2>13. Changes to Terms</h2>
              <p>We may modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our website. Your continued use of the Service after changes constitutes acceptance of the modified Terms.</p>
            </section>

            <section class="legal-section">
              <h2>14. Governing Law</h2>
              <p>These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions.</p>
            </section>

            <section class="legal-section">
              <h2>15. Contact Us</h2>
              <p>If you have questions about these Terms, please contact us at:</p>
              <p><a href="mailto:legal@magpipe.ai">legal@magpipe.ai</a></p>
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
