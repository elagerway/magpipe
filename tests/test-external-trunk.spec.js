// @ts-check
import { test, expect } from '@playwright/test';

const SUPABASE_URL = 'https://mtxbiyilvgwhbdptysex.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('External SIP Trunk UX', () => {
  test.beforeEach(async ({ page }) => {
    // Login using magic link OTP
    const email = 'erik@snapsonic.com';

    // Generate OTP via admin API
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'magiclink', email })
    });

    const { email_otp } = await response.json();
    console.log('Generated OTP for login');

    // Go to the app
    await page.goto('http://localhost:3000');

    // Verify OTP in browser context
    const sessionResult = await page.evaluate(async ({ email, otp, supabaseUrl }) => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2NjMwMzAsImV4cCI6MjA0ODIzOTAzMH0.PLjsjze5n24OKIvYQdqmOYVj3raPaoXTfePsz9CQiXY';
      const supabase = createClient(supabaseUrl, ANON_KEY, {
        auth: { storageKey: 'solo-mobile-auth-token' }
      });
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (data?.session) {
        localStorage.setItem('solo-mobile-auth-token', JSON.stringify(data.session));
      }
      return { success: !!data?.session, error: error?.message };
    }, { email, otp: email_otp, supabaseUrl: SUPABASE_URL });

    expect(sessionResult.success).toBe(true);
    console.log('Logged in successfully');

    // Reload to pick up session
    await page.reload();
    await page.waitForTimeout(1000);
  });

  test('can view External SIP Trunks section in Settings', async ({ page }) => {
    // Navigate to Settings
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Look for External SIP Trunks section
    const heading = page.locator('h2:has-text("External SIP Trunks")');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Should see "Add Trunk" button
    const addTrunkBtn = page.locator('#add-external-trunk-btn');
    await expect(addTrunkBtn).toBeVisible();

    console.log('✅ External SIP Trunks section visible');
  });

  test('can open Add Trunk modal', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Click Add Trunk button
    await page.click('#add-external-trunk-btn');

    // Modal should appear
    const modal = page.locator('#add-trunk-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should have form fields
    await expect(page.locator('#trunk-name')).toBeVisible();
    await expect(page.locator('#trunk-provider')).toBeVisible();

    // Should have auth type buttons
    await expect(page.locator('.auth-type-btn[data-auth-type="ip"]')).toBeVisible();
    await expect(page.locator('.auth-type-btn[data-auth-type="registration"]')).toBeVisible();

    console.log('✅ Add Trunk modal opens correctly');
  });

  test('can create a new IP-based trunk', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Click Add Trunk button
    await page.click('#add-external-trunk-btn');
    await page.waitForTimeout(500);

    // Fill in trunk details
    await page.fill('#trunk-name', 'Test Trunk');
    await page.fill('#trunk-provider', 'Test Provider');

    // IP auth should be selected by default
    await expect(page.locator('.auth-type-btn[data-auth-type="ip"].selected')).toBeVisible();

    // Add allowed IPs
    await page.fill('#allowed-ips', '192.168.1.100\n10.0.0.0/24');

    // Handle the alert dialog that shows success message
    page.on('dialog', async dialog => {
      console.log('Dialog message:', dialog.message());
      await dialog.accept();
    });

    // Click Create Trunk
    await page.click('#save-add-trunk');

    // Wait for modal to close
    await page.waitForTimeout(2000);

    // Check that trunk was created (should appear in list)
    const trunkCard = page.locator('.external-trunk-card:has-text("Test Trunk")');
    await expect(trunkCard).toBeVisible({ timeout: 10000 });

    console.log('✅ Created IP-based trunk successfully');
  });

  test('can add a phone number to a trunk', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // First, ensure we have a trunk (may already exist from previous test)
    const existingTrunk = page.locator('.external-trunk-card').first();
    const trunkExists = await existingTrunk.isVisible().catch(() => false);

    if (!trunkExists) {
      // Create a trunk first
      await page.click('#add-external-trunk-btn');
      await page.waitForTimeout(500);
      await page.fill('#trunk-name', 'Test Trunk For Numbers');
      await page.fill('#allowed-ips', '0.0.0.0/0');

      page.on('dialog', async dialog => await dialog.accept());
      await page.click('#save-add-trunk');
      await page.waitForTimeout(2000);
    }

    // Get the first trunk's ID
    const trunkCard = page.locator('.external-trunk-card').first();
    await expect(trunkCard).toBeVisible();

    const trunkId = await trunkCard.getAttribute('data-trunk-id');
    console.log('Testing with trunk ID:', trunkId);

    // Click "+ Add Number" button
    const addNumberBtn = page.locator(`#show-add-number-${trunkId}`);
    await addNumberBtn.click();

    // Form should appear
    const addNumberForm = page.locator(`#add-number-form-${trunkId}`);
    await expect(addNumberForm).toBeVisible();

    // Fill in the phone number (use a test number)
    await page.fill(`#new-number-input-${trunkId}`, '+15551234567');
    await page.fill(`#new-number-name-${trunkId}`, 'Test Line');

    // Click Add
    await page.click(`#save-number-btn-${trunkId}`);

    // Wait for reload
    await page.waitForTimeout(2000);

    // Number should appear in the list
    const numberItem = page.locator('.trunk-number-value:has-text("+15551234567")');
    await expect(numberItem).toBeVisible({ timeout: 10000 });

    console.log('✅ Added phone number to trunk successfully');
  });

  test('can toggle SIP Connection Info', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Get first trunk
    const trunkCard = page.locator('.external-trunk-card').first();
    const trunkExists = await trunkCard.isVisible().catch(() => false);

    if (!trunkExists) {
      console.log('⚠️ No trunks to test - skipping toggle test');
      return;
    }

    const trunkId = await trunkCard.getAttribute('data-trunk-id');

    // SIP info content should be hidden initially
    const sipContent = page.locator(`#sip-info-content-${trunkId}`);
    await expect(sipContent).not.toHaveClass(/expanded/);

    // Click to expand
    await page.click(`#sip-info-toggle-${trunkId}`);
    await page.waitForTimeout(300);

    // Should now be expanded
    await expect(sipContent).toHaveClass(/expanded/);

    // Should show SIP domain
    await expect(sipContent.locator('code:has-text("378ads1njtd.sip.livekit.cloud")')).toBeVisible();

    console.log('✅ SIP Connection Info toggles correctly');
  });

  test('can add a second number to existing trunk', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Get first trunk
    const trunkCard = page.locator('.external-trunk-card').first();
    const trunkExists = await trunkCard.isVisible().catch(() => false);

    if (!trunkExists) {
      // Create a trunk first
      await page.click('#add-external-trunk-btn');
      await page.waitForTimeout(500);
      await page.fill('#trunk-name', 'Multi-Number Trunk');
      await page.fill('#allowed-ips', '0.0.0.0/0');

      page.on('dialog', async dialog => await dialog.accept());
      await page.click('#save-add-trunk');
      await page.waitForTimeout(2000);
    }

    const updatedTrunkCard = page.locator('.external-trunk-card').first();
    const trunkId = await updatedTrunkCard.getAttribute('data-trunk-id');
    console.log('Testing multi-number with trunk ID:', trunkId);

    // Add first number
    await page.click(`#show-add-number-${trunkId}`);
    await page.fill(`#new-number-input-${trunkId}`, '+15551111111');
    await page.fill(`#new-number-name-${trunkId}`, 'First Line');
    await page.click(`#save-number-btn-${trunkId}`);
    await page.waitForTimeout(3000);

    // Verify first number appears
    const firstNumber = page.locator('.trunk-number-value:has-text("+15551111111")');
    await expect(firstNumber).toBeVisible({ timeout: 10000 });
    console.log('✅ First number added');

    // Reload to get fresh state
    await page.reload();
    await page.waitForTimeout(2000);

    // Add second number - get fresh trunk ID after reload
    const refreshedTrunkCard = page.locator('.external-trunk-card').first();
    await expect(refreshedTrunkCard).toBeVisible({ timeout: 10000 });
    const refreshedTrunkId = await refreshedTrunkCard.getAttribute('data-trunk-id');
    console.log('Refreshed trunk ID:', refreshedTrunkId);

    await page.click(`#show-add-number-${refreshedTrunkId}`);
    await page.fill(`#new-number-input-${refreshedTrunkId}`, '+15552222222');
    await page.fill(`#new-number-name-${refreshedTrunkId}`, 'Second Line');
    await page.click(`#save-number-btn-${refreshedTrunkId}`);
    await page.waitForTimeout(3000);

    // Verify second number appears
    const secondNumber = page.locator('.trunk-number-value:has-text("+15552222222")');
    await expect(secondNumber).toBeVisible({ timeout: 10000 });

    // Verify first number still exists
    await expect(page.locator('.trunk-number-value:has-text("+15551111111")')).toBeVisible();

    console.log('✅ Second number added - both numbers visible');
  });

  test('can delete a trunk', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.waitForTimeout(1000);

    // Get first trunk
    const trunkCard = page.locator('.external-trunk-card').first();
    const trunkExists = await trunkCard.isVisible().catch(() => false);

    if (!trunkExists) {
      console.log('⚠️ No trunks to delete - skipping delete test');
      return;
    }

    const trunkId = await trunkCard.getAttribute('data-trunk-id');
    const trunkName = await trunkCard.locator('.trunk-title').textContent();
    console.log(`Deleting trunk: ${trunkName} (${trunkId})`);

    // Handle confirmation dialog
    page.on('dialog', async dialog => {
      console.log('Confirm dialog:', dialog.message());
      await dialog.accept();
    });

    // Click Delete
    await page.click(`#delete-trunk-${trunkId}`);

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Trunk should be gone
    const deletedTrunk = page.locator(`[data-trunk-id="${trunkId}"]`);
    await expect(deletedTrunk).not.toBeVisible();

    console.log('✅ Deleted trunk successfully');
  });
});
