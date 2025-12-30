/**
 * Impersonate Page
 * Consumes impersonation token and creates a session
 */

import { supabase } from '../lib/supabase.js';

export default class ImpersonatePage {
  constructor() {
    this.token = null;
  }

  async render() {
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.token = urlParams.get('token');

    const appElement = document.getElementById('app');

    if (!this.token) {
      appElement.innerHTML = `
        <div class="impersonate-container">
          <div class="impersonate-card error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h2>Invalid Request</h2>
            <p>No impersonation token provided.</p>
            <button class="btn btn-primary" onclick="window.close()">Close Window</button>
          </div>
        </div>
      `;
      this.addStyles();
      return;
    }

    appElement.innerHTML = `
      <div class="impersonate-container">
        <div class="impersonate-card">
          <div class="loading-spinner"></div>
          <h2>Authenticating...</h2>
          <p>Please wait while we log you in.</p>
        </div>
      </div>
    `;

    this.addStyles();
    await this.consumeToken();
  }

  addStyles() {
    if (document.getElementById('impersonate-styles')) return;

    const style = document.createElement('style');
    style.id = 'impersonate-styles';
    style.textContent = `
      .impersonate-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: var(--bg-secondary);
        padding: 1rem;
      }

      .impersonate-card {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        padding: 2rem;
        text-align: center;
        max-width: 400px;
        width: 100%;
        box-shadow: var(--shadow-lg);
      }

      .impersonate-card.error svg {
        color: var(--error-color);
        margin-bottom: 1rem;
      }

      .impersonate-card h2 {
        margin: 0 0 0.5rem 0;
      }

      .impersonate-card p {
        color: var(--text-muted);
        margin-bottom: 1.5rem;
      }

      .loading-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid var(--border-color);
        border-top-color: var(--primary-color);
        border-radius: 50%;
        margin: 0 auto 1rem;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .impersonate-success svg {
        color: var(--success-color);
        margin-bottom: 1rem;
      }
    `;
    document.head.appendChild(style);
  }

  async consumeToken() {
    const appElement = document.getElementById('app');

    try {
      // Call the consume-impersonation endpoint
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-consume-impersonation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token: this.token })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      // Store impersonation info in session storage for the banner
      sessionStorage.setItem('impersonation', JSON.stringify({
        impersonatedBy: data.session.impersonatedBy.email,
        user: data.session.user
      }));

      // Use the magic link URL to sign in
      if (data.magicLinkUrl) {
        // Extract the token from the magic link and use it
        const magicUrl = new URL(data.magicLinkUrl);
        const tokenHash = magicUrl.hash || magicUrl.search;

        // Navigate to the magic link which will handle the auth
        window.location.href = data.magicLinkUrl;
      } else {
        throw new Error('No authentication link received');
      }
    } catch (error) {
      console.error('Impersonation error:', error);

      appElement.innerHTML = `
        <div class="impersonate-container">
          <div class="impersonate-card error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <h2>Authentication Failed</h2>
            <p>${error.message}</p>
            <button class="btn btn-primary" onclick="window.close()">Close Window</button>
          </div>
        </div>
      `;
    }
  }
}
