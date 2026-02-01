/**
 * Login Page
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';

export default class LoginPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; padding-top: 20px;">
        <div class="card">
          <h1 class="text-center" style="margin-top: 0; padding-top: 0;">Welcome Back</h1>
          <p class="text-center text-muted">Sign in to your Solo Mobile account</p>

          <div id="error-message" class="hidden"></div>

          <!-- SSO Buttons -->
          <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;">
            <button type="button" id="google-btn" class="btn" style="
              background: white;
              color: #1f2937;
              border: 2px solid #e5e7eb;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.75rem;
              font-weight: 500;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='white'">
              <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <button type="button" id="apple-btn" class="btn" style="
              background: #000000;
              color: white;
              border: 2px solid #000000;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.75rem;
              font-weight: 500;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='#1f2937'" onmouseout="this.style.backgroundColor='#000000'">
              <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000">
                <path fill="white" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
              </svg>
              Continue with Apple
            </button>

            <button type="button" id="microsoft-btn" class="btn" style="
              background: white;
              color: #1f2937;
              border: 2px solid #e5e7eb;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.75rem;
              font-weight: 500;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='white'">
              <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                <path fill="#f3f3f3" d="M0 0h23v23H0z"/>
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Continue with Microsoft
            </button>
          </div>

          <div style="display: flex; align-items: center; margin: 0.75rem 0; gap: 1rem;">
            <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
            <span style="color: var(--text-muted); font-size: 0.875rem;">or</span>
            <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
          </div>

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

            <button type="submit" class="btn btn-primary btn-full" id="submit-btn" style="margin-top: 6px;">
              Sign In
            </button>
          </form>

          <p class="text-center text-sm" style="margin-top: 0.5rem;">
            <a href="/forgot-password" onclick="event.preventDefault(); navigateTo('/forgot-password');">
              Forgot password?
            </a>
          </p>

          <p class="text-center text-sm" style="margin-top: -10px; margin-bottom: 0;">
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

  async handleOAuthLogin(provider) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.classList.add('hidden');

    try {
      const { error } = await User.signInWithOAuth(provider);

      if (error) {
        throw error;
      }

      // OAuth will redirect to provider's auth page
      // After successful auth, user will be redirected back to /agent
    } catch (error) {
      console.error('OAuth error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || `Failed to sign in with ${provider}. Please try again.`;
    }
  }

  attachEventListeners() {
    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');

    // SSO button listeners
    document.getElementById('google-btn').addEventListener('click', async () => {
      await this.handleOAuthLogin('google');
    });

    document.getElementById('apple-btn').addEventListener('click', async () => {
      await this.handleOAuthLogin('apple');
    });

    document.getElementById('microsoft-btn').addEventListener('click', async () => {
      await this.handleOAuthLogin('azure');
    });

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
        } else if (profile.must_change_password) {
          // Redirect to password change flow for invited users
          this.showPasswordChangeModal(user.id);
        } else if (!profile.phone_verified) {
          navigateTo('/verify-phone');
        } else {
          navigateTo('/agent');
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

  showPasswordChangeModal(userId) {
    // Create modal overlay
    const modalHtml = `
      <div id="password-change-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
      ">
        <div style="
          background: var(--bg-primary, white);
          border-radius: 12px;
          padding: 2rem;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        ">
          <h2 style="margin: 0 0 0.5rem 0;">Change Your Password</h2>
          <p style="color: var(--text-secondary); margin: 0 0 1.5rem 0;">
            You're using a temporary password. Please set a new password to continue.
          </p>

          <div id="password-change-error" class="hidden" style="margin-bottom: 1rem;"></div>

          <form id="password-change-form">
            <div class="form-group">
              <label class="form-label" for="new-password">New Password</label>
              <input
                type="password"
                id="new-password"
                class="form-input"
                placeholder="Enter new password"
                required
                minlength="8"
                autocomplete="new-password"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="confirm-password">Confirm Password</label>
              <input
                type="password"
                id="confirm-password"
                class="form-input"
                placeholder="Confirm new password"
                required
                minlength="8"
                autocomplete="new-password"
              />
            </div>

            <button type="submit" class="btn btn-primary btn-full" id="change-password-btn">
              Set New Password
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const form = document.getElementById('password-change-form');
    const changeBtn = document.getElementById('change-password-btn');
    const errorMessage = document.getElementById('password-change-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Passwords do not match';
        errorMessage.classList.remove('hidden');
        return;
      }

      // Validate password length
      if (newPassword.length < 8) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Password must be at least 8 characters';
        errorMessage.classList.remove('hidden');
        return;
      }

      changeBtn.disabled = true;
      changeBtn.textContent = 'Updating...';
      errorMessage.classList.add('hidden');

      try {
        // Update password in Supabase Auth
        const { error: authError } = await User.updatePassword(newPassword);
        if (authError) throw authError;

        // Clear the must_change_password flag
        const { error: updateError } = await supabase
          .from('users')
          .update({
            must_change_password: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (updateError) throw updateError;

        // Remove modal
        document.getElementById('password-change-modal').remove();

        // Redirect to agent or verify phone
        const { profile } = await User.getProfile(userId);
        if (!profile?.phone_verified) {
          navigateTo('/verify-phone');
        } else {
          navigateTo('/agent');
        }
      } catch (error) {
        console.error('Password change error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to update password. Please try again.';
        errorMessage.classList.remove('hidden');
        changeBtn.disabled = false;
        changeBtn.textContent = 'Set New Password';
      }
    });
  }
}