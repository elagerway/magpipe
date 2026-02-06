// Test Custom Functions feature
import { test, expect } from '@playwright/test';

const TEST_EMAIL = 'erik@snapsonic.com';
const TEST_PASSWORD = 'Snapsonic123';

test.describe('Custom Functions Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|agent)/, { timeout: 10000 });
  });

  test('should display Custom Functions section in Functions tab', async ({ page }) => {
    // Go to agents page
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');

    // Click on the first agent
    const agentCard = page.locator('.agent-card').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await agentCard.click();

    // Wait for agent detail page
    await page.waitForURL('**/agents/**');
    await page.waitForLoadState('networkidle');

    // Click on Functions tab
    const functionsTab = page.locator('.agent-tab[data-tab="functions"]');
    await expect(functionsTab).toBeVisible();
    await functionsTab.click();

    // Wait for tab content to load
    await page.waitForTimeout(500);

    // Verify Custom Functions section exists
    const customFunctionsHeader = page.locator('h3:has-text("Custom Functions")');
    await expect(customFunctionsHeader).toBeVisible();

    // Verify Add Function button exists
    const addFunctionBtn = page.locator('#add-custom-function-btn');
    await expect(addFunctionBtn).toBeVisible();
  });

  test('should open Add Function modal', async ({ page }) => {
    // Go to agents page
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');

    // Click on the first agent
    const agentCard = page.locator('.agent-card').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await agentCard.click();

    // Wait for agent detail page
    await page.waitForURL('**/agents/**');
    await page.waitForLoadState('networkidle');

    // Click on Functions tab
    const functionsTab = page.locator('.agent-tab[data-tab="functions"]');
    await functionsTab.click();
    await page.waitForTimeout(500);

    // Click Add Function button
    const addFunctionBtn = page.locator('#add-custom-function-btn');
    await addFunctionBtn.click();

    // Verify modal opens
    const modal = page.locator('#custom-function-modal');
    await expect(modal).toBeVisible();

    // Verify modal has expected fields
    await expect(page.locator('#cf-name')).toBeVisible();
    await expect(page.locator('#cf-description')).toBeVisible();
    await expect(page.locator('#cf-method')).toBeVisible();
    await expect(page.locator('#cf-url')).toBeVisible();

    // Verify Add Header/Parameter/Variable buttons exist
    await expect(page.locator('#add-header-btn')).toBeVisible();
    await expect(page.locator('#add-param-btn')).toBeVisible();
    await expect(page.locator('#add-response-var-btn')).toBeVisible();

    // Close modal - use the one inside our specific modal
    await modal.locator('.close-modal-btn').click();
    await expect(modal).not.toBeVisible();
  });

  test('should create a new custom function', async ({ page }) => {
    // Go to agents page
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');

    // Click on the first agent
    const agentCard = page.locator('.agent-card').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await agentCard.click();

    // Wait for agent detail page
    await page.waitForURL('**/agents/**');
    await page.waitForLoadState('networkidle');

    // Click on Functions tab
    const functionsTab = page.locator('.agent-tab[data-tab="functions"]');
    await functionsTab.click();
    await page.waitForTimeout(500);

    // Click Add Function button
    const addFunctionBtn = page.locator('#add-custom-function-btn');
    await addFunctionBtn.click();

    // Fill in the form
    const timestamp = Date.now();
    const functionName = `test_function_${timestamp}`;

    await page.fill('#cf-name', functionName);
    await page.fill('#cf-description', 'A test function for Playwright testing');
    await page.selectOption('#cf-method', 'POST');
    await page.fill('#cf-url', 'https://webhook.site/test-endpoint');

    // Add a parameter
    await page.click('#add-param-btn');
    await page.fill('.cf-param-name', 'order_id');
    await page.fill('.cf-param-desc', 'The order ID to look up');
    await page.check('.cf-param-required');

    // Save the function
    await page.click('#save-custom-function-btn');

    // Wait for modal to close and list to update
    await page.waitForTimeout(1000);

    // Verify the function appears in the list
    const functionCard = page.locator(`.custom-function-card:has-text("${functionName}")`);
    await expect(functionCard).toBeVisible({ timeout: 5000 });

    // Verify it shows POST method badge
    await expect(functionCard.locator('text=POST')).toBeVisible();

    // Clean up - delete the test function
    await functionCard.locator('.delete-custom-function-btn').click();

    // Confirm deletion in modal
    await page.click('#confirm-modal-confirm');
    await page.waitForTimeout(500);

    // Verify it's removed
    await expect(functionCard).not.toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Go to agents page
    await page.goto('http://localhost:3000/agents');
    await page.waitForLoadState('networkidle');

    // Click on the first agent
    const agentCard = page.locator('.agent-card').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await agentCard.click();

    // Wait for agent detail page
    await page.waitForURL('**/agents/**');
    await page.waitForLoadState('networkidle');

    // Click on Functions tab
    const functionsTab = page.locator('.agent-tab[data-tab="functions"]');
    await functionsTab.click();
    await page.waitForTimeout(500);

    // Click Add Function button
    await page.click('#add-custom-function-btn');

    // Try to save without filling required fields
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('required');
      await dialog.accept();
    });

    await page.click('#save-custom-function-btn');

    // Modal should still be open
    const modal = page.locator('#custom-function-modal');
    await expect(modal).toBeVisible();

    // Close modal - use the one inside our specific modal
    await modal.locator('.close-modal-btn').click();
  });
});
