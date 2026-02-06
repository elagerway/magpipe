import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test('Booking modal shows when Configure clicked', async ({ page }) => {
  test.setTimeout(60000);

  page.on('console', msg => console.log('Browser:', msg.text()));

  // Auth setup
  const magicLinkCmd = `source .env && curl -s -X POST "https://api.magpipe.ai/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
  const result = execSync(magicLinkCmd, { cwd: process.cwd(), shell: '/bin/bash' }).toString();
  const otpCode = JSON.parse(result).email_otp;

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  await page.evaluate(async ({ email, otp }) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      'https://api.magpipe.ai',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjgxNzA2NTYsImV4cCI6MjA0Mzc0NjY1Nn0.lBjrdWJnxHJSFVtJsUaKqWrXUNeOpaYXyODqXsCABFI',
      { auth: { storageKey: 'magpipe-auth-token' } }
    );
    const { data } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (data?.session) localStorage.setItem('magpipe-auth-token', JSON.stringify(data.session));
  }, { email: 'erik@snapsonic.com', otp: otpCode });

  // Navigate to agent
  await page.goto('http://localhost:3000/agents');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.locator('.agent-card').first().click();
  await page.waitForTimeout(2000);

  // Go to Functions tab
  await page.click('button[data-tab="functions"]');
  await page.waitForTimeout(500);

  // Click Configure Booking button
  console.log('Clicking Configure Booking button...');
  const configureBookingBtn = page.locator('#configure-booking-btn');
  await expect(configureBookingBtn).toBeVisible();
  await configureBookingBtn.click();
  await page.waitForTimeout(1000);

  // Modal should appear
  const modal = page.locator('#booking-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });
  console.log('✅ Booking Modal opened');

  // Check modal content - should show either Cal.com connect prompt or event types
  const modalContent = await modal.textContent();
  const hasContent = modalContent.includes('Connect Cal.com') || modalContent.includes('event types');
  console.log('Modal has content:', hasContent);
  expect(hasContent).toBe(true);

  console.log('✅ Booking modal flow complete');
});
