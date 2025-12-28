import { test, expect } from '@playwright/test';

test.describe('Inbox New Message Dropdown', () => {
  test('should show dropdown when clicking + button', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Login with test credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    // Wait for login to complete (may redirect to verify-phone)
    await page.waitForTimeout(2000);

    // Navigate directly to inbox
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });
    console.log('Navigated to inbox');

    // Find the + button
    const newConvBtn = page.locator('#new-conversation-btn');
    await expect(newConvBtn).toBeVisible();

    // Dropdown should be hidden initially
    const dropdown = page.locator('#new-message-dropdown');
    await expect(dropdown).toBeHidden();

    // Click the + button
    await newConvBtn.click();
    console.log('Clicked + button');

    // Dropdown should now be visible
    await expect(dropdown).toBeVisible();
    console.log('Dropdown is visible');

    // Verify all 4 options are present
    await expect(dropdown.locator('[data-action="new-message"]')).toBeVisible();
    await expect(dropdown.locator('[data-action="new-agent-message"]')).toBeVisible();
    await expect(dropdown.locator('[data-action="bulk-message"]')).toBeVisible();
    await expect(dropdown.locator('[data-action="bulk-agent-message"]')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: '/tmp/inbox-dropdown-open.png' });
    console.log('Screenshot saved to /tmp/inbox-dropdown-open.png');
  });

  test('should close dropdown on outside click', async ({ page }) => {
    // Login with test credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });

    // Open dropdown
    const newConvBtn = page.locator('#new-conversation-btn');
    await newConvBtn.click();

    const dropdown = page.locator('#new-message-dropdown');
    await expect(dropdown).toBeVisible();

    // Click outside the dropdown (on the page body)
    await page.locator('body').click({ position: { x: 10, y: 300 } });

    // Dropdown should be hidden
    await expect(dropdown).toBeHidden();
    console.log('Dropdown closed on outside click');
  });

  test('should close dropdown on Escape key', async ({ page }) => {
    // Login with test credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });

    // Open dropdown
    const newConvBtn = page.locator('#new-conversation-btn');
    await newConvBtn.click();

    const dropdown = page.locator('#new-message-dropdown');
    await expect(dropdown).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dropdown should be hidden
    await expect(dropdown).toBeHidden();
    console.log('Dropdown closed on Escape key');
  });

  test('should open new message modal when clicking New Message', async ({ page }) => {
    // Login with test credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });

    // Open dropdown
    const newConvBtn = page.locator('#new-conversation-btn');
    await newConvBtn.click();

    const dropdown = page.locator('#new-message-dropdown');
    await expect(dropdown).toBeVisible();

    // Click New Message option
    await dropdown.locator('[data-action="new-message"]').click();

    // Dropdown should close
    await expect(dropdown).toBeHidden();

    // New message interface should appear with To: phone input
    const phoneInput = page.locator('#text-phone');
    await expect(phoneInput).toBeVisible({ timeout: 5000 });
    console.log('New message interface opened');

    // Take screenshot
    await page.screenshot({ path: '/tmp/inbox-new-message-interface.png' });
  });
});
