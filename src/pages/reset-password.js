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

    if (!data.session) {
      // No session means invalid or expired reset link
      appElement.innerHTML = `
        <div class="container" style="max-width: 400px; padding-top: 40px;">
          <div class="card">
            <h1 class="text-center">Invalid Reset Link</h1>
            <p class="text-center text-muted">This password reset link is invalid or has expired.</p>

            <a href="/forgot-password" onclick="event.preventDefault(); navigateTo('/forgot-password');" class="btn btn-primary btn-full">
              Request New Link
            </a>

            <p class="text-center text-sm mt-4">
              <a href="/login" onclick="event.preventDefault(); navigateTo('/login');">
                Back to Sign In
              </a>
            </p>
          </div>
        </div>
      `;
      return;
    }

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; padding-top: 40px;">
        <div class="card">
          <h1 class="text-center">Set New Password</h1>
          <p class="text-center text-muted">Choose a strong password for your account</p>

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
        </div>
      </div>
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
        successMessage.textContent = 'Password updated successfully! Redirecting to dashboard...';

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigateTo('/dashboard');
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
