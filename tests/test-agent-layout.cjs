/**
 * Test: Agent page layout - chat input visible above bottom nav
 */

const { test, expect } = require('@playwright/test');

const SUPABASE_URL = 'https://mtxbiyilvgwhbdptysex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxNzA2NTYsImV4cCI6MjA0Mzc0NjY1Nn0.lBjrdWJnxHJSFVtJsUaKqWrXUNeOpaYXyODqXsCABFI';

test.describe('Agent Page Layout', () => {
  test('chat input is visible above bottom nav', async ({ page }) => {
    // Load environment for service role key
    require('dotenv').config();
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY not found in .env');
    }

    // Generate magic link OTP
    console.log('Generating magic link OTP...');
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'magiclink', email: 'erik@snapsonic.com' })
    });

    const data = await response.json();
    const otp = data.email_otp;
    console.log('Got OTP:', otp ? 'yes' : 'no');

    // Navigate to app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify OTP to get session
    console.log('Verifying OTP...');
    const sessionResult = await page.evaluate(async ({ url, anonKey, email, otpCode }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(url, anonKey, {
        auth: { storageKey: 'magpipe-auth-token' }
      });
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'email'
      });
      if (data?.session) {
        localStorage.setItem('magpipe-auth-token', JSON.stringify(data.session));
      }
      return { success: !!data?.session, error: error?.message };
    }, { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, email: 'erik@snapsonic.com', otpCode: otp });

    console.log('Session result:', sessionResult);
    expect(sessionResult.success).toBe(true);

    // Navigate to agent page
    console.log('Navigating to agent page...');
    await page.goto('http://localhost:3000/agent');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for chat interface to initialize

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/agent-before.png', fullPage: false });
    console.log('Screenshot saved to tests/screenshots/agent-before.png');

    // Check elements exist
    const chatInterface = page.locator('.admin-chat-interface');
    const chatArea = page.locator('.chat-area');
    const chatMessages = page.locator('.chat-messages');
    const chatInput = page.locator('.chat-input');
    const inputContainer = page.locator('.chat-input-container');
    const bottomNav = page.locator('.bottom-nav');

    console.log('Checking elements...');
    await expect(chatInterface).toBeVisible({ timeout: 5000 });
    await expect(chatArea).toBeVisible({ timeout: 5000 });
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await expect(bottomNav).toBeVisible({ timeout: 5000 });

    // Get bounding boxes
    const inputBox = await chatInput.boundingBox();
    const inputContainerBox = await inputContainer.boundingBox();
    const navBox = await bottomNav.boundingBox();
    const viewport = page.viewportSize();

    console.log('=== LAYOUT MEASUREMENTS ===');
    console.log('Viewport:', viewport);
    console.log('Input field:', inputBox);
    console.log('Input container:', inputContainerBox);
    console.log('Bottom nav:', navBox);

    // Calculate positions
    const inputBottom = inputContainerBox.y + inputContainerBox.height;
    const navTop = navBox.y;
    const gap = navTop - inputBottom;

    console.log(`Input container bottom: ${inputBottom}px`);
    console.log(`Bottom nav top: ${navTop}px`);
    console.log(`Gap between them: ${gap}px`);

    // Verify input is above nav (not overlapping)
    expect(inputBottom).toBeLessThanOrEqual(navTop + 5); // 5px tolerance
    console.log('✅ Input is above bottom nav');

    // Verify input is in visible area (not at very bottom edge)
    const inputDistanceFromBottom = viewport.height - inputBottom;
    console.log(`Input distance from viewport bottom: ${inputDistanceFromBottom}px`);

    // Input should have reasonable space (bottom nav is ~60px)
    expect(inputDistanceFromBottom).toBeGreaterThanOrEqual(50);
    console.log('✅ Input has proper spacing from bottom');

    // Verify input container is reasonably sized (at least 40px tall)
    expect(inputContainerBox.height).toBeGreaterThanOrEqual(40);
    console.log(`✅ Input container height: ${inputContainerBox.height}px`);

    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/agent-final.png', fullPage: false });
    console.log('Final screenshot saved to tests/screenshots/agent-final.png');
  });
});
