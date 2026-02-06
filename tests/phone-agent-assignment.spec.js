/**
 * Test Phone Page Agent Assignment Features
 */

import { test, expect } from '@playwright/test';

const SUPABASE_URL = 'https://api.magpipe.ai';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Phone Page Agent Assignment', () => {
  test.beforeEach(async ({ page }) => {
    // Login with email/password
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    // Wait for redirect after login (could be /home or /agent)
    await page.waitForURL(/\/(home|agent)/);
  });

  test('should show edit button on phone numbers', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    // Handle microphone permission modal if it appears
    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    // Wait for numbers to load in the container
    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Check that edit buttons exist
    const editButtons = page.locator('.edit-number-btn');
    await expect(editButtons.first()).toBeVisible();

    // Edit button should have three-dots icon (vertical dots)
    const svg = editButtons.first().locator('svg');
    await expect(svg).toBeVisible();
  });

  test('should open agent assignment modal when clicking edit button', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    // Handle microphone permission modal if it appears
    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    // Wait for numbers to load
    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Click first edit button
    await page.click('.edit-number-btn', { force: true });

    // Modal should appear
    await expect(page.locator('#agent-assignment-modal')).toBeVisible();

    // Modal should have title
    await expect(page.locator('#agent-assignment-modal h3')).toContainText('Agent Assignment');

    // Modal should have close button
    await expect(page.locator('#close-agent-modal')).toBeVisible();
  });

  test('should close modal when clicking X button', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Open modal
    await page.click('.edit-number-btn', { force: true });
    await expect(page.locator('#agent-assignment-modal')).toBeVisible();

    // Close modal
    await page.click('#close-agent-modal');
    await expect(page.locator('#agent-assignment-modal')).not.toBeVisible();
  });

  test('should close modal when clicking outside', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Open modal
    await page.click('.edit-number-btn', { force: true });
    await expect(page.locator('#agent-assignment-modal')).toBeVisible();

    // Click outside (on the overlay)
    await page.click('#agent-assignment-modal', { position: { x: 10, y: 10 } });
    await expect(page.locator('#agent-assignment-modal')).not.toBeVisible();
  });

  test('should show available agents in modal', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Open modal
    await page.click('.edit-number-btn', { force: true });
    await expect(page.locator('#agent-assignment-modal')).toBeVisible();

    // Should show either current assignment or "No agent assigned"
    const content = await page.locator('#agent-assignment-modal').textContent();
    const hasAgent = content.includes('Current Assignment') || content.includes('No agent assigned');
    expect(hasAgent).toBe(true);
  });

  test('should show detach confirmation when clicking detach', async ({ page }) => {
    await page.goto('http://localhost:3000/phone');

    const allowMicBtn = page.locator('text=Allow Microphone');
    if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allowMicBtn.click();
    }

    await page.waitForSelector('#numbers-list-container .number-item', { timeout: 15000 });

    // Find a number with an agent assigned (look for agent badge)
    const numberWithAgent = page.locator('.number-item').filter({
      has: page.locator('svg') // Agent icon
    }).first();

    // Open modal for this number
    await numberWithAgent.locator('.edit-number-btn').click({ force: true });
    await expect(page.locator('#agent-assignment-modal')).toBeVisible();

    // If there's a detach button, click it
    const detachBtn = page.locator('.detach-agent-btn');
    if (await detachBtn.isVisible()) {
      await detachBtn.click();

      // Confirmation modal should appear
      await expect(page.locator('text=Detach Agent?')).toBeVisible();
      await expect(page.locator('#cancel-detach')).toBeVisible();
      await expect(page.locator('#confirm-detach')).toBeVisible();

      // Cancel to not actually detach
      await page.click('#cancel-detach');
    }
  });
});

test.describe('Agent Detail Page - Phone Numbers Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    // Wait for redirect after login (could be /home or /agent)
    await page.waitForURL(/\/(home|agent)/);
  });

  test('should show agent name next to assigned phone numbers', async ({ page }) => {
    await page.goto('http://localhost:3000/agents');

    // Wait for agents to load
    await page.waitForSelector('.agent-card, [data-agent-id]', { timeout: 10000 });

    // Click first agent
    await page.click('.agent-card, [data-agent-id]');

    // Go to deployment tab
    await page.click('text=Deployment');

    // Check for phone numbers section
    await page.waitForSelector('text=Phone Numbers', { timeout: 5000 });

    // If there are assigned numbers, they should show agent name
    const assignedNumbers = page.locator('.assigned-number');
    const count = await assignedNumbers.count();

    if (count > 0) {
      // Each number should have a label with agent name
      const firstNumber = assignedNumbers.first();
      const numberName = firstNumber.locator('.number-name');
      await expect(numberName).toBeVisible();
    }
  });

  test('should NOT show legacy Pat AI friendly_name in assign modal', async ({ page }) => {
    await page.goto('http://localhost:3000/agents');
    await page.waitForSelector('.agent-card, [data-agent-id]', { timeout: 10000 });
    await page.click('.agent-card, [data-agent-id]');
    await page.click('text=Deployment');

    // Click assign button if available
    const assignBtn = page.locator('#assign-numbers-btn');
    if (await assignBtn.isVisible()) {
      await assignBtn.click();

      // Modal should appear (use heading to be specific)
      await expect(page.locator('.voice-modal h3:has-text("Assign Phone Numbers")')).toBeVisible();

      // Should NOT contain "Pat AI" text
      const modalContent = await page.locator('.voice-modal').textContent();
      expect(modalContent).not.toContain('Pat AI');
      expect(modalContent).not.toContain('erik@snapsonic.com');
    }
  });
});

test.describe('Select Number Page - Alert Positioning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    // Wait for redirect after login (could be /home or /agent)
    await page.waitForURL(/\/(home|agent)/);
  });

  test('should show alert below search button', async ({ page }) => {
    await page.goto('http://localhost:3000/select-number');

    // Search for an area code that might trigger fallback
    await page.fill('#search-query', '604');
    await page.click('#search-btn');

    // Wait for search to complete
    await page.waitForSelector('#numbers-list .number-option, #error-message:not(.hidden), #success-message:not(.hidden)', { timeout: 15000 });

    // Check that message elements are inside search-form
    const searchForm = page.locator('#search-form');
    const errorMsg = searchForm.locator('#error-message');
    const successMsg = searchForm.locator('#success-message');

    // At least one should exist inside the form
    expect(await errorMsg.count() + await successMsg.count()).toBeGreaterThan(0);
  });
});
