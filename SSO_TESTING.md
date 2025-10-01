# SSO Testing Checklist

## Pre-Testing Setup

Before testing SSO functionality, you need to configure OAuth providers in Supabase. Follow `SSO_SETUP.md` for detailed instructions.

**Quick Links:**
- Supabase Auth Providers: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/providers
- Google Cloud Console: https://console.cloud.google.com/
- Apple Developer Portal: https://developer.apple.com/account
- Azure Portal: https://portal.azure.com/

---

## Test Environment

- **Local Dev Server**: http://localhost:3000
- **Current Status**: Running ✅
- **Browser**: Chrome/Safari/Edge (test all three for OAuth compatibility)

---

## Phase 1: Visual & UI Testing

### Test 1.1: Login Page SSO Buttons ⏳
**URL**: http://localhost:3000/login

**Expected:**
- [ ] Three SSO buttons visible above email/password form
- [ ] Google button: White background, Google logo, "Continue with Google"
- [ ] Apple button: Black background, Apple logo, "Continue with Apple"
- [ ] Microsoft button: White background, Microsoft logo, "Continue with Microsoft"
- [ ] "or" divider between SSO buttons and email form
- [ ] Hover effects work (background color changes)
- [ ] Buttons are properly aligned and sized
- [ ] Mobile responsive (test in mobile view)

**Steps:**
1. Navigate to http://localhost:3000/login
2. Verify all buttons render correctly
3. Hover over each button to verify hover effects
4. Resize browser to mobile width
5. Screenshot if needed

**Status**: ⏳ PENDING

---

### Test 1.2: Signup Page SSO Buttons ⏳
**URL**: http://localhost:3000/signup

**Expected:**
- [ ] Identical SSO buttons as login page
- [ ] Positioned above signup form
- [ ] All visual elements match login page

**Steps:**
1. Navigate to http://localhost:3000/signup
2. Verify all buttons render correctly
3. Compare with login page

**Status**: ⏳ PENDING

---

## Phase 2: JavaScript/Console Testing

### Test 2.1: Check for JavaScript Errors ⏳

**Steps:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate to /login
4. Check for any errors (red messages)
5. Navigate to /signup
6. Check for any errors

**Expected:**
- [ ] No JavaScript errors in console
- [ ] No 404 errors for missing files
- [ ] User model loads successfully
- [ ] Event listeners attached without errors

**Status**: ⏳ PENDING

---

### Test 2.2: Verify User Model Methods ⏳

**Steps:**
1. Open browser console on /login page
2. Run: `const { User } = await import('/src/models/User.js')`
3. Run: `console.log(typeof User.signInWithOAuth)`
4. Run: `console.log(typeof User.handleOAuthCallback)`

**Expected:**
- [ ] `User.signInWithOAuth` should be "function"
- [ ] `User.handleOAuthCallback` should be "function"
- [ ] No import errors

**Status**: ⏳ PENDING

---

## Phase 3: Button Click Testing (Without OAuth Configured)

### Test 3.1: Google Button Click ⏳

**Steps:**
1. Go to http://localhost:3000/login
2. Open browser DevTools Console
3. Click "Continue with Google" button
4. Observe console output and any errors

**Expected (WITHOUT OAuth configured):**
- [ ] Click event fires
- [ ] Console shows: "OAuth error:"
- [ ] Error message appears on page: "Failed to sign in with google"
- [ ] Error likely: "Provider not enabled" or similar from Supabase

**Expected (WITH OAuth configured):**
- [ ] Browser redirects to Google login page
- [ ] Google consent screen shows "Pat" app name
- [ ] Can authenticate with Google account

**Status**: ⏳ PENDING

---

### Test 3.2: Apple Button Click ⏳

**Steps:**
1. Go to http://localhost:3000/login
2. Open browser DevTools Console
3. Click "Continue with Apple" button
4. Observe console output

**Expected (WITHOUT OAuth configured):**
- [ ] Click event fires
- [ ] Error message about provider not enabled

**Expected (WITH OAuth configured):**
- [ ] Browser redirects to Apple login page
- [ ] Apple consent screen appears
- [ ] Can authenticate with Apple ID

**Status**: ⏳ PENDING

