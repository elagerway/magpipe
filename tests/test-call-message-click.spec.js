// @ts-check
import { test, expect } from '@playwright/test';
import { testConfig } from './test-config.js';

/**
 * Test clicking Message from a call detail view
 */
test.describe('Call Message Click', () => {
  // Use iPhone 12 viewport for mobile-first testing
  test.use({ viewport: { width: 390, height: 844 } });

  test('Click Message from call to +16042108180', async ({ page }) => {
    const { baseUrl, testUser, timeouts } = testConfig;

    // Login
    await page.goto(`${baseUrl}/login`);
    await page.waitForSelector('#email', { timeout: timeouts.element });
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('#submit-btn');

    await page.waitForURL('**/dashboard', { timeout: timeouts.navigation });
    console.log('Logged in');

    // Navigate to inbox
    await page.goto(`${baseUrl}/inbox`);
    await page.waitForSelector('#conversations', { timeout: timeouts.navigation });
    console.log('On inbox page');

    // Wait for conversations to load
    await page.waitForSelector('.conversation-item', { timeout: timeouts.element });

    // Find conversation with 6042108180
    const targetConv = page.locator('.conversation-item').filter({ hasText: '604' }).first();
    const hasTarget = await targetConv.count() > 0;

    if (!hasTarget) {
      console.log('No conversation with 604 found, looking for any call');
      const anyCall = page.locator('.conversation-item[data-type="call"]').first();
      if (await anyCall.count() > 0) {
        await anyCall.click();
      } else {
        console.log('No calls found at all');
        await page.screenshot({ path: '/tmp/no-calls.png' });
        test.skip();
        return;
      }
    } else {
      await targetConv.click();
    }

    console.log('Clicked on conversation');
    await page.waitForTimeout(500);

    // Take screenshot of call detail
    await page.screenshot({ path: '/tmp/call-detail.png' });

    // Look for Message button
    const messageBtn = page.locator('#message-action-btn');
    const hasMessageBtn = await messageBtn.count() > 0;

    if (!hasMessageBtn) {
      console.log('No Message button - might be SMS thread, not call');
      await page.screenshot({ path: '/tmp/no-message-btn.png' });
      test.skip();
      return;
    }

    console.log('Clicking Message button...');
    await messageBtn.click();

    // Wait and take screenshot
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/after-message-click.png' });

    // Check for error
    const errorEl = page.locator('text=Error Loading Page');
    const hasError = await errorEl.count() > 0;

    if (hasError) {
      console.log('ERROR: Page shows error after clicking Message');
      await page.screenshot({ path: '/tmp/message-click-error.png' });
    }

    // Verify we're in message view (has input)
    const messageInput = page.locator('#message-input');
    const hasInput = await messageInput.count() > 0;
    console.log('Has message input:', hasInput);

    expect(hasError).toBe(false);
    expect(hasInput).toBe(true);
  });
});
