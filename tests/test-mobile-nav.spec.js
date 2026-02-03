/**
 * Test mobile navigation layout
 */
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// Mobile viewport
test.use({ viewport: { width: 375, height: 812 } }); // iPhone X size

const SUPABASE_URL = 'https://mtxbiyilvgwhbdptysex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkyNzUzNzMsImV4cCI6MjA0NDg1MTM3M30.6OZFpNqVdDnfSxkSevZKI5VsXdjnc6V1VMVH4Qa-_g8';
const TEST_EMAIL = 'erik@snapsonic.com';

test('mobile nav should be at bottom', async ({ page }) => {
  // Generate OTP for authentication
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'magiclink', email: TEST_EMAIL })
  });

  const linkData = await response.json();
  const otp = linkData.email_otp;
  console.log('Generated OTP for test');

  // Go to the app
  await page.goto('http://localhost:3000/agents');

  // Wait for redirect to login
  await page.waitForURL('**/login', { timeout: 5000 }).catch(() => {});

  // Authenticate via Supabase in the browser
  await page.evaluate(async ({ email, otp, SUPABASE_URL, SUPABASE_ANON_KEY }) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'magpipe-auth-token' }
    });
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (data?.session) {
      localStorage.setItem('magpipe-auth-token', JSON.stringify(data.session));
    }
    return { success: !!data?.session, error: error?.message };
  }, { email: TEST_EMAIL, otp, SUPABASE_URL, SUPABASE_ANON_KEY });

  // Navigate to agents page after auth
  await page.goto('http://localhost:3000/agents');
  await page.waitForTimeout(2000);

  // Take a screenshot
  await page.screenshot({ path: 'tests/screenshots/mobile-nav-test.png', fullPage: true });

  // Check bottom nav position
  const bottomNav = await page.locator('.bottom-nav');
  const isVisible = await bottomNav.isVisible();
  console.log('Bottom nav visible:', isVisible);

  if (isVisible) {
    const boundingBox = await bottomNav.boundingBox();
    console.log('Bottom nav bounding box:', boundingBox);

    if (boundingBox) {
      console.log('Nav top position:', boundingBox.y);
      console.log('Nav height:', boundingBox.height);
      // Nav should be near bottom of viewport (812px)
      const distanceFromBottom = 812 - (boundingBox.y + boundingBox.height);
      console.log('Distance from bottom:', distanceFromBottom);

      // On mobile, nav should be at the bottom (within 50px tolerance for safe area)
      expect(distanceFromBottom).toBeLessThan(50);
    }
  }

  // Check if user modal is hidden
  const userModal = await page.locator('.nav-user-modal');
  const userModalVisible = await userModal.isVisible();
  console.log('User modal visible:', userModalVisible);
  expect(userModalVisible).toBe(false);

  // Check if user section is hidden
  const userSection = await page.locator('.nav-user-section');
  const userSectionVisible = await userSection.isVisible();
  console.log('User section visible:', userSectionVisible);
  expect(userSectionVisible).toBe(false);
});
