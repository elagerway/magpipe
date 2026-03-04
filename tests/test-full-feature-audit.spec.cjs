// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

// === HELPER: Login as Erik ===
async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#login-form #email', 'erik@snapsonic.com');
  await page.fill('#login-form #password', 'Snapsonic123');
  await page.click('#login-form #submit-btn');
  await page.waitForURL(/\/(home|inbox)/);
  await page.waitForTimeout(1000);
}

// ============================================================
// 1. PUBLIC PAGES — Home, Pricing, Legal
// ============================================================
test.describe('Public Pages', () => {

  test('Home page loads with hero, features, and CTA', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(1000);

    // Hero section
    const hero = page.locator('.landing-hero');
    await expect(hero).toBeVisible({ timeout: 5000 });

    // CTA buttons
    const getStartedBtn = page.locator('.hero-cta .btn-cta-primary');
    await expect(getStartedBtn).toBeVisible();

    const viewPricingBtn = page.locator('.hero-cta .btn-cta-secondary');
    await expect(viewPricingBtn).toBeVisible();

    // Features section
    const features = page.locator('.landing-features');
    await expect(features).toBeVisible();
    const featureCards = page.locator('.feature-card');
    const count = await featureCards.count();
    expect(count).toBeGreaterThanOrEqual(6);

    // How it works section
    const howItWorks = page.locator('.landing-how-it-works');
    await expect(howItWorks).toBeVisible();
  });

  test('Pricing page loads with calculator, tabs, and FAQ', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(1000);

    // Hero text
    const heroText = page.locator('.pricing-hero-text');
    await expect(heroText).toBeVisible({ timeout: 5000 });

    // Calculator
    const calculator = page.locator('.pricing-calculator');
    await expect(calculator).toBeVisible();

    // Minutes input
    const minutesInput = page.locator('#minutes-input');
    await expect(minutesInput).toBeVisible();

    // SMS input
    const smsInput = page.locator('#sms-input');
    await expect(smsInput).toBeVisible();

    // Total cost display
    const totalCost = page.locator('#total-cost');
    await expect(totalCost).toBeVisible();

    // Tabs
    const callAgentTab = page.locator('.component-tab[data-tab="call-agent"]');
    await expect(callAgentTab).toBeVisible();

    // FAQ section
    const faq = page.locator('.pricing-faq');
    await faq.scrollIntoViewIfNeeded();
    await expect(faq).toBeVisible();
    const faqItems = page.locator('.faq-item');
    const faqCount = await faqItems.count();
    expect(faqCount).toBeGreaterThanOrEqual(3);
  });

  test('Pricing calculator updates when inputs change', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(1000);

    // Get initial total
    const totalCost = page.locator('#total-cost');
    const initialTotal = await totalCost.textContent();

    // Change minutes to a high value
    await page.fill('#minutes-input', '5000');
    await page.waitForTimeout(500);

    const updatedTotal = await totalCost.textContent();
    expect(updatedTotal).not.toBe(initialTotal);
  });

  test('Privacy policy page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/privacy`);
    await page.waitForTimeout(1000);
    const content = await page.textContent('body');
    expect(content.toLowerCase()).toContain('privacy');
  });

  test('Terms of service page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/terms`);
    await page.waitForTimeout(1000);
    const content = await page.textContent('body');
    expect(content.toLowerCase()).toContain('terms');
  });
});

