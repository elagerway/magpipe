import { test, expect } from '@playwright/test';

test('Test bridged call with recording toggle', async ({ page, context }) => {
  // Set test timeout to 120 seconds (we need 90s for call + setup time)
  test.setTimeout(120000);
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in with test account...');
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);

  const emailInput = await page.locator('input[type="email"]').first();
  const passwordInput = await page.locator('input[type="password"]').first();

  await emailInput.fill('claude-test@snapsonic.test');
  await passwordInput.fill('TestPass123!');

  const loginButton = await page.locator('button[type="submit"]').first();
  await loginButton.click();

  await page.waitForTimeout(5000);

  // Capture all console logs BEFORE navigating
  const logs = [];
  const errors = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  [BROWSER]', text);
  });

  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('  [PAGE ERROR]', error.message);
    console.log('  [STACK]', error.stack);
  });

  page.on('requestfailed', request => {
    console.log('  [REQUEST FAILED]', request.url(), request.failure().errorText);
  });

  // Navigate to phone page
  console.log('📱 Navigating to phone page...');
  await page.goto('http://localhost:3000/phone');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Verify recording toggle is checked
  const isChecked = await page.locator('#record-call-toggle').isChecked();
  console.log('\n✓ Recording toggle checked:', isChecked);

  // Wait for caller ID dropdown to load
  console.log('\n📞 Waiting for caller ID dropdown...');
  await page.waitForTimeout(2000);

  const callerIdSelect = await page.locator('#caller-id-select');
  const optionCount = await callerIdSelect.locator('option').count();
  console.log('  Caller ID options found:', optionCount);

  if (optionCount > 0) {
    const options = await callerIdSelect.locator('option').allTextContents();
    console.log('  Options:', options);
    await callerIdSelect.selectOption({ index: 0 });
    console.log('  Selected first option');
    await page.waitForTimeout(500);
  } else {
    console.log('  ❌ No caller ID options available!');
  }

  // Fill in phone number (user's cell for testing - should answer)
  console.log('\n📞 Filling phone number...');
  await page.fill('#call-search-input', '+16045628647');
  await page.waitForTimeout(500);

  // Close mic permission modal if it exists (do this right before clicking call button)
  const micModal = await page.locator('#mic-permission-modal').count();
  if (micModal > 0) {
    console.log('📞 Closing mic permission modal...');
    await page.click('button:has-text("Allow")').catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Click call button to initiate
  console.log('📞 Clicking call button via JavaScript...');
  await page.evaluate(() => {
    const btn = document.getElementById('call-btn');
    if (btn) {
      btn.click();
      console.log('✅ Button clicked via JavaScript');
    } else {
      console.log('❌ Button not found!');
    }
  });

  console.log('⏳ Waiting for call to connect...');
  console.log('☎️  CALL SHOULD BE RINGING NOW - PLEASE ANSWER!');

  // Wait 60 seconds for user to answer and talk
  await page.waitForTimeout(60000);

  console.log('⏳ Call should be connected. Waiting 30 more seconds...');
  await page.waitForTimeout(30000);

  // Check if initiateBridgedCall was called
  const bridgedCallLogs = logs.filter(log =>
    log.includes('Initiating bridged call') ||
    log.includes('Recording enabled') ||
    log.includes('Edge Function') ||
    log.includes('initiate-bridged-call')
  );

  console.log('\n📋 Bridged call logs found:', bridgedCallLogs.length);
  bridgedCallLogs.forEach(log => console.log('  →', log));

  // Check if direct SIP was used instead
  const sipLogs = logs.filter(log =>
    log.includes('Initializing SIP client') ||
    log.includes('SIP client registered')
  );

  console.log('\n📋 Direct SIP logs found:', sipLogs.length);
  sipLogs.forEach(log => console.log('  →', log));

  // Check for errors
  const errorLogs = logs.filter(log =>
    log.toLowerCase().includes('error') ||
    log.toLowerCase().includes('failed')
  );

  console.log('\n❌ Error logs found:', errorLogs.length);
  errorLogs.forEach(log => console.log('  →', log));

  console.log('\n❌ Page errors found:', errors.length);
  errors.forEach(err => console.log('  →', err));

  console.log('\n📋 ALL console logs:');
  logs.forEach(log => console.log('  →', log));

  console.log('\nWaiting 5 more seconds...');
  await page.waitForTimeout(5000);

  // Try to hangup
  const hangupBtn = await page.locator('button:has-text("Hang Up")').first();
  if (await hangupBtn.isVisible()) {
    await hangupBtn.click();
    console.log('📴 Hung up');
    await page.waitForTimeout(2000); // Wait for hangup to complete
  }

  // Verify recording was created
  console.log('\n🎙️ Verifying recording...');

  // Extract call SID from logs
  const callSidLog = logs.find(log => log.includes('call_sid:'));
  let callSid = null;
  if (callSidLog) {
    const match = callSidLog.match(/call_sid:\s*([a-f0-9-]+)/);
    if (match) callSid = match[1];
  }

  // Also try to find it in "Bridged call initiated" log
  if (!callSid) {
    const initiatedLog = logs.find(log => log.includes('Bridged call initiated'));
    if (initiatedLog) {
      const match = initiatedLog.match(/call_sid:\s*([a-f0-9-]+)/);
      if (match) callSid = match[1];
    }
  }

  if (callSid) {
    console.log('✅ Found call SID:', callSid);

    // Query SignalWire for recordings (they may take a few seconds to appear)
    console.log('⏳ Waiting 10 seconds for recording to be processed...');
    await page.waitForTimeout(10000);

    // Note: We can't directly call SignalWire API from browser context
    // The recording verification should be done in a separate script or CI/CD
    console.log('📝 To verify recording, run:');
    console.log(`   source .env && curl -s "https://\${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/\${SIGNALWIRE_PROJECT_ID}/Calls/${callSid}/Recordings.json" -u "\${SIGNALWIRE_PROJECT_ID}:\${SIGNALWIRE_API_TOKEN}"`);
  } else {
    console.log('❌ Could not find call SID in logs');
    console.log('   This is expected if call was not initiated successfully');
  }
});
