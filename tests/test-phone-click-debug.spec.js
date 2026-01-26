import { test, expect } from '@playwright/test';

test('Debug phone button click', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);

  await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
  await page.fill('input[type="password"]', 'TestPass123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // Capture console
  page.on('console', msg => console.log('  [CONSOLE]', msg.text()));
  page.on('pageerror', err => console.log('  [ERROR]', err.message));

  console.log('📱 Going to phone page...');
  await page.goto('http://localhost:3000/phone');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Close mic modal
  const micModal = await page.locator('#mic-permission-modal').count();
  if (micModal > 0) {
    await page.click('button:has-text("Allow")').catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Check if PhonePage class exists
  console.log('\n🔍 Checking PhonePage initialization...');
  const pageInstance = await page.evaluate(() => {
    return window.currentPage ? 'EXISTS' : 'MISSING';
  });
  console.log('  currentPage:', pageInstance);

  // Check if event listener is attached
  const hasListener = await page.evaluate(() => {
    const btn = document.getElementById('call-btn');
    if (!btn) return 'BUTTON_MISSING';
    // Try to see if onclick or addEventListener was used
    return btn.onclick ? 'HAS_ONCLICK' : 'NO_ONCLICK';
  });
  console.log('  call-btn listener:', hasListener);

  // Try clicking via different methods
  console.log('\n📞 Testing button click methods...');

  await page.fill('#call-search-input', '+16045628647');
  await page.selectOption('#caller-id-select', { index: 0 });
  await page.waitForTimeout(500);

  console.log('  Method 1: Normal click...');
  await page.click('#call-btn', { force: true });
  await page.waitForTimeout(2000);

  console.log('  Method 2: JavaScript click...');
  await page.evaluate(() => {
    document.getElementById('call-btn').click();
  });
  await page.waitForTimeout(2000);

  console.log('  Method 3: Dispatch event...');
  await page.evaluate(() => {
    const btn = document.getElementById('call-btn');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(2000);

  console.log('\n✅ Test complete');
});
