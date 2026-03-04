// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe('External Trunk Provider Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home|inbox)/);
    await page.waitForTimeout(500);
  });

  test('Phone page loads External SIP Trunks section', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    // Scroll down to find the External SIP Trunks section
    const heading = page.locator('h2:has-text("External SIP Trunks")');
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('Add Trunk modal opens with provider dropdown', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    // Click Add Trunk button
    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });

    // Verify modal opens with contact-modal pattern
    const overlay = page.locator('#add-trunk-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Verify modal header
    const header = overlay.locator('.contact-modal-header h3');
    await expect(header).toHaveText('Add External SIP Trunk');

    // Verify provider dropdown exists
    const providerSelect = page.locator('#trunk-provider');
    await expect(providerSelect).toBeVisible();

    // Verify it has 3 options
    const options = providerSelect.locator('option');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText('Twilio');
    await expect(options.nth(1)).toHaveText('SignalWire');
    await expect(options.nth(2)).toHaveText('Other / Generic SIP');
  });

  test('Twilio provider shows Account SID and Auth Token fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Default is Twilio
    const accountSidField = page.locator('#trunk-account-sid');
    const authTokenField = page.locator('#trunk-auth-token');
    await expect(accountSidField).toBeVisible();
    await expect(authTokenField).toBeVisible();

    // Should NOT show IP/registration toggle or outbound server for Twilio
    await expect(page.locator('.contact-modal-overlay .auth-type-selector')).not.toBeVisible();
    await expect(page.locator('#modal-outbound-address')).not.toBeVisible();
  });

  test('SignalWire provider shows Space URL, Project ID, API Token fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Switch to SignalWire
    await page.selectOption('#trunk-provider', 'signalwire');
    await page.waitForTimeout(200);

    const spaceUrlField = page.locator('#trunk-space-url');
    const projectIdField = page.locator('#trunk-project-id');
    const apiTokenField = page.locator('#trunk-api-token');
    await expect(spaceUrlField).toBeVisible();
    await expect(projectIdField).toBeVisible();
    await expect(apiTokenField).toBeVisible();

    // Should NOT show Twilio fields
    await expect(page.locator('#trunk-account-sid')).not.toBeVisible();
  });

  test('Other provider shows auth type toggle and outbound server', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Switch to Other
    await page.selectOption('#trunk-provider', 'other');
    await page.waitForTimeout(200);

    // Should show auth type selector
    const authTypeSelector = page.locator('.contact-modal-overlay .auth-type-selector');
    await expect(authTypeSelector).toBeVisible();

    // Should show outbound address field
    const outboundField = page.locator('#modal-outbound-address');
    await expect(outboundField).toBeVisible();

    // IP auth should be selected by default
    const ipBtn = page.locator('.auth-type-btn[data-auth-type="ip"]');
    await expect(ipBtn).toHaveClass(/selected/);

    // IP fields visible, registration hidden
    await expect(page.locator('#modal-ip-auth-fields')).toBeVisible();
    const regFields = page.locator('#modal-registration-auth-fields');
    await expect(regFields).toBeHidden();

    // Click registration
    const regBtn = page.locator('.auth-type-btn[data-auth-type="registration"]');
    await regBtn.click();
    await page.waitForTimeout(200);
    await expect(page.locator('#modal-ip-auth-fields')).toBeHidden();
    await expect(page.locator('#modal-registration-auth-fields')).toBeVisible();
  });

  test('Modal footer stays fixed with action buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Footer with buttons should be visible
    const modal = page.locator('#add-trunk-modal-overlay');
    const footer = modal.locator('.contact-modal-footer');
    await expect(footer).toBeVisible();

    // Footer should have Cancel and Create Trunk buttons
    await expect(footer.locator('#cancel-add-trunk')).toBeVisible();
    await expect(footer.locator('#save-add-trunk')).toBeVisible();
  });

  test('Close modal by clicking X button', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });

    const overlay = page.locator('#add-trunk-modal-overlay');
    await expect(overlay).toBeVisible();

    await page.click('#close-add-trunk-modal');
    await expect(overlay).not.toBeVisible({ timeout: 3000 });
  });

  test('Switching providers updates fields dynamically', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(2000);

    const addBtn = page.locator('#add-external-trunk-btn');
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click({ force: true });
    await page.waitForTimeout(300);

    // Start with Twilio (default)
    await expect(page.locator('#trunk-account-sid')).toBeVisible();

    // Switch to SignalWire
    await page.selectOption('#trunk-provider', 'signalwire');
    await page.waitForTimeout(200);
    await expect(page.locator('#trunk-account-sid')).not.toBeVisible();
    await expect(page.locator('#trunk-space-url')).toBeVisible();

    // Switch to Other
    await page.selectOption('#trunk-provider', 'other');
    await page.waitForTimeout(200);
    await expect(page.locator('#trunk-space-url')).not.toBeVisible();
    await expect(page.locator('.contact-modal-overlay .auth-type-selector')).toBeVisible();

    // Switch back to Twilio
    await page.selectOption('#trunk-provider', 'twilio');
    await page.waitForTimeout(200);
    await expect(page.locator('.contact-modal-overlay .auth-type-selector')).not.toBeVisible();
    await expect(page.locator('#trunk-account-sid')).toBeVisible();
  });
});
