/**
 * PII Sanitize function — injected via page.evaluate() before screenshots.
 * Replaces phone numbers, emails, names, business names with safe fake data.
 * Used by both the Playwright MCP browser captures and capture-docs-assets.js.
 */
export function sanitizePII() {
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
    if (!phoneMap[key]) {
      phoneMap[key] = fakePhones[phoneIdx % fakePhones.length];
      phoneIdx++;
    }
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
  ];

  const safeEmails = new Set([
    'help@magpipe.ai', 'user@example.com', 'john@example.com',
    'jane@example.com', 'caller@example.com'
  ]);

  // Walk ALL text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    let text = node.nodeValue;
    if (!text || !text.trim()) continue;

    text = text.replace(phoneRegex, (m) => getFakePhone(m));
    text = text.replace(rawPhoneRegex, (m) => getFakePhone(m));

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    // Catch-all emails
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
    if (t.includes("What's New") || t.includes("WHAT'S NEW")) {
      if (el.offsetHeight < 200 && el.offsetWidth < 300) el.style.display = 'none';
    }
  });

  // Hide Intercom widget
  document.querySelectorAll('#intercom-container, .intercom-lightweight-app, [class*="intercom"], iframe[src*="intercom"]').forEach(el => {
    el.style.display = 'none';
  });
}
