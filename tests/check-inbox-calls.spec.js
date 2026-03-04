import { test, expect } from '@playwright/test';

test('Check inbox for call records', async ({ page }) => {
  // Set test timeout
  test.setTimeout(60000);

  // Login first
  console.log('🔐 Logging in as test user...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);

  const emailInput = await page.locator('input[type="email"]').first();
  const passwordInput = await page.locator('input[type="password"]').first();

  await emailInput.fill('claude-test@snapsonic.test');
  await passwordInput.fill('TestPass123!');

  const loginButton = await page.locator('button[type="submit"]').first();
  await loginButton.click();

  await page.waitForTimeout(5000);

  // Capture all console logs AFTER login
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  [BROWSER]', text);
  });

  page.on('pageerror', error => {
    console.log('  [PAGE ERROR]', error.message);
  });

  // Navigate to inbox
  console.log('\n📬 Navigating to inbox page...');
  await page.goto('http://localhost:3000/inbox');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  // Check for specific logs
  const callLogs = logs.filter(log =>
    log.includes('Calls loaded:') ||
    log.includes('Number of calls:') ||
    log.includes('Processing call:')
  );

  console.log('\n📋 Call-related logs:');
  callLogs.forEach(log => console.log('  →', log));

  // Get all logs
  console.log('\n📋 ALL console logs:');
  logs.forEach(log => console.log('  →', log));

  // Take a screenshot
  await page.screenshot({ path: 'inbox-screenshot.png', fullPage: true });
  console.log('\n📸 Screenshot saved to inbox-screenshot.png');

  await page.waitForTimeout(2000);
});
