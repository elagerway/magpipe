import { test, expect } from '@playwright/test';

test('SIP registration test', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🌐 Opening inbox page...');
  await page.goto('http://localhost:3000/inbox');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  console.log('⏳ Waiting for SIP initialization...');

  // Listen to all console logs
  page.on('console', msg => {
    const text = msg.text();
    console.log('  📋 Browser:', text);
  });

  // Wait up to 10 seconds for SIP registration
  await page.waitForTimeout(10000);

  console.log('✅ Test complete - check logs above for SIP registration status');
});
