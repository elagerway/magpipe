/**
 * Impersonation Banner Component
 * Shows when an admin is viewing the app as another user
 */

export function renderImpersonationBanner() {
  // Check if we're impersonating
  const impersonationData = sessionStorage.getItem('impersonation');
  if (!impersonationData) return;

  const { impersonatedBy, user } = JSON.parse(impersonationData);

  // Remove existing banner if any
  const existingBanner = document.getElementById('impersonation-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  // Create banner
  const banner = document.createElement('div');
  banner.id = 'impersonation-banner';
  banner.innerHTML = `
    <div class="impersonation-content">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span>Viewing as <strong>${user.email}</strong></span>
      <span class="impersonation-admin">(by ${impersonatedBy})</span>
    </div>
    <button id="exit-impersonation" class="btn btn-sm">
      Exit
    </button>
  `;

  // Add styles
  addImpersonationBannerStyles();

  // Insert at top of body
  document.body.insertBefore(banner, document.body.firstChild);

  // Handle exit - clear sessionStorage only (don't call signOut which broadcasts to other tabs)
  document.getElementById('exit-impersonation').addEventListener('click', () => {
    // Clear impersonation session data from sessionStorage
    sessionStorage.removeItem('impersonation');
    sessionStorage.removeItem('isImpersonating');
    sessionStorage.removeItem('magpipe-auth-token');
    // Close the tab or redirect to a goodbye page
    window.close();
    // Fallback if window.close() doesn't work (wasn't opened by script)
    setTimeout(() => {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><div style="text-align:center;"><h2>Session Ended</h2><p>You can close this tab.</p></div></div>';
    }, 100);
  });
}

export function addImpersonationBannerStyles() {
  if (document.getElementById('impersonation-banner-styles')) return;

  const style = document.createElement('style');
  style.id = 'impersonation-banner-styles';
  style.textContent = `
    #impersonation-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      color: white;
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 100000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      box-sizing: border-box;
    }

    .impersonation-content {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .impersonation-content svg {
      flex-shrink: 0;
    }

    .impersonation-admin {
      opacity: 0.8;
      font-size: 0.875rem;
    }

    #impersonation-banner .btn {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    #impersonation-banner .btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }


    /* Push down fixed headers and content when banner is present */
    body:has(#impersonation-banner) {
      padding-top: 40px;
    }

    body:has(#impersonation-banner) .public-header {
      top: 40px;
    }

    /* App sidebar navigation */
    body:has(#impersonation-banner) .bottom-nav {
      top: 40px;
    }

    /* Agent page content area */
    body:has(#impersonation-banner) .agent-page {
      top: 40px;
    }

    @media (max-width: 480px) {
      .impersonation-admin {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// Check and render on page load
export function initImpersonationBanner() {
  // Initial render
  renderImpersonationBanner();

  // Re-render on navigation (for SPA)
  const originalPushState = history.pushState;
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    setTimeout(renderImpersonationBanner, 100);
  };
}
