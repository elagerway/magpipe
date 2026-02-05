// @ts-check
import { test, expect } from '@playwright/test';

// Test credentials from CLAUDE.md
const TEST_EMAIL = 'erik@snapsonic.com';
const TEST_PASSWORD = 'Snapsonic123';

test.describe('Knowledge Source Crawl Modes', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    // Wait for redirect after login (could be /home or /agent)
    await page.waitForURL(/\/(home|agent)/);
  });

  test('should show crawl mode options in add source modal', async ({ page }) => {
    // Navigate to Knowledge page
    await page.goto('http://localhost:3000/knowledge');
    await page.waitForLoadState('networkidle');

    // Click Add Source button
    await page.click('.btn-add-source');

    // Verify modal opened
    await expect(page.locator('.add-source-form')).toBeVisible();

    // Verify crawl mode dropdown exists
    const crawlModeSelect = page.locator('select[name="crawl_mode"]');
    await expect(crawlModeSelect).toBeVisible();

    // Verify options
    await expect(crawlModeSelect.locator('option[value="single"]')).toHaveText('Single Page');
    await expect(crawlModeSelect.locator('option[value="sitemap"]')).toHaveText('Sitemap');
    await expect(crawlModeSelect.locator('option[value="recursive"]')).toHaveText('Recursive');

    // Verify advanced options are hidden by default
    const advancedOptions = page.locator('.advanced-crawl-options');
    await expect(advancedOptions).toBeHidden();

    // Select sitemap mode
    await crawlModeSelect.selectOption('sitemap');

    // Verify advanced options are now visible
    await expect(advancedOptions).toBeVisible();

    // Verify max pages input
    const maxPagesInput = page.locator('input[name="max_pages"]');
    await expect(maxPagesInput).toBeVisible();
    await expect(maxPagesInput).toHaveValue('100');

    // Verify robots.txt checkbox
    const robotsCheckbox = page.locator('input[name="respect_robots_txt"]');
    await expect(robotsCheckbox).toBeVisible();
    await expect(robotsCheckbox).toBeChecked();

    // Crawl depth should be hidden for sitemap mode
    const depthContainer = page.locator('.depth-container');
    await expect(depthContainer).toBeHidden();

    // Select recursive mode
    await crawlModeSelect.selectOption('recursive');

    // Crawl depth should now be visible
    await expect(depthContainer).toBeVisible();
    const depthInput = page.locator('input[name="crawl_depth"]');
    await expect(depthInput).toHaveValue('2');
  });

  test('should add a sitemap source and start crawling', async ({ page }) => {
    // Navigate to Knowledge page
    await page.goto('http://localhost:3000/knowledge');
    await page.waitForLoadState('networkidle');

    // Click Add Source button
    await page.click('.btn-add-source');

    // Fill in URL (using a well-known sitemap for testing)
    const urlInput = page.locator('input[name="url"]');
    await urlInput.fill('https://www.sitemaps.org/sitemap.xml');

    // Select sitemap mode
    const crawlModeSelect = page.locator('select[name="crawl_mode"]');
    await crawlModeSelect.selectOption('sitemap');

    // Set max pages to a small number for testing
    const maxPagesInput = page.locator('input[name="max_pages"]');
    await maxPagesInput.fill('5');

    // Submit the form
    const submitBtn = page.locator('.add-source-form button[type="submit"]');
    await submitBtn.click();

    // Wait for button text to change or modal to close (timeout up to 60s for sitemap fetch)
    try {
      await page.waitForSelector('.add-source-form', { state: 'hidden', timeout: 60000 });
    } catch (e) {
      // Modal didn't close - check if form has an error state
      await page.screenshot({ path: 'test-results/sitemap-test-error.png' });

      // Check button text for error state
      const btnText = await submitBtn.textContent();
      console.log('Button text:', btnText);

      // Check for any toast messages
      const toasts = page.locator('.toast');
      const toastCount = await toasts.count();
      console.log('Number of toasts:', toastCount);
      for (let i = 0; i < toastCount; i++) {
        console.log('Toast', i, ':', await toasts.nth(i).textContent());
      }

      // The form might still be showing because of slow network - that's ok
      if (btnText === 'Starting crawl...') {
        console.log('Still processing - sitemap fetch is slow');
        await page.waitForSelector('.add-source-form', { state: 'hidden', timeout: 60000 });
      } else if (btnText === 'Add Source') {
        // Button reset means an error occurred
        throw new Error('Form submission failed - button text reset to Add Source');
      }
    }

    // Should show either success or info toast about crawl starting
    const anyToast = page.locator('.toast');
    await expect(anyToast.first()).toBeVisible({ timeout: 10000 });
    const toastText = await anyToast.first().textContent();
    console.log('Toast message:', toastText);

    // Verify the source was added to the list (may take a moment after modal closes)
    await page.waitForTimeout(1000);
    const sourceCards = page.locator('.source-card');
    const cardCount = await sourceCards.count();
    console.log('Source cards count:', cardCount);
    expect(cardCount).toBeGreaterThan(0);

    // The source should show syncing status (sitemap crawl is async)
    const statusBadge = page.locator('.status-badge').first();
    const statusText = await statusBadge.textContent();
    console.log('Source status:', statusText);
    expect(['syncing', 'completed', 'pending']).toContain(statusText);
  });
});