---

### Test 3.3: Microsoft Button Click ⏳

**Steps:**
1. Go to http://localhost:3000/login
2. Open browser DevTools Console
3. Click "Continue with Microsoft" button
4. Observe console output

**Expected (WITHOUT OAuth configured):**
- [ ] Click event fires
- [ ] Error message about provider not enabled

**Expected (WITH OAuth configured):**
- [ ] Browser redirects to Microsoft login page
- [ ] Microsoft consent screen appears
- [ ] Can authenticate with Microsoft account

**Status**: ⏳ PENDING

---

## Phase 4: Network Testing

### Test 4.1: API Calls ⏳

**Steps:**
1. Open DevTools Network tab
2. Click any SSO button
3. Monitor network requests

**Expected:**
- [ ] Request to Supabase Auth API
- [ ] URL contains: `https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/authorize`
- [ ] Query params include: `provider=google|apple|azure`
- [ ] Query params include: `redirect_to` parameter

**Status**: ⏳ PENDING

---

## Phase 5: OAuth Provider Configuration Testing

### Test 5.1: Configure Google OAuth ⏳

**Prerequisite**: Follow SSO_SETUP.md Section 1

**Steps:**
1. Complete Google Cloud setup
2. Add Client ID and Secret to Supabase
3. Click "Continue with Google" on /login
4. Complete Google authentication
5. Observe redirect back to app

**Expected:**
- [ ] Redirects to Google consent screen
- [ ] Shows "Pat" app name
- [ ] Requests email and profile permissions
- [ ] After approval, redirects to http://localhost:3000/dashboard
- [ ] User is logged in
- [ ] Profile created in database
- [ ] Redirected to /verify-phone (if phone not verified)

**Status**: ⏳ PENDING

---

### Test 5.2: Configure Apple OAuth ⏳

**Prerequisite**: Follow SSO_SETUP.md Section 2

**Steps:**
1. Complete Apple Developer setup
2. Add credentials to Supabase
3. Click "Continue with Apple" on /login
4. Complete Apple authentication

**Expected:**
- [ ] Redirects to Apple login
- [ ] Shows "Pat" app
- [ ] Can hide email (Apple privacy feature)
- [ ] Redirects back successfully
- [ ] User logged in and profile created

**Status**: ⏳ PENDING

---

### Test 5.3: Configure Microsoft OAuth ⏳

**Prerequisite**: Follow SSO_SETUP.md Section 3

**Steps:**
1. Complete Azure setup
2. Add credentials to Supabase
3. Click "Continue with Microsoft" on /login
4. Complete Microsoft authentication

**Expected:**
- [ ] Redirects to Microsoft login
- [ ] Shows "Pat" requesting permissions
- [ ] Works with personal Microsoft accounts
- [ ] Works with work/school accounts
- [ ] Redirects back successfully

**Status**: ⏳ PENDING

---

## Phase 6: Post-Authentication Flow Testing

### Test 6.1: New User OAuth Flow ⏳

**Steps:**
1. Use a new Google/Apple/Microsoft account
2. Complete OAuth login
3. Observe app behavior

**Expected:**
- [ ] `SIGNED_IN` event fires
- [ ] Profile created in `users` table
- [ ] User redirected to /verify-phone
- [ ] Phone verification required before accessing app

**Status**: ⏳ PENDING

---

### Test 6.2: Returning User OAuth Flow ⏳

**Steps:**
1. Use an existing OAuth account that already has verified phone
2. Complete OAuth login

**Expected:**
- [ ] User redirected to /dashboard immediately
- [ ] No phone verification required
- [ ] Session persists across page refreshes

**Status**: ⏳ PENDING

---

### Test 6.3: Session Persistence ⏳

**Steps:**
1. Login with OAuth
2. Close browser
3. Reopen and navigate to http://localhost:3000
4. Check if still logged in

**Expected:**
- [ ] User remains logged in
- [ ] Session restored automatically
- [ ] No re-authentication required

**Status**: ⏳ PENDING

---

## Phase 7: Error Handling Testing

### Test 7.1: OAuth Denial ⏳

**Steps:**
1. Click SSO button
2. On provider's consent screen, click "Cancel" or "Deny"
3. Observe app behavior

