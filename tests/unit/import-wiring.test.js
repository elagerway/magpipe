/**
 * Verify that all files that previously had inline escapeHtml/formatPhoneNumber/getInitials
 * now import from src/lib/formatters.js and do NOT define their own copies.
 *
 * Also verify no orphaned this.escapeHtml / this.formatPhoneNumber / this.getInitials
 * references remain without a corresponding import.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(process.cwd(), 'src');

// Files that were changed to import from formatters.js
const MIGRATED_FILES = [
  'components/ConfirmModal.js',
  'components/OutboundTemplateModal.js',
  'components/OmniChatInterface.js',
  'components/BottomNav.js',
  'pages/settings.js',
  'pages/agent-config.js',
  'pages/batch-calls.js',
  'pages/admin-batches.js',
  'pages/manage-numbers.js',
  'pages/contacts.js',
  'pages/select-number.js',
  'pages/inbox/views.js',
  'pages/inbox/listeners.js',
  'pages/inbox/messaging.js',
  'pages/admin/support-tab.js',
  'pages/admin/monitor-tab.js',
  'pages/agent-detail/index.js',
  'pages/agent-detail/deployment-tab.js',
  'pages/phone/call-handler.js',
];


describe('Import wiring: formatters.js', () => {
  for (const relPath of MIGRATED_FILES) {
    const filePath = path.join(SRC, relPath);

    // Skip files that don't exist (in case of restructuring)
    if (!fs.existsSync(filePath)) continue;
    const code = fs.readFileSync(filePath, 'utf8');

    describe(relPath, () => {
      it('imports from formatters.js', () => {
        expect(code).toMatch(/from ['"].*lib\/formatters\.js['"]/);
      });

      it('does NOT define its own escapeHtml method', () => {
        // Match standalone function def or class method def
        // But allow the import statement itself
        const lines = code.split('\n');
        const defLines = lines.filter(line =>
          // Matches: escapeHtml(text) {  or  escapeHtml(str) {
          /^\s+(escapeHtml|escapeHtml)\s*\((text|str)\)\s*\{/.test(line) ||
          // Matches: function escapeHtml(text) {
          /^\s*function\s+escapeHtml\s*\(/.test(line)
        );
        expect(defLines).toHaveLength(0);
      });

      it('does NOT define its own formatPhoneNumber method', () => {
        const lines = code.split('\n');
        const defLines = lines.filter(line =>
          /^\s+formatPhoneNumber\s*\((phone|phoneNumber)\)\s*\{/.test(line) ||
          /^\s*function\s+formatPhoneNumber\s*\(/.test(line)
        );
        expect(defLines).toHaveLength(0);
      });

      it('does NOT define its own getInitials(name, email) method', () => {
        const lines = code.split('\n');
        const defLines = lines.filter(line =>
          // Match getInitials(name, ...) or function getInitials(name, ...)
          // But NOT getInitials(phone) which is a different function in inbox/views.js
          (/^\s+getInitials\s*\(name\s*(,|\))\s*/.test(line) && line.includes('{')) ||
          /^\s*function\s+getInitials\s*\(name/.test(line)
        );
        expect(defLines).toHaveLength(0);
      });
    });
  }
});


describe('No orphaned this.* references without import', () => {
  function findJsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes('node_modules')) {
        results.push(...findJsFiles(full));
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
        results.push(full);
      }
    }
    return results;
  }

  const allFiles = findJsFiles(SRC);
  const orphans = [];

  for (const filePath of allFiles) {
    const code = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(SRC, filePath);
    const hasImport = /from ['"].*lib\/formatters\.js['"]/.test(code);

    if (code.includes('this.escapeHtml(') && !hasImport) {
      orphans.push(`${rel}: this.escapeHtml without formatters import`);
    }
    if (code.includes('this.formatPhoneNumber(') && !hasImport) {
      orphans.push(`${rel}: this.formatPhoneNumber without formatters import`);
    }
  }

  it('no files use this.escapeHtml or this.formatPhoneNumber without a formatters import', () => {
    expect(orphans).toEqual([]);
  });
});


describe('Dead code removal verification', () => {
  it('functions-tab.js does not contain renderAppFunctionsSection', () => {
    const code = fs.readFileSync(path.join(SRC, 'pages/agent-detail/functions-tab.js'), 'utf8');
    expect(code).not.toContain('renderAppFunctionsSection');
  });

  it('notifications-tab.js does not contain renderAppNotificationCards', () => {
    const code = fs.readFileSync(path.join(SRC, 'pages/agent-detail/notifications-tab.js'), 'utf8');
    expect(code).not.toContain('renderAppNotificationCards');
  });

  it('agent-config.js does not contain isLiveKitActive', () => {
    const code = fs.readFileSync(path.join(SRC, 'pages/agent-config.js'), 'utf8');
    expect(code).not.toContain('isLiveKitActive');
  });

  it('settings.js does not contain PII console.log', () => {
    const code = fs.readFileSync(path.join(SRC, 'pages/settings.js'), 'utf8');
    expect(code).not.toMatch(/console\.log\(['"]Profile data/);
  });
});
