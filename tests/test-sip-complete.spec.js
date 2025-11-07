import { test, expect } from '@playwright/test';

test('Complete SIP registration and call test', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in...');

  // Go to login page
  await page.goto('http://localhost:3000/login');

  // Check if already logged in
  await page.waitForTimeout(2000);
  if (page.url().includes('/inbox')) {
    console.log('✅ Already logged in');
  } else {
    console.log('Filling in login form...');

    try {
      // Fill in login form
      const emailInput = await page.locator('input[type="email"]').first();
      const passwordInput = await page.locator('input[type="password"]').first();

      await emailInput.fill('erik@snapsonic.com');
      await passwordInput.fill('Snapsonic2024!');

      // Click login button
      const loginButton = await page.locator('button[type="submit"]').first();
      await loginButton.click();

      console.log('⏳ Waiting for login redirect...');
      await page.waitForURL('**/inbox', { timeout: 10000 });
      console.log('✅ Logged in successfully');
    } catch (error) {
      console.log('❌ Login failed:', error.message);
      console.log('Current URL:', page.url());
      throw error;
    }
  }

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');

  console.log('📋 Listening to console logs...');

  // Capture all console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  Browser:', text);
  });

  console.log('⏳ Waiting 15 seconds for SIP registration...');
  await page.waitForTimeout(15000);

  // Check if registration succeeded
  const hasRegistered = logs.some(log =>
    log.includes('SIP registered') ||
    log.includes('registered successfully')
  );

  const hasError = logs.some(log =>
    log.includes('registration failed') ||
    log.includes('WebSocket') && log.includes('error')
  );

  console.log('\n=== TEST RESULTS ===');
  console.log('SIP Registration Success:', hasRegistered ? '✅' : '❌');
  console.log('WebSocket Errors:', hasError ? '❌ YES' : '✅ NO');

  if (hasRegistered) {
    console.log('\n✅ SIP REGISTRATION WORKING!');

    // Try to make a test call
    console.log('\n📞 Attempting test call...');

    // Click call button
    const callBtn = await page.locator('#call-btn').first();
    if (await callBtn.isVisible()) {
      await callBtn.click();
      await page.waitForTimeout(1000);

      // Enter phone number
      const phoneInput = await page.locator('#call-search-input').first();
      if (await phoneInput.isVisible()) {
        await phoneInput.fill('+16045628647');

        // Select caller ID
        const callerIdSelect = await page.locator('#caller-id-select').first();
        if (await callerIdSelect.isVisible()) {
          await callerIdSelect.selectOption({ index: 1 });
        }

        await page.waitForTimeout(500);

        // Click call again to initiate
        await callBtn.click();

        console.log('📞 Call initiated, waiting 5 seconds...');
        await page.waitForTimeout(5000);

        // Check if call connected
        const callConnected = logs.some(log =>
          log.includes('Call confirmed') ||
          log.includes('Call connected')
        );

        console.log('Call Connected:', callConnected ? '✅' : '❌');

        // Hangup
        if (await callBtn.isVisible()) {
          await callBtn.click();
          console.log('📴 Hung up');
        }
      }
    }
  } else {
    console.log('\n❌ SIP REGISTRATION FAILED');
    console.log('Recent logs:');
    logs.slice(-20).forEach(log => console.log('  -', log));
  }

  await page.waitForTimeout(2000);
});
