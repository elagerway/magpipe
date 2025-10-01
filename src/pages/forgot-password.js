/**
 * Forgot Password Page
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';

export default class ForgotPasswordPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; padding-top: 40px;">
        <div class="card">
          <h1 class="text-center">Reset Password</h1>
          <p class="text-center text-muted">Enter your email and we'll send you a reset link</p>

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

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

          <p class="text-center text-sm mt-4">
            Remember your password?
            <a href="/login" onclick="event.preventDefault(); navigateTo('/login');">
              Sign in
            </a>
          </p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = document.getElementById('forgot-password-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

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
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Password reset link sent! Check your email.';

        // Clear form
        form.reset();

        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      } catch (error) {
        console.error('Password reset error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to send reset link. Please try again.';

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      }
    });
  }
}