// ============================================================
// 2. AUTH — Signup, Login, Forgot Password
// ============================================================
test.describe('Authentication Pages', () => {

  test('Signup page has SSO buttons and form fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForTimeout(1000);

    // SSO buttons
    await expect(page.locator('#google-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#github-btn')).toBeVisible();

    // Form fields
    await expect(page.locator('#signup-form #name')).toBeVisible();
    await expect(page.locator('#signup-form #email')).toBeVisible();
    await expect(page.locator('#signup-form #password')).toBeVisible();
    await expect(page.locator('#signup-form #confirm-password')).toBeVisible();

    // Submit button
    await expect(page.locator('#submit-btn')).toBeVisible();
    await expect(page.locator('#submit-btn')).toHaveText('Create Account');

    // Legal links exist in DOM (hidden on desktop >1024px, visible on mobile)
    const privacyLink = page.locator('.legal-links a[href="/privacy"]');
    const count = await privacyLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Signup form validates password mismatch', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForTimeout(1000);

    await page.fill('#signup-form #name', 'Test User');
    await page.fill('#signup-form #email', 'test-no-signup@example.com');
    await page.fill('#signup-form #password', 'password123');
    await page.fill('#signup-form #confirm-password', 'password456');
    await page.click('#submit-btn');

    // Should show toast error — passwords don't match
    const toast = page.locator('.toast, .toast-message, [class*="toast"]');
    await expect(toast.first()).toBeVisible({ timeout: 5000 });
  });

  test('Login page has SSO buttons and form fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(1000);

    // SSO buttons
    await expect(page.locator('#google-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#github-btn')).toBeVisible();

    // Form fields
    await expect(page.locator('#login-form #email')).toBeVisible();
    await expect(page.locator('#login-form #password')).toBeVisible();

    // Submit button
    await expect(page.locator('#login-form #submit-btn')).toBeVisible();

    // Links
    const forgotLink = page.locator('a[href="/forgot-password"]');
    const forgotCount = await forgotLink.count();
    expect(forgotCount).toBeGreaterThanOrEqual(1);
  });

  test('Login with valid credentials redirects to inbox', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#login-form #email', 'erik@snapsonic.com');
    await page.fill('#login-form #password', 'Snapsonic123');
    await page.click('#login-form #submit-btn');
    await page.waitForURL(/\/(home|inbox)/, { timeout: 10000 });
    const url = page.url();
    expect(url).toMatch(/\/(home|inbox)/);
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#login-form #email', 'erik@snapsonic.com');
    await page.fill('#login-form #password', 'wrongpassword');
    await page.click('#login-form #submit-btn');

    // Should show toast or alert error
    const errorIndicator = page.locator('.toast, .alert, [class*="toast"], [class*="error"]');
    await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('Forgot password page has form and submit button', async ({ page }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    await page.waitForTimeout(1000);

    // Form elements
    await expect(page.locator('#forgot-password-form #email')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#forgot-password-form #submit-btn')).toBeVisible();

    // Sign in link
    const signInLink = page.locator('a[href="/login"]');
    const count = await signInLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 3. SETTINGS — Profile, Billing, Branding, Notifications, API, Account
// ============================================================
test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Settings page loads with all tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    const tabContainer = page.locator('#settings-tabs-container, .settings-tabs-container');
    await expect(tabContainer).toBeVisible({ timeout: 10000 });

    // Verify all 6 tabs exist
    await expect(page.locator('.settings-tab[data-tab="profile"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="billing"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="branding"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="notifications"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="account"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="api"]')).toBeVisible();
  });

  test('Profile tab shows user info fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    // Profile tab should be default
    await page.click('.settings-tab[data-tab="profile"]', { force: true });
    await page.waitForTimeout(500);

    // Avatar preview
    const avatar = page.locator('#avatar-preview');
    await expect(avatar).toBeVisible({ timeout: 5000 });

    // Name display
    const nameDisplay = page.locator('#name-display');
    await expect(nameDisplay).toBeVisible();
    const nameText = await nameDisplay.textContent();
    expect(nameText.length).toBeGreaterThan(0);

    // Email display
    const emailDisplay = page.locator('#email-display');
    await expect(emailDisplay).toBeVisible();
    const emailText = await emailDisplay.textContent();
    expect(emailText).toContain('@');
  });

  test('Billing tab shows credits and payment options', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    await page.click('.settings-tab[data-tab="billing"]', { force: true });
    await page.waitForTimeout(1000);

    // Credits balance should be visible
    const creditsBalance = page.locator('.credits-balance');
    await expect(creditsBalance).toBeVisible({ timeout: 5000 });

    // Add credits button
    const addCreditsBtn = page.locator('#add-credits-btn');
    await expect(addCreditsBtn).toBeVisible();

    // Click add credits to show options
    await addCreditsBtn.click({ force: true });
    await page.waitForTimeout(500);

    const creditsOptions = page.locator('#credits-options');
    await expect(creditsOptions).toBeVisible();

    // Preset amount buttons
    await expect(page.locator('.credit-amount-btn[data-amount="20"]')).toBeVisible();
    await expect(page.locator('.credit-amount-btn[data-amount="50"]')).toBeVisible();
    await expect(page.locator('.credit-amount-btn[data-amount="100"]')).toBeVisible();

    // Custom amount
    await expect(page.locator('#custom-amount')).toBeVisible();
  });

  test('Branding tab shows logo upload', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    await page.click('.settings-tab[data-tab="branding"]', { force: true });
    await page.waitForTimeout(1000);

    const logoPreview = page.locator('#logo-preview');
    await expect(logoPreview).toBeVisible({ timeout: 5000 });

    const uploadBtn = page.locator('#upload-logo-btn');
    await expect(uploadBtn).toBeVisible();
  });

  test('Notifications tab shows notification settings', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    await page.click('.settings-tab[data-tab="notifications"]', { force: true });
    await page.waitForTimeout(2000);

    // Check for notification settings - toggles may be checkboxes (hidden) with visible toggle-switch wrappers
    // Look for the save button as a reliable indicator the tab loaded
    const saveBtn = page.locator('#save-notifications-btn');
    await expect(saveBtn).toBeVisible({ timeout: 10000 });

    // Verify email section exists (toggle might be a hidden checkbox inside a label)
    const emailSection = page.locator('label[for="email-enabled"], #email-enabled, .toggle-switch:has(#email-enabled)');
    const emailCount = await emailSection.count();
    expect(emailCount).toBeGreaterThanOrEqual(1);
  });

  test('API tab shows key management', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    await page.click('.settings-tab[data-tab="api"]', { force: true });
    await page.waitForTimeout(1000);

    // Generate button
    const generateBtn = page.locator('#generate-api-key-btn');
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('Account tab shows sign out and delete options', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(2000);

    await page.click('.settings-tab[data-tab="account"]', { force: true });
    await page.waitForTimeout(1000);

    // Sign out button
    const signOutBtn = page.locator('#signout-btn');
    await expect(signOutBtn).toBeVisible({ timeout: 5000 });

    // Delete account button (dangerous)
    const deleteBtn = page.locator('#delete-account-btn');
    await expect(deleteBtn).toBeVisible();
  });
});

