/**
 * Client-side Router
 * Handles navigation and route rendering
 */

import { getCurrentUser, supabase } from './lib/supabase.js';
import { initImpersonationBanner } from './components/ImpersonationBanner.js';

export class Router {
  constructor() {
    this.routes = new Map();
    this.dynamicRoutes = []; // For routes with parameters like /agents/:id
    this.currentRoute = null;
    this.currentPage = null; // Current page instance for cleanup
    this.currentParams = {}; // Route parameters (e.g., { id: '123' })
    this.pageCache = new Map(); // Cache page instances
    this.setupRoutes();
  }

  setupRoutes() {
    // Public routes
    this.addRoute('/', () => import('./pages/home.js'), false);
    this.addRoute('/login', () => import('./pages/login.js'), false);
    this.addRoute('/signup', () => import('./pages/signup.js'), false);
    this.addRoute('/verify-email', () => import('./pages/verify-email.js'), false);
    this.addRoute('/forgot-password', () => import('./pages/forgot-password.js'), false);
    this.addRoute('/reset-password', () => import('./pages/reset-password.js'), false);
    this.addRoute('/impersonate', () => import('./pages/impersonate.js'), false);
    this.addRoute('/pricing', () => import('./pages/pricing.js'), false);
    this.addRoute('/custom-plan', () => import('./pages/custom-plan.js'), false);
    this.addRoute('/privacy', () => import('./pages/privacy.js'), false);
    this.addRoute('/terms', () => import('./pages/terms.js'), false);

    // Protected routes
    this.addRoute('/agent', () => import('./pages/agent.js'), true);
    this.addRoute('/inbox', () => import('./pages/inbox.js'), true);
    this.addRoute('/phone', () => import('./pages/phone.js'), true);
    this.addRoute('/verify-phone', () => import('./pages/verify-phone.js'), true);
    this.addRoute('/select-number', () => import('./pages/select-number.js'), true);
    this.addRoute('/manage-numbers', () => import('./pages/manage-numbers.js'), true);
    this.addRoute('/agent-config', () => import('./pages/agent-config.js'), true);
    this.addRoute('/contacts', () => import('./pages/contacts.js'), true);
    this.addRoute('/calls', () => import('./pages/calls.js'), true);
    this.addRoute('/messages', () => import('./pages/messages.js'), true);
    this.addRoute('/apps', () => import('./pages/apps.js'), true);
    this.addRoute('/knowledge', () => import('./pages/knowledge.js'), true);
    this.addRoute('/settings', () => import('./pages/settings.js'), true);
    this.addRoute('/team', () => import('./pages/team.js'), true);
    this.addRoute('/bulk-calling', () => import('./pages/bulk-calling.js'), true);

    // Admin routes (role-protected)
    this.addRoute('/admin', () => import('./pages/admin.js'), true, ['admin', 'support', 'god']);

    // Agents routes (multi-agent support)
    this.addRoute('/agents', () => import('./pages/agents.js'), true);
    this.addDynamicRoute('/agents/:id', () => import('./pages/agent-detail.js'), true);

    // Chat widget settings
    this.addDynamicRoute('/chat-widget/:id', () => import('./pages/chat-widget-settings.js'), true);
  }

  addRoute(path, loader, requiresAuth = false, requiredRoles = null) {
    this.routes.set(path, { loader, requiresAuth, requiredRoles });
  }

