/**
 * Test: Per-Agent Notifications Tab
 * Verifies:
 * 1. Notifications tab appears in agent detail
 * 2. Email/SMS/Push sections render with controls
 * 3. Toggles and inputs are interactive
 * 4. Saving works (upsert with agent_id)
 * 5. App Notifications (Slack/HubSpot) cards appear on Notifications tab
 * 6. Functions tab no longer has Dynamic Data Flow
 * 7. Settings page no longer has Notifications tab
 * 8. Different agents have independent notification prefs
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const AGENT_ID = 'b9a8f519-70eb-489e-93b1-147780ed16ee'; // SeniorHome
const AGENT_ID_2 = '7696ad90-539f-4e35-ad47-7ddde3ac2edb'; // Agent 4

// Helper: toggle a checkbox by dispatching click event (works for hidden toggle-switch inputs)
async function toggleCheckbox(page, selector) {
  await page.locator(selector).evaluate(el => {
    el.click();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test.describe('Per-Agent Notifications Tab', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/inbox', { timeout: 15000 });
  });

  test('Notifications tab exists and renders all sections', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}`);
    await page.waitForSelector('.agent-tab', { timeout: 10000 });

    // Verify tab button exists
    const notifTab = page.locator('.agent-tab[data-tab="notifications"]');
    await expect(notifTab).toBeVisible();
    await expect(notifTab).toHaveText('Notifications');

    // Click the tab
    await notifTab.click();
    await page.waitForSelector('#notif-loading', { state: 'hidden', timeout: 10000 });

    // Check Email, SMS, Push section headings exist
    await expect(page.locator('h3:has-text("Email Notifications")')).toBeVisible();
    await expect(page.locator('h3:has-text("SMS Notifications")')).toBeVisible();
    await expect(page.locator('h3:has-text("Push Notifications")')).toBeVisible();

    // Slack Notifications should NOT exist as a dedicated section
    const slackSection = page.locator('h3:has-text("Slack Notifications")');
    await expect(slackSection).toHaveCount(0);

    // App Notifications section should be present (contains Slack/HubSpot cards)
    await expect(page.locator('h3:has-text("App Notifications")')).toBeVisible();
  });

  test('Email notification controls are interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    // Email toggle
    const emailToggle = page.locator('#notif-email-enabled');
    await expect(emailToggle).toBeAttached();
    const wasChecked = await emailToggle.isChecked();

    // Toggle it via JS (checkbox is hidden inside toggle-switch)
    await toggleCheckbox(page, '#notif-email-enabled');
    expect(await emailToggle.isChecked()).toBe(!wasChecked);

    // Email address input
    const emailInput = page.locator('#notif-email-address');
    await expect(emailInput).toBeVisible();
    const emailVal = await emailInput.inputValue();
    expect(emailVal.length).toBeGreaterThan(0); // should have default email

    // Sub-toggles exist
    await expect(page.locator('#notif-email-inbound-calls')).toBeAttached();
    await expect(page.locator('#notif-email-all-calls')).toBeAttached();
    await expect(page.locator('#notif-email-inbound-messages')).toBeAttached();
    await expect(page.locator('#notif-email-all-messages')).toBeAttached();

    // Toggle sub-checkbox
    const inboundCalls = page.locator('#notif-email-inbound-calls');
    const wasInboundChecked = await inboundCalls.isChecked();
    await toggleCheckbox(page, '#notif-email-inbound-calls');
    expect(await inboundCalls.isChecked()).toBe(!wasInboundChecked);

    // Revert both changes
    await toggleCheckbox(page, '#notif-email-enabled');
    await toggleCheckbox(page, '#notif-email-inbound-calls');
    await page.waitForTimeout(1000);
  });

  test('SMS notification controls are interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    const smsToggle = page.locator('#notif-sms-enabled');
    await expect(smsToggle).toBeAttached();

    const phoneInput = page.locator('#notif-sms-phone-number');
    await expect(phoneInput).toBeVisible();

    await expect(page.locator('#notif-sms-inbound-calls')).toBeAttached();
    await expect(page.locator('#notif-sms-all-calls')).toBeAttached();
    await expect(page.locator('#notif-sms-inbound-messages')).toBeAttached();
    await expect(page.locator('#notif-sms-all-messages')).toBeAttached();

    // Toggle SMS enabled
    const wasChecked = await smsToggle.isChecked();
    await toggleCheckbox(page, '#notif-sms-enabled');
    expect(await smsToggle.isChecked()).toBe(!wasChecked);
    // Revert
    await toggleCheckbox(page, '#notif-sms-enabled');
    await page.waitForTimeout(1000);
  });

  test('Push notification controls render', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    const pushToggle = page.locator('#notif-push-enabled');
    await expect(pushToggle).toBeAttached();

    // Push status shows something
    const pushStatus = page.locator('#notif-push-status');
    await expect(pushStatus).toBeVisible();
    const statusText = await pushStatus.textContent();
    expect(statusText.length).toBeGreaterThan(0);

    // Push sub-toggles exist in DOM (hidden until push is enabled)
    await expect(page.locator('#notif-push-inbound-calls')).toBeAttached();
    await expect(page.locator('#notif-push-all-calls')).toBeAttached();
    await expect(page.locator('#notif-push-inbound-messages')).toBeAttached();
    await expect(page.locator('#notif-push-all-messages')).toBeAttached();
  });

  test('App Notification cards render (Slack/HubSpot)', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    // App Notifications heading should exist
    await expect(page.locator('h3:has-text("App Notifications")')).toBeVisible();

    // Check for app cards OR the "Connect apps" message
    const appCards = page.locator('.app-func-card');
    const connectMessage = page.locator('text=Connect apps in the');
    const hasCards = await appCards.count() > 0;
    const hasMessage = await connectMessage.count() > 0;
    expect(hasCards || hasMessage).toBe(true);

    if (hasCards) {
      const firstCard = appCards.first();
      await expect(firstCard.locator('.app-func-master-toggle')).toBeAttached();
      await expect(firstCard.locator('.app-func-channel-toggle').first()).toBeAttached();
    }
  });

  test('Saving notification prefs works (auto-save)', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    // Toggle email enabled
    const emailToggle = page.locator('#notif-email-enabled');
    const wasChecked = await emailToggle.isChecked();
    await toggleCheckbox(page, '#notif-email-enabled');

    // Wait for auto-save to complete (500ms debounce + network)
    const saveStatus = page.locator('#notif-save-status');
    await expect(saveStatus).toHaveText('Saved', { timeout: 5000 });

    // Reload and verify the change persisted
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    const emailToggleAfter = page.locator('#notif-email-enabled');
    expect(await emailToggleAfter.isChecked()).toBe(!wasChecked);

    // Revert the change
    await toggleCheckbox(page, '#notif-email-enabled');
    await expect(saveStatus).toHaveText('Saved', { timeout: 5000 });
  });

  test('Different agents have independent notification prefs', async ({ page }) => {
    // Set agent 1 email to ON
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    const emailToggle1 = page.locator('#notif-email-enabled');
    if (!(await emailToggle1.isChecked())) {
      await toggleCheckbox(page, '#notif-email-enabled');
      await page.waitForSelector('#notif-save-status:has-text("Saved")', { timeout: 5000 });
    }

    // Set agent 2 email to OFF
    await page.goto(`${BASE_URL}/agents/${AGENT_ID_2}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    const emailToggle2 = page.locator('#notif-email-enabled');
    if (await emailToggle2.isChecked()) {
      await toggleCheckbox(page, '#notif-email-enabled');
      await page.waitForSelector('#notif-save-status:has-text("Saved")', { timeout: 5000 });
    }

    // Verify agent 1 still has email ON
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });
    expect(await page.locator('#notif-email-enabled').isChecked()).toBe(true);

    // Verify agent 2 still has email OFF
    await page.goto(`${BASE_URL}/agents/${AGENT_ID_2}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });
    expect(await page.locator('#notif-email-enabled').isChecked()).toBe(false);
  });

  test('Functions tab no longer has Dynamic Data Flow', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=functions`);
    await page.waitForSelector('.function-toggles', { timeout: 10000 });

    // Functions tab should NOT contain Dynamic Data Flow or App Notifications
    const dynamicDataFlow = page.locator('#tab-content >> text=Dynamic Data Flow');
    await expect(dynamicDataFlow).toHaveCount(0);

    const appNotifications = page.locator('#tab-content >> h3:has-text("App Notifications")');
    await expect(appNotifications).toHaveCount(0);

    // But should still have Built-in Functions and Custom Functions
    await expect(page.locator('text=Built-in Functions')).toBeVisible();
    await expect(page.locator('text=Custom Functions')).toBeVisible();
  });

  test('Settings page no longer has Notifications tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForSelector('.settings-tab', { timeout: 10000 });

    // Should NOT have Notifications tab
    const notifTab = page.locator('.settings-tab[data-tab="notifications"]');
    await expect(notifTab).toHaveCount(0);

    // Should still have other tabs
    await expect(page.locator('.settings-tab[data-tab="profile"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="billing"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="branding"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="account"]')).toBeVisible();
    await expect(page.locator('.settings-tab[data-tab="api"]')).toBeVisible();
  });

  test('Tab ordering is correct', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}`);
    await page.waitForSelector('.agent-tab', { timeout: 10000 });

    const tabs = await page.locator('.agent-tab').allTextContents();
    const expected = ['Configure', 'Prompt', 'Knowledge', 'Memory', 'Functions', 'Notifications', 'Schedule', 'Deployment', 'Analytics'];
    expect(tabs).toEqual(expected);
  });

  test('URL updates to ?tab=notifications when clicking tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}`);
    await page.waitForSelector('.agent-tab', { timeout: 10000 });

    await page.locator('.agent-tab[data-tab="notifications"]').click();
    await page.waitForSelector('#notif-loading', { timeout: 5000 });

    expect(page.url()).toContain('tab=notifications');
  });

  test('Direct navigation to ?tab=notifications works', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents/${AGENT_ID}?tab=notifications`);
    await page.waitForSelector('#notif-content', { state: 'visible', timeout: 10000 });

    // Tab should be active
    const activeTab = page.locator('.agent-tab.active');
    await expect(activeTab).toHaveText('Notifications');

    // Content should be loaded
    await expect(page.locator('h3:has-text("Email Notifications")')).toBeVisible();
  });
});
