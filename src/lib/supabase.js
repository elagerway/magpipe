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
const DB_NAME = 'solo-mobile-auth';
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
      const db = await this.dbPromise;
      if (!db) return localStorage.getItem(key);

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => {
          const value = request.result;
          // If IndexedDB is empty (browser cleared it), fall back to localStorage backup
          if (value === undefined || value === null) {
            resolve(localStorage.getItem(key));
          } else {
            resolve(value);
          }
        };
        request.onerror = () => resolve(localStorage.getItem(key));
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

// Initialize Supabase client with IndexedDB storage for better iOS PWA persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: customStorage,
    storageKey: 'solo-mobile-auth-token',
  },
});

/**
 * Get the current authenticated user
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

/**
 * Get the current session
 * @returns {Promise<{session: Object|null, error: Error|null}>}
 */
export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
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