  /**
   * Add a dynamic route with parameters (e.g., /agents/:id)
   */
  addDynamicRoute(pattern, loader, requiresAuth = false, requiredRoles = null) {
    // Convert pattern like /agents/:id to regex
    const paramNames = [];
    const regexPattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPattern}$`);

    this.dynamicRoutes.push({
      pattern,
      regex,
      paramNames,
      loader,
      requiresAuth,
      requiredRoles
    });
  }

  /**
   * Match a path against dynamic routes and extract parameters
   */
  matchDynamicRoute(path) {
    for (const route of this.dynamicRoutes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return { route, params };
      }
    }
    return null;
  }

  async init() {
    // Initialize impersonation banner
    initImpersonationBanner();

    // Start preloading Inbox immediately (most common first navigation)
    this.preloadInbox();

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.loadRoute(window.location.pathname + window.location.search);
    });

    // Handle initial route (include query string)
    await this.loadRoute(window.location.pathname + window.location.search);
  }

  // Preload inbox module early for fast first navigation
  async preloadInbox() {
    try {
      const route = this.routes.get('/inbox');
      if (route && !this.pageCache.has('/inbox')) {
        const pageModule = await route.loader();
        const Page = pageModule.default;
        this.pageCache.set('/inbox', new Page());
      }
    } catch (e) {
      // Ignore preload errors
    }
  }

  async navigate(path, replace = false) {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }

    await this.loadRoute(path);

    // Scroll to top after page renders
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }

  async loadRoute(fullPath) {
    // Strip query string for route lookup, but preserve it for the page
    const path = fullPath.split('?')[0];

    // Try static routes first
    let route = this.routes.get(path);
    let params = {};

    // If not found, try dynamic routes
    if (!route) {
      const dynamicMatch = this.matchDynamicRoute(path);
      if (dynamicMatch) {
        route = dynamicMatch.route;
        params = dynamicMatch.params;
      }
    }

    if (!route) {
      // Route not found, redirect to home
      this.navigate('/', true);
      return;
    }

    // Store current params for page access
    this.currentParams = params;

    // Check authentication (getCurrentUser uses caching)
    if (route.requiresAuth) {
      const { user } = await getCurrentUser();

      if (!user) {
        // Redirect to login
        this.navigate('/login', true);
        return;
      }

      // Check role requirements
      if (route.requiredRoles && route.requiredRoles.length > 0) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!profile || !route.requiredRoles.includes(profile.role)) {
          // User doesn't have required role, redirect to agent
          this.navigate('/agent', true);
          return;
        }
      }
    }

    // Cleanup previous page if it has a cleanup method
    if (this.currentPage && typeof this.currentPage.cleanup === 'function') {
      try {
        this.currentPage.cleanup();
      } catch (e) {
        console.error('Error during page cleanup:', e);
      }
    }

    // Load and render page (with caching for main tabs)
    try {
      // Don't cache inbox or dynamic routes - they need fresh instances
      const cacheable = ['/agent', '/phone', '/contacts', '/apps', '/settings'];
      const isDynamicRoute = Object.keys(params).length > 0;
      let page;

      if (!isDynamicRoute && cacheable.includes(path) && this.pageCache.has(path)) {
        // Use cached page instance
        page = this.pageCache.get(path);
      } else {
        // Create new page instance
        const pageModule = await route.loader();
        const Page = pageModule.default;
        // Pass params to dynamic route pages
        page = new Page(isDynamicRoute ? params : undefined);

        // Cache main tab pages (not dynamic routes)
        if (!isDynamicRoute && cacheable.includes(path)) {
          this.pageCache.set(path, page);
        }
      }

      this.currentRoute = path;
      this.currentPage = page;
      await page.render();

      // Preload other main tabs in background after first render
      if (cacheable.includes(path)) {
        this.preloadTabs(path);
      }
    } catch (error) {
      console.error('Error loading route:', error);
      this.renderError(error);
    }
  }

  // Preload other main tabs in background
  preloadTabs(currentPath) {
    // Don't preload inbox - it needs fresh instances for dynamic rendering
    const tabs = ['/agent', '/phone', '/contacts', '/apps', '/settings'];
    const toPreload = tabs.filter(t => t !== currentPath && !this.pageCache.has(t));

    // Preload immediately but don't block - use requestIdleCallback if available
    const preload = () => {
      toPreload.forEach(async (path) => {
        try {
          const route = this.routes.get(path);
          if (route) {
            const pageModule = await route.loader();
            const Page = pageModule.default;
            this.pageCache.set(path, new Page());
          }
        } catch (e) {
          // Ignore preload errors
        }
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(preload);
    } else {
      setTimeout(preload, 100);
    }
  }

  renderError(error) {
    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="container" style="padding-top: 2rem;">
        <div class="card">
          <h2>Error Loading Page</h2>
          <p class="text-muted">${error.message}</p>
          <button class="btn btn-primary" onclick="window.location.reload()">
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
}

// Make router available globally for navigation
window.navigateTo = (path) => {
  if (window.router) {
    window.router.navigate(path);
  }
};