/**
 * Take screenshots for documentation
 * Run with: node scripts/take-doc-screenshots.js
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOTS_DIR = './docs/images';

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in...');
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'erik@snapsonic.com');
    await page.fill('input[type="password"]', 'Snapsonic123');
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 10000 });
    console.log('Logged in successfully');
    await page.waitForTimeout(1500);

    // Phone/Dialpad
    console.log('Taking screenshot: phone/dialpad');
    await page.goto(`${BASE_URL}/phone`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/phone-dialpad.png` });

    // Agents list
    console.log('Taking screenshot: agents');
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/agents-list.png` });

    // Agent detail - click the Open button
    console.log('Taking screenshot: agent detail');
    const openBtn = await page.$('button:has-text("Open")');
    if (openBtn) {
      await openBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/agent-detail.png` });

      // Deploy tab
      const deployTab = await page.$('[data-tab="deploy"], button:has-text("Deploy"), .tab:has-text("Deploy")');
      if (deployTab) {
        await deployTab.click();
        await page.waitForTimeout(1000);
        console.log('Taking screenshot: agent deploy');
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/agent-deploy.png` });
      }

      // Integrations tab
      const integrationsTab = await page.$('[data-tab="integrations"], button:has-text("Integrations"), .tab:has-text("Integrations")');
      if (integrationsTab) {
        await integrationsTab.click();
        await page.waitForTimeout(1000);
        console.log('Taking screenshot: agent integrations');
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/agent-integrations.png` });
      }
    }

    // Inbox
    console.log('Taking screenshot: inbox');
    await page.goto(`${BASE_URL}/inbox`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/inbox.png` });

    // Click first conversation
    const firstConvo = await page.$('.conversation-item, [class*="conversation-list"] > div:first-child');
    if (firstConvo) {
      await firstConvo.click();
      await page.waitForTimeout(1500);
      console.log('Taking screenshot: inbox conversation detail');
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/inbox-conversation.png` });
    }

    // Numbers page
    console.log('Taking screenshot: numbers');
    await page.goto(`${BASE_URL}/numbers`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/phone-numbers.png` });

    // Knowledge
    console.log('Taking screenshot: knowledge');
    await page.goto(`${BASE_URL}/knowledge`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/knowledge-base.png` });

    // Apps/Integrations
    console.log('Taking screenshot: apps');
    await page.goto(`${BASE_URL}/apps`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/apps-integrations.png` });

    // Settings
    console.log('Taking screenshot: settings');
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings.png` });

    // Contacts
    console.log('Taking screenshot: contacts');
    await page.goto(`${BASE_URL}/contacts`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/contacts.png` });

    console.log('All screenshots taken!');

  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
