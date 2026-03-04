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
          <img src="/magpipe-bird.png" alt="" class="public-header-logo-img" />
        </a>
        <nav class="public-header-nav">
          <a href="/pricing" class="nav-link ${isActive('pricing')}" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
          <a href="/custom-plan" class="nav-link ${isActive('enterprise')}" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
          <a href="https://docs.magpipe.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
          <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
          <a href="/signup" class="btn btn-primary" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
          <a href="https://github.com/elagerway/magpipe" class="nav-link nav-github-link" target="_blank" rel="noopener" aria-label="GitHub">
            <svg width="28" height="28" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>
          </a>
        </nav>
        <button class="public-header-hamburger" onclick="document.querySelector('.public-header-mobile-menu').classList.toggle('open')" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="public-header-mobile-menu">
        <a href="/pricing" class="${isActive('pricing')}" onclick="event.preventDefault(); document.querySelector('.public-header-mobile-menu').classList.remove('open'); navigateTo('/pricing');">Pricing</a>
        <a href="/custom-plan" class="${isActive('enterprise')}" onclick="event.preventDefault(); document.querySelector('.public-header-mobile-menu').classList.remove('open'); navigateTo('/custom-plan');">Enterprise</a>
        <a href="https://docs.magpipe.ai" target="_blank" rel="noopener">Docs</a>
        <a href="https://github.com/elagerway/magpipe" target="_blank" rel="noopener">GitHub</a>
        <a href="/login" onclick="event.preventDefault(); document.querySelector('.public-header-mobile-menu').classList.remove('open'); navigateTo('/login');">Sign In</a>
        <a href="/signup" class="mobile-menu-cta" onclick="event.preventDefault(); document.querySelector('.public-header-mobile-menu').classList.remove('open'); navigateTo('/signup');">Get Started</a>
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
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .public-header-logo-img {
      height: 36px;
      width: auto;
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

    .public-header-nav .nav-github-link {
      display: flex;
      align-items: center;
      padding: 0.5rem;
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

    .public-header-hamburger {
      display: none;
      background: none;
      border: none;
      color: var(--text-primary);
      cursor: pointer;
      padding: 0.5rem;
    }

    .public-header-mobile-menu {
      display: none;
      flex-direction: column;
      padding: 0 1.5rem 1rem;
      border-top: 1px solid var(--border-color);
    }

    .public-header-mobile-menu a {
      padding: 0.75rem 0;
      color: var(--text-primary);
      text-decoration: none;
      font-weight: 500;
      font-size: 1rem;
      border-bottom: 1px solid var(--border-color);
    }

    .public-header-mobile-menu a:last-child {
      border-bottom: none;
    }

    .public-header-mobile-menu .mobile-menu-cta {
      margin-top: 0.75rem;
      background: var(--primary-color);
      color: white;
      text-align: center;
      padding: 0.75rem;
      border-radius: 0.5rem;
      border-bottom: none;
    }

    @media (max-width: 768px) {
      .public-header-nav {
        display: none;
      }

      .public-header-hamburger {
        display: block;
      }

      .public-header-mobile-menu.open {
        display: flex;
      }
    }
  `;
}
