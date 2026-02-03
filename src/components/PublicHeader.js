/**
 * Public Header Component
 * Reusable header/nav for all public pages
 */

/**
 * Render the public header HTML
 * @param {Object} options - Configuration options
 * @param {string} options.activePage - Current active page ('home', 'pricing', 'enterprise', 'login', 'signup')
 * @returns {string} Header HTML
 */
export function renderPublicHeader(options = {}) {
  const { activePage = '' } = options;

  const isActive = (page) => activePage === page ? 'nav-link-active' : '';

  return `
    <header class="public-header">
      <div class="public-header-content">
        <a href="/" class="public-header-logo" onclick="event.preventDefault(); navigateTo('/');">
          MAGPIPE
        </a>
        <nav class="public-header-nav">
          <a href="/pricing" class="nav-link ${isActive('pricing')}" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
          <a href="/custom-plan" class="nav-link ${isActive('enterprise')}" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
          <a href="https://docs.solomobile.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
          <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
          <a href="/signup" class="btn btn-primary" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
        </nav>
      </div>
    </header>
  `;
}

/**
 * Get the public header CSS styles
 * @returns {string} CSS styles
 */
export function getPublicHeaderStyles() {
  return `
    .public-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border-color);
      z-index: 100;
      padding: 1rem 0;
    }

    /* Spacer to offset fixed header */
    .public-header + * {
      margin-top: 60px;
    }

    .public-header-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .public-header-logo {
      font-family: 'Inter', sans-serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
      text-decoration: none;
      letter-spacing: 0.02em;
    }

    .public-header-nav {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .public-header-nav .nav-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 500;
      padding: 0.5rem 1rem;
      transition: color 0.15s;
    }

    .public-header-nav .nav-link:hover {
      color: var(--primary-color);
    }

    .public-header-nav .nav-link-active {
      color: var(--primary-color);
    }

    .public-header-nav .btn-ghost {
      background: transparent;
      color: var(--text-primary);
      border: none;
    }

    .public-header-nav .btn-ghost:hover {
      background: var(--bg-secondary);
    }

    @media (max-width: 768px) {
      .public-header-nav .nav-link {
        padding: 0.375rem 0.625rem;
        font-size: 0.875rem;
      }
    }

    @media (max-width: 480px) {
      .public-header-content {
        padding: 0 1rem;
      }

      .public-header-nav .nav-link {
        display: none;
      }

      .public-header-nav .btn-ghost {
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
      }

      .public-header-nav .btn-primary {
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
      }
    }
  `;
}
