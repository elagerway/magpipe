/**
 * Main Application Entry Point
 * Handles routing, authentication state, and app initialization
 */

import { supabase, getCurrentUser } from './lib/supabase.js';
import { Router } from './router.js';

class App {
  constructor() {
    this.router = new Router();
    this.currentUser = null;
    this.init();
  }

  async init() {
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

    // Register service worker for PWA
    // Temporarily disabled to avoid Chrome extension errors
    // if ('serviceWorker' in navigator) {
    //   this.registerServiceWorker();
    // }
  }

  async checkAuth() {
    // First try to get the existing session (restores from storage)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Error restoring session:', sessionError);
    }

    // If we have a session, try to refresh it to ensure it's still valid
    if (session) {
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Session refresh failed:', refreshError.message);
        // Session might be expired, user will need to re-login
      } else if (refreshedSession) {
        this.currentUser = refreshedSession.user;
        return;
      }
    }

    // Fall back to getUser if session restoration didn't work
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

      // Don't redirect if user is already on a protected route
      // This prevents navigation during token refresh or tab focus
      const publicRoutes = ['/', '/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'];
      const currentPath = window.location.pathname;

      if (!publicRoutes.includes(currentPath)) {
        // User is already on a protected route, don't redirect
        console.log('Auth refresh on protected route, staying on:', currentPath);
        return;
      }

      // Check if user has verified phone number
      const { User } = await import('./models/User.js');
      const { profile } = await User.getProfile(session.user.id);

      if (!profile) {
        // Profile doesn't exist yet, create it
        await User.createProfile(session.user.id, session.user.email, session.user.user_metadata?.name || 'User');
        this.router.navigate('/verify-phone');
      } else if (!profile.phone_verified) {
        // Phone not verified, redirect to phone verification
        this.router.navigate('/verify-phone');
      } else {
        // Everything set up, go to dashboard
        this.router.navigate('/dashboard');
      }
    } else if (event === 'SIGNED_OUT') {
      this.currentUser = null;
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