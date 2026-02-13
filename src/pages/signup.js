/**
 * Sign Up Page
 */

import { User } from '../models/User.js';
import { supabase } from '../lib/supabase.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';
import { renderPublicHeader, getPublicHeaderStyles } from '../components/PublicHeader.js';
import { showToast } from '../lib/toast.js';

export default class SignupPage {
  async render() {
    const appElement = document.getElementById('app');

    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      localStorage.setItem('magpipe_referral_code', refCode);
    }

    // Check for team invitation
    const inviteId = urlParams.get('invite');
    let invitation = null;

    if (inviteId) {
      // Fetch invitation details to pre-fill form
      const { data } = await supabase
        .from('organization_members')
        .select('*, organizations(name)')
        .eq('id', inviteId)
        .eq('status', 'pending')
        .single();

      // Check if invitation has expired (60 days)
      if (data && !OrganizationMember.isExpired(data)) {
        invitation = data;
      }
    }

    appElement.innerHTML = `
      <div class="signup-page">
        ${renderPublicHeader({ activePage: 'signup' })}

        <!-- Main Content -->
        <main class="signup-main">
          <!-- Desktop Branding Panel -->
          <div class="signup-branding">
            <div class="branding-content">
              <h2>Every call and text answered.</h2>
              <p>Intelligent call and text handling that work 24/7.</p>
              <div class="branding-features">
                <div class="branding-feature">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>Smart Call Handling</span>
                </div>
                <div class="branding-feature">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Intelligent SMS</span>
                </div>
                <div class="branding-feature">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  <span>24/7 Availability</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Form Panel -->
          <div class="signup-container">
            <div class="signup-card">
              <h1>Create Account</h1>
              ${invitation ? `
                <div class="invite-banner">
                  You've been invited to join <strong>${invitation.organizations?.name || 'a team'}</strong>
                </div>
              ` : `
                <p class="signup-subtitle">Get started with your AI assistant</p>
              `}

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
                    ${invitation?.full_name ? `value="${invitation.full_name}"` : ''}
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
                    ${invitation?.email ? `value="${invitation.email}" readonly` : ''}
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

              <p class="signup-footer-text">
                Already have an account?
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

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>
        .signup-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* Header */
        ${getPublicHeaderStyles()}

        /* Main Content */
        .signup-main {
          flex: 1;
          display: flex;
          align-items: stretch;
        }

        /* Desktop Branding Panel */
        .signup-branding {
          display: none;
          flex: 1;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #a855f7 70%, #d946ef 100%);
          padding: 2rem;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .signup-branding::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 40%);
        }

        .signup-branding::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        .branding-content {
          max-width: 400px;
          color: white;
          position: relative;
          z-index: 1;
        }

        .branding-content h2 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          line-height: 1.2;
        }

        .branding-content p {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 1.5rem;
        }

        .branding-features {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .branding-feature {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.875rem;
        }

        .branding-feature svg {
          width: 20px;
          height: 20px;
          color: var(--primary-color);
        }

        /* Form Panel */
        .signup-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem 1.5rem;
          background: var(--bg-secondary);
        }

        @media (min-width: 1024px) {
          .signup-branding {
            display: flex;
          }

          .signup-container {
            flex: 0 0 50%;
            max-width: 50%;
          }
        }

        .signup-card {
          width: 100%;
          max-width: 380px;
          background: var(--bg-primary);
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .signup-card h1 {
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .signup-subtitle {
          text-align: center;
          color: var(--text-secondary);
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .invite-banner {
          text-align: center;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 0.5rem;
          padding: 0.6rem 1rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
          color: var(--text-primary);
        }

        /* SSO Buttons */
        .sso-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .btn-sso {
          background: white;
          color: #1f2937;
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
          padding: 0.5rem 0.75rem;
          transition: all 0.2s ease;
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
          margin: 0.75rem 0;
          gap: 0.75rem;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-color);
        }

        .divider span {
          color: var(--text-secondary);
          font-size: 0.75rem;
        }

        /* Form */
        .form-group {
          margin-bottom: 0.6rem;
        }

        .form-label {
          display: block;
          font-weight: 500;
          font-size: 0.8rem;
          margin-bottom: 0.2rem;
          color: var(--text-primary);
        }

        .form-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid var(--border-color);
          border-radius: 0.375rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }

        .form-help {
          font-size: 0.7rem;
          color: var(--text-secondary);
          margin-top: 0.2rem;
        }

        .signup-footer-text {
          text-align: center;
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.75rem;
          margin-bottom: 0;
        }

        .signup-footer-text a {
          color: var(--primary-color);
          text-decoration: none;
          font-weight: 500;
        }

        .signup-footer-text a:hover {
          text-decoration: underline;
        }

        .legal-links {
          text-align: center;
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-color);
          font-size: 0.7rem;
        }

        .legal-links a {
          color: var(--text-secondary);
          text-decoration: none;
        }

        .legal-links a:hover {
          color: var(--primary-color);
        }

        .legal-links .separator {
          color: var(--text-secondary);
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
          .signup-page {
            padding: 1rem;
          }

          .signup-card {
            max-width: 100%;
          }
        }

        /* Mobile */
        @media (max-width: 480px) {
          .signup-page {
            padding: 0.75rem;
          }

          .signup-card {
            padding: 1.5rem;
          }

          .signup-card h1 {
            font-size: 1.5rem;
          }

          .sso-buttons {
            flex-direction: column;
          }

          .sso-btn {
            width: 100%;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  async handleOAuthSignup(provider) {
    // Store invite ID for processing after OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    if (inviteId) {
      localStorage.setItem('pending_team_invite', inviteId);
    }

    try {
      const { error } = await User.signInWithOAuth(provider);

      if (error) {
        throw error;
      }

      // OAuth will redirect to provider's auth page
      // After successful auth, user will be redirected back to /agent
    } catch (error) {
      console.error('OAuth error:', error);
      showToast(error.message || `Failed to sign up with ${provider}. Please try again.`, 'error');
    }
  }

  attachEventListeners() {
    const form = document.getElementById('signup-form');
    const submitBtn = document.getElementById('submit-btn');

    // SSO button listeners
    document.getElementById('google-btn').addEventListener('click', async () => {
      await this.handleOAuthSignup('google');
    });

    document.getElementById('apple-btn').addEventListener('click', async () => {
      await this.handleOAuthSignup('apple');
    });

    document.getElementById('microsoft-btn').addEventListener('click', async () => {
      await this.handleOAuthSignup('azure');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Validate passwords match
      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        return;
      }

      // Disable form
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const { user, error } = await User.signUp(email, password, name);

        if (error) {
          throw error;
        }

        // Profile is created automatically by database trigger (handle_new_user)
        // No need to call User.createProfile() here

        // Send signup notification (don't await - fire and forget)
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email })
        }).catch(() => {}); // Ignore errors

        // Process referral code (fire and forget)
        const storedRefCode = localStorage.getItem('magpipe_referral_code');
        if (storedRefCode && user) {
          const { data: { session } } = await supabase.auth.getSession();
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-referral`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token || ''}`
            },
            body: JSON.stringify({ referral_code: storedRefCode })
          }).then(() => {
            localStorage.removeItem('magpipe_referral_code');
          }).catch(() => {}); // Ignore errors
        }

        // If this signup was from a team invitation, approve membership
        if (invitation && user) {
          try {
            await OrganizationMember.approve(invitation.id, user.id);
            // Set user's current organization
            await supabase
              .from('users')
              .update({ current_organization_id: invitation.organization_id })
              .eq('id', user.id);
          } catch (inviteErr) {
            console.error('Failed to process invitation:', inviteErr);
          }
        }

        // Redirect to phone verification
        navigateTo('/verify-phone');
      } catch (error) {
        console.error('Signup error:', error);
        showToast(error.message || 'Failed to create account. Please try again.', 'error');

        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  }
}
