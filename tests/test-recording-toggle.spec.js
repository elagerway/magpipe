import { test, expect } from '@playwright/test';

test('Check recording toggle on phone page', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in with test account...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);

  const emailInput = await page.locator('input[type="email"]').first();
  const passwordInput = await page.locator('input[type="password"]').first();

  await emailInput.fill('claude-test@snapsonic.test');
  await passwordInput.fill('TestPass123!');

  const loginButton = await page.locator('button[type="submit"]').first();
  await loginButton.click();

  console.log('⏳ Waiting for login redirect...');
  await page.waitForTimeout(5000);

  console.log('Current URL:', page.url());

  // Navigate to phone page
  console.log('📱 Navigating to phone page...');
  await page.goto('http://localhost:3000/phone');
  await page.waitForTimeout(2000);

  // Listen to console logs
  console.log('📋 Capturing browser console...');
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  [BROWSER]', text);
  });

  page.on('pageerror', error => {
    console.log('  [ERROR]', error.message);
  });

  await page.waitForTimeout(2000);

  // Check if recording toggle exists
  const toggleExists = await page.locator('#record-call-toggle').count();
  console.log('\n✓ Recording toggle found:', toggleExists > 0 ? 'YES' : 'NO');

  if (toggleExists > 0) {
    const isChecked = await page.locator('#record-call-toggle').isChecked();
    console.log('✓ Recording toggle checked by default:', isChecked ? 'YES' : 'NO');

    // Check if toggle is visible
    const isVisible = await page.locator('#record-call-toggle').isVisible();
    console.log('✓ Recording toggle visible:', isVisible ? 'YES' : 'NO');
  } else {
    console.log('❌ Recording toggle NOT FOUND in DOM');

    // Dump page HTML for debugging
    const html = await page.content();
    console.log('\nSearching for "record" in HTML:', html.includes('record') ? 'FOUND' : 'NOT FOUND');
    console.log('Searching for "Record call" text:', html.includes('Record call') ? 'FOUND' : 'NOT FOUND');
  }

  // Keep browser open for inspection
  console.log('\nWaiting 10 seconds for inspection...');
  await page.waitForTimeout(10000);
});
