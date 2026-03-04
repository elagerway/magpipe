# Password Reset Testing Guide

## Overview
This guide covers testing the forgot password / password reset functionality.

**Dev Server**: http://localhost:3000 ✅ Running

---

## Test Checklist

### ✅ Phase 1: Visual Testing

#### Test 1.1: Login Page - Forgot Password Link
**URL**: http://localhost:3000/login

**Steps**:
1. Navigate to login page
2. Look for "Forgot password?" link below password field

**Expected**:
- [ ] Link visible and styled correctly
- [ ] Right-aligned below password input
- [ ] Clickable and navigates to /forgot-password
- [ ] Link color matches primary color

---

#### Test 1.2: Forgot Password Page
**URL**: http://localhost:3000/forgot-password

**Steps**:
1. Navigate to forgot password page

**Expected**:
- [ ] Page title: "Reset Password"
- [ ] Subtitle: "Enter your email and we'll send you a reset link"
- [ ] Email input field present
- [ ] "Send Reset Link" button present
- [ ] "Remember your password? Sign in" link at bottom
- [ ] No console errors

---

#### Test 1.3: Reset Password Page (No Session)
**URL**: http://localhost:3000/reset-password

**Steps**:
1. Navigate directly to reset-password page (without clicking email link)

**Expected**:
- [ ] Shows "Invalid Reset Link" message
- [ ] "Request New Link" button present
- [ ] "Back to Sign In" link present
- [ ] Cannot set password without valid session

---

### ✅ Phase 2: Functional Testing

#### Test 2.1: Send Reset Email
**Prerequisites**:
- Have a test account with email/password auth
- Access to the email inbox

**Steps**:
1. Go to http://localhost:3000/forgot-password
2. Enter your test account email
3. Click "Send Reset Link"
4. Check email inbox

**Expected**:
- [ ] Button changes to "Sending..."
- [ ] Success message appears: "Password reset link sent! Check your email."
- [ ] Form clears after submission
- [ ] Button re-enabled
- [ ] Email received within 1-2 minutes
- [ ] Email contains reset link

---

#### Test 2.2: Invalid Email
**Steps**:
1. Go to /forgot-password
2. Enter non-existent email: `notreal@example.com`
3. Click "Send Reset Link"

**Expected**:
- [ ] Success message still appears (security best practice)
- [ ] Doesn't reveal if email exists or not
- [ ] No error shown to user

---

#### Test 2.3: Empty Email
**Steps**:
1. Go to /forgot-password
2. Leave email field empty
3. Click "Send Reset Link"

**Expected**:
- [ ] HTML5 validation prevents submission
- [ ] "Please fill out this field" message appears

---

#### Test 2.4: Click Reset Link in Email
**Prerequisites**: Completed Test 2.1

**Steps**:
1. Open reset email
2. Click the reset link

**Expected**:
- [ ] Opens app at /reset-password
- [ ] Shows "Set New Password" form
- [ ] Two password fields visible
- [ ] "Update Password" button present
- [ ] Session token present (check DevTools Application > Cookies)

---

#### Test 2.5: Set New Password
**Prerequisites**: Completed Test 2.4

**Steps**:
1. On /reset-password page (after clicking email link)
2. Enter new password: `NewPassword123!`
3. Confirm password: `NewPassword123!`
4. Click "Update Password"

**Expected**:
- [ ] Button changes to "Updating password..."
- [ ] Success message: "Password updated successfully! Redirecting to dashboard..."
- [ ] Automatically redirects to /dashboard after 2 seconds
- [ ] User is logged in
- [ ] Can navigate app normally

---

#### Test 2.6: Password Mismatch
**Steps**:
1. On /reset-password page
2. Enter password: `NewPassword123!`
3. Enter confirm: `DifferentPassword123!`
4. Click "Update Password"

**Expected**:
- [ ] Error message: "Passwords do not match."
- [ ] Form not submitted
- [ ] Can try again

---

#### Test 2.7: Short Password
**Steps**:
1. On /reset-password page
2. Enter password: `short` (less than 8 characters)
3. Try to submit

**Expected**:
- [ ] HTML5 validation prevents submission
- [ ] "Please lengthen this text" or similar message
- [ ] Minimum 8 characters enforced

---

#### Test 2.8: Login with New Password
**Prerequisites**: Completed Test 2.5

**Steps**:
1. Sign out from dashboard
2. Go to /login
3. Enter email and NEW password
4. Click "Sign In"

**Expected**:
- [ ] Successfully logs in
- [ ] Old password no longer works
- [ ] New password is active

---

### ✅ Phase 3: Security Testing

#### Test 3.1: Expired Reset Link
**Steps**:
1. Request reset email
2. Wait for link to expire (typically 1 hour)
3. Click expired link

**Expected**:
- [ ] Shows "Invalid Reset Link" message
- [ ] Cannot set password
- [ ] Must request new link

---

