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

                <button type="button" id="apple-btn" class="btn btn-sso btn-sso-apple">
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000">
                    <path fill="white" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
                  </svg>
                  Continue with Apple
                </button>

                <button type="button" id="microsoft-btn" class="btn btn-sso">
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

        .btn-sso-apple {
          background: #000000;
          color: white;
          border-color: #000000;
        }

        .btn-sso-apple:hover {
          background: #1f2937;
          border-color: #1f2937;
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