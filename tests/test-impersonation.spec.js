// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Impersonation', () => {
  test('can impersonate another user', async ({ page, context }) => {
    // Login as test account (admin)
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Go to admin
    await page.goto('http://localhost:3000/admin');
    await page.waitForSelector('.user-item', { timeout: 10000 });
    console.log('✅ Admin portal loaded');

    // Find a user that's NOT the test account (erik@snapsonic.com)
    const userItems = page.locator('.user-item');
    const count = await userItems.count();
    console.log(`Found ${count} users`);

    let targetClicked = false;
    for (let i = 0; i < count; i++) {
      const emailEl = userItems.nth(i).locator('.user-email');
      const email = await emailEl.textContent();
      console.log(`User ${i}: ${email}`);

      if (email && email.includes('erik@snapsonic.com')) {
        await userItems.nth(i).click();
        targetClicked = true;
        console.log('✅ Clicked on erik@snapsonic.com');
        break;
      }
    }

    if (!targetClicked) {
      console.log('Erik not found, clicking first user');
      await userItems.first().click();
    }

    // Wait for details panel
    await page.waitForSelector('#btn-impersonate', { timeout: 5000 });
    console.log('✅ Details panel loaded');

    // Listen for dialog (alert)
    page.on('dialog', async dialog => {
      console.log('Dialog appeared:', dialog.type(), dialog.message());
      await dialog.accept();
    });

    // Listen for new pages (popup)
    const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(e => {
      console.log('No new page opened:', e.message);
      return null;
    });

    // Click impersonate
    console.log('Clicking impersonate button...');
    await page.click('#btn-impersonate');

    // Wait for popup
    const popup = await pagePromise;

    if (popup) {
      console.log('✅ New tab opened!');
      const popupUrl = popup.url();
      console.log('Popup URL:', popupUrl);

      // Verify the URL contains the impersonation token
      expect(popupUrl).toContain('/impersonate?token=');
      console.log('✅ Impersonation URL is correct');

      // Wait for the impersonation page to process
      await popup.waitForTimeout(3000);
      const finalUrl = popup.url();
      console.log('Final URL after processing:', finalUrl);

      await popup.close();
    } else {
      // Check for error in console or page
      console.log('No popup - checking page for errors...');
      const pageContent = await page.content();
      if (pageContent.includes('error')) {
        console.log('Page may contain an error');
      }

      // This test should fail if no popup
      expect(popup).not.toBeNull();
    }
  });
});
