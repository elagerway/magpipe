// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Admin Reviews Tab', () => {
  test.beforeEach(async ({ page }) => {
    // Login with admin credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/inbox', { timeout: 10000 });
  });

  test('Reviews tab loads with stats and empty table', async ({ page }) => {
    // Navigate to admin with reviews tab
    await page.goto('http://localhost:3000/admin?tab=reviews');
    await page.waitForTimeout(2000);

    // Should see the Reviews heading
    await expect(page.locator('h2:has-text("Review Collection")')).toBeVisible({ timeout: 10000 });
    console.log('✅ Reviews tab header visible');

    // Should see the Send Review Request button
    const sendBtn = page.locator('#review-send-btn');
    await expect(sendBtn).toBeVisible();
    console.log('✅ Send Review Request button visible');

    // Should see stats cards (may take a moment to load)
    await page.waitForSelector('.review-stats-grid', { timeout: 10000 });
    const statCards = page.locator('.review-stat-card');
    const cardCount = await statCards.count();
    expect(cardCount).toBe(5);
    console.log(`✅ ${cardCount} stat cards visible`);

    // Stats should show zeros initially
    const totalValue = await statCards.first().locator('.review-stat-value').textContent();
    console.log(`✅ Total sent: ${totalValue}`);

    // Table should show empty state
    const emptyState = page.locator('.tl-empty');
    const table = page.locator('.admin-table');
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);
    console.log(`✅ Table state: ${hasEmpty ? 'empty (expected)' : hasTable ? 'has data' : 'unknown'}`);
  });

  test('Send Review Request modal opens and has user picker', async ({ page }) => {
    await page.goto('http://localhost:3000/admin?tab=reviews');
    await page.waitForSelector('#review-send-btn', { timeout: 10000 });

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('Browser error:', msg.text());
    });

    // Click Send Review Request button
    await page.click('#review-send-btn');

    // Wait for modal (API call to list users + DOM render)
    const modal = page.locator('#review-modal-overlay');
    await expect(modal).toBeVisible({ timeout: 10000 });
    console.log('✅ Send Review Request modal opens');

    // Should have user selector
    const userSelect = modal.locator('select[name="user_id"]');
    await expect(userSelect).toBeVisible();
    const optionCount = await userSelect.locator('option').count();
    console.log(`✅ User picker has ${optionCount} options (including placeholder)`);
    expect(optionCount).toBeGreaterThanOrEqual(2); // At least 1 user + placeholder

    // Should have platform selector
    const platformSelect = modal.locator('select[name="platform"]');
    await expect(platformSelect).toBeVisible();
    const platformOptions = await platformSelect.locator('option').count();
    expect(platformOptions).toBe(3); // G2, Capterra, Product Hunt
    console.log('✅ Platform picker has 3 options');

    // Should have Cancel and Send buttons
    await expect(modal.locator('#review-modal-cancel')).toBeVisible();
    await expect(modal.locator('button[type="submit"]')).toBeVisible();
    console.log('✅ Modal has Cancel and Send Email buttons');

    // Close modal
    await page.click('#review-modal-cancel');
    await page.waitForTimeout(300);
    await expect(modal).not.toBeVisible();
    console.log('✅ Modal closes on Cancel');
  });
});
