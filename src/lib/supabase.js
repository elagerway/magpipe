/**
 * Supabase Client Configuration
 * Initializes and exports the Supabase client for use throughout the application.
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables (will be set via import.meta.env in Vite)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check .env file.');
}

// Custom storage adapter using IndexedDB for better persistence on iOS PWAs
// Falls back to localStorage if IndexedDB is unavailable
const DB_NAME = 'magpipe-auth';
const STORE_NAME = 'session';

class IndexedDBStorage {
  constructor() {
    this.dbPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => {
        console.warn('IndexedDB unavailable, falling back to localStorage');
        resolve(null);
      };

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async getItem(key) {
    try {
      // Check localStorage FIRST (synchronous) - critical for cold start
      // This ensures we don't wait for IndexedDB to initialize
      const localValue = localStorage.getItem(key);
      if (localValue) {
        return localValue;
      }

      // Only check IndexedDB if localStorage is empty
      const db = await this.dbPromise;
      if (!db) return null;

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => {
          const value = request.result;
          resolve(value || null);
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return localStorage.getItem(key);
    }
  }

  async setItem(key, value) {
    try {
      const db = await this.dbPromise;
      // Always write to localStorage as backup
      localStorage.setItem(key, value);

      if (!db) return;

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
    } catch {
      localStorage.setItem(key, value);
    }
  }

  async removeItem(key) {
    try {
      localStorage.removeItem(key);
      const db = await this.dbPromise;
      if (!db) return;

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
      });
    } catch {
      localStorage.removeItem(key);
    }
  }
}

const customStorage = new IndexedDBStorage();

// Check if this tab is an impersonation session (uses sessionStorage)
const isImpersonating = sessionStorage.getItem('isImpersonating') === 'true';

// Initialize Supabase client
// - Impersonation tabs use sessionStorage (tab-isolated)
// - Normal tabs use IndexedDB/localStorage (shared across tabs)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: !isImpersonating, // Don't detect URL tokens in impersonation mode
    storage: isImpersonating ? sessionStorage : customStorage,
    storageKey: 'magpipe-auth-token',
  },
});

// User cache for performance
let cachedUser = null;
let userCacheTime = 0;
const USER_CACHE_TTL = 60000; // 1 minute cache

// Clear cache on auth state change
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
    cachedUser = null;
    userCacheTime = 0;
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    userCacheTime = 0; // Force refresh on next call
    // Auto-save browser timezone so notifications use the correct local time
    if (session?.user?.id) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        supabase.from('users').update({ timezone: tz }).eq('id', session.user.id).then(() => {});
      }
    }
  }
});

/**
 * Wrap getSession() with a timeout to prevent hanging when Supabase SDK
 * makes an internal network call (token refresh/validation) that stalls.
 * getSession() should read from local storage (fast), but sometimes doesn't.
 */
export async function safeGetSession(timeoutMs = 3000) {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), timeoutMs)),
    ]);
    return result;
  } catch {
    console.warn('getSession timed out, returning null session');
    return { data: { session: null }, error: null };
  }
}

/**
 * Get the current authenticated user (with caching)
 * First tries local session (no network), then falls back to API
 * @param {boolean} forceRefresh - Force refresh from API
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function getCurrentUser(forceRefresh = false) {
  const now = Date.now();

  // Return cached user if valid
  if (!forceRefresh && cachedUser && (now - userCacheTime) < USER_CACHE_TTL) {
    return { user: cachedUser, error: null };
  }

  // First try to get user from local session (no network required)
  // This is critical for cold start when network might not be ready
  const { data: { session } } = await safeGetSession();
  if (session?.user) {
    cachedUser = session.user;
    userCacheTime = now;
    return { user: session.user, error: null };
  }

  // Fall back to API call if no local session (with timeout to prevent hanging)
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 5000)),
    ]);

    const { data: { user }, error } = result;

    // Update cache
    if (user && !error) {
      cachedUser = user;
      userCacheTime = now;
    }

    return { user, error };
  } catch (timeoutErr) {
    console.warn('getCurrentUser timed out, returning null');
    return { user: null, error: timeoutErr };
  }
}

/**
 * Get the current session
 * @returns {Promise<{session: Object|null, error: Error|null}>}
 */
export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await safeGetSession();
  return { session, error };
}

/**
 * Sign out the current user
 * @returns {Promise<{error: Error|null}>}
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}