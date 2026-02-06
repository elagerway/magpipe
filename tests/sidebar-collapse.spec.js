/**
 * Test Sidebar Collapse Toggle
 */
import { test, expect } from '@playwright/test';

test.describe('Agent Page Sidebar Collapse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|agent)/);
  });

  test('sidebar collapse toggle works', async ({ page }) => {
    // Go to agent page
    await page.goto('http://localhost:3000/agent');
    await page.waitForSelector('.chat-sidebar', { timeout: 10000 });

    // Verify sidebar is visible
    const sidebar = page.locator('.chat-sidebar');
    await expect(sidebar).toBeVisible();

    // Find collapse toggle in left nav (next to logo)
    const toggle = page.locator('.sidebar-panel-toggle');
    await expect(toggle).toBeVisible();

    // Click to collapse
    await toggle.click();

    // Sidebar should have collapsed class
    await expect(sidebar).toHaveClass(/collapsed/);

    // Toggle should still be visible when collapsed (it's in the nav, not sidebar)
    await expect(toggle).toBeVisible();

    // Click to expand
    await toggle.click();

    // Sidebar should not have collapsed class
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });
});
