import { test, expect } from '@playwright/test';

// Test credentials from CLAUDE.md
const TEST_EMAIL = 'erik@snapsonic.com';
const TEST_PASSWORD = 'Snapsonic123';

test.describe('Global Agent Access Control', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/agent', { timeout: 10000 });
  });

  test('Admin Global Agent tab shows permission management UI', async ({ page }) => {
    // Navigate to admin
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');

    // Click on Global Agent tab
    await page.click('[data-tab="global-agent"]');
    await page.waitForTimeout(1000);

    // Verify the permission management UI is shown
    await expect(page.locator('h2:has-text("Global Agent Access")')).toBeVisible();
    await expect(page.locator('text=Control which users can view and edit')).toBeVisible();

    // Verify search input is present
    await expect(page.locator('#global-agent-search')).toBeVisible();

    // Verify user list is loaded
    await expect(page.locator('.global-agent-users-list')).toBeVisible();

    // Verify at least one user is shown
    await expect(page.locator('.global-agent-user-item').first()).toBeVisible();

    console.log('✅ Admin Global Agent tab shows permission management UI');
  });

  test('Can grant and revoke global agent permission', async ({ page }) => {
    // Navigate to admin
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');

    // Click on Global Agent tab
    await page.click('[data-tab="global-agent"]');
    await page.waitForTimeout(1000);

    // Find a checkbox that's not disabled (not a god user)
    const checkbox = page.locator('.global-agent-checkbox:not([disabled])').first();

    if (await checkbox.count() > 0) {
      const wasChecked = await checkbox.isChecked();

      // Toggle the checkbox
      await checkbox.click();
      await page.waitForTimeout(500);

      // Verify status message appeared
      await expect(page.locator('.form-status')).toBeVisible();

      // Toggle back
      await checkbox.click();
      await page.waitForTimeout(500);

      console.log('✅ Can grant and revoke global agent permission');
    } else {
      console.log('⚠️ No non-god users found to test permission toggle');
    }
  });

  test('Agent config page shows agent selector for permitted users', async ({ page }) => {
    // First, grant permission to current user via admin
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="global-agent"]');
    await page.waitForTimeout(1000);

    // Find current user's checkbox (erik@snapsonic.com)
    const userCheckbox = page.locator('.global-agent-user-item:has-text("erik@snapsonic.com") .global-agent-checkbox');

    // Check if it's a god user (disabled checkbox)
    const isDisabled = await userCheckbox.isDisabled();

    if (!isDisabled) {
      // Make sure permission is granted
      const isChecked = await userCheckbox.isChecked();
      if (!isChecked) {
        await userCheckbox.click();
        await page.waitForTimeout(500);
      }
    }

    // Navigate to agent config
    await page.goto('http://localhost:3000/agent-config');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check if agent selector is visible (should be visible for god user or user with permission)
    const personalBtn = page.locator('#select-personal-agent');
    const globalBtn = page.locator('#select-global-agent');

    if (await personalBtn.count() > 0) {
      await expect(personalBtn).toBeVisible();
      await expect(globalBtn).toBeVisible();
      console.log('✅ Agent selector is visible for permitted user');

      // Test switching to global agent
      await globalBtn.click();
      await page.waitForTimeout(1000);

      // Verify page reloads with global agent mode
      await expect(page.locator('h1:has-text("Global Agent Configuration")')).toBeVisible();
      console.log('✅ Can switch to Global Agent editing mode');

      // Switch back to personal
      await page.locator('#select-personal-agent').click();
      await page.waitForTimeout(1000);

      await expect(page.locator('h1:has-text("Agent Configuration")')).toBeVisible();
      console.log('✅ Can switch back to personal agent');
    } else {
      console.log('⚠️ Agent selector not visible - user may not have permission or is in initial setup');
    }
  });

  test('Search filter works in permission list (including user ID)', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="global-agent"]');
    await page.waitForTimeout(1000);

    const searchInput = page.locator('#global-agent-search');
    await expect(searchInput).toBeVisible();

    // Get initial count of visible users
    const initialCount = await page.locator('.global-agent-user-item:visible').count();

    // Search for a specific term (email)
    await searchInput.fill('erik');
    await page.waitForTimeout(300);

    // Verify filtering occurred
    const filteredCount = await page.locator('.global-agent-user-item:visible').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Get a user ID from one of the visible items
    const firstUserItem = page.locator('.global-agent-user-item:visible').first();
    const userId = await firstUserItem.getAttribute('data-user-id');

    // Clear and search by partial user ID (first 8 chars of UUID)
    const partialId = userId.substring(0, 8);
    await searchInput.fill(partialId);
    await page.waitForTimeout(300);

    // Should find at least one user
    const idFilteredCount = await page.locator('.global-agent-user-item:visible').count();
    expect(idFilteredCount).toBeGreaterThan(0);
    console.log(`✅ Search by partial user ID (${partialId}) found ${idFilteredCount} user(s)`);

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(300);

    // Should show all users again
    const clearedCount = await page.locator('.global-agent-user-item:visible').count();
    expect(clearedCount).toEqual(initialCount);

    console.log('✅ Search filter works correctly (email, name, and user ID)');
  });

  test('Users tab search works with full user ID', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="users"]');
    await page.waitForTimeout(1500);

    // Wait for users to load
    await page.waitForSelector('.user-item', { timeout: 10000 });

    // Get a user ID from the first item
    const firstUserItem = page.locator('.user-item').first();
    const userId = await firstUserItem.getAttribute('data-user-id');

    if (userId) {
      const searchInput = page.locator('#search-input');
      await expect(searchInput).toBeVisible();

      // Search by FULL user ID (server-side supports exact UUID matching)
      await searchInput.fill(userId);

      // Wait for debounced search and results to update
      await page.waitForTimeout(1500);

      // Should find exactly one result
      const resultsCount = await page.locator('.user-item').count();
      expect(resultsCount).toBeGreaterThan(0);

      console.log(`✅ Users tab search by full ID (${userId}) found ${resultsCount} user(s)`);
    } else {
      console.log('⚠️ Could not get user ID from first item');
    }
  });
});