**Expected:**
- [ ] User returned to /login
- [ ] Error message shown
- [ ] Can try again

**Status**: ⏳ PENDING

---

### Test 7.2: Network Error ⏳

**Steps:**
1. Open DevTools Network tab
2. Enable "Offline" mode
3. Click any SSO button
4. Observe error handling

**Expected:**
- [ ] Error message displayed
- [ ] No app crash
- [ ] Can retry when online

**Status**: ⏳ PENDING

---

## Phase 8: Mobile Testing

### Test 8.1: Mobile Browser (iOS Safari) ⏳

**Steps:**
1. Open app on iPhone Safari
2. Navigate to /login
3. Test all three SSO buttons

**Expected:**
- [ ] Buttons render correctly
- [ ] Touch targets are adequate (44x44pt minimum)
- [ ] OAuth flow works in mobile Safari
- [ ] Returns to app after authentication

**Status**: ⏳ PENDING

---

### Test 8.2: Mobile Browser (Android Chrome) ⏳

**Steps:**
1. Open app on Android Chrome
2. Navigate to /login
3. Test all three SSO buttons

**Expected:**
- [ ] Buttons render correctly
- [ ] OAuth flow works
- [ ] Returns to app correctly

**Status**: ⏳ PENDING

---

### Test 8.3: PWA Installed App ⏳

**Steps:**
1. Install PWA on mobile device
2. Open installed app
3. Test OAuth login

**Expected:**
- [ ] OAuth opens in system browser
- [ ] Returns to PWA after authentication
- [ ] Session established in PWA

**Status**: ⏳ PENDING

---

## Phase 9: Security Testing

### Test 9.1: PKCE Flow ⏳

**Steps:**
1. Open Network tab
2. Initiate OAuth flow
3. Look for `code_challenge` parameter

**Expected:**
- [ ] Supabase Auth automatically includes PKCE
- [ ] `code_challenge` and `code_challenge_method` present
- [ ] State parameter included

**Status**: ⏳ PENDING

---

### Test 9.2: Redirect URI Validation ⏳

**Steps:**
1. Try to manually craft OAuth URL with different redirect_uri
2. Test if provider rejects invalid redirects

**Expected:**
- [ ] Invalid redirect_uri rejected by provider
- [ ] Only configured URIs work

**Status**: ⏳ PENDING

---

## Phase 10: Database Testing

### Test 10.1: User Profile Creation ⏳

**Steps:**
1. Login with new OAuth account
2. Check Supabase Dashboard > Table Editor > users

**Expected:**
- [ ] New row created with OAuth user's ID
- [ ] Email field populated
- [ ] Name field populated (from OAuth profile)
- [ ] phone_verified = false initially
- [ ] Timestamps set correctly

**Status**: ⏳ PENDING

---

### Test 10.2: Identity Linking ⏳

**Steps:**
1. Create account with email/password using email: test@example.com
2. Login with Google OAuth using same email: test@example.com
3. Check database

**Expected:**
- [ ] Supabase automatically links identities
- [ ] Same user ID for both auth methods
- [ ] Can login with either method

**Status**: ⏳ PENDING

---

## Testing Summary

**Total Tests**: 30+

**Status Overview**:
- ⏳ Pending: All tests awaiting execution
- ✅ Passed: To be filled during testing
- ❌ Failed: To be filled during testing

---

## Current Blocking Issues

1. **OAuth Providers Not Configured**: Need to set up Google, Apple, and Microsoft OAuth apps
2. **Redirect URIs**: Must add localhost:3000 and production domain to all providers
3. **Testing Without Config**: Can only test UI and click handlers, not full OAuth flow

---

## Next Steps

1. **Immediate**: Test UI rendering and JavaScript (Phases 1-2) ✅ Can do now
2. **After Provider Setup**: Complete OAuth flow testing (Phases 5-10)
3. **Optional**: Mobile testing on real devices

---

## Notes

- Some tests can be done immediately (UI, click handlers, console errors)
- Full OAuth testing requires completing SSO_SETUP.md configuration
- Start with visual testing, then configure one provider (Google is easiest)
- Test incrementally: Google first, then Apple, then Microsoft
