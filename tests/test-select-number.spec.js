import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// Skip browser login — navigate directly and wait for auth to restore from storage
async function loginAndGo(page, path) {
  // First visit to init auth from IndexedDB
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', 'erik@snapsonic.com');
  await page.fill('input[type="password"]', 'Snapsonic123');
  await page.click('button[type="submit"]');
  // Wait for any redirect or auth state
  await page.waitForTimeout(5000);
  // Navigate to target regardless of where login landed
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

test.describe('Select Number Page', () => {
  test('loads default US results on page load', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });
    const rows = await page.$$('.sn-number-row');
    expect(rows.length).toBeGreaterThan(0);
    console.log(`Default: ${rows.length} numbers loaded`);

    const caps = await page.$$eval('.sn-number-row td:nth-child(2)', cells => cells.map(c => c.textContent.trim()));
    for (const c of caps) {
      expect(c).toContain('voice');
      expect(c).toContain('sms');
    }
  });

  test('state search by code works', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });

    await page.fill('#state-input', 'CA');
    await page.click('#state-search-btn');
    await page.waitForFunction(() => {
      const l = document.getElementById('loading-state');
      return l && l.style.display === 'none';
    }, { timeout: 20000 });

    const rows = await page.$$('.sn-number-row');
    expect(rows.length).toBeGreaterThan(0);
    console.log(`State CA: ${rows.length} numbers`);
  });

  test('state search by full name works', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });

    await page.fill('#state-input', 'British Columbia (BC)');
    await page.click('#state-search-btn');
    await page.waitForFunction(() => {
      const l = document.getElementById('loading-state');
      return l && l.style.display === 'none';
    }, { timeout: 20000 });

    const rows = await page.$$('.sn-number-row');
    expect(rows.length).toBeGreaterThan(0);
    console.log(`State BC by name: ${rows.length} numbers`);
  });

  test('city search works', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });

    await page.fill('#city-input', 'vancouver');
    await page.click('#city-search-btn');
    await page.waitForFunction(() => {
      const l = document.getElementById('loading-state');
      return l && l.style.display === 'none';
    }, { timeout: 20000 });

    const rows = await page.$$('.sn-number-row');
    expect(rows.length).toBeGreaterThan(0);
    console.log(`City Vancouver: ${rows.length} numbers`);
  });

  test('area code search works', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });

    await page.fill('#area-code-input', '604');
    await page.click('#area-code-search-btn');
    await page.waitForFunction(() => {
      const l = document.getElementById('loading-state');
      return l && l.style.display === 'none';
    }, { timeout: 20000 });

    const rows = await page.$$('.sn-number-row');
    expect(rows.length).toBeGreaterThan(0);
    const numbers = await page.$$eval('.sn-number-row td:first-child div:first-child', cells =>
      cells.map(c => c.textContent.trim())
    );
    for (const num of numbers) {
      expect(num).toContain('(604)');
    }
    console.log(`Area 604: ${rows.length} numbers, all 604`);
  });

  test('autocomplete datalists populated and toggle at bottom', async ({ page }) => {
    await loginAndGo(page, '/select-number');
    await page.waitForSelector('.sn-number-row', { timeout: 20000 });

    const toggle = await page.$('#number-type-toggle');
    expect(toggle).not.toBeNull();

    const stateOptions = await page.$$('#state-list option');
    expect(stateOptions.length).toBeGreaterThan(50);

    const cityOptions = await page.$$('#city-list option');
    expect(cityOptions.length).toBeGreaterThan(20);

    console.log(`Autocomplete: ${stateOptions.length} states, ${cityOptions.length} cities`);
  });
});

test.describe('Phone Number Management - Delete', () => {
  test('delete button and modal work correctly', async ({ page }) => {
    await loginAndGo(page, '/phone');
    await page.waitForSelector('.delete-number-btn', { timeout: 15000 });

    const deleteBtns = await page.$$('.delete-number-btn');
    expect(deleteBtns.length).toBeGreaterThan(0);
    console.log(`Found ${deleteBtns.length} delete buttons`);

    // Click first delete button
    await page.click('.delete-number-btn');
    await page.waitForSelector('h3', { timeout: 5000 });

    const title = await page.textContent('h3');
    expect(title).toContain('Delete Phone Number');

    const body = await page.textContent('p');
    expect(body).toContain('cannot be undone');
    // Agent warning should be present for assigned numbers
    expect(body).toContain('will no longer receive calls or messages');
    // No RELEASE or SignalWire info
    expect(body).not.toContain('RELEASE');
    expect(body).not.toContain('SignalWire');

    console.log(`Modal: ${body}`);

    // Cancel - don't actually delete
    await page.click('button:has-text("Cancel")');
  });

  test('no RELEASE text visible in number list', async ({ page }) => {
    await loginAndGo(page, '/phone');
    await page.waitForSelector('[data-number-id]', { timeout: 15000 });

    const allText = await page.textContent('#app');
    // RELEASE should not appear anywhere in the phone management UI
    const numberSectionText = await page.$$eval('[data-number-id]', els => els.map(e => e.textContent).join(' '));
    expect(numberSectionText).not.toContain('RELEASE');
    console.log('No RELEASE text in number list');
  });
});
