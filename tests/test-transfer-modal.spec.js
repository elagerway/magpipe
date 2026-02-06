import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test('Transfer modal shows when toggle enabled', async ({ page }) => {
  test.setTimeout(60000);

  // Capture console logs
  page.on('console', msg => console.log('Browser:', msg.text()));

  // Get magic link via Supabase admin API
  console.log('🔐 Generating magic link...');
  const magicLinkCmd = `source .env && curl -s -X POST "https://api.magpipe.ai/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
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
  await page.goto('http://localhost:3000/agents');
  await page.waitForLoadState('networkidle');

  // Wait a bit for agents to load
  await page.waitForTimeout(2000);

  // Check what's on the page
  const agentCard = page.locator('.agent-card').first();
  const agentCardVisible = await agentCard.isVisible().catch(() => false);
  console.log('Agent card visible:', agentCardVisible);

  if (agentCardVisible) {
    await agentCard.click();
    await page.waitForTimeout(2000);
  } else {
    // Maybe we're on a different page structure - check URL
    console.log('Current URL:', page.url());
    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/agents-page.png' });
  }

  // Check current URL
  const currentUrl = page.url();
  console.log('Current URL after click:', currentUrl);

  // If not on agent page, try direct navigation
  if (!currentUrl.includes('/agent/')) {
    // Get first agent ID from the page or use a known one
    const agentLinks = await page.locator('a[href*="/agent/"]').all();
    if (agentLinks.length > 0) {
      await agentLinks[0].click();
      await page.waitForTimeout(2000);
    }
  }

  // Click Functions tab
  console.log('Clicking Functions tab...');
  await page.click('button[data-tab="functions"]');
  await page.waitForTimeout(500);

  // Find transfer toggle
  const transferToggle = page.locator('#func-transfer');
  await expect(transferToggle).toBeVisible();

  const isChecked = await transferToggle.isChecked();
  console.log('Transfer toggle initially checked:', isChecked);

  // If already checked, uncheck first
  if (isChecked) {
    console.log('Unchecking transfer toggle...');
    await transferToggle.click();
    await page.waitForTimeout(1500);
  }

  // Now enable the toggle
  console.log('Clicking transfer toggle to enable...');
  await transferToggle.click();
  await page.waitForTimeout(2000);

  // Check for modal
  const modal = page.locator('#transfer-modal');
  const modalVisible = await modal.isVisible();
  console.log('Modal visible:', modalVisible);

  await expect(modal).toBeVisible({ timeout: 5000 });
  console.log('✅ Modal is visible!');
});
