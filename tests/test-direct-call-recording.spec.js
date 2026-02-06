import { test, expect } from '@playwright/test';

// Increase timeout for this test since it makes actual phone calls
test.setTimeout(120000);

test('Test direct outbound call with recording and transcription', async ({ page, context }) => {
  // Grant microphone permission
  await context.grantPermissions(['microphone']);

  // Go to phone page
  console.log('📞 Going to phone page...');
  await page.goto('http://localhost:3000/phone');
  await page.waitForTimeout(2000);

  // Handle login if redirected
  if (page.url().includes('/login')) {
    console.log('🔐 Logging in with test account...');
    await page.locator('input[type="email"]').fill('claude-test@snapsonic.test');
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
    await page.goto('http://localhost:3000/phone');
    await page.waitForTimeout(2000);
  }

  await page.waitForLoadState('networkidle');

  console.log('📋 Listening to console logs...');
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    console.log('  Browser:', text);
  });

  // Handle microphone permission modal if it appears
  const allowMicBtn = page.locator('text=Allow Microphone');
  if (await allowMicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('🎤 Clicking Allow Microphone...');
    await allowMicBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('⏳ Waiting 15 seconds for SIP registration...');
  await page.waitForTimeout(15000);

  const hasRegistered = logs.some(log =>
    log.includes('SIP registered') ||
    log.includes('registered successfully') ||
    log.includes('✅ SIP')
  );

  console.log('SIP Registration:', hasRegistered ? '✅' : '⚠️ (may already be registered)');

  // Make sure Agent toggle is OFF (for direct SIP call, not bridged)
  console.log('🔧 Checking Agent toggle...');
  const agentToggle = page.locator('input#agent-toggle');

  // Wait for it to be available
  await agentToggle.waitFor({ state: 'attached', timeout: 5000 });

  const isChecked = await agentToggle.isChecked();
  console.log('Agent toggle current state:', isChecked ? 'ON' : 'OFF');

  if (isChecked) {
    console.log('🔄 Turning Agent toggle OFF for direct SIP call...');
    // Scroll into view and click via JS
    await agentToggle.scrollIntoViewIfNeeded();
    await agentToggle.evaluate((el) => el.click());
    await page.waitForTimeout(500);

    const nowChecked = await agentToggle.isChecked();
    console.log('Agent toggle after click:', nowChecked ? 'ON' : 'OFF');
  }

  // Enter phone number
  console.log('📱 Entering phone number...');
  const phoneInput = page.locator('#call-search-input');
  await phoneInput.scrollIntoViewIfNeeded();
  await phoneInput.fill('+16045628647');
  await page.waitForTimeout(500);

  // Select caller ID
  console.log('📋 Selecting caller ID...');
  const callerIdSelect = page.locator('#caller-id-select');
  if (await callerIdSelect.isVisible()) {
    await callerIdSelect.selectOption({ index: 0 });
    await page.waitForTimeout(500);
  }

  // Click call button
  console.log('📞 Initiating direct SIP call...');
  const callBtn = page.locator('#call-btn');
  await callBtn.click();

  // Wait for call to connect
  console.log('⏳ Waiting for call to connect...');
  await page.waitForTimeout(5000);

  // Check if call connected
  const callConnected = logs.some(log =>
    log.includes('Call connected') ||
    log.includes('✅ Call connected') ||
    log.includes('established')
  );
  console.log('Call connected:', callConnected ? '✅' : '❌');

  // Let the call run for 10 seconds to get some audio
  console.log('🎙️ Letting call run for 10 seconds to record audio...');
  await page.waitForTimeout(10000);

  // Hang up
  console.log('📴 Hanging up...');
  const hangupBtn = page.locator('#call-btn');
  await hangupBtn.click();
  await page.waitForTimeout(2000);

  // Check call record was created
  const callRecordCreated = logs.some(log =>
    log.includes('Call record created') ||
    log.includes('✅ Call record')
  );
  console.log('Call Record Created:', callRecordCreated ? '✅' : '❌');

  // Now check the database for recording URL
  console.log('\n🔍 Checking database for recording...');
  console.log('⏳ Waiting 5 seconds for recording callback to process...');
  await page.waitForTimeout(5000);

  // Query database via Supabase
  const supabaseUrl = 'https://api.magpipe.ai';
  const supabaseKey = 'your-supabase-service-role-key';

  const response = await fetch(
    `${supabaseUrl}/rest/v1/call_records?select=id,contact_phone,direction,call_sid,recording_url,transcript,status,created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  const records = await response.json();
  console.log('\n📊 Latest call record:');
  console.log(JSON.stringify(records[0], null, 2));

  if (records[0]) {
    console.log('\n📋 Summary:');
    console.log('  - Call SID:', records[0].call_sid ? '✅ ' + records[0].call_sid : '❌ Not set');
    console.log('  - Recording URL:', records[0].recording_url ? '✅ Present' : '❌ Not set');
    console.log('  - Transcript:', records[0].transcript ? '✅ Present' : '⏳ Pending (may take longer)');
  }

  // If no recording yet, wait a bit more and check again
  if (!records[0]?.recording_url) {
    console.log('\n⏳ Waiting 10 more seconds for recording callback...');
    await page.waitForTimeout(10000);

    const response2 = await fetch(
      `${supabaseUrl}/rest/v1/call_records?select=id,contact_phone,direction,call_sid,recording_url,transcript,status,created_at&order=created_at.desc&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const records2 = await response2.json();
    console.log('\n📊 Updated call record:');
    console.log(JSON.stringify(records2[0], null, 2));

    if (records2[0]) {
      console.log('\n📋 Final Summary:');
      console.log('  - Call SID:', records2[0].call_sid ? '✅ ' + records2[0].call_sid : '❌ Not set');
      console.log('  - Recording URL:', records2[0].recording_url ? '✅ Present' : '❌ Not set');
      console.log('  - Transcript:', records2[0].transcript ? '✅ ' + records2[0].transcript.substring(0, 100) + '...' : '⏳ Pending');
    }
  }

  console.log('\n✅ Test complete');
});
