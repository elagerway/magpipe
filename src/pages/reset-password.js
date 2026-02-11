/**
 * Reset Password Page
 * Shown after user clicks the reset link in their email
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';

export default class ResetPasswordPage {
  async render() {
    const appElement = document.getElementById('app');

    // Check if we have a valid PASSWORD_RECOVERY event
    const { data } = await supabase.auth.getSession();

    // Common styles for both states
    const pageStyles = `
      <style>
        .reset-password-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .reset-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 1rem 0;
        }

        .reset-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .reset-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .reset-nav {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-weight: 500;
          padding: 0.5rem 1rem;
          transition: color 0.15s;
        }

        .nav-link:hover {
          color: var(--primary-color);
        }

        .nav-link-active {
          color: var(--primary-color);
        }

        .btn-ghost {
          background: transparent;
          color: var(--text-primary);
          border: none;
        }

        .btn-ghost:hover {
          background: var(--bg-secondary);
        }

        /* Main Content */
        .reset-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
        }

        .reset-container {
          width: 100%;
          max-width: 440px;
        }

        .reset-card {
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 2.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .reset-card h1 {
          text-align: center;
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .reset-subtitle {
          text-align: center;
          color: var(--text-secondary);
          margin-bottom: 2rem;
        }

        /* Form */
        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-weight: 500;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .form-input {
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-help {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.375rem;
        }

        .reset-footer-text {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 1.5rem;
          margin-bottom: 0;
        }

        .reset-footer-text a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 500;
        }

        .reset-footer-text a:hover {
          text-decoration: underline;
        }

        /* Legal Links */
        .legal-links {
          text-align: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-color);
          font-size: 0.75rem;
        }

        .legal-links a {
          color: var(--text-secondary);
          text-decoration: none;
        }

        .legal-links a:hover {
          text-decoration: underline;
        }

        .legal-links .separator {
          color: var(--text-muted);
          margin: 0 0.5rem;
        }

        /* Mobile */
        @media (max-width: 480px) {
          .reset-card {
            padding: 1.5rem;
          }

          .reset-card h1 {
            font-size: 1.5rem;
          }

          .reset-nav .nav-link {
            display: none;
          }
        }
      </style>
    `;

    if (!data.session) {
      // No session means invalid or expired reset link
      appElement.innerHTML = `
        <div class="reset-password-page">
          <!-- Header Navigation -->
          <header class="reset-header">
            <div class="reset-header-content">
              <a href="/" class="reset-logo" onclick="event.preventDefault(); navigateTo('/');">
                MAGPIPE
              </a>
              <nav class="reset-nav">
                <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
                <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
              </nav>
            </div>
          </header>

          <!-- Main Content -->
          <main class="reset-main">
            <div class="reset-container">
              <div class="reset-card">
                <h1>Invalid Reset Link</h1>
                <p class="reset-subtitle">This password reset link is invalid or has expired.</p>

                <a href="/forgot-password" onclick="event.preventDefault(); navigateTo('/forgot-password');" class="btn btn-primary btn-full">
                  Request New Link
                </a>

                <p class="reset-footer-text">
                  <a href="/login" onclick="event.preventDefault(); navigateTo('/login');">
                    Back to Sign In
                  </a>
                </p>

                <div class="legal-links">
                  <a href="/privacy" onclick="event.preventDefault(); navigateTo('/privacy');">Privacy Policy</a>
                  <span class="separator">|</span>
                  <a href="/terms" onclick="event.preventDefault(); navigateTo('/terms');">Terms of Use</a>
                </div>
              </div>
            </div>
          </main>
        </div>
        ${pageStyles}
      `;
      return;
    }

    appElement.innerHTML = `
      <div class="reset-password-page">
        <!-- Header Navigation -->
        <header class="reset-header">
          <div class="reset-header-content">
            <a href="/" class="reset-logo" onclick="event.preventDefault(); navigateTo('/');">
              MAGPIPE
            </a>
            <nav class="reset-nav">
              <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.magpipe.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
            </nav>
          </div>
        </header>

        <!-- Main Content -->
        <main class="reset-main">
          <div class="reset-container">
            <div class="reset-card">
              <h1>Set New Password</h1>
              <p class="reset-subtitle">Choose a strong password for your account</p>

              <div id="error-message" class="hidden"></div>
              <div id="success-message" class="hidden"></div>

              <form id="reset-password-form">
                <div class="form-group">
                  <label class="form-label" for="password">New Password</label>
                  <input
                    type="password"
                    id="password"
                    class="form-input"
                    placeholder="At least 8 characters"
                    required
                    autocomplete="new-password"
                    minlength="8"
                  />
                  <p class="form-help">Minimum 8 characters</p>
                </div>

                <div class="form-group">
                  <label class="form-label" for="confirm-password">Confirm Password</label>
                  <input
                    type="password"
                    id="confirm-password"
                    class="form-input"
                    placeholder="Re-enter password"
                    required
                    autocomplete="new-password"
                    minlength="8"
                  />
                </div>

                <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
                  Update Password
                </button>
              </form>

              <div class="legal-links">
                <a href="/privacy" onclick="event.preventDefault(); navigateTo('/privacy');">Privacy Policy</a>
                <span class="separator">|</span>
                <a href="/terms" onclick="event.preventDefault(); navigateTo('/terms');">Terms of Use</a>
              </div>
            </div>
          </div>
        </main>
      </div>
      ${pageStyles}
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = document.getElementById('reset-password-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Validate passwords match
      if (password !== confirmPassword) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Passwords do not match.';
        return;
      }

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating password...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { error } = await User.updatePassword(password);

        if (error) {
          throw error;
        }

        // Show success message
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Password updated successfully! Redirecting...';

        // Redirect to agent after 2 seconds
        setTimeout(() => {
          navigateTo('/inbox');
        }, 2000);
      } catch (error) {
        console.error('Password update error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to update password. Please try again.';

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Password';
      }
    });
  }
}
