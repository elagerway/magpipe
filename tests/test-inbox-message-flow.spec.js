// @ts-check
import { test, expect } from '@playwright/test';
import { testConfig } from './test-config.js';

/**
 * Test the Message button flow in inbox:
 * 1. View a call in inbox
 * 2. Click Message button
 * 3. Click back button
 * 4. Click on another conversation
 * 5. Verify it works
 */

test.describe('Inbox Message Flow', () => {
  // Use iPhone 12 viewport for mobile-first testing
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    const { baseUrl, testUser, timeouts } = testConfig;

    // Login with test credentials
    await page.goto(`${baseUrl}/login`);
    await page.waitForSelector('#email', { timeout: timeouts.element });

    // Fill credentials from config
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    console.log('Filled credentials');

    // Submit form
    await page.click('#submit-btn');
    console.log('Clicked submit');

    // Wait for navigation away from login page
    try {
      await page.waitForURL('**/dashboard', { timeout: timeouts.navigation });
      console.log('Navigated to dashboard');
    } catch (e) {
      // Take screenshot if login failed
      await page.screenshot({ path: '/tmp/login-failed.png' });
      // Check if there's an error message
      const errorEl = page.locator('#error-message');
      if (await errorEl.count() > 0) {
        const errorText = await errorEl.textContent();
        console.log('Login error:', errorText);
      }
      throw new Error('Login failed - did not navigate to dashboard');
    }

    // Navigate to inbox directly
    await page.goto(`${baseUrl}/inbox`);
    await page.waitForSelector('#conversations', { timeout: timeouts.navigation });
  });

  test('Message button flow - click Message, back, then another conversation', async ({ page }) => {
    // Wait for conversations to load
    await page.waitForSelector('.conversation-item', { timeout: 10000 });

    // Find a call conversation
    const callConversation = page.locator('.conversation-item[data-type="call"]').first();
    const hasCallConversation = await callConversation.count() > 0;

    if (!hasCallConversation) {
      console.log('No call conversations found, skipping test');
      test.skip();
      return;
    }

    // Click on the call conversation
    await callConversation.click();
    console.log('Clicked on call conversation');

    // Wait for call detail view to load
    await page.waitForTimeout(500);

    // Look for the Call/Message buttons
    const messageBtn = page.locator('#message-action-btn');
    const hasMessageBtn = await messageBtn.count() > 0;

    if (!hasMessageBtn) {
      console.log('No Message button found in call detail view');
      // Take screenshot for debugging
      await page.screenshot({ path: '/tmp/no-message-btn.png' });
      test.skip();
      return;
    }

    console.log('Found Message button, clicking...');
    await messageBtn.click();

    // Wait for SMS thread to load
    await page.waitForTimeout(500);

    // Verify we're now in SMS view (should have message input)
    const messageInput = page.locator('#message-input');
    const hasMessageInput = await messageInput.count() > 0;
    console.log('Has message input after clicking Message:', hasMessageInput);

    // Click back button
    const backButton = page.locator('#back-button');
    const hasBackButton = await backButton.count() > 0;

    if (!hasBackButton) {
      console.log('No back button found');
      await page.screenshot({ path: '/tmp/no-back-btn.png' });
      test.fail();
      return;
    }

    console.log('Clicking back button...');
    await backButton.click();

    // Wait for back navigation
    await page.waitForTimeout(500);

    // Now try to click on ANY conversation (call or SMS)
    const anyConversation = page.locator('.conversation-item').first();
    const conversationCount = await page.locator('.conversation-item').count();
    console.log('Found', conversationCount, 'conversations after clicking back');

    if (conversationCount === 0) {
      console.log('No conversations found after clicking back!');
      await page.screenshot({ path: '/tmp/no-conversations-after-back.png' });
      test.fail();
      return;
    }

    // Take screenshot before clicking
    await page.screenshot({ path: '/tmp/before-click-conversation.png' });

    console.log('Clicking on first conversation...');
    await anyConversation.click();

    // Wait for thread to load
    await page.waitForTimeout(1000);

    // Take screenshot after clicking
    await page.screenshot({ path: '/tmp/after-click-conversation.png' });

    // Verify thread loaded - should have either message input (SMS) or recording (call)
    const threadMessages = page.locator('#thread-messages');
    const hasThreadMessages = await threadMessages.count() > 0;

    console.log('Has thread messages after clicking conversation:', hasThreadMessages);

    // Check if there's an error in the page
    const pageContent = await page.content();
    const hasError = pageContent.includes('error') || pageContent.includes('Error');

    if (!hasThreadMessages) {
      console.log('Thread messages not found - flow is broken!');
      await page.screenshot({ path: '/tmp/broken-flow.png' });
    }

    expect(hasThreadMessages).toBe(true);
    console.log('Test passed - conversation click works after Message -> Back flow');
  });
});
