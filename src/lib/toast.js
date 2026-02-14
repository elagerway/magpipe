/**
 * Global Toast Notification Utility
 * Usage: import { showToast } from '../lib/toast.js';
 *        showToast('Saved successfully', 'success');
 */

let toastContainer = null;

function ensureContainer() {
  if (!toastContainer || !toastContainer.isConnected) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Toast type
 */
export function showToast(message, type = 'info') {
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    toast.addEventListener('animationend', () => toast.remove());
    // Fallback: force remove if animationend doesn't fire (iOS PWA)
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}
