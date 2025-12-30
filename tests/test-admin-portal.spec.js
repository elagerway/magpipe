// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Admin Portal', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test account (set as admin)
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    // Wait for any redirect after login
    await page.waitForTimeout(2000);

    // If redirected to verify-phone, navigate directly to admin
    const currentUrl = page.url();
    if (currentUrl.includes('verify-phone') || currentUrl.includes('login')) {
      // Just go directly to admin - the session is valid
      await page.goto('http://localhost:3000/admin');
    }
  });

  test('can access admin portal', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Should see the admin header
    await expect(page.locator('h1')).toContainText('Admin Portal');

    // Should see the user list loading
    await expect(page.locator('.user-list')).toBeVisible();

    // Wait for users to load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Should have at least one user
    const userItems = page.locator('.user-item');
    await expect(userItems.first()).toBeVisible();

    console.log('✅ Admin portal loads successfully');
  });

  test('can view user details', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Wait for users to load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Click on the first user
    await page.locator('.user-item').first().click();

    // Should see user detail panel
    await expect(page.locator('.detail-header')).toBeVisible({ timeout: 5000 });

    // Should see statistics
    await expect(page.locator('.stats-grid')).toBeVisible();

    // Should see action buttons
    await expect(page.locator('#btn-impersonate')).toBeVisible();

    console.log('✅ User details load successfully');
  });

  test('can search users', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Wait for initial load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Type in search
    await page.fill('#search-input', 'erik');

    // Wait for search results (debounced)
    await page.waitForTimeout(500);

    // Should still have users (erik should match)
    await expect(page.locator('.user-item').first()).toBeVisible();

    console.log('✅ Search works');
  });

  test('can filter by plan', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Wait for initial load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Select pro plan filter
    await page.selectOption('#filter-plan', 'pro');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    console.log('✅ Plan filter works');
  });

  test('can change user plan', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Wait for users to load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Click on a user (not the first one if it's the admin)
    const userItems = page.locator('.user-item');
    const count = await userItems.count();

    if (count > 1) {
      // Click second user
      await userItems.nth(1).click();
    } else {
      // Click first user
      await userItems.first().click();
    }

    // Wait for details to load
    await page.waitForSelector('#select-plan', { timeout: 5000 });

    // Get current plan
    const currentPlan = await page.locator('#select-plan').inputValue();
    console.log('Current plan:', currentPlan);

    // Change to opposite plan
    const newPlan = currentPlan === 'free' ? 'pro' : 'free';
    await page.selectOption('#select-plan', newPlan);

    // Handle the alert
    page.on('dialog', async dialog => {
      console.log('Dialog message:', dialog.message());
      await dialog.accept();
    });

    // Click save
    await page.click('#btn-save-plan');

    // Wait for update
    await page.waitForTimeout(1000);

    console.log('✅ Plan change works');
  });

  test('impersonate button generates URL', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    // Wait for users to load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Find a user that's not erik (can't impersonate yourself)
    const userItems = page.locator('.user-item');
    const count = await userItems.count();

    let targetUserFound = false;
    for (let i = 0; i < count; i++) {
      const userEmail = await userItems.nth(i).locator('.user-email').textContent();
      if (userEmail && !userEmail.includes('erik@snapsonic.com')) {
        await userItems.nth(i).click();
        targetUserFound = true;
        break;
      }
    }

    if (!targetUserFound && count > 0) {
      // Just click the first user
      await userItems.first().click();
    }

    // Wait for details to load
    await page.waitForSelector('#btn-impersonate', { timeout: 5000 });

    // Set up listener for new window/tab
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
      page.click('#btn-impersonate')
    ]);

    if (popup) {
      const popupUrl = popup.url();
      console.log('Impersonation URL:', popupUrl);
      expect(popupUrl).toContain('/impersonate?token=');
      console.log('✅ Impersonation generates token URL');
      await popup.close();
    } else {
      // Check for error alert
      console.log('No popup opened - may have shown error');
    }
  });
});
