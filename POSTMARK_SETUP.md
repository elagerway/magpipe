# Postmark Email Setup for Supabase Auth

## Overview
Configure Supabase to use Postmark for sending authentication emails (password reset, email verification, etc.) instead of the default Supabase email service.

## Credentials (from .env)
- **Server ID**: 17141722
- **API Key**: f508e120-4acf-4634-bcf6-8de3606b7060

---

## Step 1: Configure Custom SMTP in Supabase

### Navigate to Supabase Settings
1. Go to: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/settings/auth
2. Scroll down to **"SMTP Settings"** section
3. Click **"Enable Custom SMTP"**

### Enter Postmark SMTP Details

**SMTP Settings:**
```
Sender email: noreply@snapsonic.app (or your verified domain)
Sender name: Pat AI Assistant

Host: smtp.postmarkapp.com
Port number: 587
Username: f508e120-4acf-4634-bcf6-8de3606b7060
Password: f508e120-4acf-4634-bcf6-8de3606b7060

Enable SSL: No (use TLS/STARTTLS)
```

**Important Notes:**
- For Postmark, both username AND password are the same (your API key)
- Use port 587 with TLS (not SSL)
- Sender email must be from a verified domain in Postmark

---

## Step 2: Verify Sender Domain in Postmark

### Check Domain Status
1. Go to: https://account.postmarkapp.com/servers/17141722/signatures
2. Check if your sending domain is verified

### If Domain Not Verified:
1. Click "Add Domain or Signature"
2. Enter your domain (e.g., snapsonic.app)
3. Add DNS records provided by Postmark:
   - DKIM record
   - Return-Path record
4. Wait for verification (usually 5-15 minutes)

### Alternative: Use Verified Signature
If you don't want to verify a full domain:
1. Verify a single email address
2. Use that address as the sender

---

## Step 3: Test Email Delivery

### Test Password Reset Email
1. Go to: http://localhost:3000/forgot-password
2. Enter a test email address
3. Click "Send Reset Link"
4. Check:
   - Email arrives (check spam folder)
   - Sent from correct address
   - Contains reset link
   - Link works when clicked

### Monitor in Postmark Dashboard
1. Go to: https://account.postmarkapp.com/servers/17141722/streams/outbound/activity
2. View sent emails in real-time
3. Check delivery status
4. View bounce/spam reports

---

## Step 4: Customize Email Templates

### Option A: Customize in Supabase (Recommended)
1. Go to: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/templates
2. Select "Reset Password" template
3. Customize:
   - Subject line
   - Email body (HTML and plain text)
   - Add branding/logo
   - Adjust styling

### Option B: Use Postmark Templates
1. Create template in Postmark: https://account.postmarkapp.com/servers/17141722/templates
2. Get template ID/alias
3. Configure Supabase to use Postmark template (advanced)

---

## Email Template Customization

### Recommended Password Reset Template

**Subject:**
```
Reset Your Pat Password
```

**HTML Body:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #1f2937;">Reset Your Password</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #6b7280;">
                We received a request to reset your Pat password. Click the button below to create a new password:
              </p>

              <!-- Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.
              </p>

              <!-- Alternative Link -->
              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                Button not working? Copy and paste this link into your browser:<br>
                <a href="{{ .ConfirmationURL }}" style="color: #6366f1; word-break: break-all;">{{ .ConfirmationURL }}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                © 2025 Pat AI Assistant. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

**Plain Text Body:**
```
Reset Your Password

We received a request to reset your Pat password.

Click the link below to create a new password:
{{ .ConfirmationURL }}

If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.

---
© 2025 Pat AI Assistant. All rights reserved.
```

---

## Step 5: Update Environment Variables (Optional)

If needed, add Postmark credentials to Supabase environment:

1. Go to: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/settings/api
2. Add custom environment variables (if using Edge Functions):
   ```
   POSTMARK_SERVER_ID=17141722
   POSTMARK_API_KEY=f508e120-4acf-4634-bcf6-8de3606b7060
   ```

---

## Benefits of Using Postmark

### Reliability
- ✅ 99.99% uptime SLA
- ✅ Dedicated IP reputation
- ✅ Automatic retry on failures

### Deliverability
- ✅ High inbox placement rate
- ✅ DKIM/SPF/DMARC configured
- ✅ Real-time bounce handling
- ✅ Spam complaint monitoring

### Analytics
- ✅ Open tracking (optional)
- ✅ Click tracking (optional)
- ✅ Delivery statistics
- ✅ Bounce categorization

### Developer Experience
- ✅ Real-time activity stream
- ✅ Detailed error messages
- ✅ Testing sandbox
- ✅ Template management

---

## Troubleshooting

### Emails Not Sending

**Check Supabase SMTP Configuration:**
1. Verify all fields are correct
2. Ensure "Enable Custom SMTP" is ON
3. Test connection (Supabase provides test button)

**Check Postmark:**
1. View activity stream for rejected messages
2. Check for authentication errors
3. Verify domain is verified

**Common Issues:**
- Sender domain not verified → Verify in Postmark
- Wrong API key → Double-check .env file
- Port blocked → Ensure firewall allows port 587
- Email in spam → Check Postmark reputation score

### Emails Going to Spam

**Solutions:**
1. Verify DKIM/SPF records
2. Warm up IP address gradually
3. Avoid spam trigger words
4. Include unsubscribe link (for marketing emails)
5. Monitor bounce rate

### Link Not Working

**Check:**
1. Redirect URL configured correctly in Supabase
2. Link hasn't expired (1 hour default)
3. User hasn't already used the link
4. No trailing characters copied from email

---

## Testing Checklist

### Pre-Production Testing
- [ ] Send test password reset email
- [ ] Verify email received
- [ ] Check email formatting (HTML and plain text)
- [ ] Click reset link
- [ ] Confirm redirect to /reset-password
- [ ] Set new password successfully
- [ ] Login with new password

### Monitor After Launch
- [ ] Check Postmark activity stream daily
- [ ] Review bounce reports weekly
- [ ] Monitor spam complaints
- [ ] Track delivery rates
- [ ] Review user feedback

---

## Cost Estimate

**Postmark Pricing** (as of 2025):
- 100 emails/month: FREE
- 10,000 emails/month: $15
- 50,000 emails/month: $50
- 100,000 emails/month: $80

**Current Usage Estimate:**
- Password resets: ~50-100/month (estimated)
- Email verifications: ~100-200/month (estimated)
- Total: ~150-300/month = **FREE TIER**

---

## Next Steps

1. ✅ Configure SMTP settings in Supabase
2. ✅ Verify sender domain in Postmark
3. ✅ Customize email templates
4. ✅ Test password reset flow
5. Monitor delivery in first week

---

## Support & Resources

**Postmark:**
- Dashboard: https://account.postmarkapp.com/servers/17141722
- Docs: https://postmarkapp.com/developer
- Support: support@postmarkapp.com

**Supabase:**
- SMTP Settings: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/settings/auth
- Email Templates: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/templates
- Docs: https://supabase.com/docs/guides/auth/auth-smtp

---

## Quick Setup Summary

**For Quick Setup (5 minutes):**
1. Go to Supabase Auth Settings
2. Enable Custom SMTP
3. Enter Postmark details (see Step 1)
4. Save
5. Test with forgot password flow

**For Production-Ready Setup (30 minutes):**
1. Complete Quick Setup above
2. Verify domain in Postmark
3. Customize email template
4. Test thoroughly
5. Monitor first 24 hours

---

**Setup Date**: September 30, 2025
**Status**: Ready to Configure
**Next Action**: Configure SMTP in Supabase Dashboard
