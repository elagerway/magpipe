/**
 * Chat Widget Settings Page
 * Configure chat widget appearance and behavior
 */

import { ChatWidget } from '../models/index.js';
import { getCurrentUser } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class ChatWidgetSettingsPage {
  constructor() {
    this.widget = null;
    this.agentId = null;
    this.saveTimeout = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      window.router.navigate('/login');
      return;
    }

    // Get widget ID from URL params
    const widgetId = window.router.currentParams?.id;
    if (!widgetId) {
      window.router.navigate('/agents');
      return;
    }

    // Load widget data
    const { widget, error } = await ChatWidget.getById(widgetId);
    if (error || !widget) {
      console.error('Error loading widget:', error);
      window.router.navigate('/agents');
      return;
    }

    this.widget = widget;
    this.agentId = widget.agent_id;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 1.5rem 1rem;">
        <style>
          .back-btn {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.5rem;
            margin-left: -0.5rem;
            font-size: 0.9rem;
            transition: color 0.2s;
          }
          .back-btn:hover {
            color: var(--primary-color);
          }
        </style>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <button class="back-btn" id="back-btn">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Agents / Deployment
          </button>
          <div id="save-status" style="font-size: 0.75rem; color: var(--text-tertiary);"></div>
        </div>
        <h1 style="margin: 0 0 0.25rem 0; font-size: 1.5rem;">Chat Widget Settings</h1>
        <p style="margin: 0 0 1.5rem 0; color: var(--text-secondary); font-size: 0.875rem;">${widget.name || 'Website Chat'}</p>

        <form id="widget-settings-form">
          <!-- Support Agent Mode -->
          <div class="settings-section" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; padding: 1.25rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <div class="toggle-row" style="margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span style="font-weight: 600;">MAGPIPE Support Agent</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-support-agent" ${widget.is_support_agent ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <p class="form-help" style="margin: 0;">Enable this to make the agent an expert on MAGPIPE - it will know how to help users with calls, SMS, phone numbers, MCP servers, integrations, and all app features.</p>
            </div>
          </div>

          <!-- Basic Settings -->
          <div class="settings-section">
            <h3 class="settings-section-title">Basic Settings</h3>

            <div class="form-group">
              <label class="form-label">Widget Name</label>
              <input type="text" id="widget-name" class="form-input" value="${widget.name || ''}" placeholder="Website Chat" />
              <p class="form-help">Internal name to identify this widget</p>
            </div>

            <div class="form-group">
              <label class="form-label">Agent Name</label>
              <input type="text" id="widget-agent-name" class="form-input" value="${widget.agent_name || ''}" placeholder="${widget.agent_configs?.name || 'Assistant'}" />
              <p class="form-help">The name the agent uses to introduce itself (defaults to "${widget.agent_configs?.name || 'the assigned agent name'}")</p>
            </div>

            <div class="form-group">
              <label class="form-label">Status</label>
              <div class="toggle-row">
                <span>Widget Active</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-active" ${widget.is_active ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <p class="form-help">When disabled, the widget won't respond to messages</p>
            </div>
          </div>

          <!-- Appearance -->
          <div class="settings-section">
            <h3 class="settings-section-title">Appearance</h3>

            <div class="form-group">
              <label class="form-label">Primary Color</label>
              <div style="display: flex; gap: 0.75rem; align-items: center;">
                <input type="color" id="widget-color" value="${widget.primary_color || '#6366f1'}" style="width: 60px; height: 44px; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; padding: 4px;" />
                <input type="text" id="widget-color-hex" class="form-input" value="${widget.primary_color || '#6366f1'}" style="width: 120px; font-family: monospace;" />
              </div>
              <p class="form-help">Used for the chat bubble and message styling</p>
            </div>

            <div class="form-group">
              <label class="form-label">Position</label>
              <div class="position-selector" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                <label class="position-option ${widget.position === 'top-left' ? 'selected' : ''}">
                  <input type="radio" name="widget-position" value="top-left" ${widget.position === 'top-left' ? 'checked' : ''} />
                  <span class="position-label">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2"/>
                      <circle cx="6" cy="6" r="2.5" fill="currentColor" stroke="none"/>
                    </svg>
                    Top Left
                  </span>
                </label>
                <label class="position-option ${widget.position === 'top-right' ? 'selected' : ''}">
                  <input type="radio" name="widget-position" value="top-right" ${widget.position === 'top-right' ? 'checked' : ''} />
                  <span class="position-label">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2"/>
                      <circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none"/>
                    </svg>
                    Top Right
                  </span>
                </label>
                <label class="position-option ${widget.position === 'bottom-left' ? 'selected' : ''}">
                  <input type="radio" name="widget-position" value="bottom-left" ${widget.position === 'bottom-left' ? 'checked' : ''} />
                  <span class="position-label">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2"/>
                      <circle cx="6" cy="18" r="2.5" fill="currentColor" stroke="none"/>
                    </svg>
                    Bottom Left
                  </span>
                </label>
                <label class="position-option ${(!widget.position || widget.position === 'bottom-right') ? 'selected' : ''}">
                  <input type="radio" name="widget-position" value="bottom-right" ${(!widget.position || widget.position === 'bottom-right') ? 'checked' : ''} />
                  <span class="position-label">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="2" width="20" height="20" rx="2"/>
                      <circle cx="18" cy="18" r="2.5" fill="currentColor" stroke="none"/>
                    </svg>
                    Bottom Right
                  </span>
                </label>
              </div>
              <p class="form-help">Where the chat bubble appears on the page</p>
            </div>

            <div class="form-group">
              <label class="form-label">Offset (pixels)</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                  <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Horizontal (from edge)</label>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button type="button" class="btn btn-sm btn-secondary offset-btn" data-target="offset-x" data-delta="-5" style="padding: 0.25rem 0.5rem;">−5</button>
                    <input type="number" id="offset-x" class="form-input" value="${widget.offset_x ?? 20}" min="0" max="200" style="width: 70px; text-align: center;" />
                    <button type="button" class="btn btn-sm btn-secondary offset-btn" data-target="offset-x" data-delta="5" style="padding: 0.25rem 0.5rem;">+5</button>
                  </div>
                </div>
                <div>
                  <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Vertical (from edge)</label>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button type="button" class="btn btn-sm btn-secondary offset-btn" data-target="offset-y" data-delta="-5" style="padding: 0.25rem 0.5rem;">−5</button>
                    <input type="number" id="offset-y" class="form-input" value="${widget.offset_y ?? 20}" min="0" max="200" style="width: 70px; text-align: center;" />
                    <button type="button" class="btn btn-sm btn-secondary offset-btn" data-target="offset-y" data-delta="5" style="padding: 0.25rem 0.5rem;">+5</button>
                  </div>
                </div>
              </div>
              <p class="form-help">Distance from the edge of the screen in pixels</p>
            </div>

            <div class="form-group">
              <label class="form-label">Widget Preview</label>
              <div id="widget-preview" style="background: var(--bg-secondary); border-radius: 12px; padding: 1.5rem; display: flex; min-height: 100px; ${this.getPreviewAlignment(widget.position)}">
                <div id="preview-bubble" style="width: 56px; height: 56px; border-radius: 50%; background: ${widget.primary_color || '#6366f1'}; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.22.84.85-3.12-.2-.32C4.46 15.12 4 13.61 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Hide Widget on Pages</label>
              <p class="form-help" style="margin-bottom: 0.75rem;">Select portal pages where the widget should be hidden</p>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${this.getPortalPages().map(page => `
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" class="hidden-page-checkbox" value="${page.path}" ${(widget.hidden_portal_pages || ['/agent', '/inbox']).includes(page.path) ? 'checked' : ''} style="width: 16px; height: 16px;" />
                    <span style="font-size: 0.875rem;">${page.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-tertiary);">${page.path}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Messages -->
          <div class="settings-section">
            <h3 class="settings-section-title">Messages</h3>

            <div class="form-group">
              <div class="toggle-row">
                <div>
                  <span>AI-Generated Greeting</span>
                  <p class="form-help" style="margin: 0.25rem 0 0 0;">Let the AI create personalized greetings using visitor info</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-ai-greeting" ${widget.use_ai_greeting !== false ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="form-group" id="welcome-message-group">
              <label class="form-label">Welcome Message</label>
              <textarea id="widget-welcome" class="form-textarea" rows="3" placeholder="Hi! How can I help you today?">${widget.welcome_message || ''}</textarea>
              <p class="form-help">Shown when visitors first open the chat (used as fallback when AI greeting is enabled)</p>
            </div>

            <div class="form-group">
              <label class="form-label">Offline Message</label>
              <textarea id="widget-offline" class="form-textarea" rows="2" placeholder="Leave a message and we'll get back to you.">${widget.offline_message || ''}</textarea>
              <p class="form-help">Shown when the widget is inactive</p>
            </div>
          </div>

          <!-- Data Collection -->
          <div class="settings-section">
            <h3 class="settings-section-title">Data Collection</h3>

            <div class="form-group">
              <div class="toggle-row">
                <div>
                  <span>Auto-collect from Logged-in Users</span>
                  <p class="form-help" style="margin: 0.25rem 0 0 0;">Automatically use profile data for logged-in portal users</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-auto-collect" ${widget.auto_collect_user_data !== false ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <div class="toggle-row">
                <div>
                  <span>Collect Visitor Name</span>
                  <p class="form-help" style="margin: 0.25rem 0 0 0;">Ask visitors for their name before starting chat</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-collect-name" ${widget.collect_visitor_name ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <div class="toggle-row">
                <div>
                  <span>Collect Visitor Email</span>
                  <p class="form-help" style="margin: 0.25rem 0 0 0;">Ask visitors for their email before starting chat</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-collect-email" ${widget.collect_visitor_email ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <!-- Security -->
          <div class="settings-section">
            <h3 class="settings-section-title">Security</h3>

            <div class="form-group">
              <label class="form-label">Allowed Domains</label>
              <input type="text" id="widget-domains" class="form-input" value="${(widget.allowed_domains || []).join(', ')}" placeholder="example.com, app.example.com" />
              <p class="form-help">Comma-separated list of domains where the widget can be embedded. Leave empty to allow any domain.</p>
            </div>
          </div>

          <!-- Portal Settings -->
          <div class="settings-section">
            <h3 class="settings-section-title">Portal Integration</h3>

            <div class="form-group">
              <div class="toggle-row">
                <div>
                  <span>Show on Portal</span>
                  <p class="form-help" style="margin: 0.25rem 0 0 0;">Display this widget on your MAGPIPE dashboard</p>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="widget-portal" ${widget.is_portal_widget ? 'checked' : ''} />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div style="padding-bottom: 2rem;"></div>
        </form>
      </div>

      ${renderBottomNav('agents')}
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
      this.navigateBack();
    });

    // Color picker sync
    const colorPicker = document.getElementById('widget-color');
    const colorHex = document.getElementById('widget-color-hex');
    const previewBubble = document.getElementById('preview-bubble');

    colorPicker.addEventListener('input', (e) => {
      colorHex.value = e.target.value;
      previewBubble.style.background = e.target.value;
      this.autoSave();
    });

    colorHex.addEventListener('input', (e) => {
      const hex = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colorPicker.value = hex;
        previewBubble.style.background = hex;
      }
      this.autoSave();
    });

    // Live widget position update function
    const updateWidgetPosition = () => {
      const offsetX = parseInt(document.getElementById('offset-x').value, 10) || 20;
      const offsetY = parseInt(document.getElementById('offset-y').value, 10) || 20;
      const position = document.querySelector('input[name="widget-position"]:checked')?.value || 'bottom-right';
      const isBottom = position.includes('bottom');
      const isRight = position.includes('right');

      // Update live widget bubble
      const bubble = document.querySelector('.solo-chat-bubble');
      if (bubble) {
        bubble.style.top = isBottom ? 'auto' : `${offsetY}px`;
        bubble.style.bottom = isBottom ? `${offsetY}px` : 'auto';
        bubble.style.left = isRight ? 'auto' : `${offsetX}px`;
        bubble.style.right = isRight ? `${offsetX}px` : 'auto';
      }

      // Update live widget modal
      const modal = document.querySelector('.solo-chat-modal');
      if (modal) {
        modal.style.top = isBottom ? 'auto' : `${offsetY + 70}px`;
        modal.style.bottom = isBottom ? `${offsetY + 70}px` : 'auto';
        modal.style.left = isRight ? 'auto' : `${offsetX}px`;
        modal.style.right = isRight ? `${offsetX}px` : 'auto';
      }
    };

    // Position selector
    const positionOptions = document.querySelectorAll('input[name="widget-position"]');
    const widgetPreview = document.getElementById('widget-preview');

    positionOptions.forEach(option => {
      option.addEventListener('change', (e) => {
        // Update selected state on labels
        document.querySelectorAll('.position-option').forEach(opt => opt.classList.remove('selected'));
        e.target.closest('.position-option').classList.add('selected');

        // Update preview alignment
        const position = e.target.value;
        widgetPreview.style.cssText = `background: var(--bg-secondary); border-radius: 12px; padding: 1.5rem; display: flex; min-height: 100px; ${this.getPreviewAlignment(position)}`;

        // Update live widget position
        updateWidgetPosition();
        this.autoSave();
      });
    });

    // Offset buttons
    document.querySelectorAll('.offset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const delta = parseInt(btn.dataset.delta, 10);
        const input = document.getElementById(targetId);
        const newValue = Math.max(0, Math.min(200, parseInt(input.value, 10) + delta));
        input.value = newValue;
        updateWidgetPosition();
        this.autoSave();
      });
    });

    // Also update on manual input change
    document.getElementById('offset-x').addEventListener('input', () => {
      updateWidgetPosition();
      this.autoSave();
    });
    document.getElementById('offset-y').addEventListener('input', () => {
      updateWidgetPosition();
      this.autoSave();
    });

    // Track changes on all inputs and auto-save
    const form = document.getElementById('widget-settings-form');
    form.querySelectorAll('input, textarea').forEach(input => {
      // Skip inputs we've already handled
      if (['widget-color', 'widget-color-hex', 'offset-x', 'offset-y'].includes(input.id) ||
          input.name === 'widget-position') {
        return;
      }
      input.addEventListener('change', () => this.autoSave());
      if (input.tagName === 'TEXTAREA' || input.type === 'text') {
        input.addEventListener('input', () => this.autoSave());
      }
    });

    // Prevent form submit
    form.addEventListener('submit', (e) => e.preventDefault());
  }

  getPreviewAlignment(position) {
    switch (position) {
      case 'top-left':
        return 'justify-content: flex-start; align-items: flex-start;';
      case 'top-right':
        return 'justify-content: flex-end; align-items: flex-start;';
      case 'bottom-left':
        return 'justify-content: flex-start; align-items: flex-end;';
      case 'bottom-right':
      default:
        return 'justify-content: flex-end; align-items: flex-end;';
    }
  }

  getPortalPages() {
    return [
      { path: '/home', name: 'Home' },
      { path: '/agent', name: 'Agent' },
      { path: '/inbox', name: 'Inbox' },
      { path: '/knowledge', name: 'Knowledge' },
      { path: '/numbers', name: 'Phone Numbers' },
      { path: '/settings', name: 'Settings' },
    ];
  }

  navigateBack() {
    if (this.agentId) {
      window.router.navigate(`/agents/${this.agentId}?tab=deployment`);
    } else {
      window.router.navigate('/agents');
    }
  }

  autoSave() {
    // Debounce saves - wait 500ms after last change
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    const statusEl = document.getElementById('save-status');
    statusEl.textContent = 'Saving...';
    statusEl.style.color = 'var(--text-tertiary)';

    this.saveTimeout = setTimeout(() => this.saveSettings(), 500);
  }

  async saveSettings() {
    const statusEl = document.getElementById('save-status');

    // Collect form data
    const domainsInput = document.getElementById('widget-domains').value.trim();
    const allowedDomains = domainsInput
      ? domainsInput.split(',').map(d => d.trim()).filter(d => d)
      : [];

    // Collect hidden portal pages
    const hiddenPages = Array.from(document.querySelectorAll('.hidden-page-checkbox:checked'))
      .map(cb => cb.value);

    const updates = {
      name: document.getElementById('widget-name').value.trim() || 'Website Chat',
      agent_name: document.getElementById('widget-agent-name').value.trim() || null,
      is_active: document.getElementById('widget-active').checked,
      is_support_agent: document.getElementById('widget-support-agent').checked,
      primary_color: document.getElementById('widget-color').value,
      position: document.querySelector('input[name="widget-position"]:checked')?.value || 'bottom-right',
      offset_x: parseInt(document.getElementById('offset-x').value, 10) || 20,
      offset_y: parseInt(document.getElementById('offset-y').value, 10) || 20,
      use_ai_greeting: document.getElementById('widget-ai-greeting').checked,
      welcome_message: document.getElementById('widget-welcome').value.trim(),
      offline_message: document.getElementById('widget-offline').value.trim(),
      auto_collect_user_data: document.getElementById('widget-auto-collect').checked,
      collect_visitor_name: document.getElementById('widget-collect-name').checked,
      collect_visitor_email: document.getElementById('widget-collect-email').checked,
      allowed_domains: allowedDomains,
      is_portal_widget: document.getElementById('widget-portal').checked,
      hidden_portal_pages: hiddenPages,
    };

    const { widget, error } = await ChatWidget.update(this.widget.id, updates);

    if (error) {
      console.error('Error saving widget:', error);
      statusEl.textContent = 'Failed to save';
      statusEl.style.color = 'var(--error-color)';
    } else {
      this.widget = widget;
      statusEl.textContent = 'Saved';
      statusEl.style.color = 'var(--success-color)';

      // Fade out after 2 seconds
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  }
}
