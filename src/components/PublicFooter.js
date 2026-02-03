/**
 * Public Footer Component
 * Reusable footer for all public pages
 */

/**
 * Render the public footer HTML
 * @returns {string} Footer HTML
 */
export function renderPublicFooter() {
  return `
    <footer class="public-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <span class="footer-logo">Solo Mobile</span>
          <p>AI-powered phone assistant for modern professionals.</p>
        </div>
        <div class="footer-links">
          <div class="footer-column">
            <h4>Product</h4>
            <a href="/pricing" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
            <a href="/custom-plan" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
            <a href="/signup" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
          </div>
          <div class="footer-column">
            <h4>Developers</h4>
            <a href="https://docs.solomobile.ai" target="_blank" rel="noopener">Documentation</a>
            <a href="https://docs.solomobile.ai/api" target="_blank" rel="noopener">API Reference</a>
          </div>
          <div class="footer-column">
            <h4>Company</h4>
            <a href="/custom-plan" onclick="event.preventDefault(); navigateTo('/custom-plan');">Contact Sales</a>
          </div>
          <div class="footer-column">
            <h4>Legal</h4>
            <a href="/privacy" onclick="event.preventDefault(); navigateTo('/privacy');">Privacy Policy</a>
            <a href="/terms" onclick="event.preventDefault(); navigateTo('/terms');">Terms of Use</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; ${new Date().getFullYear()} Solo Mobile. All rights reserved.</p>
      </div>
    </footer>
  `;
}

/**
 * Get the public footer CSS styles
 * @returns {string} CSS styles
 */
export function getPublicFooterStyles() {
  return `
    .public-footer {
      background: #0f172a;
      color: rgba(255, 255, 255, 0.7);
      padding: 3rem 1.5rem 1.5rem;
    }

    .public-footer .footer-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      gap: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .public-footer .footer-brand {
      max-width: 300px;
    }

    .public-footer .footer-logo {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
    }

    .public-footer .footer-brand p {
      margin-top: 1rem;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .public-footer .footer-links {
      display: flex;
      gap: 3rem;
    }

    .public-footer .footer-column h4 {
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .public-footer .footer-column a {
      display: block;
      color: rgba(255, 255, 255, 0.6);
      text-decoration: none;
      font-size: 0.9rem;
      padding: 0.375rem 0;
      transition: color 0.15s;
    }

    .public-footer .footer-column a:hover {
      color: #ffffff;
    }

    .public-footer .footer-bottom {
      max-width: 1200px;
      margin: 0 auto;
      padding-top: 1.5rem;
      text-align: center;
    }

    .public-footer .footer-bottom p {
      font-size: 0.875rem;
      margin: 0;
    }

    @media (max-width: 768px) {
      .public-footer .footer-content {
        flex-direction: column;
        gap: 2rem;
      }

      .public-footer .footer-links {
        flex-wrap: wrap;
        gap: 2rem;
      }

      .public-footer .footer-column {
        min-width: 140px;
      }
    }
  `;
}
