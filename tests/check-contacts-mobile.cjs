const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const iPhone = devices['iPhone 12'];
  const context = await browser.newContext({
    ...iPhone,
  });
  const page = await context.newPage();

  // Use a pre-existing session by going directly to contacts
  // This will redirect to login if not authenticated
  await page.goto('http://localhost:3000/contacts');
  await page.waitForTimeout(2000);

  // Check if we're on login page
  const isLoginPage = await page.locator('text=Welcome Back').isVisible();
  if (isLoginPage) {
    console.log('Logging in...');
    await page.fill('#email', 'claude-test@snapsonic.test');
    await page.fill('#password', 'TestPass123!');
    await page.click('#submit-btn');
    await page.waitForTimeout(5000);
    await page.goto('http://localhost:3000/contacts');
    await page.waitForTimeout(2000);
  }

  // Take screenshot
  await page.screenshot({ path: '/tmp/contacts-mobile.png', fullPage: true });
  console.log('Screenshot saved to /tmp/contacts-mobile.png');

  await browser.close();
})();
