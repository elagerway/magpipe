/**
 * Push Notifications Service
 * Handles web push subscription management for the PWA
 */

import { supabase } from '../lib/supabase.js';

// VAPID public key - this is safe to expose in client code
// Generate with: npx web-push generate-vapid-keys
// TODO: Move this to environment variable for production
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/**
 * Convert a base64 string to Uint8Array (for VAPID key)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator &&
         'PushManager' in window &&
         'Notification' in window;
}

/**
 * Get current notification permission status
 * @returns {'granted' | 'denied' | 'default'}
 */
export function getPermissionStatus() {
  if (!isPushSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Request permission for push notifications
 * @returns {Promise<boolean>} True if permission granted
 */
export async function requestPushPermission() {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('Push notification permission:', permission);
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Get the current push subscription if one exists
 * @returns {Promise<PushSubscription | null>}
 */
export async function getCurrentSubscription() {
  if (!isPushSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch (error) {
    console.error('Error getting current subscription:', error);
    return null;
  }
}

/**
 * Subscribe to push notifications
 * @param {string} deviceName - Optional friendly name for this device
 * @returns {Promise<{success: boolean, subscription?: PushSubscription, error?: string}>}
 */
export async function subscribeToPush(deviceName = null) {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported on this device' };
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error('VAPID public key not configured');
    return { success: false, error: 'Push notifications not configured' };
  }

  try {
    // Request permission if not already granted
    if (Notification.permission === 'default') {
      const granted = await requestPushPermission();
      if (!granted) {
        return { success: false, error: 'Notification permission denied' };
      }
    } else if (Notification.permission === 'denied') {
      return { success: false, error: 'Notification permission blocked. Please enable in browser settings.' };
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    // If no subscription exists, create one
    if (!subscription) {
      console.log('Creating new push subscription...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, // Required for Chrome
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Get the subscription data
    const subscriptionJson = subscription.toJSON();
    console.log('Push subscription obtained:', subscriptionJson.endpoint?.substring(0, 50) + '...');

    // Save to backend
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Detect device name if not provided
    const detectedDeviceName = deviceName || detectDeviceName();

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-push-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys,
        deviceName: detectedDeviceName,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to save subscription');
    }

    console.log('Push subscription saved to server');
    return { success: true, subscription };

  } catch (error) {
    console.error('Error subscribing to push:', error);
    return { success: false, error: error.message || 'Failed to subscribe to push notifications' };
  }
}

/**
 * Unsubscribe from push notifications
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('No push subscription to unsubscribe from');
      return { success: true };
    }

    const endpoint = subscription.endpoint;

    // Unsubscribe locally
    await subscription.unsubscribe();
    console.log('Unsubscribed from push notifications locally');

    // Remove from backend
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-push-subscription`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ endpoint }),
        });
        console.log('Push subscription removed from server');
      } catch (e) {
        // Don't fail if server delete fails - we've already unsubscribed locally
        console.error('Failed to remove subscription from server:', e);
      }
    }

    return { success: true };

  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return { success: false, error: error.message || 'Failed to unsubscribe' };
  }
}

/**
 * Check if push is currently subscribed
 * @returns {Promise<boolean>}
 */
export async function isSubscribed() {
  const subscription = await getCurrentSubscription();
  return subscription !== null;
}

/**
 * Detect a friendly name for this device
 */
function detectDeviceName() {
  const ua = navigator.userAgent;

  // iOS devices
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';

  // Android
  if (/Android/.test(ua)) {
    const match = ua.match(/Android.*?;\s*([^)]+)/);
    if (match) {
      // Extract device model, clean it up
      const model = match[1].split(' Build')[0].trim();
      if (model.length < 30) return model;
    }
    return 'Android Device';
  }

  // Desktop browsers
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux';

  return 'Unknown Device';
}

/**
 * Show a local test notification (for testing purposes)
 */
export async function showTestNotification() {
  if (!isPushSupported()) {
    throw new Error('Notifications not supported');
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission not granted');
  }

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification('Test Notification', {
    body: 'Push notifications are working!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: 'test-notification',
    data: { url: '/inbox' },
  });
}

/**
 * Initialize push notifications after login
 * Called from main.js after successful auth
 */
export async function initPushNotifications() {
  if (!isPushSupported()) {
    console.log('Push notifications not supported on this device');
    return;
  }

  try {
    // Check if user has push enabled in their preferences
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('push_enabled')
      .eq('user_id', session.user.id)
      .single();

    if (!prefs?.push_enabled) {
      console.log('Push notifications not enabled in user preferences');
      return;
    }

    // Check if we already have a subscription
    const subscription = await getCurrentSubscription();
    if (subscription) {
      console.log('Push subscription already active');
      return;
    }

    // User has push enabled but no active subscription - try to resubscribe
    console.log('Attempting to restore push subscription...');
    const result = await subscribeToPush();
    if (!result.success) {
      console.warn('Could not restore push subscription:', result.error);
    }

  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}
