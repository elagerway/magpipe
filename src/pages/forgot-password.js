/**
 * Forgot Password Page
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';

export default class ForgotPasswordPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="forgot-password-page">
        <!-- Header Navigation -->
        <header class="forgot-header">
          <div class="forgot-header-content">
            <a href="/" class="forgot-logo" onclick="event.preventDefault(); navigateTo('/');">
              MAGPIPE
            </a>
            <nav class="forgot-nav">
              <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.magpipe.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
            </nav>
          </div>
        </header>

        <!-- Main Content -->
        <main class="forgot-main">
          <div class="forgot-container">
            <div class="forgot-card">
              <h1>Reset Password</h1>
              <p class="forgot-subtitle">Enter your email and we'll send you a reset link</p>

              <form id="forgot-password-form">
                <div class="form-group">
                  <label class="form-label" for="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    class="form-input"
                    placeholder="you@example.com"
                    required
                    autocomplete="email"
                  />
                </div>

                <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
                  Send Reset Link
                </button>
              </form>

              <p class="forgot-footer-text">
                Remember your password?
                <a href="/login" onclick="event.preventDefault(); navigateTo('/login');">
                  Sign in
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

      <style>
        .forgot-password-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .forgot-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 1rem 0;
        }

        .forgot-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .forgot-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .forgot-nav {
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
        .forgot-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
        }

        .forgot-container {
          width: 100%;
          max-width: 440px;
        }

        .forgot-card {
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 2.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .forgot-card h1 {
          text-align: center;
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .forgot-subtitle {
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

        .forgot-footer-text {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 1.5rem;
          margin-bottom: 0;
        }

        .forgot-footer-text a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 500;
        }

        .forgot-footer-text a:hover {
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
          .forgot-card {
            padding: 1.5rem;
          }

          .forgot-card h1 {
            font-size: 1.5rem;
          }

          .forgot-nav .nav-link {
            display: none;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = document.getElementById('forgot-password-form');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        console.log('Sending password reset email to:', email);

        // Call custom Edge Function
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch(`${supabaseUrl}/functions/v1/send-password-reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({ email }),
        });

        const result = await response.json();
        console.log('Reset password response:', result);
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);

        if (!response.ok) {
          console.error('Edge Function error:', result);
          throw new Error(result.error || 'Failed to send reset email');
        }

        // Show success message
        console.log('Password reset email sent successfully');
        showToast('Password reset link sent! Check your email.', 'success');

        // Clear form
        form.reset();

        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      } catch (error) {
        console.error('Password reset error:', error);
        showToast(error.message || 'Failed to send reset link. Please try again.', 'error');

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      }
    });
  }
}
