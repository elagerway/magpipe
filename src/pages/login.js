/**
 * Login Page
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';
import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';
import { renderPublicHeader, getPublicHeaderStyles } from '../components/PublicHeader.js';
import { showToast } from '../lib/toast.js';

export default class LoginPage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="login-page">
        ${renderPublicHeader({ activePage: 'login' })}

        <!-- Main Content -->
        <main class="login-main">
          <div class="login-decoration">
            <div class="login-gradient-orb login-orb-1"></div>
            <div class="login-gradient-orb login-orb-2"></div>
            <div class="login-gradient-orb login-orb-3"></div>
            <div class="login-grid"></div>
          </div>

          <div class="login-container">
            <div class="login-card">
              <h1>Welcome Back</h1>
              <p class="login-subtitle">Sign in to your MAGPIPE account</p>

              <!-- SSO Buttons -->
              <div class="sso-buttons">
                <button type="button" id="google-btn" class="btn btn-sso">
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continue with Google
                </button>

                <button type="button" id="github-btn" class="btn btn-sso btn-sso-github">
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98 96">
                    <path fill="white" fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              <div class="divider">
                <span>or</span>
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

                <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
                  Sign In
                </button>
              </form>

              <p class="login-footer-text" style="margin-top: 0.75rem;">
                <a href="/forgot-password" onclick="event.preventDefault(); navigateTo('/forgot-password');">
                  Forgot password?
                </a>
              </p>

              <p class="login-footer-text">
                Don't have an account?
                <a href="/signup" onclick="event.preventDefault(); navigateTo('/signup');">
                  Sign up
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

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>
        .login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* Header */
        ${getPublicHeaderStyles()}

        /* Main Content */
        .login-main {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6rem 1.5rem 3rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
          overflow: hidden;
        }

        /* Animated Orbs */
        .login-decoration {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .login-gradient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.5;
          will-change: transform;
        }

        .login-orb-1 {
          width: 700px;
          height: 700px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
          top: -300px;
          left: -200px;
          animation: loginFloat1 20s ease-in-out infinite;
        }

        .login-orb-2 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
          bottom: -250px;
          right: -150px;
          animation: loginFloat2 25s ease-in-out infinite;
        }

        .login-orb-3 {
          width: 450px;
          height: 450px;
          background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
          top: 20%;
          right: 5%;
          opacity: 0.4;
          animation: loginFloat3 18s ease-in-out infinite;
        }

        @keyframes loginFloat1 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(200px, 150px); }
          50% { transform: translate(350px, 250px); }
          75% { transform: translate(150px, 100px); }
        }

        @keyframes loginFloat2 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-200px, -150px); }
          50% { transform: translate(-350px, -200px); }
          75% { transform: translate(-150px, -100px); }
        }

        @keyframes loginFloat3 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-150px, -100px); }
          50% { transform: translate(-250px, 80px); }
          75% { transform: translate(-100px, 150px); }
        }

        .login-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        /* Form Panel */
        .login-container {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: #ffffff;
          border-radius: 1rem;
          padding: 2rem;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
        }

        .login-card h1 {
          text-align: center;
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
          color: #1f2937;
        }

        .login-subtitle {
          text-align: center;
          color: #6b7280;
          margin-bottom: 1.25rem;
          font-size: 0.875rem;
        }

        /* SSO Buttons */
        .sso-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .btn-sso {
          background: #ffffff;
          color: #1f2937;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
          padding: 0.6rem 0.75rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .btn-sso:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .btn-sso-github {
          background: #24292e;
          color: white;
          border-color: #24292e;
        }

        .btn-sso-github:hover {
          background: #1b1f23;
          border-color: #1b1f23;
        }

        /* Divider */
        .divider {
          display: flex;
          align-items: center;
          margin: 1rem 0;
          gap: 0.75rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }

        .divider span {
          color: #9ca3af;
          font-size: 0.75rem;
        }

        /* Form */
        .form-group {
          margin-bottom: 0.75rem;
        }

        .form-label {
          display: block;
          font-weight: 500;
          font-size: 0.8rem;
          margin-bottom: 0.25rem;
          color: #374151;
        }

        .form-input {
          width: 100%;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          background: #ffffff;
          color: #1f2937;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .form-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .btn-primary.btn-full {
          width: 100%;
          padding: 0.7rem;
          font-size: 0.9rem;
          font-weight: 600;
          border-radius: 0.5rem;
        }

        .login-footer-text {
          text-align: center;
          font-size: 0.8rem;
          color: #6b7280;
          margin-top: 0.75rem;
          margin-bottom: 0;
        }

        .login-footer-text a {
          color: #6366f1;
          text-decoration: none;
          font-weight: 500;
        }

        .login-footer-text a:hover {
          text-decoration: underline;
        }

        .legal-links {
          text-align: center;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e5e7eb;
          font-size: 0.75rem;
        }

        .legal-links a {
          color: #9ca3af;
          text-decoration: none;
        }

        .legal-links a:hover {
          color: #6366f1;
        }

        .legal-links .separator {
          color: #d1d5db;
          margin: 0 0.5rem;
        }

        /* Hide legal links in card on desktop (shown in footer) */
        @media (min-width: 1024px) {
          .legal-links {
            display: none;
          }
        }

        /* Tablet */
        @media (max-width: 768px) {
          .login-main {
            padding: 5rem 1rem 2rem;
          }

          .login-orb-1 {
            width: 400px;
            height: 400px;
            top: -150px;
            left: -150px;
          }

          .login-orb-2 {
            width: 350px;
            height: 350px;
            bottom: -150px;
            right: -100px;
          }

          .login-orb-3 {
            width: 250px;
            height: 250px;
            opacity: 0.3;
          }

          .login-card {
            max-width: 100%;
          }
        }

        /* Mobile */
        @media (max-width: 480px) {
          .login-main {
            padding: 4.5rem 0.75rem 1.5rem;
          }

          .login-card {
            padding: 1.5rem;
            border-radius: 0.75rem;
          }

          .login-card h1 {
            font-size: 1.5rem;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  async handleOAuthLogin(provider) {
    try {
      const { error } = await User.signInWithOAuth(provider);

      if (error) {
        throw error;
      }

      // OAuth will redirect to provider's auth page
      // After successful auth, user will be redirected back to /agent
    } catch (error) {
      console.error('OAuth error:', error);
      showToast(error.message || `Failed to sign in with ${provider}. Please try again.`, 'error');
    }
  }

  attachEventListeners() {
    const form = document.getElementById('login-form');
    const submitBtn = document.getElementById('submit-btn');

    // SSO button listeners
    document.getElementById('google-btn').addEventListener('click', async () => {
      await this.handleOAuthLogin('google');
    });

    document.getElementById('github-btn').addEventListener('click', async () => {
      await this.handleOAuthLogin('github');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

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
          navigateTo('/inbox');
        }
      } catch (error) {
        console.error('Login error:', error);
        showToast(error.message || 'Failed to sign in. Please check your credentials.', 'error');

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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }

      // Validate password length
      if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      changeBtn.disabled = true;
      changeBtn.textContent = 'Updating...';

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
          navigateTo('/inbox');
        }
      } catch (error) {
        console.error('Password change error:', error);
        showToast(error.message || 'Failed to update password. Please try again.', 'error');
        changeBtn.disabled = false;
        changeBtn.textContent = 'Set New Password';
      }
    });
  }
}