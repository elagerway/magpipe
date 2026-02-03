import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test('SMS modal shows when toggle enabled', async ({ page }) => {
  test.setTimeout(60000);

  page.on('console', msg => console.log('Browser:', msg.text()));

  // Auth setup
  const magicLinkCmd = `source .env && curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{"type":"magiclink","email":"erik@snapsonic.com"}'`;
  const result = execSync(magicLinkCmd, { cwd: process.cwd(), shell: '/bin/bash' }).toString();
  const otpCode = JSON.parse(result).email_otp;

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  await page.evaluate(async ({ email, otp }) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      'https://mtxbiyilvgwhbdptysex.supabase.co',
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

  // Click Configure SMS button
  console.log('Clicking Configure SMS button...');
  const configureSmsBtn = page.locator('#configure-sms-btn');
  await expect(configureSmsBtn).toBeVisible();
  await configureSmsBtn.click();
  await page.waitForTimeout(1000);

  // Modal should appear
  const modal = page.locator('#sms-modal');
  await expect(modal).toBeVisible({ timeout: 5000 });
  console.log('✅ SMS Modal opened');

  // Click Add Template
  const addBtn = page.locator('#add-sms-template-btn');
  await addBtn.click();
  await page.waitForTimeout(500);

  // Fill template
  const nameInput = modal.locator('.sms-template-name-input').first();
  const contentInput = modal.locator('.sms-template-content-input').first();

  if (await nameInput.isVisible()) {
    await nameInput.fill('Test Template');
    await contentInput.fill('Hello, this is a test message.');
    console.log('✅ Filled template form');
  }

  // Save
  await page.locator('#save-sms-templates-btn').click();
  await page.waitForTimeout(2000);

  console.log('✅ SMS modal flow complete');
});
