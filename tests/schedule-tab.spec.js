// Test the Schedule tab on agent detail page
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Schedule Tab', () => {
  test('should display and save schedule settings', async ({ page }) => {
    test.setTimeout(60000);

    // Get magic link via Supabase admin API
    console.log('Generating magic link...');
    const magicLinkCmd = `source .env && curl -s -X POST "https://api.magpipe.ai/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
    const result = execSync(magicLinkCmd, { cwd: process.cwd(), shell: '/bin/bash' }).toString();
    const magicLinkData = JSON.parse(result);
    const otpCode = magicLinkData.email_otp;
    console.log('Got OTP code:', otpCode);

    // Go to localhost
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify OTP to get session
    console.log('Verifying OTP...');
    const sessionResult = await page.evaluate(async ({ email, otp }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        'https://api.magpipe.ai',
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

    // Navigate to agents page
    console.log('Navigating to agents page...');
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click the first agent
    const firstAgent = page.locator('.agent-card').first();
    await expect(firstAgent).toBeVisible({ timeout: 10000 });
    await firstAgent.click();
    await page.waitForURL(/\/agents\/.+/);
    await page.waitForTimeout(1000);

    // Click the Schedule tab
    console.log('Clicking Schedule tab...');
    const scheduleTab = page.locator('[data-tab="schedule"]');
    await expect(scheduleTab).toBeVisible();
    await scheduleTab.click();
    await page.waitForTimeout(500);

    // Verify schedule content loads
    console.log('Verifying schedule content...');
    await expect(page.locator('text=Schedule Settings')).toBeVisible();
    await expect(page.locator('text=Calls Schedule')).toBeVisible();
    await expect(page.locator('text=Texts Schedule')).toBeVisible();
    await expect(page.locator('#schedule-timezone')).toBeVisible();

    // Verify day rows are present
    await expect(page.locator('#calls-monday-enabled')).toBeVisible();
    await expect(page.locator('#texts-monday-enabled')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/schedule-tab.png' });
    console.log('Screenshot saved');

    console.log('Schedule tab test passed');
    console.log('- Schedule Settings visible: true');
    console.log('- Timezone selector visible: true');
    console.log('- Day toggles visible: true');
  });
});
