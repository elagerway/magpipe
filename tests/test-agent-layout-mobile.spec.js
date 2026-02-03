import { test, expect, devices } from '@playwright/test';
import { execSync } from 'child_process';

test.use({ ...devices['iPhone 13'] });

test.describe('Agent Page Layout - Mobile', () => {
  test('chat input is visible above bottom nav on mobile', async ({ page }) => {
    test.setTimeout(60000);

    // Get magic link via Supabase admin API
    console.log('🔐 Generating magic link...');
    const magicLinkCmd = `source .env && curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
    const result = execSync(magicLinkCmd, { cwd: process.cwd(), shell: '/bin/bash' }).toString();
    const magicLinkData = JSON.parse(result);
    const otpCode = magicLinkData.email_otp;
    console.log('✅ Got OTP code:', otpCode);

    // Go to localhost
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify OTP to get session
    console.log('🔑 Verifying OTP...');
    const sessionResult = await page.evaluate(async ({ email, otp }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        'https://mtxbiyilvgwhbdptysex.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxNzA2NTYsImV4cCI6MjA0Mzc0NjY1Nn0.lBjrdWJnxHJSFVtJsUaKqWrXUNeOpaYXyODqXsCABFI',
        { auth: { storageKey: 'magpipe-auth-token' } }
      );
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email'
      });
      if (data?.session) {
        localStorage.setItem('magpipe-auth-token', JSON.stringify(data.session));
      }
      return { success: !!data?.session, error: error?.message };
    }, { email: 'erik@snapsonic.com', otp: otpCode });

    console.log('Session result:', sessionResult);
    expect(sessionResult.success).toBe(true);

    // Navigate to agent page
    console.log('📱 Navigating to agent page (MOBILE viewport)...');
    await page.goto('http://localhost:3000/agent');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/agent-layout-MOBILE.png', fullPage: false });
    console.log('📸 Mobile screenshot saved');

    // Check elements exist
    const chatInput = page.locator('.chat-input');
    const inputContainer = page.locator('.chat-input-container');
    const bottomNav = page.locator('.bottom-nav');

    console.log('🔍 Checking elements...');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(bottomNav).toBeVisible({ timeout: 5000 });

    // Get bounding boxes
    const inputContainerBox = await inputContainer.boundingBox();
    const navBox = await bottomNav.boundingBox();
    const viewport = page.viewportSize();

    console.log('=== MOBILE LAYOUT MEASUREMENTS ===');
    console.log('Viewport:', viewport);
    console.log('Input container:', inputContainerBox);
    console.log('Bottom nav:', navBox);

    if (!inputContainerBox) {
      console.log('❌ Input container not visible!');
      throw new Error('Input container not found or not visible');
    }

    // Calculate positions
    const inputBottom = inputContainerBox.y + inputContainerBox.height;
    const navTop = navBox.y;
    const gap = navTop - inputBottom;

    console.log(`Input container bottom: ${inputBottom}px`);
    console.log(`Bottom nav top: ${navTop}px`);
    console.log(`Gap between them: ${gap}px`);

    // Verify input is above nav
    if (inputBottom > navTop) {
      console.log('❌ FAIL: Input overlaps with bottom nav!');
    } else {
      console.log('✅ Input is above bottom nav');
    }
    expect(inputBottom).toBeLessThanOrEqual(navTop + 5);

    console.log('✅ Mobile test complete');
  });
});