#### Test 3.2: Reused Reset Link
**Steps**:
1. Request reset email
2. Click link and set new password successfully
3. Try to use the same link again

**Expected**:
- [ ] Link no longer works
- [ ] Shows invalid link message
- [ ] One-time use enforced

---

#### Test 3.3: Direct Access to Reset Page
**Steps**:
1. Try to navigate to /reset-password without clicking email link
2. Try manually

**Expected**:
- [ ] No session present
- [ ] Shows "Invalid Reset Link" page
- [ ] Cannot bypass email verification

---

### ✅ Phase 4: Edge Cases

#### Test 4.1: Multiple Reset Requests
**Steps**:
1. Request reset email
2. Immediately request another reset email
3. Request a third time

**Expected**:
- [ ] All requests succeed
- [ ] Only the most recent link works
- [ ] Previous links invalidated
- [ ] No rate limiting issues (for testing)

---

#### Test 4.2: Reset While Logged In
**Steps**:
1. Login to app normally
2. Navigate to /forgot-password
3. Request reset email
4. Click link in email

**Expected**:
- [ ] Reset still works
- [ ] Creates new session
- [ ] Old session replaced

---

#### Test 4.3: Network Error
**Steps**:
1. Open DevTools Network tab
2. Enable "Offline" mode
3. Try to submit forgot password form

**Expected**:
- [ ] Error message displayed
- [ ] User informed of network issue
- [ ] Can retry when online

---

### ✅ Phase 5: Supabase Configuration

#### Test 5.1: Redirect URL Configuration
**Location**: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/url-configuration

**Steps**:
1. Go to Supabase Auth URL Configuration
2. Check "Redirect URLs" section

**Required URLs**:
- [ ] `http://localhost:3000/**` (for local testing)
- [ ] `http://localhost:3000/reset-password` (specific)
- [ ] Production domain URLs when deploying

**Note**: Wildcard `/**` allows all paths under the domain

---

#### Test 5.2: Email Templates
**Location**: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/templates

**Steps**:
1. Go to Supabase Auth Templates
2. Select "Reset Password" template

**Verify**:
- [ ] Template active
- [ ] Correct sender email
- [ ] Link includes correct redirect URL
- [ ] Branding matches app (optional)

**Default Template**:
```
Subject: Reset Your Password

Hi,

Follow this link to reset your password:

{{ .ConfirmationURL }}

This link expires in 1 hour.
```

---

### ✅ Phase 6: Integration Testing

#### Test 6.1: Complete User Journey
**Scenario**: User forgets password, resets it, and logs in

**Steps**:
1. Create test account
2. Sign out
3. Go to /login
4. Click "Forgot password?"
5. Enter email and submit
6. Check email and click link
7. Set new password
8. Verify redirect to dashboard
9. Sign out
10. Sign in with new password

**Expected**:
- [ ] All steps complete without errors
- [ ] Smooth user experience
- [ ] Password successfully changed

---

#### Test 6.2: Password Reset + SSO
**Scenario**: User with both password and OAuth can reset password

**Steps**:
1. Create account with Google OAuth
2. Add password via forgot password flow
3. Can login with both methods

**Expected**:
- [ ] Both auth methods work
- [ ] Identity linking works correctly
- [ ] No conflicts

---

## Known Issues / Limitations

### 1. Email Delivery Time
- Reset emails may take 1-5 minutes
- Check spam folder if not received
- Supabase uses email service with rate limits

### 2. Link Expiration
- Reset links expire after 1 hour (Supabase default)
- Cannot be extended without custom configuration

### 3. Rate Limiting
- Supabase may rate limit password reset requests
- Typically 60 requests per hour per IP
- Not an issue for normal usage

---

## Troubleshooting

### Email Not Received
1. Check spam/junk folder
2. Verify email address is correct
3. Check Supabase logs for errors
4. Ensure email templates are enabled

### "Invalid Reset Link" Error
1. Link may have expired (1 hour limit)
2. Link already used (one-time use)
3. Request new reset link

### Password Not Updating
1. Check browser console for errors
2. Verify Supabase Auth is configured
3. Ensure session is valid
4. Try refreshing page

### Redirect Not Working
1. Check Supabase redirect URL configuration
2. Ensure URL matches exactly
3. Check for trailing slashes
4. Verify browser allows redirects

---

## Testing Results

**Last Tested**: [Date]
**Tested By**: [Name]
**Environment**: Local Development
**Browser**: [Chrome/Safari/Firefox]

**Summary**:
- Total Tests: 30+
- Passed: [ ]
- Failed: [ ]
- Skipped: [ ]

**Notes**:
[Add any testing observations here]

---

## Next Steps After Testing

1. ✅ Test all flows manually
2. ✅ Fix any bugs found
3. ✅ Configure Supabase redirect URLs for production
4. ✅ Customize email templates (optional)
5. Test on mobile devices
6. Test in production environment
7. Monitor password reset success rates
