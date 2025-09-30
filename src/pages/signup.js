/**
 * Sign Up Page
 */

import { User } from '../models/User.js';

export default class SignupPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; margin-top: 4rem;">
        <div class="card">
          <h1 class="text-center">Create Account</h1>
          <p class="text-center text-muted">Get started with Pat</p>

          <div id="error-message" class="hidden"></div>

          <form id="signup-form">
            <div class="form-group">
              <label class="form-label" for="name">Full Name</label>
              <input
                type="text"
                id="name"
                class="form-input"
                placeholder="John Doe"
                required
                autocomplete="name"
              />
            </div>

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
              <label class="form-label" for="password">Password</label>
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
              Create Account
            </button>
          </form>

          <p class="text-center text-sm mt-4">
            Already have an account?
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
    const form = document.getElementById('signup-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
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
      submitBtn.textContent = 'Creating account...';
      errorMessage.classList.add('hidden');

      try {
        const { user, error } = await User.signUp(email, password, name);

        if (error) {
          throw error;
        }

        // Create user profile
        const { error: profileError } = await User.createProfile(user.id, email, name);

        if (profileError) {
          console.error('Error creating profile:', profileError);
          // Continue anyway - profile might be created by trigger
        }

        // Redirect to email verification
        navigateTo('/verify-email');
      } catch (error) {
        console.error('Signup error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to create account. Please try again.';

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  }
}