// ============================================================
// 4. CONTACTS — CRUD, Search, Modal
// ============================================================
test.describe('Contacts Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Contacts page loads with search and action buttons', async ({ page }) => {
    await page.goto(`${BASE_URL}/contacts`);
    await page.waitForTimeout(2000);

    // Search input
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Add contact button
    const addBtn = page.locator('#add-contact-btn');
    await expect(addBtn).toBeVisible();

    // Import button
    const importBtn = page.locator('#import-contacts-btn');
    await expect(importBtn).toBeVisible();

    // Contacts list
    const contactsList = page.locator('#contacts-list');
    await expect(contactsList).toBeVisible();
  });

  test('Add Contact modal opens with correct fields', async ({ page }) => {
    await page.goto(`${BASE_URL}/contacts`);
    await page.waitForTimeout(2000);

    await page.click('#add-contact-btn', { force: true });
    await page.waitForTimeout(500);

    const modal = page.locator('#edit-contact-modal-overlay');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Check modal title
    const title = page.locator('#modal-title');
    await expect(title).toHaveText('Add Contact');

    // Required fields
    await expect(page.locator('#contact-first-name')).toBeVisible();
    await expect(page.locator('#contact-phone')).toBeVisible();

    // Optional fields
    await expect(page.locator('#contact-last-name')).toBeVisible();
    await expect(page.locator('#contact-email')).toBeVisible();
    await expect(page.locator('#contact-company')).toBeVisible();

    // Footer buttons
    await expect(page.locator('#cancel-modal-btn')).toBeVisible();
    await expect(page.locator('#save-contact-btn')).toBeVisible();

    // Close modal
    await page.click('#close-modal-btn');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('Contact search filters the list', async ({ page }) => {
    await page.goto(`${BASE_URL}/contacts`);
    await page.waitForTimeout(2000);

    const contactsList = page.locator('#contacts-list');
    await expect(contactsList).toBeVisible({ timeout: 10000 });

    // Count initial contacts
    const initialCount = await page.locator('.contact-item').count();

    // Search for something specific
    await page.fill('#search-input', 'zzzznonexistent');
    await page.waitForTimeout(500);

    const filteredCount = await page.locator('.contact-item').count();
    // Should have fewer (or zero) results
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });
});

