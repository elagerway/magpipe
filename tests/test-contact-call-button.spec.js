import { test, expect } from '@playwright/test';

test.describe('Contact Call Button', () => {
  test('should navigate to phone page with number pre-filled', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Login first
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for navigation to complete
    await page.waitForURL('**/inbox', { timeout: 10000 });
    console.log('Logged in successfully');

    // Navigate to contacts page
    await page.goto('http://localhost:3000/contacts');
    await page.waitForSelector('.contact-item', { timeout: 10000 });
    console.log('Contacts page loaded');

    // Find the first contact's call button and get the phone number
    const callButton = page.locator('.call-contact-btn').first();
    const phoneNumber = await callButton.getAttribute('data-phone');
    console.log('Phone number from button:', phoneNumber);

    // Click the call button
    await callButton.click();
    console.log('Clicked call button');

    // Wait for navigation to phone page
    await page.waitForURL('**/phone**', { timeout: 5000 });
    console.log('Current URL:', page.url());

    // Check URL parameters
    const url = new URL(page.url());
    console.log('URL pathname:', url.pathname);
    console.log('URL search:', url.search);
    console.log('dial param:', url.searchParams.get('dial'));

    // Wait a moment for the page to process the parameter
    await page.waitForTimeout(500);

    // Check if the dial input has the phone number
    const dialInput = page.locator('#dial-input');
    const dialValue = await dialInput.inputValue();
    console.log('Dial input value:', dialValue);

    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/phone-page-debug.png' });

    // Verify the number is pre-filled
    expect(dialValue).toBe(phoneNumber);
  });

  test('debug phone page URL parameter handling', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    // Login first
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/inbox', { timeout: 10000 });

    // Navigate directly to phone page with dial parameter
    const testNumber = '+16045628647';
    await page.goto(`http://localhost:3000/phone?dial=${encodeURIComponent(testNumber)}`);
    console.log('Navigated to:', page.url());

    // Wait for page to load
    await page.waitForSelector('#dial-input', { timeout: 5000 });

    // Wait a moment for parameter processing
    await page.waitForTimeout(500);

    // Check the dial input value
    const dialInput = page.locator('#dial-input');
    const dialValue = await dialInput.inputValue();
    console.log('Dial input value after direct navigation:', dialValue);

    // Take screenshot
    await page.screenshot({ path: '/tmp/phone-direct-nav-debug.png' });

    expect(dialValue).toBe(testNumber);
  });
});
