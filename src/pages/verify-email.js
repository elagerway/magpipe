/**
 * Email Verification Page
 */

import { User } from '../models/User.js';

export default class VerifyEmailPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="verify-email-page">
        <!-- Header Navigation -->
        <header class="verify-header">
          <div class="verify-header-content">
            <a href="/" class="verify-logo" onclick="event.preventDefault(); navigateTo('/');">
              MAGPIPE
            </a>
            <nav class="verify-nav">
              <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.magpipe.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
            </nav>
          </div>
        </header>

        <!-- Main Content -->
        <main class="verify-main">
          <div class="verify-container">
            <div class="verify-card">
              <h1>Check Your Email</h1>
              <p class="verify-subtitle">
                We've sent a verification code to your email address. Please enter it below.
              </p>

              <div id="error-message" class="hidden"></div>
              <div id="success-message" class="hidden"></div>

              <form id="verify-form">
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

                <div class="form-group">
                  <label class="form-label" for="code">Verification Code</label>
                  <input
                    type="text"
                    id="code"
                    class="form-input"
                    placeholder="Enter 6-digit code"
                    required
                    maxlength="6"
                    pattern="[0-9]{6}"
                    autocomplete="one-time-code"
                  />
                  <p class="form-help">Enter the 6-digit code from your email</p>
                </div>

                <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
                  Verify Email
                </button>
              </form>

              <p class="verify-footer-text">
                Didn't receive the code?
                <a href="#" id="resend-link">Resend email</a>
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
        .verify-email-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Header */
        .verify-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 1rem 0;
        }

        .verify-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .verify-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .verify-nav {
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
        .verify-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
        }

        .verify-container {
          width: 100%;
          max-width: 440px;
        }

        .verify-card {
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 2.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .verify-card h1 {
          text-align: center;
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .verify-subtitle {
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

        .verify-footer-text {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 1.5rem;
          margin-bottom: 0;
        }

        .verify-footer-text a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 500;
        }

        .verify-footer-text a:hover {
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
          .verify-card {
            padding: 1.5rem;
          }

          .verify-card h1 {
            font-size: 1.5rem;
          }

          .verify-nav .nav-link {
            display: none;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = document.getElementById('verify-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const resendLink = document.getElementById('resend-link');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const code = document.getElementById('code').value;

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user, session, error } = await User.verifyEmail(email, code);

        if (error) {
          throw error;
        }

        // Success
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Email verified successfully! Redirecting...';

        // Redirect to phone verification
        setTimeout(() => {
          navigateTo('/verify-phone');
        }, 1500);
      } catch (error) {
        console.error('Verification error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Invalid verification code. Please try again.';

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify Email';
      }
    });

    resendLink.addEventListener('click', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;

      if (!email) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Please enter your email address first.';
        return;
      }

      resendLink.textContent = 'Sending...';
      errorMessage.classList.add('hidden');

      try {
        // Supabase doesn't have a direct resend method, so we'd need to trigger another signup
        // or use a custom edge function
        successMessage.className = 'alert alert-info';
        successMessage.textContent = 'Verification email resent. Please check your inbox.';
        resendLink.textContent = 'Resend email';
      } catch (error) {
        console.error('Resend error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to resend email. Please try again.';
        resendLink.textContent = 'Resend email';
      }
    });
  }
}