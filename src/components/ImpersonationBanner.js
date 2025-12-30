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

  // Handle exit
  document.getElementById('exit-impersonation').addEventListener('click', () => {
    sessionStorage.removeItem('impersonation');
    window.close();
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
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      color: white;
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    #impersonation-banner + * {
      margin-top: 44px; /* Height of banner */
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

    /* Adjust body padding when banner is present */
    body:has(#impersonation-banner) .container,
    body:has(#impersonation-banner) .admin-container {
      padding-top: 44px;
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
