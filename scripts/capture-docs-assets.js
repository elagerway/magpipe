/**
 * Capture screenshots and video clips for Mint documentation
 *
 * Usage:
 *   node scripts/capture-docs-assets.js                  # Run against production
 *   node scripts/capture-docs-assets.js --local          # Run against localhost:3000
 *   node scripts/capture-docs-assets.js --page agents    # Capture single page only
 *   node scripts/capture-docs-assets.js --videos-only    # Only capture video clips
 *   node scripts/capture-docs-assets.js --screenshots-only # Only capture screenshots
 *
 * Prerequisites:
 *   - playwright installed: npm i -D playwright
 *   - ffmpeg installed (for GIF conversion): brew install ffmpeg
 *   - .env file with TEST_EMAIL and TEST_PASSWORD
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT, 'docs', 'images');
const VIDEOS_DIR = path.join(ROOT, 'docs', 'videos');

// Parse CLI args
const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const pageFilter = args.includes('--page') ? args[args.indexOf('--page') + 1] : null;
const videosOnly = args.includes('--videos-only');
const screenshotsOnly = args.includes('--screenshots-only');

const manualLogin = args.includes('--manual-login');
const BASE_URL = isLocal ? 'http://localhost:3000' : 'https://magpipe.ai';
const TEST_EMAIL = process.env.TEST_EMAIL || 'erik@snapsonic.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Snapsonic123';

// Viewport for all captures
const VIEWPORT = { width: 1280, height: 800 };

// Ensure output directories exist
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });

// ──────────────────────────────────────────────
// Screenshot & Video capture definitions
// ──────────────────────────────────────────────

const SCREENSHOTS = [
  // Agents
  { page: 'agents', path: '/agents', file: 'agents-list.png', wait: 1500 },
  { page: 'agents', path: '/agents', file: 'agent-create-modal.png', wait: 500,
    action: async (page) => {
      await page.click('#create-agent-btn');
      await page.waitForTimeout(800);
    }
  },
  { page: 'agent-detail', path: null, file: 'agent-detail-configure.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
    }
  },
  { page: 'agent-detail', path: null, file: 'agent-detail-deploy.png', wait: 1000,
    setup: async (page) => {
      const tab = await page.$('[data-tab="deploy"], button:has-text("Deploy"), .tab-btn:has-text("Deploy")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // Agent Memory
  { page: 'agent-memory', path: null, file: 'agent-memory-tab.png', wait: 1000,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      const tab = await page.$('[data-tab="memory"], button:has-text("Memory"), .tab-btn:has-text("Memory")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // Agent Notifications
  { page: 'agent-notifications', path: null, file: 'agent-notifications-tab.png', wait: 1000,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      const tab = await page.$('[data-tab="notifications"], button:has-text("Notifications"), .tab-btn:has-text("Notifications")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // System Functions
  { page: 'system-functions', path: null, file: 'system-functions-tab.png', wait: 1000,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      const tab = await page.$('[data-tab="functions"], button:has-text("Functions"), .tab-btn:has-text("Functions")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // Custom Functions
  { page: 'custom-functions', path: null, file: 'custom-functions-tab.png', wait: 1000,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      const tab = await page.$('[data-tab="functions"], button:has-text("Functions"), .tab-btn:has-text("Functions")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // Phone Numbers
  { page: 'phone-numbers', path: '/numbers', file: 'phone-numbers.png', wait: 1500 },
  { page: 'phone-numbers', path: '/phone', file: 'phone-dialpad.png', wait: 1500 },

  // Inbox
  { page: 'inbox', path: '/inbox', file: 'inbox.png', wait: 1500 },
  { page: 'inbox', path: '/inbox', file: 'inbox-conversation.png', wait: 500,
    action: async (page) => {
      const convo = await page.$('.conversation-item, [class*="conversation-list"] > div:first-child');
      if (convo) { await convo.click(); await page.waitForTimeout(1500); }
    }
  },

  // SMS
  { page: 'sms', path: '/inbox', file: 'sms-conversation.png', wait: 1500,
    setup: async (page) => {
      // Navigate to inbox and find an SMS conversation
      await page.goto(`${BASE_URL}/inbox`);
      await page.waitForTimeout(1500);
      const smsTab = await page.$('button:has-text("SMS"), [data-filter="sms"]');
      if (smsTab) { await smsTab.click(); await page.waitForTimeout(1000); }
      const convo = await page.$('.conversation-item, [class*="conversation-list"] > div:first-child');
      if (convo) { await convo.click(); await page.waitForTimeout(1500); }
    }
  },

  // Email
  { page: 'email', path: '/inbox', file: 'email-thread.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/inbox`);
      await page.waitForTimeout(1500);
      const emailTab = await page.$('button:has-text("Email"), [data-filter="email"]');
      if (emailTab) { await emailTab.click(); await page.waitForTimeout(1000); }
      const convo = await page.$('.conversation-item, [class*="conversation-list"] > div:first-child');
      if (convo) { await convo.click(); await page.waitForTimeout(1500); }
    }
  },

  // Knowledge Base
  { page: 'knowledge-base', path: '/knowledge', file: 'knowledge-base.png', wait: 1500 },
  { page: 'knowledge-base', path: '/knowledge', file: 'knowledge-add-modal.png', wait: 500,
    action: async (page) => {
      const addBtn = await page.$('button:has-text("Add Source"), button:has-text("Add Knowledge")');
      if (addBtn) { await addBtn.click(); await page.waitForTimeout(800); }
    }
  },

  // Chat Widget
  { page: 'chat-widget', path: null, file: 'chat-widget-config.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      const tab = await page.$('[data-tab="deploy"], button:has-text("Deploy"), .tab-btn:has-text("Deploy")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
    }
  },

  // Apps
  { page: 'apps', path: '/apps', file: 'apps-integrations.png', wait: 1500 },

  // Contacts
  { page: 'contacts', path: '/contacts', file: 'contacts.png', wait: 1500 },
  { page: 'contacts', path: '/contacts', file: 'contacts-detail.png', wait: 500,
    action: async (page) => {
      const contact = await page.$('.contact-row, [class*="contact"] tr, table tbody tr:first-child');
      if (contact) { await contact.click(); await page.waitForTimeout(1500); }
    }
  },

  // Settings
  { page: 'settings', path: '/settings', file: 'settings.png', wait: 1500 },

  // Billing
  { page: 'billing', path: '/billing', file: 'billing-page.png', wait: 1500 },

  // Team Management
  { page: 'team-management', path: '/settings', file: 'team-management.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForTimeout(1500);
      const teamSection = await page.$('button:has-text("Team"), [data-section="team"], a:has-text("Team")');
      if (teamSection) { await teamSection.click(); await page.waitForTimeout(1000); }
    }
  },

  // Scheduled Actions
  { page: 'scheduled-actions', path: '/scheduled-actions', file: 'scheduled-actions.png', wait: 1500 },

  // Batch Calling
  { page: 'batch-calling', path: '/batch-calling', file: 'batch-calling.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/batch-calling`);
      await page.waitForTimeout(1500);
    }
  },

  // Webhooks / API
  { page: 'webhooks', path: '/settings', file: 'webhooks-api.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForTimeout(1500);
      const apiSection = await page.$('button:has-text("API"), [data-section="api"], a:has-text("API")');
      if (apiSection) { await apiSection.click(); await page.waitForTimeout(1000); }
    }
  },

  // White Labeling
  { page: 'white-labeling', path: '/settings', file: 'white-labeling.png', wait: 1500,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForTimeout(1500);
      const brandSection = await page.$('button:has-text("Branding"), button:has-text("White Label"), [data-section="branding"]');
      if (brandSection) { await brandSection.click(); await page.waitForTimeout(1000); }
    }
  },

  // Home / Dialpad (for guides)
  { page: 'home', path: '/home', file: 'home-dialpad.png', wait: 1500 },

  // Status Page
  { page: 'status-page', path: null, file: 'status-page-modal.png', wait: 1000,
    setup: async (page) => {
      await page.goto(`${BASE_URL}/home`);
      await page.waitForTimeout(1500);
      // Open profile menu then status
      const profileBtn = await page.$('.profile-menu, [class*="profile"], .avatar-btn, button:has-text("Status")');
      if (profileBtn) { await profileBtn.click(); await page.waitForTimeout(500); }
      const statusBtn = await page.$('button:has-text("Status"), a:has-text("Status"), [data-action="status"]');
      if (statusBtn) { await statusBtn.click(); await page.waitForTimeout(1000); }
    }
  },
];

const VIDEO_CAPTURES = [
  {
    page: 'agents',
    file: 'create-agent-demo',
    description: 'Creating a new agent',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      await page.click('#create-agent-btn');
      await page.waitForTimeout(1000);
      const nameInput = await page.$('input[name="name"], input[placeholder*="name"], #agent-name');
      if (nameInput) { await nameInput.fill('Demo Sales Agent'); await page.waitForTimeout(500); }
      const typeSelect = await page.$('select[name="type"], #agent-type');
      if (typeSelect) { await typeSelect.selectOption('inbound'); await page.waitForTimeout(500); }
      await page.waitForTimeout(2000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  },
  {
    page: 'knowledge-base',
    file: 'add-knowledge-demo',
    description: 'Adding a knowledge source',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/knowledge`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const addBtn = await page.$('button:has-text("Add Source"), button:has-text("Add Knowledge")');
      if (addBtn) { await addBtn.click(); await page.waitForTimeout(1000); }
      const urlInput = await page.$('input[name="url"], input[placeholder*="url"], input[type="url"]');
      if (urlInput) { await urlInput.fill('https://example.com/faq'); await page.waitForTimeout(1000); }
      await page.waitForTimeout(2000);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  },
  {
    page: 'phone-numbers',
    file: 'purchase-number-demo',
    description: 'Purchasing a phone number',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/numbers`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const getBtn = await page.$('button:has-text("Get a Number"), button:has-text("Add Number")');
      if (getBtn) { await getBtn.click(); await page.waitForTimeout(1500); }
      const areaInput = await page.$('input[placeholder*="area"], input[name="areaCode"]');
      if (areaInput) { await areaInput.fill('604'); await page.waitForTimeout(500); }
      const searchBtn = await page.$('button:has-text("Search")');
      if (searchBtn) { await searchBtn.click(); await page.waitForTimeout(2000); }
      await sanitize(page);
      await page.waitForTimeout(1500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  },
  {
    page: 'inbox',
    file: 'reply-message-demo',
    description: 'Replying to a message',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/inbox`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const convo = await page.$('.conversation-item, [class*="conversation-list"] > div:first-child');
      if (convo) { await convo.click(); await page.waitForTimeout(1500); }
      await sanitize(page);
      const input = await page.$('textarea, input[placeholder*="message"], .message-input');
      if (input) { await input.fill('Thanks for reaching out! How can I help?'); await page.waitForTimeout(1500); }
      await page.waitForTimeout(1000);
    }
  },
  {
    page: 'apps',
    file: 'connect-slack-demo',
    description: 'Connecting Slack',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/apps`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const slackCard = await page.$('[data-app="slack"], .app-card:has-text("Slack"), button:has-text("Slack")');
      if (slackCard) { await slackCard.click(); await page.waitForTimeout(2000); }
      await page.waitForTimeout(1500);
      await page.keyboard.press('Escape');
    }
  },
  {
    page: 'custom-functions',
    file: 'add-function-demo',
    description: 'Adding a custom function',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      await sanitize(page);
      const tab = await page.$('[data-tab="functions"], button:has-text("Functions"), .tab-btn:has-text("Functions")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
      await sanitize(page);
      const addBtn = await page.$('button:has-text("Add Function"), button:has-text("Custom Function")');
      if (addBtn) { await addBtn.click(); await page.waitForTimeout(1500); }
      await page.waitForTimeout(2000);
      await page.keyboard.press('Escape');
    }
  },
  {
    page: 'agent-notifications',
    file: 'test-notification-demo',
    description: 'Sending a test notification',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const btn = await page.$('.agent-card, [class*="agent"] a, button:has-text("Open")');
      if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      await sanitize(page);
      const tab = await page.$('[data-tab="notifications"], button:has-text("Notifications"), .tab-btn:has-text("Notifications")');
      if (tab) { await tab.click(); await page.waitForTimeout(1000); }
      await sanitize(page);
      const testBtn = await page.$('button:has-text("Send Test"), button:has-text("Test Notification")');
      if (testBtn) { await testBtn.click(); await page.waitForTimeout(2000); }
      await page.waitForTimeout(1500);
    }
  },
  {
    page: 'guides-make-calls',
    file: 'make-call-demo',
    description: 'Making an outbound call',
    gifConvert: false, // Keep as MP4 (longer)
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/phone`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const dialpad = await page.$('.dialpad, [class*="dialpad"]');
      if (dialpad) {
        for (const digit of '5551234567') {
          const btn = await page.$(`button:has-text("${digit}"), .dialpad-btn:has-text("${digit}")`);
          if (btn) { await btn.click(); await page.waitForTimeout(200); }
        }
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(2000);
    }
  },
  {
    page: 'guides-sms',
    file: 'send-sms-demo',
    description: 'Sending an SMS',
    gifConvert: true,
    actions: async (page, sanitize) => {
      await page.goto(`${BASE_URL}/inbox`);
      await page.waitForTimeout(1500);
      await sanitize(page);
      const composeBtn = await page.$('button:has-text("Compose"), button:has-text("New Message")');
      if (composeBtn) { await composeBtn.click(); await page.waitForTimeout(1000); }
      await page.waitForTimeout(2000);
      await page.keyboard.press('Escape');
    }
  },
];

// ──────────────────────────────────────────────
// Utility functions
// ──────────────────────────────────────────────

async function hideSensitiveInfo(page) {
  await page.evaluate(() => {
    // ── PII Sanitize: replaces phone numbers, emails, names, business names ──
    const fakePhones = [
      '+1 (555) 123-4567', '+1 (555) 234-5678', '+1 (555) 345-6789',
      '+1 (555) 456-7890', '+1 (555) 567-8901', '+1 (555) 678-9012',
      '+1 (555) 789-0123', '+1 (555) 890-1234', '+1 (555) 901-2345',
      '+1 (555) 012-3456', '+1 (555) 111-2222', '+1 (555) 333-4444',
      '+1 (555) 555-6666', '+1 (555) 777-8888', '+1 (555) 999-0000'
    ];
    let phoneIdx = 0;
    const phoneMap = {};
    function getFakePhone(real) {
      const key = real.replace(/\D/g, '');
      if (!phoneMap[key]) { phoneMap[key] = fakePhones[phoneIdx % fakePhones.length]; phoneIdx++; }
      return phoneMap[key];
    }

    const phoneRegex = /\+?1?\s*[\(\[]?\d{3}[\)\]]?\s*[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const rawPhoneRegex = /\+1\d{10}/g;

    // Ordered: longest/most-specific first to avoid partial matches
    const replacements = [
      [/Erik Lagerway/g, 'Demo User'],
      [/Erik/g, 'Demo User'],
      [/Lucas Avilez/g, 'John Smith'],
      [/lucas@hellomd\.com/g, 'john@example.com'],
      [/xlags@icloud\.com/g, 'jane@example.com'],
      [/xlags/g, 'Jane D.'],
      [/Doug\.wall@bell\.net/g, 'caller@example.com'],
      [/Doug/g, 'Caller'],
      [/SeniorHome\s*-\s*Chartwell\s*Avondale/g, 'ExampleCo - Oakwood'],
      [/SeniorHome\.ca/g, 'exampledomain.com'],
      [/seniorhome\.ca/g, 'exampledomain.com'],
      [/SeniorHome\s*Web\s*Chat/g, 'ExampleCo Web Chat'],
      [/SeniorHome\s*Chat/g, 'ExampleCo Chat'],
      [/SeniorHome/g, 'ExampleCo'],
      [/Snapsonic/g, 'Acme Corp'],
      [/snapsonic\.com/g, 'exampledomain.com'],
      [/carneywatch\.ca/gi, 'exampledomain.com'],
      [/CarneyWatch/g, 'WatchCo'],
      [/Carney\s*Watch\s*Agent/g, 'WatchCo Agent'],
      [/Carney\s*Watch/g, 'WatchCo'],
      [/coveblades\.com/gi, 'exampledomain.com'],
      [/Cove\s*Blades/g, 'BladeSharp'],
      [/Snappy\s*Voice/g, 'Support Agent'],
      [/Maggie\s*SMS/g, 'Text Agent'],
      [/helloMD/gi, 'HealthCo'],
      [/HelloMD/g, 'HealthCo'],
      [/conveyr\.ai/gi, 'exampledomain.com'],
      [/Conveyr/g, 'TechCo'],
      [/Convyr/g, 'TechCo'],
      [/homehelper\.ca/gi, 'exampledomain.com'],
      [/Knife Sharpening in Vancouver/g, 'Product Services Guide'],
      [/Find Senior Living in Canada/g, 'Business Directory'],
      [/erik@snapsonic\.com/g, 'user@example.com'],
      [/Emi/g, 'Agent'],
    ];

    const safeEmails = new Set([
      'help@magpipe.ai', 'user@example.com', 'john@example.com',
      'jane@example.com', 'caller@example.com'
    ]);

    // Walk ALL text nodes and replace PII
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      let text = node.nodeValue;
      if (!text || !text.trim()) continue;

      text = text.replace(phoneRegex, (m) => getFakePhone(m));
      text = text.replace(rawPhoneRegex, (m) => getFakePhone(m));

      for (const [pattern, replacement] of replacements) {
        text = text.replace(pattern, replacement);
      }

      // Catch-all email replacement
      text = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, (m) => safeEmails.has(m) ? m : 'user@example.com');

      if (text !== node.nodeValue) node.nodeValue = text;
    }

    // Sanitize input field values (email, phone inputs)
    document.querySelectorAll('input, textarea').forEach(el => {
      if (el.value) {
        el.value = el.value.replace(phoneRegex, (m) => getFakePhone(m));
        el.value = el.value.replace(rawPhoneRegex, (m) => getFakePhone(m));
        for (const [pattern, replacement] of replacements) {
          el.value = el.value.replace(pattern, replacement);
        }
        el.value = el.value.replace(/[\w.-]+@[\w.-]+\.\w+/g, (m) => safeEmails.has(m) ? m : 'user@example.com');
      }
    });

    // Hide "What's New" banner
    document.querySelectorAll('div, section').forEach(el => {
      const t = el.textContent || '';
      if ((t.includes("What's New") || t.includes("WHAT'S NEW")) && el.offsetHeight < 200 && el.offsetWidth < 300) {
        el.style.display = 'none';
      }
    });

    // Hide Intercom widget
    document.querySelectorAll('#intercom-container, .intercom-lightweight-app, [class*="intercom"], iframe[src*="intercom"]').forEach(el => {
      el.style.display = 'none';
    });
  });
}

function convertToGif(mp4Path, gifPath) {
  try {
    // Two-pass for better quality: generate palette then use it
    const palettePath = mp4Path.replace('.mp4', '-palette.png');
    execSync(
      `ffmpeg -y -i "${mp4Path}" -vf "fps=10,scale=960:-1:flags=lanczos,palettegen" "${palettePath}"`,
      { stdio: 'pipe' }
    );
    execSync(
      `ffmpeg -y -i "${mp4Path}" -i "${palettePath}" -lavfi "fps=10,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse" "${gifPath}"`,
      { stdio: 'pipe' }
    );
    // Clean up palette file
    fs.unlinkSync(palettePath);
    console.log(`  ✓ Converted to GIF: ${path.basename(gifPath)}`);
  } catch (err) {
    console.warn(`  ⚠ GIF conversion failed for ${path.basename(mp4Path)}: ${err.message}`);
    console.warn('    Make sure ffmpeg is installed: brew install ffmpeg');
  }
}

// ──────────────────────────────────────────────
// Main capture flow
// ──────────────────────────────────────────────

async function main() {
  console.log(`\n📸 Docs Asset Capture Tool`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Screenshots: ${SCREENSHOTS_DIR}`);
  console.log(`   Videos: ${VIDEOS_DIR}`);
  if (pageFilter) console.log(`   Filter: ${pageFilter}`);
  console.log('');

  const browser = await chromium.launch({
    headless: !manualLogin,
    args: ['--no-sandbox'],
  });

  try {
    // ── Authentication ──
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    if (manualLogin) {
      console.log('🔐 Opening browser for manual login...');
      console.log('   Please log in, then the script will continue automatically.\n');
      await page.goto(`${BASE_URL}/login`);
      // Wait for user to log in and land on an app page (up to 3 minutes)
      await page.waitForURL(url => {
        const p = url.pathname;
        return !p.includes('login') && !p.includes('signup') && p !== '/';
      }, { timeout: 180000 });
      console.log('✅ Authenticated\n');
      await page.waitForTimeout(2000);
    } else {
      console.log('🔐 Authenticating...');
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 15000 });
      console.log('✅ Authenticated\n');
      await page.waitForTimeout(2000);
    }

    // ── Screenshots ──
    if (!videosOnly) {
      console.log('📷 Capturing screenshots...\n');
      const screenshots = pageFilter
        ? SCREENSHOTS.filter(s => s.page === pageFilter)
        : SCREENSHOTS;

      for (const shot of screenshots) {
        const filePath = path.join(SCREENSHOTS_DIR, shot.file);
        try {
          // Setup (navigate to the right state)
          if (shot.setup) {
            await shot.setup(page);
          } else if (shot.path) {
            await page.goto(`${BASE_URL}${shot.path}`);
          }
          await page.waitForTimeout(shot.wait || 1500);

          // Pre-screenshot action (open a modal, click something, etc.)
          if (shot.action) {
            await shot.action(page);
          }

          await hideSensitiveInfo(page);
          await page.screenshot({ path: filePath });
          console.log(`  ✓ ${shot.file}`);
        } catch (err) {
          console.warn(`  ✗ ${shot.file}: ${err.message}`);
        }
      }
      console.log('');
    }

    // ── Video clips ──
    if (!screenshotsOnly) {
      console.log('🎬 Capturing video clips...\n');
      const videos = pageFilter
        ? VIDEO_CAPTURES.filter(v => v.page === pageFilter)
        : VIDEO_CAPTURES;

      // Save cookies from authenticated session for video contexts
      const cookies = await context.cookies();

      for (const video of videos) {
        const mp4Path = path.join(VIDEOS_DIR, `${video.file}.mp4`);
        try {
          // Create a new context with video recording + existing auth cookies
          const videoContext = await browser.newContext({
            viewport: VIEWPORT,
            recordVideo: {
              dir: VIDEOS_DIR,
              size: VIEWPORT,
            },
          });
          await videoContext.addCookies(cookies);
          const videoPage = await videoContext.newPage();

          // Also inject localStorage auth if available
          const storageState = await page.evaluate(() => {
            const keys = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k.includes('supabase') || k.includes('auth') || k.includes('sb-')) {
                keys[k] = localStorage.getItem(k);
              }
            }
            return keys;
          });

          await videoPage.goto(`${BASE_URL}/home`);
          await videoPage.evaluate((state) => {
            for (const [k, v] of Object.entries(state)) {
              localStorage.setItem(k, v);
            }
          }, storageState);
          await videoPage.reload();
          await videoPage.waitForTimeout(2000);

          // Sanitize BEFORE actions start so all recorded frames are clean
          await hideSensitiveInfo(videoPage);
          await videoPage.waitForTimeout(300);

          // Run the video actions (pass sanitize fn so actions can re-apply after navigation)
          await video.actions(videoPage, hideSensitiveInfo);

          // Final sanitize pass
          await hideSensitiveInfo(videoPage);
          await videoPage.waitForTimeout(500);

          // Close context to save the video
          await videoContext.close();

          // Rename the auto-generated video file to our desired name
          const videoFiles = fs.readdirSync(VIDEOS_DIR)
            .filter(f => f.endsWith('.webm'))
            .map(f => ({
              name: f,
              path: path.join(VIDEOS_DIR, f),
              mtime: fs.statSync(path.join(VIDEOS_DIR, f)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);

          if (videoFiles.length > 0) {
            const latestVideo = videoFiles[0].path;
            // Convert WebM to MP4
            try {
              execSync(`ffmpeg -y -i "${latestVideo}" -c:v libx264 -preset fast -crf 23 "${mp4Path}"`, { stdio: 'pipe' });
              fs.unlinkSync(latestVideo); // Remove the .webm
              console.log(`  ✓ ${video.file}.mp4 — ${video.description}`);
            } catch {
              // If ffmpeg fails, just rename the webm
              fs.renameSync(latestVideo, mp4Path.replace('.mp4', '.webm'));
              console.log(`  ✓ ${video.file}.webm (ffmpeg not available for MP4 conversion)`);
            }
          }

          // Convert to GIF if requested
          if (video.gifConvert && fs.existsSync(mp4Path)) {
            const gifPath = path.join(SCREENSHOTS_DIR, `${video.file}.gif`);
            convertToGif(mp4Path, gifPath);
          }
        } catch (err) {
          console.warn(`  ✗ ${video.file}: ${err.message}`);
        }
      }
      console.log('');
    }

    console.log('🎉 Capture complete!\n');

    // Summary
    const pngs = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    const gifs = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.gif'));
    const mp4s = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.mp4'));
    console.log(`📊 Summary:`);
    console.log(`   ${pngs.length} screenshots (.png)`);
    console.log(`   ${gifs.length} GIF clips (.gif)`);
    console.log(`   ${mp4s.length} video clips (.mp4)`);

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
