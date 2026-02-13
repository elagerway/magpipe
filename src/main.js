/**
 * Main Application Entry Point
 * Handles routing, authentication state, and app initialization
 */

import { supabase, getCurrentUser } from './lib/supabase.js';
import { Router } from './router.js';
import { ChatWidget } from './models/ChatWidget.js';
import { initPushNotifications } from './services/pushNotifications.js';

class App {
  constructor() {
    this.router = new Router();
    this.currentUser = null;
    this.hiddenPortalPages = [];
    this.portalWidgetConfig = null;
    this.init();
  }

  async init() {
    // Check if Supabase is reachable before doing anything
    const supabaseHealthy = await this.checkSupabaseHealth();
    if (!supabaseHealthy) {
      const { default: MaintenancePage } = await import('./pages/maintenance.js');
      const page = new MaintenancePage();
      await page.render();
      return; // Don't initialize anything else
    }

    // Check authentication state
    await this.checkAuth();

    // Set up auth state listener
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      this.handleAuthStateChange(event, session);
    });

    // Initialize router
    this.router.init();

    // Expose router globally for navigation
    window.router = this.router;

    // Expose supabase for debugging
    window.supabase = supabase;

    // Set up global dialpad function
    this.setupGlobalDialpad();

    // Listen for route changes to update widget visibility
    window.addEventListener('popstate', () => this.updateWidgetVisibility());
    // Also listen for pushstate changes (SPA navigation)
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.updateWidgetVisibility(), 100);
    };

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      this.registerServiceWorker();
    }
  }

  async checkSupabaseHealth() {
    try {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async checkAuth() {
    // First try to get the existing session (restores from storage)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Error restoring session:', sessionError);
    }

    // If we have a session from storage, use it immediately
    // This prevents redirect to login on cold start when network is slow
    if (session?.user) {
      console.log('Session restored from storage');
      this.currentUser = session.user;

      // Load portal widget if configured
      this.loadPortalWidget(session.user.id);

      // Try to refresh in background (don't block on this)
      supabase.auth.refreshSession().then(({ data: { session: refreshedSession } }) => {
        if (refreshedSession?.user) {
          this.currentUser = refreshedSession.user;
        }
      }).catch(() => {
        // Ignore refresh errors on cold start - we'll retry later
      });

      return;
    }

    // No session in storage, check if we can get user directly
    const { user, error } = await getCurrentUser();

    if (error) {
      console.error('Error checking auth:', error);
      return;
    }

    this.currentUser = user;
  }

  async handleAuthStateChange(event, session) {
    if (event === 'SIGNED_IN') {
      this.currentUser = session?.user || null;

      // Don't redirect if user is already on a protected route or browsing public pages
      // This prevents navigation during token refresh or tab focus
      const authRedirectRoutes = ['/login', '/signup']; // Only redirect from auth pages
      const currentPath = window.location.pathname;

      if (!authRedirectRoutes.includes(currentPath)) {
        // User is on a protected route or public content page, don't redirect
        console.log('Auth state change, staying on:', currentPath);
        return;
      }

      // Process pending team invitation (from OAuth signup flow)
      const pendingInviteId = localStorage.getItem('pending_team_invite');
      if (pendingInviteId && session?.user) {
        localStorage.removeItem('pending_team_invite');
        try {
          const { OrganizationMember } = await import('./models/OrganizationMember.js');
          const { member } = await OrganizationMember.approve(pendingInviteId, session.user.id);
          if (member) {
            await supabase
              .from('users')
              .update({ current_organization_id: member.organization_id })
              .eq('id', session.user.id);
          }
        } catch (inviteErr) {
          console.error('Failed to process team invitation:', inviteErr);
        }
      }

      // Check if user has verified phone number
      const { User } = await import('./models/User.js');
      const { profile } = await User.getProfile(session.user.id);

      if (!profile) {
        // Profile doesn't exist yet, create it (new OAuth user)
        const name = session.user.user_metadata?.name || session.user.user_metadata?.full_name || 'User';
        await User.createProfile(session.user.id, session.user.email, name);

        // Send signup notification (fire and forget) - skip for impersonation sessions
        const isImpersonating = sessionStorage.getItem('isImpersonating') === 'true';
        if (!isImpersonating) {
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email: session.user.email })
          }).catch(() => {});
        }

        this.router.navigate('/verify-phone');
      } else if (!profile.phone_verified) {
        // Phone not verified, redirect to phone verification
        this.router.navigate('/verify-phone');
      } else {
        // Everything set up, go to inbox
        this.router.navigate('/inbox');
      }

      // Load portal widget if configured
      this.loadPortalWidget(session.user.id);

      // Initialize push notifications (only if user has them enabled)
      initPushNotifications().catch(err => console.error('Push init error:', err));
    } else if (event === 'SIGNED_OUT') {
      this.currentUser = null;
      this.removePortalWidget();
      this.router.navigate('/login');
    }
  }

  setupGlobalDialpad() {
    // Make dialpad accessible from anywhere in the app
    window.showDialpad = () => {
      // Navigate to inbox and show dialpad
      this.router.navigate('/inbox');
      // Wait for page to render then show dialpad
      setTimeout(() => {
        const inboxPage = this.router.currentPage;
        if (inboxPage && inboxPage.showCallInterface) {
          inboxPage.showCallInterface();
        }
      }, 100);
    };
  }

  async loadPortalWidget(userId) {
    try {
      // First try to get user's own portal widget
      let { widget, error } = await ChatWidget.getPortalWidget(userId);

      // If user doesn't have their own widget, fall back to global Magpipe widget
      if (!widget) {
        const globalResult = await ChatWidget.getGlobalPortalWidget();
        widget = globalResult.widget;
        error = globalResult.error;
      }

      if (error || !widget) {
        return; // No portal widget available
      }

      // Store hidden pages for route change handling
      // Always force /admin to be hidden (system-protected page)
      this.hiddenPortalPages = widget.hidden_portal_pages || ['/agent', '/inbox'];

      // Check if widget should be hidden on current page
      const currentPath = window.location.pathname;
      if (this.isPageHiddenForWidget(currentPath)) {
        console.log('Widget hidden on page:', currentPath);
        return;
      }

      // Check if widget is already loaded
      if (document.getElementById('chat-widget')) {
        return;
      }

      // Get user's profile info for portal mode (if auto-collect is enabled)
      let visitorName = null;
      let visitorEmail = null;
      if (widget.auto_collect_user_data !== false) {
        try {
          const { data: profile } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', userId)
            .single();
          if (profile) {
            visitorName = profile.name;
            visitorEmail = profile.email;
          }
        } catch (e) {
          console.warn('Could not fetch user profile for widget:', e);
        }
      }

      // Store widget config for re-loading after navigation
      this.portalWidgetConfig = {
        widgetKey: widget.widget_key,
        isPortal: true,
        primaryColor: widget.primary_color,
        position: widget.position,
        offsetX: widget.offset_x || 20,
        offsetY: widget.offset_y || 20,
        name: widget.name,
        welcomeMessage: widget.welcome_message,
        useAiGreeting: widget.use_ai_greeting ?? true,
        visitorName: visitorName,
        visitorEmail: visitorEmail
      };

      // Inject the widget script
      this.injectPortalWidget();
    } catch (err) {
      console.error('Error loading portal widget:', err);
    }
  }

  injectPortalWidget() {
    if (!this.portalWidgetConfig) return;

    // Check if widget is already loaded
    if (document.getElementById('chat-widget')) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'chat-widget';
    script.src = '/widget/magpipe-chat.js';
    script.async = true;
    script.onload = () => {
      // Initialize widget with the widget key and portal mode
      if (window.MagpipeChat) {
        window.MagpipeChat('init', this.portalWidgetConfig);
      }
    };
    document.body.appendChild(script);
  }

  isPageHiddenForWidget(path) {
    // Always hide widget on public pages
    const publicPages = ['/', '/pricing', '/custom-plan', '/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/impersonate'];
    if (publicPages.includes(path)) {
      return true;
    }

    if (!this.hiddenPortalPages || this.hiddenPortalPages.length === 0) {
      return false;
    }
    // Check if any hidden page pattern matches the current path
    return this.hiddenPortalPages.some(hiddenPath => {
      // Exact match or path starts with hidden path
      return path === hiddenPath || path.startsWith(hiddenPath + '/');
    });
  }

  updateWidgetVisibility() {
    const currentPath = window.location.pathname;
    const container = document.getElementById('magpipe-chat-container');

    if (this.isPageHiddenForWidget(currentPath)) {
      // Hide widget on this page
      if (container) {
        container.style.display = 'none';
      }
    } else {
      // Show widget on this page
      if (container) {
        container.style.display = '';
      } else if (this.portalWidgetConfig) {
        // Widget not loaded yet, inject it
        this.injectPortalWidget();
      }
    }
  }

  removePortalWidget() {
    // Remove widget script
    const script = document.getElementById('chat-widget');
    if (script) {
      script.remove();
    }

    // Remove widget container
    const container = document.getElementById('magpipe-chat-container');
    if (container) {
      container.remove();
    }

    // Clean up global function
    if (window.MagpipeChat) {
      delete window.MagpipeChat;
    }
  }

  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}