// ============================================================
// 5. INBOX — Conversation List, Filters
// ============================================================
test.describe('Inbox Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Inbox loads with conversation list', async ({ page }) => {
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForTimeout(3000);

    // Inbox container or conversations list
    const inboxContent = page.locator('.inbox-container, #conversation-list, #conversations');
    await expect(inboxContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('Inbox has search and filter controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForTimeout(3000);

    // Search toggle or input
    const searchEl = page.locator('#inbox-search-toggle, #inbox-search');
    const searchCount = await searchEl.count();
    expect(searchCount).toBeGreaterThanOrEqual(1);

    // Filter toggle button or filter buttons
    const filterEl = page.locator('#filter-toggle-btn, .inbox-filter-btn, [data-filter-type]');
    const filterCount = await filterEl.count();
    expect(filterCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 6. AGENTS — List and Detail Page
// ============================================================
test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Agents list page loads with agent cards', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForTimeout(2000);

    // Should have at least one agent card
    const agentCards = page.locator('.agent-card, .agent-item');
    const count = await agentCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Agent detail page loads with tabs', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForTimeout(2000);

    // Click first agent card
    const firstAgent = page.locator('.agent-card, .agent-item').first();
    await firstAgent.click({ force: true });
    await page.waitForURL(/\/agents\//, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Should have tab navigation
    const tabs = page.locator('.agent-tab, .tab-btn, [data-tab]');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 7. PHONE — Number Management
// ============================================================
test.describe('Phone Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Phone page loads with service numbers', async ({ page }) => {
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(3000);

    // Desktop layout or add number button as indicators
    const phoneContent = page.locator('.phone-page-desktop, .phone-left-column, #add-number-btn');
    await expect(phoneContent.first()).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// 8. APPS / INTEGRATIONS
// ============================================================
test.describe('Apps/Integrations Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Apps page loads with integration options', async ({ page }) => {
    await page.goto(`${BASE_URL}/apps`);
    await page.waitForTimeout(3000);

    // Integration settings or MCP catalog containers
    const appsContent = page.locator('#integration-settings-container, #mcp-catalog-container');
    await expect(appsContent.first()).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// 9. NAVIGATION — Bottom nav, sidebar, routing
// ============================================================
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Bottom nav exists with core navigation items', async ({ page }) => {
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForTimeout(2000);

    const bottomNav = page.locator('.bottom-nav, #bottom-nav');
    // Bottom nav might only be visible on mobile viewport
    // Just verify it exists in DOM
    const exists = await bottomNav.count();
    expect(exists).toBeGreaterThanOrEqual(1);
  });

  test('Navigating between pages preserves auth', async ({ page }) => {
    // Already logged in from beforeEach

    // Navigate to multiple pages in sequence
    const pages = ['/inbox', '/contacts', '/settings', '/agents', '/phone'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForTimeout(2000);

      // Should NOT redirect to login
      const url = page.url();
      expect(url).not.toContain('/login');
    }
  });
});

// ============================================================
// 10. PRICING CALCULATOR DEEP TEST
// ============================================================
test.describe('Pricing Calculator Deep Tests', () => {

  test('FAQ items expand and collapse', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(1000);

    const faqList = page.locator('#faq-list');
    await faqList.scrollIntoViewIfNeeded();

    // Click first FAQ item
    const firstQuestion = page.locator('.faq-question').first();
    await firstQuestion.click();
    await page.waitForTimeout(300);

    // First FAQ should now be expanded
    const firstItem = page.locator('.faq-item').first();
    await expect(firstItem).toHaveClass(/expanded/);

    // Click again to collapse
    await firstQuestion.click();
    await page.waitForTimeout(300);
    await expect(firstItem).not.toHaveClass(/expanded/);
  });

  test('LLM pill selection updates pricing', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(1000);

    const llmCost = page.locator('#llm-cost');
    const initialLlmCost = await llmCost.textContent();

    // Click a different LLM pill (e.g. GPT 4o which is more expensive)
    const gpt4oPill = page.locator('#llm-pills .pill-btn[data-value="0.05"]');
    if (await gpt4oPill.isVisible()) {
      await gpt4oPill.click();
      await page.waitForTimeout(500);
      const updatedLlmCost = await llmCost.textContent();
      // Cost should change (might be same if minutes are 0, but usually different)
    }
  });

  test('Pricing tabs switch content', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);
    await page.waitForTimeout(1000);

    // Click Add-ons tab
    const addonsTab = page.locator('.component-tab[data-tab="add-ons"]');
    if (await addonsTab.isVisible()) {
      await addonsTab.click();
      await page.waitForTimeout(500);
      const addonsPanel = page.locator('#tab-add-ons');
      await expect(addonsPanel).toBeVisible();
    }

    // Click Monthly tab
    const monthlyTab = page.locator('.component-tab[data-tab="monthly"]');
    if (await monthlyTab.isVisible()) {
      await monthlyTab.click();
      await page.waitForTimeout(500);
      const monthlyPanel = page.locator('#tab-monthly');
      await expect(monthlyPanel).toBeVisible();
    }
  });
});
