/**
 * Low Balance Banner Component
 * Shows when user's credit balance is at or below $1
 * Follows ImpersonationBanner.js pattern
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';

let _balanceCache = { balance: null, fetchedAt: 0 };

async function fetchBalance() {
  // Cache for 30 seconds to avoid excessive queries
  if (_balanceCache.balance !== null && Date.now() - _balanceCache.fetchedAt < 30000) {
    return _balanceCache.balance;
  }

  try {
    const { user } = await getCurrentUser();
    if (!user) return null;

    const { data } = await supabase
      .from('users')
      .select('credits_balance')
      .eq('id', user.id)
      .single();

    const balance = data?.credits_balance ?? null;
    _balanceCache = { balance, fetchedAt: Date.now() };
    return balance;
  } catch {
    return null;
  }
}

export async function renderLowBalanceBanner() {
  // Don't show if dismissed this session
  if (sessionStorage.getItem('low-balance-dismissed')) return;

  // Don't show on public pages
  const publicPaths = ['/', '/login', '/signup', '/verify-email', '/forgot-password', '/reset-password', '/pricing', '/privacy', '/terms'];
  if (publicPaths.includes(window.location.pathname)) return;

  const balance = await fetchBalance();
  if (balance === null) return;

  if (balance > 1) {
    // Remove banner if balance recovered
    const existing = document.getElementById('low-balance-banner');
    if (existing) existing.remove();
    return;
  }

  // Remove existing banner if any (re-render with updated balance)
  const existingBanner = document.getElementById('low-balance-banner');
  if (existingBanner) existingBanner.remove();

  // Create banner
  const banner = document.createElement('div');
  banner.id = 'low-balance-banner';
  banner.innerHTML = `
    <div class="low-balance-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>Your balance is low: <strong>$${balance.toFixed(2)}</strong></span>
    </div>
    <div class="low-balance-actions">
      <a href="/settings?tab=billing" id="low-balance-add-credits" class="low-balance-link">Add Credits</a>
      <button id="low-balance-dismiss" class="low-balance-dismiss-btn">&times;</button>
    </div>
  `;

  // Add styles
  addLowBalanceBannerStyles();

  // Insert at top of body (after impersonation banner if present)
  const impersonationBanner = document.getElementById('impersonation-banner');
  if (impersonationBanner) {
    impersonationBanner.after(banner);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Handle dismiss
  document.getElementById('low-balance-dismiss').addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.setItem('low-balance-dismissed', 'true');
    banner.remove();
  });

  // Handle add credits link (SPA navigation)
  document.getElementById('low-balance-add-credits').addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', '/settings?tab=billing');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

export function addLowBalanceBannerStyles() {
  if (document.getElementById('low-balance-banner-styles')) return;

  const style = document.createElement('style');
  style.id = 'low-balance-banner-styles';
  style.textContent = `
    #low-balance-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      color: white;
      padding: 0.5rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 100000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      box-sizing: border-box;
    }

    .low-balance-content {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .low-balance-content svg {
      flex-shrink: 0;
    }

    .low-balance-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .low-balance-link {
      color: white;
      font-size: 0.8125rem;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }

    .low-balance-link:hover {
      opacity: 0.9;
    }

    .low-balance-dismiss-btn {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      padding: 0;
    }

    .low-balance-dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Push down content when low balance banner is present */
    body:has(#low-balance-banner) {
      padding-top: 40px;
    }

    body:has(#low-balance-banner) .public-header {
      top: 40px;
    }

    body:has(#low-balance-banner) .bottom-nav {
      top: 40px;
    }

    body:has(#low-balance-banner) .agent-page {
      top: 40px;
    }

    /* When both impersonation AND low-balance banners are present, stack them */
    body:has(#impersonation-banner):has(#low-balance-banner) {
      padding-top: 80px;
    }

    body:has(#impersonation-banner):has(#low-balance-banner) .public-header {
      top: 80px;
    }

    body:has(#impersonation-banner):has(#low-balance-banner) .bottom-nav {
      top: 80px;
    }

    body:has(#impersonation-banner):has(#low-balance-banner) .agent-page {
      top: 80px;
    }

    body:has(#impersonation-banner) #low-balance-banner {
      top: 40px;
    }

    @media (max-width: 480px) {
      .low-balance-content span {
        font-size: 0.8125rem;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize: render on load and re-render on SPA navigation
export function initLowBalanceBanner() {
  // Initial render (delayed to allow auth to initialize)
  setTimeout(() => renderLowBalanceBanner(), 1500);

  // Re-render on navigation (for SPA) - only wrap once
  if (!history._lowBalanceWrapped) {
    history._lowBalanceWrapped = true;
    const current = history.pushState;
    history.pushState = function() {
      current.apply(this, arguments);
      // Clear dismiss on navigation so banner reappears if still low
      sessionStorage.removeItem('low-balance-dismissed');
      // Invalidate cache on navigation
      _balanceCache.fetchedAt = 0;
      setTimeout(() => renderLowBalanceBanner(), 300);
    };
  }

  // Also listen for popstate (back/forward)
  window.addEventListener('popstate', () => {
    sessionStorage.removeItem('low-balance-dismissed');
    _balanceCache.fetchedAt = 0;
    setTimeout(() => renderLowBalanceBanner(), 300);
  });
}
