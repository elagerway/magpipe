import { test, expect } from '@playwright/test';

test.setTimeout(120000); // 2 minute timeout

test('Test outbound call direction detection', async ({ page, context }) => {
  // Listen to console logs early
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('SIP') || text.includes('call') || text.includes('Call') || text.includes('direction')) {
      console.log('  Browser:', text);
    }
  });

  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  console.log('🔐 Logging in via API and injecting session...');

  // Generate magic link and get OTP
  const response = await fetch('https://api.magpipe.ai/auth/v1/admin/generate_link', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-supabase-service-role-key',
      'apikey': 'your-supabase-service-role-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'magiclink', email: 'erik@snapsonic.com' })
  });
  const data = await response.json();
  const otp = data.email_otp;
  console.log('Got OTP:', otp);

  // Verify OTP to get session
  const verifyResponse = await fetch('https://api.magpipe.ai/auth/v1/verify', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'email', token: otp, email: 'erik@snapsonic.com' })
  });
  const session = await verifyResponse.json();
  console.log('Got session, access_token length:', session.access_token?.length);

  // Go to the app first to set localStorage on the right origin
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);

  // Set the session in browser storage with the correct format
  await page.evaluate((sessionData) => {
    const storageKey = 'sb-mtxbiyilvgwhbdptysex-auth-token';
    const sessionObj = {
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: sessionData.user
    };
    localStorage.setItem(storageKey, JSON.stringify(sessionObj));
    console.log('Session set in localStorage');
  }, session);

  // Navigate to inbox first
  await page.goto('http://localhost:3000/inbox');
  await page.waitForTimeout(3000);
  console.log('✅ On inbox page');

  // Navigate to Phone page via bottom nav
  console.log('📱 Navigating to Phone page...');
  await page.click('text=Phone');
  await page.waitForTimeout(2000);

  // Handle microphone permission modal if it appears
  const allowMicBtn = page.locator('text=Allow Microphone');
  if (await allowMicBtn.isVisible()) {
    console.log('🎤 Clicking Allow Microphone...');
    await allowMicBtn.click();
    await page.waitForTimeout(1000);
  }

  // Wait for SIP registration
  console.log('⏳ Waiting for SIP registration...');
  await page.waitForTimeout(15000);

  const hasRegistered = logs.some(log =>
    log.includes('SIP registered') ||
    log.includes('registered successfully') ||
    log.includes('Registration successful')
  );

  console.log('SIP Registration:', hasRegistered ? '✅' : '❌');

  // Screenshot for debugging
  await page.screenshot({ path: '/tmp/phone-state.png' });
  console.log('📸 Screenshot saved to /tmp/phone-state.png');

  // Now look for the call button on Phone page
  const callBtnVisible = await page.locator('#call-btn').isVisible().catch(() => false);
  console.log('Call button visible:', callBtnVisible);

  if (!callBtnVisible) {
    console.log('❌ Call button not found, checking page state...');
    console.log('Current URL:', page.url());
    throw new Error('Call button not visible on phone page');
  }

  // Enter phone number in the dialer
  console.log('📞 Entering phone number...');
  const phoneInput = page.locator('#call-search-input');
  await phoneInput.waitFor({ state: 'visible', timeout: 5000 });
  await phoneInput.click();
  await phoneInput.fill('+16045628647');
  await page.waitForTimeout(500);

  // Verify number was entered
  const enteredValue = await phoneInput.inputValue();
  console.log('Entered phone number:', enteredValue);
  if (!enteredValue.includes('6045628647')) {
    throw new Error(`Phone number not entered correctly: ${enteredValue}`);
  }

  // Select caller ID if dropdown exists
  const callerIdSelect = page.locator('#caller-id-select');
  if (await callerIdSelect.isVisible()) {
    await callerIdSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);
  }

  // Initiate call - scroll into view and use JavaScript click to bypass bottom nav
  console.log('📞 Initiating call...');
  const callBtn = page.locator('#call-btn').first();
  await callBtn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  // Use JavaScript click to bypass any overlapping elements
  await page.evaluate(() => {
    const btn = document.getElementById('call-btn');
    if (btn) btn.click();
  });
  console.log('📞 Call button clicked via JavaScript');

  console.log('⏳ Waiting for call to connect (answer your phone!)...');
  await page.waitForTimeout(30000);

  // Check call logs for direction-related messages
  const directionLogs = logs.filter(log =>
    log.includes('direction') ||
    log.includes('outbound') ||
    log.includes('Call record')
  );

  console.log('Direction-related logs:', directionLogs);

  // Hangup - use force click because bottom nav may intercept
  const hangupBtn = page.locator('#call-btn, .hangup-btn').first();
  if (await hangupBtn.isVisible()) {
    await hangupBtn.click({ force: true });
    console.log('📴 Hung up');
  }

  await page.waitForTimeout(3000);

  // Query database for call result
  const checkResponse = await fetch('https://api.magpipe.ai/rest/v1/call_records?user_id=eq.77873635-9f5a-4eee-90f3-d145aed0c2c4&order=created_at.desc&limit=1', {
    headers: {
      'apikey': 'your-supabase-service-role-key',
      'Authorization': 'Bearer your-supabase-service-role-key'
    }
  });

  const callRecords = await checkResponse.json();
  const latestCall = callRecords[0];

  console.log('📊 Latest call record:');
  console.log('  Direction:', latestCall?.direction);
  console.log('  Status:', latestCall?.status);
  console.log('  Transcript:', latestCall?.transcript?.substring(0, 200));

  // Verify direction is outbound
  expect(latestCall?.direction).toBe('outbound');
});
