# Single Sign-On (SSO) Setup Guide

This guide explains how to configure Google, Apple, and Microsoft OAuth providers in Supabase for Pat.

## Prerequisites

- Supabase project dashboard access: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex
- Developer accounts for each provider

## OAuth Providers Configuration

### 1. Google OAuth Setup

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable "Google+ API" for your project

#### Step 2: Configure OAuth Consent Screen
1. Navigate to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type
3. Fill in required fields:
   - App name: "Pat"
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

#### Step 3: Create OAuth Client ID
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: "Web application"
4. Add authorized JavaScript origins:
   ```
   https://mtxbiyilvgwhbdptysex.supabase.co
   http://localhost:3000
   ```
5. Add authorized redirect URIs:
   ```
   https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/callback
   http://localhost:3000/auth/v1/callback
   ```
6. Save Client ID and Client Secret

#### Step 4: Configure in Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/providers)
2. Click on "Google" provider
3. Enable the provider
4. Paste your Client ID and Client Secret
5. Save changes

---

### 2. Apple OAuth Setup

#### Step 1: Apple Developer Account Setup
1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to "Certificates, Identifiers & Profiles"

#### Step 2: Create Services ID
1. Click "Identifiers" > "+" button
2. Select "Services IDs" > Continue
3. Fill in details:
   - Description: "Pat SSO"
   - Identifier: `com.pat.sso` (or your domain)
4. Enable "Sign in with Apple"
5. Configure domains and return URLs:
   - Domains: `mtxbiyilvgwhbdptysex.supabase.co`
   - Return URLs: `https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/callback`

#### Step 3: Create Signing Key
1. Go to "Keys" > "+" button
2. Key name: "Pat Apple Sign In Key"
3. Enable "Sign in with Apple"
4. Download the key file (.p8)
5. Note your Key ID

#### Step 4: Get Required IDs
- Team ID: Found in top-right of Apple Developer portal
- Services ID: The identifier you created
- Key ID: From the key you created

#### Step 5: Configure in Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/providers)
2. Click on "Apple" provider
3. Enable the provider
4. Enter:
   - Services ID
   - Team ID
   - Key ID
   - Private Key (contents of .p8 file)
5. Save changes

---

### 3. Microsoft (Azure) OAuth Setup

#### Step 1: Register App in Azure Portal
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in details:
   - Name: "Pat"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI (Web): `https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/callback`

#### Step 2: Configure Authentication
1. Go to "Authentication" in your app
2. Add additional redirect URIs if needed:
   ```
   http://localhost:3000/auth/v1/callback
   ```
3. Enable "ID tokens" under "Implicit grant and hybrid flows"

#### Step 3: Create Client Secret
1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Add description: "Pat SSO Secret"
4. Choose expiration (recommended: 24 months)
5. Copy the secret value (you won't see it again!)

#### Step 4: Note Application IDs
- Application (client) ID: Found on the "Overview" page
- Directory (tenant) ID: Also on the "Overview" page
- Client Secret: From previous step

#### Step 5: Configure in Supabase
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/providers)
2. Click on "Azure" provider
3. Enable the provider
4. Enter:
   - Azure Client ID: Your Application (client) ID
   - Azure Secret: Your client secret value
   - Azure Tenant ID: Your Directory (tenant) ID (or "common" for multi-tenant)
5. Save changes

---

## Testing OAuth Flow

### Development Testing
1. Start local dev server: `npm run dev`
2. Navigate to http://localhost:3000/login
3. Click on any SSO button (Google, Apple, or Microsoft)
4. Complete authentication on provider's page
5. Verify redirect back to /dashboard

### Production Testing
1. Deploy to production
2. Test each OAuth provider
3. Verify user profile creation
4. Check phone verification flow

---

## Security Best Practices

### 1. Redirect URI Validation
- Only add trusted redirect URIs
- Use HTTPS in production
- Keep localhost URIs for development only

### 2. Client Secret Management
- Never commit secrets to version control
- Rotate secrets periodically
- Use environment variables when possible

### 3. OAuth Scopes
- Request minimal scopes needed
- Current scopes: email, profile, openid
- Users must consent to data access

### 4. Session Management
- Sessions are handled by Supabase Auth
- JWT tokens stored in httpOnly cookies
- Automatic token refresh enabled

---

## Troubleshooting

### "Redirect URI mismatch" Error
- Verify redirect URIs match exactly in provider settings
- Include protocol (http:// or https://)
- Check for trailing slashes

### "Invalid Client" Error
- Verify Client ID and Secret are correct
- Check if credentials are active
- Ensure OAuth app is published (Google)

### Users Not Redirected After Login
- Check browser console for errors
- Verify Supabase Auth event listeners are active
- Check network tab for failed API calls

### Profile Not Created
- Check Supabase logs for errors
- Verify `users` table exists
- Check if user email is available from provider

---

## Implementation Details

### Code Flow
1. User clicks SSO button
2. `User.signInWithOAuth(provider)` called
3. Browser redirects to provider's auth page
4. User authenticates with provider
5. Provider redirects to Supabase callback URL
6. Supabase exchanges code for session
7. `SIGNED_IN` event fires in app
8. App creates profile and redirects to /verify-phone or /dashboard

### Files Modified
- `src/models/User.js`: Added `signInWithOAuth()` method
- `src/pages/login.js`: Added SSO buttons and handlers
- `src/pages/signup.js`: Added SSO buttons and handlers
- `src/main.js`: Auth state change handler (already handles OAuth)

### Supported Providers
- ✅ Google (via `google` provider)
- ✅ Apple (via `apple` provider)
- ✅ Microsoft (via `azure` provider)

---

## Mobile Considerations

### PWA Compatibility
- OAuth flows work in mobile browsers
- PWA installed apps use system browser for OAuth
- Session persists after OAuth redirect

### Native Apps (Future)
For native mobile apps, consider:
- Google Sign-In SDK for native iOS/Android
- Apple Sign-In native flow
- Microsoft Authentication Library (MSAL)

---

## Next Steps

1. ✅ Configure all three OAuth providers in Supabase
2. ✅ Test each provider on localhost
3. ✅ Test on production domain
4. Add analytics tracking for SSO sign-ins
5. Monitor SSO success/failure rates
6. Consider adding more providers (GitHub, LinkedIn)
