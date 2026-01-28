/**
 * AddCustomMcpServer Component
 * Modal for adding custom MCP servers
 */

import { supabase } from '../lib/supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Show the Add Custom MCP Server modal
 * @param {object} options - Modal options
 * @param {function} options.onSuccess - Callback when server is added successfully
 * @param {function} options.onCancel - Callback when modal is cancelled
 * @returns {HTMLElement} The modal element
 */
export function showAddCustomMcpServerModal({ onSuccess, onCancel }) {
  // Add modal styles
  addAddCustomMcpServerStyles();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'mcp-modal-overlay';
  overlay.innerHTML = `
    <div class="mcp-modal">
      <div class="mcp-modal-header">
        <h3>Add Custom MCP Server</h3>
        <button class="mcp-modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="mcp-modal-body">
        <form id="add-mcp-server-form">
          <div class="mcp-form-group">
            <label for="mcp-server-url">Server URL <span class="required">*</span></label>
            <input
              type="url"
              id="mcp-server-url"
              name="server_url"
              placeholder="https://mcp.example.com/v1"
              required
            />
            <div class="mcp-form-hint">Must be HTTPS. No localhost or internal addresses.</div>
          </div>

          <div class="mcp-form-group">
            <label for="mcp-server-name">Display Name <span class="required">*</span></label>
            <input
              type="text"
              id="mcp-server-name"
              name="name"
              placeholder="My MCP Server"
              required
            />
          </div>

          <div class="mcp-form-group">
            <label for="mcp-server-description">Description</label>
            <input
              type="text"
              id="mcp-server-description"
              name="description"
              placeholder="What does this server do?"
            />
          </div>

          <div class="mcp-form-group">
            <label for="mcp-auth-type">Authentication</label>
            <select id="mcp-auth-type" name="auth_type">
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
            </select>
          </div>

          <div class="mcp-form-group mcp-api-key-group" style="display: none;">
            <label for="mcp-api-key">API Key</label>
            <input
              type="password"
              id="mcp-api-key"
              name="api_key"
              placeholder="Enter your API key"
            />
            <div class="mcp-form-hint">Your key is encrypted at rest.</div>
          </div>

          <div id="mcp-test-result" class="mcp-test-result" style="display: none;"></div>
        </form>
      </div>
      <div class="mcp-modal-footer">
        <button type="button" class="btn btn-secondary" id="mcp-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-secondary" id="mcp-test-btn">Test Connection</button>
        <button type="button" class="btn btn-primary" id="mcp-save-btn" disabled>Add Server</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Get form elements
  const form = overlay.querySelector('#add-mcp-server-form');
  const urlInput = overlay.querySelector('#mcp-server-url');
  const nameInput = overlay.querySelector('#mcp-server-name');
  const descriptionInput = overlay.querySelector('#mcp-server-description');
  const authTypeSelect = overlay.querySelector('#mcp-auth-type');
  const apiKeyGroup = overlay.querySelector('.mcp-api-key-group');
  const apiKeyInput = overlay.querySelector('#mcp-api-key');
  const testResultDiv = overlay.querySelector('#mcp-test-result');
  const testBtn = overlay.querySelector('#mcp-test-btn');
  const saveBtn = overlay.querySelector('#mcp-save-btn');
  const cancelBtn = overlay.querySelector('#mcp-cancel-btn');
  const closeBtn = overlay.querySelector('.mcp-modal-close');

  let lastTestResult = null;

  // Toggle API key field visibility
  authTypeSelect.addEventListener('change', () => {
    const needsKey = authTypeSelect.value !== 'none';
    apiKeyGroup.style.display = needsKey ? 'block' : 'none';
    if (needsKey) {
      apiKeyInput.required = true;
    } else {
      apiKeyInput.required = false;
      apiKeyInput.value = '';
    }
  });

  // Test connection
  testBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const authType = authTypeSelect.value;
    const apiKey = apiKeyInput.value.trim();

    if (!url) {
      showTestResult(testResultDiv, 'error', 'Please enter a server URL');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    showTestResult(testResultDiv, 'loading', 'Connecting to server...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'validate',
          server_url: url,
          auth_type: authType,
          api_key: apiKey || undefined,
        }),
      });

      const result = await response.json();

      if (result.valid) {
        lastTestResult = result;
        showTestResult(
          testResultDiv,
          'success',
          `Connection successful! Found ${result.tools_count} tool${result.tools_count !== 1 ? 's' : ''}.`
        );
        saveBtn.disabled = false;

        // Show discovered tools
        if (result.tools && result.tools.length > 0) {
          const toolsList = result.tools.slice(0, 5).map(t => `• ${t.name}`).join('\n');
          const moreText = result.tools.length > 5 ? `\n...and ${result.tools.length - 5} more` : '';
          showTestResult(
            testResultDiv,
            'success',
            `Connection successful! Found ${result.tools_count} tool${result.tools_count !== 1 ? 's' : ''}:\n${toolsList}${moreText}`
          );
        }
      } else {
        lastTestResult = null;
        saveBtn.disabled = true;
        showTestResult(testResultDiv, 'error', result.error || 'Connection failed');
      }
    } catch (error) {
      lastTestResult = null;
      saveBtn.disabled = true;
      showTestResult(testResultDiv, 'error', error.message || 'Connection failed');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
    }
  });

  // Save server
  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const authType = authTypeSelect.value;
    const apiKey = apiKeyInput.value.trim();

    if (!url || !name) {
      showTestResult(testResultDiv, 'error', 'Please fill in all required fields');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Adding...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'add',
          server_url: url,
          name,
          description: description || undefined,
          auth_type: authType,
          api_key: apiKey || undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        closeModal();
        if (onSuccess) onSuccess(result.server);
      } else {
        showTestResult(testResultDiv, 'error', result.error || 'Failed to add server');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add Server';
      }
    } catch (error) {
      showTestResult(testResultDiv, 'error', error.message || 'Failed to add server');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add Server';
    }
  });

  // Close modal handlers
  const closeModal = () => {
    overlay.remove();
  };

  closeBtn.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  cancelBtn.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      if (onCancel) onCancel();
    }
  });

  // Focus the URL input
  urlInput.focus();

  return overlay;
}

function showTestResult(container, type, message) {
  container.style.display = 'block';
  container.className = `mcp-test-result mcp-test-${type}`;
  container.textContent = message;
}

/**
 * Add styles for the Add Custom MCP Server modal
 */
export function addAddCustomMcpServerStyles() {
  if (document.getElementById('add-custom-mcp-server-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'add-custom-mcp-server-styles';
  styles.textContent = `
    .mcp-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .mcp-modal {
      background: var(--bg-primary);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    .mcp-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .mcp-modal-header h3 {
      margin: 0;
      font-size: 1.125rem;
    }

    .mcp-modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 0.25rem;
      line-height: 1;
    }

    .mcp-modal-close:hover {
      color: var(--text-primary);
    }

    .mcp-modal-body {
      padding: 1.5rem;
      overflow-y: auto;
    }

    .mcp-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }

    .mcp-form-group {
      margin-bottom: 1.25rem;
    }

    .mcp-form-group:last-child {
      margin-bottom: 0;
    }

    .mcp-form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
    }

    .mcp-form-group label .required {
      color: var(--error-color);
    }

    .mcp-form-group input,
    .mcp-form-group select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 1rem;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .mcp-form-group input:focus,
    .mcp-form-group select:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .mcp-form-hint {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      margin-top: 0.375rem;
    }

    .mcp-test-result {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      white-space: pre-line;
      margin-top: 1rem;
    }

    .mcp-test-loading {
      background: var(--bg-secondary);
      color: var(--text-secondary);
    }

    .mcp-test-success {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
    }

    .mcp-test-error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    @media (max-width: 600px) {
      .mcp-modal-footer {
        flex-wrap: wrap;
      }

      .mcp-modal-footer .btn {
        flex: 1;
        min-width: 100px;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default {
  showAddCustomMcpServerModal,
  addAddCustomMcpServerStyles,
};
