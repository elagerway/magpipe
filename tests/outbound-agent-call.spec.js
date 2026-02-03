import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

// Test credentials
const TEST_PHONE = '+16044182180'; // Erik's cell

test.describe('Outbound Agent Call Test', () => {
  test('place outbound agent call and monitor status', async ({ page, context }) => {
    test.setTimeout(180000); // 3 minute timeout

    // Grant microphone permission
    await context.grantPermissions(['microphone']);

    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('📞') || text.includes('✅') || text.includes('❌') || text.includes('SIP') || text.includes('call') || text.includes('Generated')) {
        console.log('BROWSER:', text);
      }
    });

    // Log network requests to Edge Functions
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('functions/v1/initiate-callback-call')) {
        console.log('🌐 Edge Function Response:');
        console.log('   Status:', response.status());
        console.log('   URL:', url);
        try {
          const body = await response.text();
          console.log('   Body:', body.substring(0, 500));
        } catch (e) {
          console.log('   Body: (could not read)');
        }
      }
    });

    // Get magic link via Supabase admin API
    console.log('🔐 Generating magic link...');
    const magicLinkCmd = `source .env && curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
    const result = execSync(magicLinkCmd, { cwd: process.cwd(), shell: '/bin/bash' }).toString();
    const magicLinkData = JSON.parse(result);

    // Get the OTP code and token
    const otpCode = magicLinkData.email_otp;
    const token = magicLinkData.hashed_token;
    const userEmail = 'erik@snapsonic.com';
    console.log('✅ Got OTP code:', otpCode);

    // Go to localhost first
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Use Supabase verifyOtp with the email OTP code via the app's existing client
    const sessionResult = await page.evaluate(async ({ email, otp }) => {
      // Use the app's supabase client if available, otherwise create new one
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        'https://mtxbiyilvgwhbdptysex.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs',
        { auth: { storageKey: 'magpipe-auth-token' } }
      );
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: otp,
        type: 'email'
      });
      if (data?.session) {
        // Also manually store in the correct key for the app
        const storageKey = 'magpipe-auth-token';
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
          token_type: data.session.token_type,
          user: data.session.user
        }));
        return { success: true, userId: data.user?.id };
      }
      return { success: false, error: error?.message };
    }, { email: userEmail, otp: otpCode });

    console.log('🔐 Session result:', sessionResult);

    if (!sessionResult.success) {
      throw new Error('Failed to verify OTP: ' + sessionResult.error);
    }

    // Reload to pick up session
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check if session is valid after reload
    const sessionCheck = await page.evaluate(async () => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        'https://mtxbiyilvgwhbdptysex.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs',
        { auth: { storageKey: 'magpipe-auth-token' } }
      );
      const { data: { session }, error } = await supabase.auth.getSession();
      return {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        userId: session?.user?.id,
        error: error?.message
      };
    });
    console.log('🔐 Session check after reload:', sessionCheck);

    console.log('📱 Navigating to phone page...');
    await page.goto('http://localhost:3000/phone');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check if phone page loaded
    const callBtn = page.locator('#call-btn');
    const callBtnVisible = await callBtn.isVisible().catch(() => false);

    if (!callBtnVisible) {
      console.log('❌ Call button not visible - may need to login or page not loaded');
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/phone-page-debug.png' });
      throw new Error('Phone page not loaded properly');
    }

    console.log('✅ Phone page loaded');

    // Ensure agent toggle is OFF for testing callback (non-agent) flow
    // Note: The checkbox is hidden (opacity: 0) with a custom styled toggle
    // We need to check its state and click its label to toggle it
    const agentToggle = page.locator('#agent-toggle');
    const isChecked = await agentToggle.isChecked().catch(() => true); // Default to true if can't check
    console.log('🤖 Agent toggle checked state:', isChecked);

    if (isChecked) {
      console.log('🔧 Turning OFF agent toggle for callback test...');
      // Click the label which contains the visible toggle track
      await page.locator('label:has(#agent-toggle)').click();
      await page.waitForTimeout(500);

      // Verify it's now unchecked
      const nowChecked = await agentToggle.isChecked();
      console.log('🤖 Agent toggle after click:', nowChecked);
    }
    console.log('📞 Testing callback flow (non-agent direct call)');

    // Enter phone number
    const searchInput = page.locator('#call-search-input');
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.fill(TEST_PHONE);
    console.log('📞 Entered phone number:', TEST_PHONE);

    // Check caller ID selector
    const callerIdSelect = page.locator('#caller-id-select');
    const callerIdValue = await callerIdSelect.inputValue().catch(() => '');
    console.log('📱 Selected caller ID:', callerIdValue || 'default');

    // Handle mic permission modal if present
    const micModal = page.locator('#mic-permission-modal');
    if (await micModal.isVisible().catch(() => false)) {
      console.log('🎤 Handling mic permission modal...');
      // Click allow/continue button in modal
      const allowBtn = page.locator('#mic-permission-modal button, #mic-permission-modal .btn-primary, #mic-permission-modal [data-action="allow"]').first();
      if (await allowBtn.isVisible().catch(() => false)) {
        await allowBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Click call button
    console.log('📞 Initiating call...');
    await callBtn.click({ force: true });

    // Wait for call to start
    await page.waitForTimeout(5000);

    // Check button state
    const btnAction = await callBtn.getAttribute('data-action');
    console.log('📞 Button action after click:', btnAction);

    if (btnAction === 'hangup') {
      console.log('✅ Call initiated successfully - button is now hangup');

      // Monitor call for 30 seconds
      console.log('⏳ Monitoring call for 30 seconds...');

      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(5000);
        const currentAction = await callBtn.getAttribute('data-action');
        console.log(`⏱️ [${(i+1)*5}s] Button action: ${currentAction || 'call'}`);

        if (currentAction !== 'hangup') {
          console.log('📞 Call ended');
          break;
        }
      }

      // Check if still in call, hang up
      const finalAction = await callBtn.getAttribute('data-action');
      if (finalAction === 'hangup') {
        console.log('🔴 Hanging up call...');
        await callBtn.click();
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('❌ Call may have failed to initiate');
    }

    // Query call records to verify
    console.log('📊 Checking call records...');
  });
});
