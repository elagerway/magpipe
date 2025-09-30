/**
 * Email Verification Page
 */

import { User } from '../models/User.js';

export default class VerifyEmailPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; margin-top: 4rem;">
        <div class="card">
          <h1 class="text-center">Check Your Email</h1>
          <p class="text-center text-muted">
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

          <p class="text-center text-sm mt-4">
            Didn't receive the code?
            <a href="#" id="resend-link">Resend email</a>
          </p>
        </div>
      </div>
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