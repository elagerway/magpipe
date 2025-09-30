/**
 * Login Page
 */

import { User } from '../models/User.js';

export default class LoginPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; margin-top: 4rem;">
        <div class="card">
          <h1 class="text-center">Welcome Back</h1>
          <p class="text-center text-muted">Sign in to your Pat account</p>

          <div id="error-message" class="hidden"></div>

          <form id="login-form">
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
                placeholder="Enter your password"
                required
                autocomplete="current-password"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
              Sign In
            </button>
          </form>

          <p class="text-center text-sm mt-4">
            Don't have an account?
            <a href="/signup" onclick="event.preventDefault(); navigateTo('/signup');">
              Sign up
            </a>
          </p>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      errorMessage.classList.add('hidden');

      try {
        const { user, session, error } = await User.signIn(email, password);

        if (error) {
          throw error;
        }

        // Check user's onboarding status and redirect accordingly
        const { profile } = await User.getProfile(user.id);

        if (!profile) {
          await User.createProfile(user.id, email, user.user_metadata?.name || 'User');
          navigateTo('/verify-phone');
        } else if (!profile.phone_verified) {
          navigateTo('/verify-phone');
        } else {
          navigateTo('/dashboard');
        }
      } catch (error) {
        console.error('Login error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to sign in. Please check your credentials.';

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  }
}