/**
 * Client-side Router
 * Handles navigation and route rendering
 */

import { getCurrentUser, supabase } from './lib/supabase.js';
import { initImpersonationBanner } from './components/ImpersonationBanner.js';

export class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
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

    // Protected routes
    this.addRoute('/agent', () => import('./pages/agent.js'), true);
    this.addRoute('/dashboard', () => import('./pages/dashboard.js'), true);
    this.addRoute('/inbox', () => import('./pages/inbox.js'), true);
    this.addRoute('/phone', () => import('./pages/phone.js'), true);
    this.addRoute('/verify-phone', () => import('./pages/verify-phone.js'), true);
    this.addRoute('/select-number', () => import('./pages/select-number.js'), true);
    this.addRoute('/manage-numbers', () => import('./pages/manage-numbers.js'), true);
    this.addRoute('/agent-config', () => import('./pages/agent-config.js'), true);
    this.addRoute('/contacts', () => import('./pages/contacts.js'), true);
    this.addRoute('/calls', () => import('./pages/calls.js'), true);
    this.addRoute('/messages', () => import('./pages/messages.js'), true);
    this.addRoute('/settings', () => import('./pages/settings.js'), true);
    this.addRoute('/bulk-calling', () => import('./pages/bulk-calling.js'), true);

    // Admin routes (role-protected)
    this.addRoute('/admin', () => import('./pages/admin.js'), true, ['admin', 'support']);
  }

  addRoute(path, loader, requiresAuth = false, requiredRoles = null) {
    this.routes.set(path, { loader, requiresAuth, requiredRoles });
  }

  async init() {
    // Initialize impersonation banner
    initImpersonationBanner();

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.loadRoute(window.location.pathname + window.location.search);
    });

    // Handle initial route (include query string)
    await this.loadRoute(window.location.pathname + window.location.search);
  }

  async navigate(path, replace = false) {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }

    await this.loadRoute(path);
  }

  async loadRoute(fullPath) {
    // Strip query string for route lookup, but preserve it for the page
    const path = fullPath.split('?')[0];
    const route = this.routes.get(path);

    if (!route) {
      // Route not found, redirect to home
      this.navigate('/', true);
      return;
    }

    // Check authentication
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
          // User doesn't have required role, redirect to dashboard
          this.navigate('/dashboard', true);
          return;
        }
      }
    }

    // Load and render page
    try {
      const pageModule = await route.loader();
      const Page = pageModule.default;
      const page = new Page();

      this.currentRoute = path;
      await page.render();
    } catch (error) {
      console.error('Error loading route:', error);
      this.renderError(error);
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