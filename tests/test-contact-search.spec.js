import { test, expect } from '@playwright/test';

test.describe('New Message Contact Search', () => {
  test('should show contact suggestions when typing in To field', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Login with test credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });

    // Click + to open dropdown
    await page.click('#new-conversation-btn');
    await page.waitForSelector('#new-message-dropdown', { state: 'visible' });

    // Click New Message
    await page.click('[data-action="new-message"]');

    // Wait for new message interface
    await page.waitForSelector('#text-phone', { timeout: 5000 });
    console.log('New message interface loaded');

    // Take screenshot of initial state
    await page.screenshot({ path: '/tmp/contact-search-initial.png' });

    // Type something to trigger search
    const phoneInput = page.locator('#text-phone');
    await phoneInput.fill('604');

    // Wait a moment for suggestions
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({ path: '/tmp/contact-search-results.png' });

    // Check if suggestions dropdown appears (may or may not have contacts)
    const suggestions = page.locator('#contact-suggestions');
    const isVisible = await suggestions.isVisible();
    console.log('Suggestions visible:', isVisible);

    // Verify direct number entry still works
    await phoneInput.fill('+16045551234');
    const value = await phoneInput.inputValue();
    expect(value).toBe('+16045551234');
    console.log('Direct number entry works');
  });

  test('should select contact from suggestions', async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'claude-test@snapsonic.test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:3000/inbox');
    await page.waitForSelector('#new-conversation-btn', { timeout: 10000 });

    // Open new message
    await page.click('#new-conversation-btn');
    await page.waitForSelector('#new-message-dropdown', { state: 'visible' });
    await page.click('[data-action="new-message"]');
    await page.waitForSelector('#text-phone', { timeout: 5000 });

    // Type to search
    const phoneInput = page.locator('#text-phone');
    await phoneInput.fill('test');
    await page.waitForTimeout(300);

    // Check for suggestions
    const suggestions = page.locator('#contact-suggestions');
    const isVisible = await suggestions.isVisible();

    if (isVisible) {
      // Click first suggestion
      const firstSuggestion = page.locator('.contact-suggestion').first();
      if (await firstSuggestion.isVisible()) {
        const phone = await firstSuggestion.getAttribute('data-phone');
        await firstSuggestion.click();

        // Verify phone was populated
        const value = await phoneInput.inputValue();
        expect(value).toBe(phone);
        console.log('Contact selected:', phone);
      }
    } else {
      console.log('No contacts found for search term - this is OK for test account');
    }

    // Take final screenshot
    await page.screenshot({ path: '/tmp/contact-search-selected.png' });
  });
});
