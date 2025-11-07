import { test, expect } from '@playwright/test';

test('Test outbound call creates record in inbox', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in...');
  await page.goto('http://localhost:3000/login');

  await page.waitForTimeout(2000);

  if (page.url().includes('/inbox')) {
    console.log('✅ Already logged in');
  } else {
    console.log('Filling in login form...');

    const emailInput = await page.locator('input[type="email"]').first();
    const passwordInput = await page.locator('input[type="password"]').first();

    await emailInput.fill('erik@snapsonic.com');
    await passwordInput.fill('Snapsonic2024!');

    const loginButton = await page.locator('button[type="submit"]').first();
    await loginButton.click();

    console.log('⏳ Waiting for login redirect...');
    await page.waitForURL('**/inbox', { timeout: 10000 });
    console.log('✅ Logged in successfully');
  }

  await page.waitForLoadState('networkidle');

  console.log('📋 Listening to console logs...');

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  Browser:', text);
  });

  console.log('⏳ Waiting 15 seconds for SIP registration...');
  await page.waitForTimeout(15000);

  const hasRegistered = logs.some(log =>
    log.includes('SIP registered') ||
    log.includes('registered successfully')
  );

  console.log('SIP Registration:', hasRegistered ? '✅' : '❌');

  if (!hasRegistered) {
    console.log('❌ SIP not registered, cannot test');
    throw new Error('SIP registration failed');
  }

  // Now make a test call
  console.log('\n📞 Initiating test call...');

  const callBtn = await page.locator('#call-btn').first();
  await callBtn.click();
  await page.waitForTimeout(1000);

  const phoneInput = await page.locator('#call-search-input').first();
  await phoneInput.fill('+16045628647');

  const callerIdSelect = await page.locator('#caller-id-select').first();
  await callerIdSelect.selectOption({ index: 1 });

  await page.waitForTimeout(500);

  // Click call to initiate
  await callBtn.click();

  console.log('📞 Call initiated, waiting for call record creation...');
  await page.waitForTimeout(3000);

  // Check if call record was created
  const callRecordCreated = logs.some(log =>
    log.includes('Call record created')
  );

  console.log('Call Record Created:', callRecordCreated ? '✅' : '❌');

  // Wait a bit more to see if call connects
  await page.waitForTimeout(2000);

  // Hangup
  if (await callBtn.isVisible()) {
    await callBtn.click();
    console.log('📴 Hung up');
  }

  await page.waitForTimeout(2000);

  // Verify call record updated
  const callRecordUpdated = logs.some(log =>
    log.includes('Call record updated')
  );

  console.log('Call Record Updated:', callRecordUpdated ? '✅' : '❌');

  if (!callRecordCreated) {
    throw new Error('Call record was not created');
  }
});
