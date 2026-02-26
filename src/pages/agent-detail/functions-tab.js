import { supabase } from '../../lib/supabase.js';
import { CustomFunction } from '../../models/CustomFunction.js';
import { SemanticMatchAction } from '../../models/SemanticMatchAction.js';
import { showToast } from '../../lib/toast.js';

export const functionsTabMethods = {
  renderFunctionsTab() {
    return `
      <div class="config-section">
        <h3>Built-in Functions</h3>
        <p class="section-desc">Enable capabilities for your agent.</p>

        <div class="function-toggles">
          <div class="function-toggle sms-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-sms" ${this.agent.functions?.sms?.enabled ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">Send SMS</span>
                <span class="toggle-desc">Allow agent to send text messages</span>
              </div>
            </label>
            <button id="configure-sms-btn" type="button" class="configure-btn">Configure</button>
          </div>

          <div class="function-toggle transfer-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-transfer" ${this.agent.functions?.transfer?.enabled ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">Transfer Calls</span>
                <span class="toggle-desc">Allow agent to transfer calls to another number</span>
              </div>
            </label>
            <button id="configure-transfer-btn" type="button" class="configure-btn">Configure</button>
          </div>

          <div class="function-toggle booking-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-booking" ${this.isCalComConnected && this.agent.functions?.booking?.enabled ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">Book Appointments</span>
                <span class="toggle-desc">Allow agent to schedule appointments (requires Cal.com)</span>
              </div>
            </label>
            <button id="configure-booking-btn" type="button" class="configure-btn">Configure</button>
          </div>

          <div class="function-toggle extract-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-extract" ${this.agent.functions?.extract_data?.enabled ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">Extract Data</span>
                <span class="toggle-desc">Extract structured data from conversations (name, email, etc.)</span>
              </div>
            </label>
            <button id="configure-extract-btn" type="button" class="configure-btn">Configure</button>
          </div>

          <div class="function-toggle end-call-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-end-call" ${this.agent.functions?.end_call?.enabled !== false ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">End Call</span>
                <span class="toggle-desc">Allow agent to end calls when conversation is complete</span>
              </div>
            </label>
            <button id="configure-end-call-btn" type="button" class="configure-btn">Configure</button>
          </div>

          <div class="function-toggle semantic-match-toggle-container" style="padding: 0; cursor: default;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; cursor: pointer; flex: 1;">
              <input type="checkbox" id="func-semantic-match" ${this.agent.functions?.semantic_match?.enabled ? 'checked' : ''} style="margin-top: 0.2rem;" />
              <div class="toggle-content">
                <span class="toggle-label">Semantic Match</span>
                <span class="toggle-desc">Get notified when recurring patterns are detected across conversations</span>
              </div>
            </label>
            <button id="configure-semantic-match-btn" type="button" class="configure-btn">Configure</button>
          </div>

        </div>
      </div>

      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Custom Functions</h3>
          <button class="btn btn-primary btn-sm" id="add-custom-function-btn" style="display: flex; align-items: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Function
          </button>
        </div>
        <p class="section-desc">Define custom webhooks your agent can call during conversations.</p>

        <div id="custom-functions-list">
          ${this.customFunctions.length === 0 ? `
            <div class="no-numbers-message">No custom functions configured</div>
          ` : this.customFunctions.map(func => this.renderCustomFunctionCard(func)).join('')}
        </div>
      </div>

      <div class="config-section">
        <h3>MCP Servers</h3>
        <p class="section-desc">Connect MCP servers to extend your agent's capabilities.</p>
        <div class="placeholder-message">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/>
          </svg>
          <span>Configure MCP servers in the <a href="#" onclick="navigateTo('/apps'); return false;">Apps</a> page</span>
        </div>
      </div>
    `;
  },

  renderAppFunctionsSection() {
    // App icons by slug
    const appIcons = {
      slack: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14.5 2a2.5 2.5 0 0 0 0 5H17V4.5A2.5 2.5 0 0 0 14.5 2z" fill="#E01E5A"/><path d="M2 14.5a2.5 2.5 0 0 0 5 0V12H4.5A2.5 2.5 0 0 0 2 14.5z" fill="#36C5F0"/><path d="M9.5 22a2.5 2.5 0 0 0 0-5H7v2.5A2.5 2.5 0 0 0 9.5 22z" fill="#2EB67D"/><path d="M22 9.5a2.5 2.5 0 0 0-5 0V12h2.5A2.5 2.5 0 0 0 22 9.5z" fill="#ECB22E"/><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5V7h2.5a2.5 2.5 0 0 0 0-5z" fill="#36C5F0"/><path d="M2 9.5A2.5 2.5 0 0 0 4.5 12H7V9.5a2.5 2.5 0 0 0-5 0z" fill="#E01E5A"/><path d="M14.5 22a2.5 2.5 0 0 0 2.5-2.5V17h-2.5a2.5 2.5 0 0 0 0 5z" fill="#ECB22E"/><path d="M22 14.5a2.5 2.5 0 0 0-2.5-2.5H17v2.5a2.5 2.5 0 0 0 5 0z" fill="#2EB67D"/></svg>`,
      hubspot: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.5 8.2V5.8c.8-.4 1.3-1.2 1.3-2.1C18.8 2.2 17.6 1 16.1 1S13.4 2.2 13.4 3.7c0 .9.5 1.7 1.3 2.1v2.4c-1.1.2-2.1.7-2.9 1.4L5.6 5.1c.1-.2.1-.5.1-.7 0-1.2-1-2.2-2.2-2.2S1.3 3.2 1.3 4.4s1 2.2 2.2 2.2c.4 0 .8-.1 1.2-.3l6.1 4.5c-.7 1-1.1 2.2-1.1 3.5 0 1.2.4 2.4 1 3.3l-1.8 1.8c-.2-.1-.5-.1-.7-.1-1.2 0-2.2 1-2.2 2.2s1 2.2 2.2 2.2 2.2-1 2.2-2.2c0-.3 0-.5-.1-.7l1.8-1.8c1 .7 2.3 1.2 3.6 1.2 3.5 0 6.3-2.8 6.3-6.3 0-3.1-2.2-5.7-5.1-6.3h-.4zM16 18.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z" fill="#FF7A59"/></svg>`,
    };

    // Only show apps that support push notifications
    const notifiableApps = this.connectedApps.filter(a => ['slack', 'hubspot'].includes(a.slug));

    if (notifiableApps.length === 0) {
      return `
        <div class="config-section">
          <h3>Dynamic Data Flow</h3>
          <p class="section-desc">Control which apps receive data from your Functions.</p>
          <div class="placeholder-message">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <span>Connect apps in the <a href="#" onclick="navigateTo('/apps'); return false;">Apps</a> page to configure notifications</span>
          </div>
        </div>
      `;
    }

    const hasTranslateTo = !!this.agent.translate_to;

    const appCards = notifiableApps.map(app => {
      const prefs = this.agent.functions?.app_functions?.[app.slug] || {};
      const enabled = prefs.enabled !== false; // default ON
      const sms = prefs.sms !== false;
      const calls = prefs.calls !== false;
      const webChat = prefs.web_chat !== false;
      const translations = prefs.translations !== false;

      const icon = appIcons[app.slug] || '';
      const disabledClass = !enabled ? 'app-func-disabled' : '';

      return `
        <div class="app-func-card ${disabledClass}" data-app="${app.slug}">
          <div class="app-func-header">
            <div class="app-func-title">
              <span class="app-func-icon">${icon}</span>
              <span class="app-func-name">${app.name}</span>
            </div>
            <label class="toggle-switch-sm">
              <input type="checkbox" class="app-func-master-toggle" data-app="${app.slug}" ${enabled ? 'checked' : ''} />
              <span class="toggle-slider-sm"></span>
            </label>
          </div>
          <div class="app-func-channels">
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="sms" ${sms ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>SMS messages</span>
            </label>
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="calls" ${calls ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>Call summaries</span>
            </label>
            <label class="app-func-channel">
              <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="web_chat" ${webChat ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
              <span>Web chat messages</span>
            </label>
            ${hasTranslateTo ? `
              <label class="app-func-channel">
                <input type="checkbox" class="app-func-channel-toggle" data-app="${app.slug}" data-channel="translations" ${translations ? 'checked' : ''} ${!enabled ? 'disabled' : ''} />
                <span>Include translations</span>
              </label>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="config-section">
        <h3>Dynamic Data Flow</h3>
        <p class="section-desc">Control which apps receive data from your Functions.</p>
        <div class="app-func-cards">
          ${appCards}
        </div>
      </div>
    `;
  },

  attachFunctionsTabListeners() {
    const funcSms = document.getElementById('func-sms');
    const funcTransfer = document.getElementById('func-transfer');
    const funcBooking = document.getElementById('func-booking');
    const funcExtract = document.getElementById('func-extract');
    const funcEndCall = document.getElementById('func-end-call');
    const funcSemanticMatch = document.getElementById('func-semantic-match');

    const updateFunctions = () => {
      const functions = {
        ...this.agent.functions,
        sms: { ...this.agent.functions?.sms, enabled: funcSms?.checked ?? false },
        transfer: { ...this.agent.functions?.transfer, enabled: funcTransfer?.checked ?? false },
        booking: { ...this.agent.functions?.booking, enabled: funcBooking?.checked ?? false },
        extract_data: { ...this.agent.functions?.extract_data, enabled: funcExtract?.checked ?? false },
        end_call: { ...this.agent.functions?.end_call, enabled: funcEndCall?.checked ?? true },
        semantic_match: { ...this.agent.functions?.semantic_match, enabled: funcSemanticMatch?.checked ?? false },
      };
      this.agent.functions = functions;
      this.scheduleAutoSave({ functions });
    };

    // End Call toggle
    if (funcEndCall) {
      funcEndCall.addEventListener('change', updateFunctions);
    }

    // Booking toggle - show modal when enabled
    // Booking toggle - requires Cal.com connection
    if (funcBooking) {
      funcBooking.addEventListener('change', async (e) => {
        if (funcBooking.checked) {
          // Check if Cal.com is connected
          const { data: userData } = await supabase
            .from('users')
            .select('cal_com_access_token')
            .eq('id', this.agent.user_id)
            .single();

          const isConnected = !!userData?.cal_com_access_token;
          if (!isConnected) {
            // Not connected - prevent enable, show modal to connect
            e.preventDefault();
            funcBooking.checked = false;
            this.showBookingModal(true); // true = enabling mode
          } else {
            // Already connected, just enable
            updateFunctions();
          }
        } else {
          // Disabling - just update
          updateFunctions();
        }
      });
    }

    // Configure booking button
    const configureBookingBtn = document.getElementById('configure-booking-btn');
    if (configureBookingBtn) {
      configureBookingBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showBookingModal();
      });
    }

    // Extract Data toggle - must configure before enabling
    if (funcExtract) {
      funcExtract.addEventListener('change', (e) => {
        if (funcExtract.checked) {
          // Trying to enable - check if has variables configured
          const hasVariables = this.agent.functions?.extract_data?.variables?.length > 0;
          if (!hasVariables) {
            // No config yet - prevent enable, show modal
            e.preventDefault();
            funcExtract.checked = false;
            this.showExtractDataModal(true); // true = enabling mode
          } else {
            // Already configured, just enable
            updateFunctions();
          }
        } else {
          // Disabling - just update
          updateFunctions();
        }
      });
    }

    // Configure extract button
    const configureExtractBtn = document.getElementById('configure-extract-btn');
    if (configureExtractBtn) {
      configureExtractBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showExtractDataModal();
      });
    }

    // Configure end call button
    const configureEndCallBtn = document.getElementById('configure-end-call-btn');
    if (configureEndCallBtn) {
      configureEndCallBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showEndCallModal();
      });
    }

    // SMS toggle - must configure before enabling
    if (funcSms) {
      funcSms.addEventListener('change', (e) => {
        if (funcSms.checked) {
          // Trying to enable - check if has description or templates
          const hasDescription = this.agent.functions?.sms?.description?.trim();
          // Templates are per-user, we'll check in modal
          if (!hasDescription) {
            // No config yet - prevent enable, show modal
            e.preventDefault();
            funcSms.checked = false;
            this.showSmsModal(true); // true = enabling mode
          } else {
            // Already configured, just enable
            updateFunctions();
          }
        } else {
          // Disabling - just update
          updateFunctions();
        }
      });
    }

    // Configure SMS button
    const configureSmsBtn = document.getElementById('configure-sms-btn');
    if (configureSmsBtn) {
      configureSmsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showSmsModal();
      });
    }

    // Transfer toggle - must configure before enabling
    if (funcTransfer) {
      funcTransfer.addEventListener('change', (e) => {
        if (funcTransfer.checked) {
          // Trying to enable - check if already has numbers configured
          const hasNumbers = this.agent.functions?.transfer?.numbers?.length > 0;
          if (!hasNumbers) {
            // No config yet - prevent enable, show modal
            e.preventDefault();
            funcTransfer.checked = false;
            this.showTransferModal(true); // true = enabling mode
          } else {
            // Already configured, just enable
            updateFunctions();
          }
        } else {
          // Disabling - just update
          updateFunctions();
        }
      });
    }

    // Configure transfer button (stopPropagation prevents checkbox toggle)
    const configureTransferBtn = document.getElementById('configure-transfer-btn');
    if (configureTransferBtn) {
      configureTransferBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTransferModal();
      });
    }

    // Custom Functions listeners
    const addCustomFunctionBtn = document.getElementById('add-custom-function-btn');
    if (addCustomFunctionBtn) {
      addCustomFunctionBtn.addEventListener('click', () => {
        this.showCustomFunctionModal();
      });
    }

    // Edit/Delete buttons for existing custom functions
    this.attachCustomFunctionListeners();

    // Semantic Match toggle - must configure alerts before enabling
    if (funcSemanticMatch) {
      funcSemanticMatch.addEventListener('change', (e) => {
        if (funcSemanticMatch.checked) {
          const hasAlerts = this.semanticActions.length > 0;
          if (!hasAlerts) {
            e.preventDefault();
            funcSemanticMatch.checked = false;
            this.showSemanticMatchConfigModal(true);
          } else {
            updateFunctions();
          }
        } else {
          updateFunctions();
        }
      });
    }

    // Configure semantic match button
    const configureSemanticMatchBtn = document.getElementById('configure-semantic-match-btn');
    if (configureSemanticMatchBtn) {
      configureSemanticMatchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showSemanticMatchConfigModal();
      });
    }

  },

  attachAppFunctionListeners() {
    const saveAppFunctions = () => {
      // Collect current state from all app function toggles
      const appFunctions = { ...(this.agent.functions?.app_functions || {}) };

      document.querySelectorAll('.app-func-master-toggle').forEach(toggle => {
        const app = toggle.dataset.app;
        if (!appFunctions[app]) appFunctions[app] = {};
        appFunctions[app].enabled = toggle.checked;
      });

      document.querySelectorAll('.app-func-channel-toggle').forEach(toggle => {
        const app = toggle.dataset.app;
        const channel = toggle.dataset.channel;
        if (!appFunctions[app]) appFunctions[app] = {};
        appFunctions[app][channel] = toggle.checked;
      });

      const functions = {
        ...this.agent.functions,
        app_functions: appFunctions,
      };
      this.agent.functions = functions;
      this.scheduleAutoSave({ functions });
    };

    // Master toggles — enable/disable sub-toggles
    document.querySelectorAll('.app-func-master-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const app = toggle.dataset.app;
        const card = document.querySelector(`.app-func-card[data-app="${app}"]`);
        const channelToggles = card?.querySelectorAll('.app-func-channel-toggle') || [];

        channelToggles.forEach(ct => {
          ct.disabled = !toggle.checked;
        });

        if (toggle.checked) {
          card?.classList.remove('app-func-disabled');
        } else {
          card?.classList.add('app-func-disabled');
        }

        saveAppFunctions();
      });
    });

    // Channel toggles
    document.querySelectorAll('.app-func-channel-toggle').forEach(toggle => {
      toggle.addEventListener('change', saveAppFunctions);
    });
  },

  attachCustomFunctionListeners() {
    document.querySelectorAll('.edit-custom-function-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const functionId = btn.dataset.functionId;
        const func = this.customFunctions.find(f => f.id === functionId);
        if (func) {
          this.showCustomFunctionModal(func);
        }
      });
    });

    document.querySelectorAll('.delete-custom-function-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const functionId = btn.dataset.functionId;
        const func = this.customFunctions.find(f => f.id === functionId);
        if (func) {
          this.deleteCustomFunction(func);
        }
      });
    });

    document.querySelectorAll('.toggle-custom-function-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const functionId = btn.dataset.functionId;
        const func = this.customFunctions.find(f => f.id === functionId);
        if (func) {
          await this.toggleCustomFunctionActive(func);
        }
      });
    });
  },

  async showBookingModal(enablingMode = false) {
    try {
      // enablingMode = true means user is trying to enable the function, needs Cal.com connection
      this._bookingEnablingMode = enablingMode;

      // Check if Cal.com is connected
      const { data: user } = await supabase
        .from('users')
        .select('cal_com_access_token, cal_com_refresh_token')
        .eq('id', this.agent.user_id)
        .single();

      const isCalComConnected = !!user?.cal_com_access_token;

      // Get event types if connected
      let eventTypes = [];
      if (isCalComConnected) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cal-com-get-slots`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'get_event_types' }),
            }
          );
          if (response.ok) {
            const data = await response.json();
            eventTypes = data.eventTypes || [];
          }
        } catch (err) {
          console.error('Error fetching event types:', err);
        }
      }

      // Get saved booking config from functions
      const bookingConfig = this.agent.functions?.booking || {};
      const selectedEventTypes = bookingConfig.event_type_ids || [];

      const modal = document.createElement('div');
      modal.className = 'voice-modal-overlay';
      modal.id = 'booking-modal';
      modal.innerHTML = `
        <div class="voice-modal" style="max-width: 500px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="voice-modal-header">
            <h3>Booking Settings</h3>
            <button class="close-modal-btn">&times;</button>
          </div>
          <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
            ${!isCalComConnected ? `
              <div style="text-align: center; padding: 2rem 1rem;">
                <svg width="48" height="48" fill="none" stroke="var(--text-secondary)" viewBox="0 0 24 24" style="margin-bottom: 1rem;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <h4 style="margin: 0 0 0.5rem; color: var(--text-primary);">Connect Cal.com</h4>
                <p style="margin: 0 0 1.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                  Connect your Cal.com account to let your agent book appointments.
                </p>
                <button id="connect-calcom-btn" class="btn btn-primary">
                  Connect Cal.com
                </button>
              </div>
            ` : `
              <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                Select which event types your agent can book appointments for.
              </p>
              ${eventTypes.length === 0 ? `
                <p style="color: var(--text-secondary); text-align: center; padding: 1rem;">
                  No event types found. Create event types in Cal.com first.
                </p>
              ` : `
                <div id="event-types-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                  ${eventTypes.map(et => `
                    <label class="event-type-option" style="
                      display: flex;
                      align-items: center;
                      gap: 0.75rem;
                      padding: 0.75rem;
                      background: var(--bg-secondary, #f9fafb);
                      border: 1px solid var(--border-color, #e5e7eb);
                      border-radius: 8px;
                      cursor: pointer;
                    ">
                      <input type="checkbox" class="event-type-checkbox" value="${et.id}"
                        ${selectedEventTypes.includes(et.id) ? 'checked' : ''} />
                      <div style="flex: 1;">
                        <div style="font-weight: 500; font-size: 0.9rem;">${et.title || et.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${et.length || et.duration || 30} minutes</div>
                      </div>
                    </label>
                  `).join('')}
                </div>
              `}
            `}
          </div>
          ${isCalComConnected && eventTypes.length > 0 ? `
            <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
              <button id="save-booking-config-btn" class="btn btn-primary" style="width: 100%;">
                Save Changes
              </button>
            </div>
          ` : ''}
        </div>
      `;

      document.body.appendChild(modal);

      // Close button
      modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // Save button
      const saveBtn = modal.querySelector('#save-booking-config-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const checkboxes = modal.querySelectorAll('.event-type-checkbox:checked');
          const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

          // If enabling mode and no event types selected, don't enable
          if (this._bookingEnablingMode && selectedIds.length === 0) {
            showToast('Please select at least one event type to enable booking.', 'warning');
            return;
          }

          // If enabling mode and has selections, enable the function
          const shouldEnable = this._bookingEnablingMode && selectedIds.length > 0;

          const functions = {
            ...this.agent.functions,
            booking: {
              ...this.agent.functions?.booking,
              enabled: shouldEnable ? true : (this.agent.functions?.booking?.enabled ?? false),
              event_type_ids: selectedIds,
            },
          };
          this.agent.functions = functions;
          this.scheduleAutoSave({ functions });

          // Update checkbox if we enabled
          if (shouldEnable) {
            const checkbox = document.getElementById('func-booking');
            if (checkbox) checkbox.checked = true;
          }

          this._bookingEnablingMode = false;
          modal.remove();
        });
      }

      // Connect Cal.com button - initiate OAuth
      const connectBtn = modal.querySelector('#connect-calcom-btn');
      if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
          connectBtn.disabled = true;
          connectBtn.textContent = 'Connecting...';

          try {
            const { data: { session } } = await supabase.auth.getSession();
            const returnUrl = `${window.location.origin}/agents/${this.agentId}?tab=functions`;

            const encodedReturnUrl = encodeURIComponent(returnUrl);
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cal-com-oauth-start?returnUrl=${encodedReturnUrl}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (response.ok) {
              const data = await response.json();
              if (data.url) {
                window.location.href = data.url;
              }
            } else {
              const error = await response.json();
              showToast(error.error || 'Failed to start Cal.com connection', 'error');
              connectBtn.disabled = false;
              connectBtn.textContent = 'Connect Cal.com';
            }
          } catch (err) {
            console.error('Error starting Cal.com OAuth:', err);
            showToast('Failed to connect to Cal.com', 'error');
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect Cal.com';
          }
        });
      }
    } catch (err) {
      console.error('Error in showBookingModal:', err);
    }
  },

  async showExtractDataModal(enablingMode = false) {
    try {
      // enablingMode = true means user is trying to enable the function, needs valid config to proceed
      this._extractEnablingMode = enablingMode;

      // Load dynamic variables from database
      const { data: dynamicVars, error } = await supabase
        .from('dynamic_variables')
        .select('*')
        .eq('user_id', this.agent.user_id)
        .eq('agent_id', this.agent.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading dynamic variables:', error);
      }

      const variables = dynamicVars || [];

      const extractChannels = this.agent.functions?.extract_data?.channels || {};
      const chCalls = extractChannels.calls !== false;
      const chSms = extractChannels.sms !== false;
      const chWebChat = extractChannels.web_chat !== false;

      const sendTo = this.agent.functions?.extract_data?.send_to || {};
      // Build "Send to" checkboxes from connected apps
      const sendToApps = this.connectedApps.filter(a => ['slack', 'hubspot'].includes(a.slug));

      const modal = document.createElement('div');
      modal.className = 'voice-modal-overlay';
      modal.id = 'extract-modal';
      modal.innerHTML = `
        <div class="voice-modal" style="max-width: 550px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="voice-modal-header">
            <h3>Extract Data</h3>
            <button class="close-modal-btn">&times;</button>
          </div>
          <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
            <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
              Define variables to extract from conversations. This data can be sent to CRMs, databases, or other integrations.
            </p>

            <div style="margin-bottom: 1rem; padding: 0.75rem; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; background: var(--bg-secondary, #f9fafb);">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.03em;">Extract from</label>
              <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.875rem; color: var(--text-primary);">
                  <input type="checkbox" id="extract-ch-calls" ${chCalls ? 'checked' : ''} style="accent-color: var(--primary-color);" />
                  Calls
                </label>
                <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.875rem; color: var(--text-primary);">
                  <input type="checkbox" id="extract-ch-sms" ${chSms ? 'checked' : ''} style="accent-color: var(--primary-color);" />
                  SMS
                </label>
                <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.875rem; color: var(--text-primary);">
                  <input type="checkbox" id="extract-ch-web-chat" ${chWebChat ? 'checked' : ''} style="accent-color: var(--primary-color);" />
                  Web Chat
                </label>
              </div>
            </div>

            ${sendToApps.length > 0 ? `
            <div style="margin-bottom: 1rem; padding: 0.75rem; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; background: var(--bg-secondary, #f9fafb);">
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.03em;">Send to</label>
              <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                ${sendToApps.map(app => {
                  const checked = sendTo[app.slug] !== false; // default ON
                  return `
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.875rem; color: var(--text-primary);">
                      <input type="checkbox" class="extract-send-to" data-app="${app.slug}" ${checked ? 'checked' : ''} style="accent-color: var(--primary-color);" />
                      ${app.name}
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
            ` : ''}

            <div id="dynamic-vars-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${variables.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No variables configured</p>' : ''}
              ${variables.map((v, index) => this.renderDynamicVarRow(v, index)).join('')}
            </div>
            <button id="add-dynamic-var-btn" style="
              width: 100%;
              margin-top: 1rem;
              padding: 0.75rem;
              background: var(--bg-secondary, #f3f4f6);
              border: 1px dashed var(--border-color, #e5e7eb);
              border-radius: 8px;
              color: var(--text-secondary);
              font-size: 0.875rem;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
            ">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Add Variable
            </button>
          </div>
          <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
            <button id="save-dynamic-vars-btn" class="btn btn-primary" style="width: 100%;">
              Save Changes
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Store variables for manipulation
      this.modalDynamicVars = [...variables];

      // Close button
      modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // Add variable button
      modal.querySelector('#add-dynamic-var-btn').addEventListener('click', () => {
        this.modalDynamicVars.push({ id: null, name: '', description: '', var_type: 'text', enum_options: [] });
        this.refreshDynamicVarsList();
      });

      // Save button
      modal.querySelector('#save-dynamic-vars-btn').addEventListener('click', async () => {
        await this.saveDynamicVars();
        modal.remove();
      });

      // Attach input listeners
      this.attachExtractModalListeners();
    } catch (err) {
      console.error('Error in showExtractDataModal:', err);
    }
  },

  showEndCallModal() {
    const currentDescription = this.agent.functions?.end_call?.description ||
      'End the phone call. Use this when the conversation is complete, the caller says goodbye, or there is nothing more to discuss.';

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.id = 'end-call-modal';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 500px;">
        <div class="voice-modal-header">
          <h3>Configure End Call</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem;">
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Define when your agent should end the call. This description helps the AI understand the right moment to hang up.
          </p>
          <div class="form-group">
            <label for="end-call-description" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
              End Call Condition
            </label>
            <textarea
              id="end-call-description"
              rows="4"
              style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; resize: vertical; font-family: inherit;"
              placeholder="Describe when the agent should end the call..."
            >${currentDescription}</textarea>
          </div>
        </div>
        <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
          <button id="save-end-call-btn" class="btn btn-primary" style="width: 100%;">
            Save Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Save button
    modal.querySelector('#save-end-call-btn').addEventListener('click', async () => {
      const description = modal.querySelector('#end-call-description').value.trim();
      const functions = {
        ...this.agent.functions,
        end_call: {
          ...this.agent.functions?.end_call,
          description: description,
        },
      };
      this.agent.functions = functions;
      await this.scheduleAutoSave({ functions });
      modal.remove();
    });
  },

  renderDynamicVarRow(v, index) {
    const types = [
      { value: 'text', label: 'Text' },
      { value: 'number', label: 'Number' },
      { value: 'boolean', label: 'Boolean' },
      { value: 'enum', label: 'Enum (list)' },
    ];

    // Per-variable send_to pills (only when connected apps exist)
    const sendToApps = this.connectedApps.filter(a => ['slack', 'hubspot'].includes(a.slug));
    const varSendTo = v.send_to || {}; // null/undefined = use global default
    const hasOverride = v.send_to != null;

    const sendToPills = sendToApps.length > 0 ? `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; flex-wrap: wrap;">
        <span style="font-size: 0.75rem; color: var(--text-tertiary, #9ca3af);">Send to:</span>
        ${sendToApps.map(app => {
          // If no per-variable override, show as checked (inherits global)
          const checked = hasOverride ? varSendTo[app.slug] !== false : true;
          const isDefault = !hasOverride;
          return `
            <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer; font-size: 0.75rem; color: ${isDefault ? 'var(--text-tertiary, #9ca3af)' : 'var(--text-secondary)'};" title="${isDefault ? 'Using global default' : 'Per-variable override'}">
              <input type="checkbox" class="dynamic-var-send-to" data-index="${index}" data-app="${app.slug}" ${checked ? 'checked' : ''} style="width: 13px; height: 13px; accent-color: var(--primary-color);" />
              ${app.name}
            </label>
          `;
        }).join('')}
      </div>
    ` : '';

    return `
      <div class="dynamic-var-row" data-index="${index}" style="
        background: var(--bg-secondary, #f9fafb);
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        padding: 0.75rem;
      ">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input
            type="text"
            class="dynamic-var-name-input form-input"
            placeholder="Variable name (e.g., caller_name)"
            value="${v.name || ''}"
            data-index="${index}"
            style="flex: 1; font-size: 0.875rem;"
          />
          <select class="dynamic-var-type-select form-input" data-index="${index}" style="width: 110px; font-size: 0.875rem;">
            ${types.map(t => `<option value="${t.value}" ${v.var_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
          <button class="remove-dynamic-var-btn btn btn-icon" data-index="${index}" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.25rem;
          ">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
        <input
          type="text"
          class="dynamic-var-desc-input form-input"
          placeholder="Description (e.g., The caller's full name)"
          value="${v.description || ''}"
          data-index="${index}"
          style="width: 100%; font-size: 0.875rem; ${sendToApps.length > 0 ? '' : 'margin-bottom: 0.5rem;'}"
        />
        <div class="enum-options-container" data-index="${index}" style="display: ${v.var_type === 'enum' ? 'block' : 'none'};">
          <input
            type="text"
            class="dynamic-var-enum-input form-input"
            placeholder="Options (comma-separated, e.g., Yes, No, Maybe)"
            value="${(v.enum_options || []).join(', ')}"
            data-index="${index}"
            style="width: 100%; font-size: 0.875rem;"
          />
        </div>
        ${sendToPills}
      </div>
    `;
  },

  refreshDynamicVarsList() {
    const list = document.getElementById('dynamic-vars-list');
    if (!list) return;

    if (this.modalDynamicVars.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No variables configured</p>';
    } else {
      list.innerHTML = this.modalDynamicVars.map((v, index) => this.renderDynamicVarRow(v, index)).join('');
    }

    this.attachExtractModalListeners();
  },

  attachExtractModalListeners() {
    const modal = document.getElementById('extract-modal');
    if (!modal) return;

    // Name inputs
    modal.querySelectorAll('.dynamic-var-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalDynamicVars[index].name = e.target.value;
      });
    });

    // Description inputs
    modal.querySelectorAll('.dynamic-var-desc-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalDynamicVars[index].description = e.target.value;
      });
    });

    // Type selects
    modal.querySelectorAll('.dynamic-var-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalDynamicVars[index].var_type = e.target.value;
        // Show/hide enum options
        const enumContainer = modal.querySelector(`.enum-options-container[data-index="${index}"]`);
        if (enumContainer) {
          enumContainer.style.display = e.target.value === 'enum' ? 'block' : 'none';
        }
      });
    });

    // Enum options inputs
    modal.querySelectorAll('.dynamic-var-enum-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalDynamicVars[index].enum_options = e.target.value.split(',').map(s => s.trim()).filter(s => s);
      });
    });

    // Remove buttons
    modal.querySelectorAll('.remove-dynamic-var-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const v = this.modalDynamicVars[index];

        // If it has an ID, delete from database
        if (v.id) {
          await supabase.from('dynamic_variables').delete().eq('id', v.id);
        }

        this.modalDynamicVars.splice(index, 1);
        this.refreshDynamicVarsList();
      });
    });

    // Global send_to checkboxes — toggling ON checks all per-variable, OFF unchecks all
    modal.querySelectorAll('.extract-send-to').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const app = e.target.dataset.app;
        const checked = e.target.checked;
        modal.querySelectorAll(`.dynamic-var-send-to[data-app="${app}"]`).forEach(varCb => {
          varCb.checked = checked;
          const index = parseInt(varCb.dataset.index);
          const v = this.modalDynamicVars[index];
          if (!v.send_to) v.send_to = {};
          v.send_to[app] = checked;
          const label = varCb.closest('label');
          if (label) label.style.color = 'var(--text-secondary)';
        });
      });
    });

    // Per-variable send_to checkboxes — unchecking any deselects global
    modal.querySelectorAll('.dynamic-var-send-to').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        const app = e.target.dataset.app;
        const v = this.modalDynamicVars[index];
        if (!v.send_to) v.send_to = {};
        v.send_to[app] = e.target.checked;
        // Update label style to show it's now an override
        const label = e.target.closest('label');
        if (label) label.style.color = 'var(--text-secondary)';

        // If unchecked, deselect the global toggle for this app
        if (!e.target.checked) {
          const globalCb = modal.querySelector(`.extract-send-to[data-app="${app}"]`);
          if (globalCb) globalCb.checked = false;
        } else {
          // If all per-variable are checked, re-select the global
          const allForApp = modal.querySelectorAll(`.dynamic-var-send-to[data-app="${app}"]`);
          const allChecked = [...allForApp].every(c => c.checked);
          if (allChecked) {
            const globalCb = modal.querySelector(`.extract-send-to[data-app="${app}"]`);
            if (globalCb) globalCb.checked = true;
          }
        }
      });
    });
  },

  async saveDynamicVars() {
    const saveBtn = document.querySelector('#save-dynamic-vars-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      // Count valid variables
      const validVars = this.modalDynamicVars.filter(v => v.name);

      // If enabling mode and no valid variables, don't enable
      if (this._extractEnablingMode && validVars.length === 0) {
        showToast('Please add at least one variable to extract to enable this function.', 'warning');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
        return;
      }

      for (const v of this.modalDynamicVars) {
        // Skip empty entries
        if (!v.name) continue;

        if (v.id) {
          // Update existing
          await supabase
            .from('dynamic_variables')
            .update({
              name: v.name,
              description: v.description,
              var_type: v.var_type,
              enum_options: v.var_type === 'enum' ? v.enum_options : null,
              send_to: v.send_to || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', v.id);
        } else if (v.name) {
          // Insert new
          await supabase
            .from('dynamic_variables')
            .insert({
              user_id: this.agent.user_id,
              agent_id: this.agent.id,
              name: v.name,
              description: v.description,
              var_type: v.var_type,
              enum_options: v.var_type === 'enum' ? v.enum_options : null,
              send_to: v.send_to || null,
            });
        }
      }

      // Save channel selections from the modal
      const channels = {
        calls: document.getElementById('extract-ch-calls')?.checked ?? true,
        sms: document.getElementById('extract-ch-sms')?.checked ?? true,
        web_chat: document.getElementById('extract-ch-web-chat')?.checked ?? true,
      };

      // Save send_to app selections
      const sendTo = { ...(this.agent.functions?.extract_data?.send_to || {}) };
      document.querySelectorAll('.extract-send-to').forEach(toggle => {
        sendTo[toggle.dataset.app] = toggle.checked;
      });

      // If enabling mode and has valid variables, enable the function
      const shouldEnable = this._extractEnablingMode && validVars.length > 0;
      const functions = {
        ...this.agent.functions,
        extract_data: {
          ...this.agent.functions?.extract_data,
          channels,
          send_to: sendTo,
          ...(shouldEnable ? { enabled: true } : {}),
        },
      };
      this.agent.functions = functions;
      await this.scheduleAutoSave({ functions });

      if (shouldEnable) {
        // Update checkbox
        const checkbox = document.getElementById('func-extract');
        if (checkbox) checkbox.checked = true;
      }

      this._extractEnablingMode = false;
    } catch (err) {
      console.error('Error saving dynamic variables:', err);
      showToast('Failed to save variables. Please try again.', 'error');
    }
  },

  async showSmsModal(enablingMode = false) {
    try {
      // enablingMode = true means user is trying to enable the function, needs valid config to proceed
      this._smsEnablingMode = enablingMode;

      // Load SMS templates from database
      const { data: smsTemplates, error } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('user_id', this.agent.user_id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading SMS templates:', error);
      }

      const templates = smsTemplates || [];

      const modal = document.createElement('div');
      modal.className = 'voice-modal-overlay';
      modal.id = 'sms-modal';
      modal.innerHTML = `
        <div class="voice-modal" style="max-width: 500px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="voice-modal-header">
            <h3>SMS Templates</h3>
            <button class="close-modal-btn">&times;</button>
          </div>
          <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
            <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
              Create message templates your agent can use when sending SMS.
            </p>
            <div id="sms-templates-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${templates.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No templates configured</p>' : ''}
              ${templates.map((tmpl, index) => this.renderSmsTemplateRow(tmpl, index)).join('')}
            </div>
            <button id="add-sms-template-btn" style="
              width: 100%;
              margin-top: 1rem;
              padding: 0.75rem;
              background: var(--bg-secondary, #f3f4f6);
              border: 1px dashed var(--border-color, #e5e7eb);
              border-radius: 8px;
              color: var(--text-secondary);
              font-size: 0.875rem;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
            ">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Add Template
            </button>
          </div>
          <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
            <button id="save-sms-templates-btn" class="btn btn-primary" style="width: 100%;">
              Save Changes
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Store templates for manipulation
      this.modalSmsTemplates = [...templates];

      // Close button
      modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // Add template button
      modal.querySelector('#add-sms-template-btn').addEventListener('click', () => {
        this.modalSmsTemplates.push({ id: null, name: '', content: '' });
        this.refreshSmsTemplatesList();
      });

      // Save button
      modal.querySelector('#save-sms-templates-btn').addEventListener('click', async () => {
        await this.saveSmsTemplates();
        modal.remove();
      });

      // Attach input listeners
      this.attachSmsModalListeners();
    } catch (err) {
      console.error('Error in showSmsModal:', err);
    }
  },

  renderSmsTemplateRow(tmpl, index) {
    return `
      <div class="sms-template-row" data-index="${index}" style="
        background: var(--bg-secondary, #f9fafb);
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        padding: 0.75rem;
      ">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input
            type="text"
            class="sms-template-name-input form-input"
            placeholder="Template name (e.g., Follow up)"
            value="${tmpl.name || ''}"
            data-index="${index}"
            style="flex: 1; font-size: 0.875rem;"
          />
          <button class="remove-sms-template-btn btn btn-icon" data-index="${index}" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.25rem;
          ">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
        <textarea
          class="sms-template-content-input form-input"
          placeholder="Message content..."
          data-index="${index}"
          style="width: 100%; min-height: 80px; font-size: 0.875rem; resize: vertical;"
        >${tmpl.content || ''}</textarea>
      </div>
    `;
  },

  refreshSmsTemplatesList() {
    const list = document.getElementById('sms-templates-list');
    if (!list) return;

    if (this.modalSmsTemplates.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No templates configured</p>';
    } else {
      list.innerHTML = this.modalSmsTemplates.map((tmpl, index) => this.renderSmsTemplateRow(tmpl, index)).join('');
    }

    this.attachSmsModalListeners();
  },

  attachSmsModalListeners() {
    const modal = document.getElementById('sms-modal');
    if (!modal) return;

    // Name inputs
    modal.querySelectorAll('.sms-template-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalSmsTemplates[index].name = e.target.value;
      });
    });

    // Content inputs
    modal.querySelectorAll('.sms-template-content-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalSmsTemplates[index].content = e.target.value;
      });
    });

    // Remove buttons
    modal.querySelectorAll('.remove-sms-template-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        const tmpl = this.modalSmsTemplates[index];

        // If it has an ID, delete from database
        if (tmpl.id) {
          await supabase.from('sms_templates').delete().eq('id', tmpl.id);
        }

        this.modalSmsTemplates.splice(index, 1);
        this.refreshSmsTemplatesList();
      });
    });
  },

  async saveSmsTemplates() {
    const saveBtn = document.querySelector('#save-sms-templates-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      // Count valid templates
      const validTemplates = this.modalSmsTemplates.filter(t => t.name || t.content);

      // If enabling mode and no valid templates, don't enable
      if (this._smsEnablingMode && validTemplates.length === 0) {
        showToast('Please add at least one SMS template to enable this function.', 'warning');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
        return;
      }

      for (const tmpl of this.modalSmsTemplates) {
        // Skip empty entries
        if (!tmpl.name && !tmpl.content) continue;

        if (tmpl.id) {
          // Update existing
          await supabase
            .from('sms_templates')
            .update({
              name: tmpl.name,
              content: tmpl.content,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tmpl.id);
        } else if (tmpl.name || tmpl.content) {
          // Insert new
          await supabase
            .from('sms_templates')
            .insert({
              user_id: this.agent.user_id,
              name: tmpl.name,
              content: tmpl.content,
            });
        }
      }

      // If enabling mode and has valid templates, enable the function
      if (this._smsEnablingMode && validTemplates.length > 0) {
        const functions = {
          ...this.agent.functions,
          sms: {
            ...this.agent.functions?.sms,
            enabled: true,
          },
        };
        this.agent.functions = functions;
        await this.scheduleAutoSave({ functions });

        // Update checkbox
        const checkbox = document.getElementById('func-sms');
        if (checkbox) checkbox.checked = true;
      }

      this._smsEnablingMode = false;
    } catch (err) {
      console.error('Error saving SMS templates:', err);
      showToast('Failed to save templates. Please try again.', 'error');
    }
  },

  renderCustomFunctionCard(func) {
    const methodColors = {
      'GET': '#22c55e',
      'POST': '#3b82f6',
      'PUT': '#f59e0b',
      'PATCH': '#8b5cf6',
      'DELETE': '#ef4444'
    };
    const methodColor = methodColors[func.http_method] || '#6b7280';

    return `
      <div class="custom-function-card" data-function-id="${func.id}" style="
        background: var(--bg-secondary, #f9fafb);
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.75rem;
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span style="
                background: ${methodColor};
                color: white;
                font-size: 0.625rem;
                font-weight: 600;
                padding: 0.125rem 0.375rem;
                border-radius: 4px;
                font-family: monospace;
              ">${func.http_method}</span>
              <span style="font-weight: 600; font-size: 0.9rem; font-family: monospace;">${func.name}</span>
              <span style="
                background: ${func.is_active ? '#dcfce7' : '#f3f4f6'};
                color: ${func.is_active ? '#15803d' : '#6b7280'};
                font-size: 0.625rem;
                font-weight: 500;
                padding: 0.125rem 0.375rem;
                border-radius: 4px;
              ">${func.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <p style="margin: 0.25rem 0; font-size: 0.875rem; color: var(--text-secondary);">${func.description}</p>
            <p style="margin: 0; font-size: 0.75rem; color: var(--text-tertiary, #9ca3af); word-break: break-all;">${func.endpoint_url}</p>
          </div>
          <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
            <button class="toggle-custom-function-btn btn btn-sm ${func.is_active ? 'btn-secondary' : 'btn-primary'}" data-function-id="${func.id}" title="${func.is_active ? 'Disable' : 'Enable'}">
              ${func.is_active ? `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              ` : `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              `}
            </button>
            <button class="edit-custom-function-btn btn btn-sm btn-secondary" data-function-id="${func.id}" title="Edit">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button class="delete-custom-function-btn btn btn-sm btn-secondary" data-function-id="${func.id}" title="Delete" style="color: #ef4444;">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderSemanticActionCard(action) {
    const typeColors = {
      'sms': '#22c55e',
      'email': '#3b82f6',
      'slack': '#e11d48',
      'hubspot': '#f97316',
      'webhook': '#8b5cf6'
    };
    const typeLabels = {
      'sms': 'SMS',
      'email': 'Email',
      'slack': 'Slack',
      'hubspot': 'HubSpot',
      'webhook': 'Webhook'
    };
    const typeColor = typeColors[action.action_type] || '#6b7280';
    const typeLabel = typeLabels[action.action_type] || action.action_type;
    const topics = action.monitored_topics || [];
    const lastTriggered = action.last_triggered_at
      ? new Date(action.last_triggered_at).toLocaleDateString()
      : 'Never';

    return `
      <div class="semantic-action-card" data-action-id="${action.id}" style="
        background: var(--bg-secondary, #f9fafb);
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.75rem;
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
              <span style="
                background: ${typeColor};
                color: white;
                font-size: 0.625rem;
                font-weight: 600;
                padding: 0.125rem 0.375rem;
                border-radius: 4px;
              ">${typeLabel}</span>
              <span style="font-weight: 600; font-size: 0.9rem;">${action.name}</span>
              <span style="
                background: ${action.is_active ? '#dcfce7' : '#f3f4f6'};
                color: ${action.is_active ? '#15803d' : '#6b7280'};
                font-size: 0.625rem;
                font-weight: 500;
                padding: 0.125rem 0.375rem;
                border-radius: 4px;
              ">${action.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            ${topics.length > 0 ? `
              <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin: 0.35rem 0;">
                ${topics.map(t => `<span style="
                  background: #fef3c7;
                  color: #92400e;
                  font-size: 0.7rem;
                  padding: 0.1rem 0.4rem;
                  border-radius: 10px;
                ">${t}</span>`).join('')}
              </div>
            ` : ''}
            <div style="display: flex; gap: 1rem; font-size: 0.75rem; color: var(--text-tertiary, #9ca3af); margin-top: 0.25rem;">
              <span>Threshold: ${action.match_threshold}+</span>
              <span>Triggered: ${action.trigger_count || 0}x</span>
              <span>Last: ${lastTriggered}</span>
            </div>
          </div>
          <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
            <button class="toggle-semantic-action-btn btn btn-sm ${action.is_active ? 'btn-secondary' : 'btn-primary'}" data-action-id="${action.id}" title="${action.is_active ? 'Disable' : 'Enable'}">
              ${action.is_active ? `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              ` : `
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              `}
            </button>
            <button class="edit-semantic-action-btn btn btn-sm btn-secondary" data-action-id="${action.id}" title="Edit">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
            <button class="delete-semantic-action-btn btn btn-sm btn-secondary" data-action-id="${action.id}" title="Delete" style="color: #ef4444;">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  showSemanticMatchConfigModal(enablingMode = false, prefillTopicsForNew = null) {
    this._semanticMatchEnablingMode = enablingMode;

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.id = 'semantic-match-config-modal';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 520px; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="voice-modal-header">
          <h3>Semantic Match Alerts</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Define alerts that fire when recurring patterns are detected across conversations. Each alert monitors specific topics and sends notifications via your chosen channel.
          </p>
          <div id="semantic-alerts-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${this.semanticActions.length === 0
              ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No alerts configured</p>'
              : this.semanticActions.map(action => this.renderSemanticActionCard(action)).join('')}
          </div>
          <button id="add-semantic-alert-btn" style="
            width: 100%;
            margin-top: 1rem;
            padding: 0.75rem;
            background: var(--bg-secondary, #f3f4f6);
            border: 1px dashed var(--border-color, #e5e7eb);
            border-radius: 8px;
            color: var(--text-secondary);
            font-size: 0.875rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          ">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Alert
          </button>
        </div>
        <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
          <button id="close-semantic-config-btn" class="btn btn-primary" style="width: 100%;">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
      // Sync toggle with whether alerts exist
      const funcSemanticMatch = document.getElementById('func-semantic-match');
      if (funcSemanticMatch) {
        const hasAlerts = this.semanticActions.length > 0;
        if (hasAlerts && !funcSemanticMatch.checked) {
          funcSemanticMatch.checked = true;
          funcSemanticMatch.dispatchEvent(new Event('change'));
        } else if (!hasAlerts && funcSemanticMatch.checked) {
          funcSemanticMatch.checked = false;
          funcSemanticMatch.dispatchEvent(new Event('change'));
        }
      }
    };

    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('close-semantic-config-btn').addEventListener('click', closeModal);

    // Add alert button
    document.getElementById('add-semantic-alert-btn').addEventListener('click', () => {
      this.showSemanticActionModal(null, prefillTopicsForNew || []);
      prefillTopicsForNew = null; // Only pre-fill for the first add
    });

    // Attach edit/delete/toggle listeners for cards in the list
    this.attachSemanticActionListeners();

    // If we came from Memory tab with pre-filled topics, auto-open the add modal
    if (prefillTopicsForNew && prefillTopicsForNew.length > 0) {
      this.showSemanticActionModal(null, prefillTopicsForNew);
      prefillTopicsForNew = null;
    }
  },

  _refreshSemanticConfigList() {
    const listContainer = document.getElementById('semantic-alerts-list');
    if (listContainer) {
      listContainer.innerHTML = this.semanticActions.length === 0
        ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No alerts configured</p>'
        : this.semanticActions.map(a => this.renderSemanticActionCard(a)).join('');
      this.attachSemanticActionListeners();
    }
  },

  showSemanticActionModal(existingAction = null, prefillTopics = []) {
    const isEdit = !!existingAction;
    const action = existingAction || {
      name: prefillTopics.length > 0 ? `Alert: ${prefillTopics.slice(0, 3).join(', ')}` : '',
      monitored_topics: prefillTopics,
      match_threshold: 3,
      action_type: 'email',
      action_config: {},
      cooldown_minutes: 60,
      is_active: true
    };

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.id = 'semantic-action-modal';

    const cooldownOptions = [
      { value: 15, label: '15 minutes' },
      { value: 30, label: '30 minutes' },
      { value: 60, label: '1 hour' },
      { value: 240, label: '4 hours' },
      { value: 1440, label: '24 hours' }
    ];

    const thresholdOptions = [2, 3, 5, 10];

    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 520px; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="voice-modal-header">
          <h3>${isEdit ? 'Edit' : 'Add'} Semantic Alert</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">Alert Name <span style="color: #ef4444;">*</span></label>
            <input type="text" id="sa-name" class="form-input" value="${action.name}" placeholder="e.g., Login Issues Alert" />
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">Monitored Topics</label>
            <div id="sa-topics-container" style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
              ${(action.monitored_topics || []).map(t => `
                <span class="sa-topic-chip" style="
                  background: #fef3c7;
                  color: #92400e;
                  font-size: 0.8rem;
                  padding: 0.2rem 0.5rem;
                  border-radius: 10px;
                  display: inline-flex;
                  align-items: center;
                  gap: 0.25rem;
                ">${t}<button type="button" class="sa-remove-topic" data-topic="${t}" style="background: none; border: none; cursor: pointer; color: #92400e; font-size: 1rem; line-height: 1; padding: 0;">&times;</button></span>
              `).join('')}
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="sa-topic-input" class="form-input" placeholder="Add topic..." style="flex: 1;" />
              <button type="button" id="sa-add-topic-btn" class="btn btn-secondary btn-sm">Add</button>
            </div>
          </div>

          <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Match Threshold</label>
              <select id="sa-threshold" class="form-input">
                ${thresholdOptions.map(n => `<option value="${n}" ${action.match_threshold === n ? 'selected' : ''}>${n}+ matches</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Cooldown</label>
              <select id="sa-cooldown" class="form-input">
                ${cooldownOptions.map(o => `<option value="${o.value}" ${action.cooldown_minutes === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label">Alert Channel <span style="color: #ef4444;">*</span></label>
            <select id="sa-action-type" class="form-input">
              <option value="email" ${action.action_type === 'email' ? 'selected' : ''}>Email</option>
              <option value="sms" ${action.action_type === 'sms' ? 'selected' : ''}>SMS</option>
              <option value="slack" ${action.action_type === 'slack' ? 'selected' : ''}>Slack</option>
              <option value="hubspot" ${action.action_type === 'hubspot' ? 'selected' : ''}>HubSpot</option>
              <option value="webhook" ${action.action_type === 'webhook' ? 'selected' : ''}>Webhook</option>
            </select>
          </div>

          <div id="sa-config-fields">
            ${this._renderActionConfigFields(action.action_type, action.action_config)}
          </div>
        </div>
        <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" id="sa-cancel-btn" style="flex: 1;">Cancel</button>
          <button type="button" class="btn btn-primary" id="sa-save-btn" style="flex: 1;">${isEdit ? 'Save Changes' : 'Create Alert'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    document.getElementById('sa-cancel-btn').addEventListener('click', closeModal);

    // Topic management
    const addTopic = () => {
      const input = document.getElementById('sa-topic-input');
      const topic = input.value.trim();
      if (!topic) return;
      const container = document.getElementById('sa-topics-container');
      const chip = document.createElement('span');
      chip.className = 'sa-topic-chip';
      chip.style.cssText = 'background: #fef3c7; color: #92400e; font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 10px; display: inline-flex; align-items: center; gap: 0.25rem;';
      chip.innerHTML = `${topic}<button type="button" class="sa-remove-topic" data-topic="${topic}" style="background: none; border: none; cursor: pointer; color: #92400e; font-size: 1rem; line-height: 1; padding: 0;">&times;</button>`;
      chip.querySelector('.sa-remove-topic').addEventListener('click', () => chip.remove());
      container.appendChild(chip);
      input.value = '';
      input.focus();
    };

    document.getElementById('sa-add-topic-btn').addEventListener('click', addTopic);
    document.getElementById('sa-topic-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addTopic(); }
    });

    // Remove topic chips
    document.querySelectorAll('.sa-remove-topic').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.sa-topic-chip').remove());
    });

    // Dynamic config fields based on action type
    document.getElementById('sa-action-type').addEventListener('change', (e) => {
      document.getElementById('sa-config-fields').innerHTML = this._renderActionConfigFields(e.target.value, {});
    });

    // Save
    document.getElementById('sa-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('sa-name').value.trim();
      if (!name) {
        document.getElementById('sa-name').style.borderColor = '#ef4444';
        return;
      }

      const topicChips = document.querySelectorAll('#sa-topics-container .sa-topic-chip');
      const topics = Array.from(topicChips).map(chip => chip.textContent.replace('×', '').trim());

      const actionType = document.getElementById('sa-action-type').value;
      const actionConfig = this._getActionConfig(actionType);

      // Validate config
      if (actionType === 'sms' && !actionConfig.phone_number) {
        return;
      }
      if (actionType === 'email' && !actionConfig.email_address) {
        return;
      }
      if (actionType === 'webhook' && !actionConfig.url) {
        return;
      }

      const saveBtn = document.getElementById('sa-save-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const actionData = {
          name,
          monitored_topics: topics,
          match_threshold: parseInt(document.getElementById('sa-threshold').value),
          action_type: actionType,
          action_config: actionConfig,
          cooldown_minutes: parseInt(document.getElementById('sa-cooldown').value)
        };

        let result;
        if (isEdit) {
          result = await SemanticMatchAction.update(existingAction.id, actionData);
        } else {
          result = await SemanticMatchAction.create(this.agent.user_id, this.agent.id, actionData);
        }

        if (result.error) {
          console.error('Error saving semantic action:', result.error);
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Alert';
          return;
        }

        // Refresh list
        const { actions } = await SemanticMatchAction.listByAgent(this.agent.id);
        this.semanticActions = actions || [];
        this._refreshSemanticConfigList();

        closeModal();
      } catch (err) {
        console.error('Error saving semantic action:', err);
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Alert';
      }
    });
  },

  _renderActionConfigFields(actionType, config = {}) {
    switch (actionType) {
      case 'sms':
        return `
          <div class="form-group">
            <label class="form-label">Phone Number <span style="color: #ef4444;">*</span></label>
            <input type="tel" id="sa-config-phone" class="form-input" value="${config.phone_number || ''}" placeholder="+1234567890" />
          </div>
        `;
      case 'email':
        return `
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label class="form-label">Email Address <span style="color: #ef4444;">*</span></label>
            <input type="email" id="sa-config-email" class="form-input" value="${config.email_address || ''}" placeholder="alerts@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Subject (optional)</label>
            <input type="text" id="sa-config-subject" class="form-input" value="${config.subject_template || ''}" placeholder="Auto-generated if blank" />
          </div>
        `;
      case 'slack':
        return `
          <div class="form-group">
            <label class="form-label">Channel Name</label>
            <input type="text" id="sa-config-channel" class="form-input" value="${config.channel_name || ''}" placeholder="#alerts" />
            <small style="color: var(--text-tertiary, #9ca3af);">Requires Slack connected in Apps</small>
          </div>
        `;
      case 'hubspot':
        return `
          <div class="form-group">
            <label class="form-label">Contact Email (optional)</label>
            <input type="email" id="sa-config-hubspot-email" class="form-input" value="${config.contact_email || ''}" placeholder="Creates standalone note if blank" />
            <small style="color: var(--text-tertiary, #9ca3af);">Requires HubSpot connected in Apps</small>
          </div>
        `;
      case 'webhook':
        return `
          <div class="form-group">
            <label class="form-label">Webhook URL <span style="color: #ef4444;">*</span></label>
            <input type="url" id="sa-config-url" class="form-input" value="${config.url || ''}" placeholder="https://example.com/webhook" />
          </div>
        `;
      default:
        return '';
    }
  },

  _getActionConfig(actionType) {
    switch (actionType) {
      case 'sms':
        return { phone_number: document.getElementById('sa-config-phone')?.value?.trim() || '' };
      case 'email':
        return {
          email_address: document.getElementById('sa-config-email')?.value?.trim() || '',
          subject_template: document.getElementById('sa-config-subject')?.value?.trim() || ''
        };
      case 'slack':
        return { channel_name: document.getElementById('sa-config-channel')?.value?.trim() || '' };
      case 'hubspot':
        return { contact_email: document.getElementById('sa-config-hubspot-email')?.value?.trim() || '' };
      case 'webhook':
        return { url: document.getElementById('sa-config-url')?.value?.trim() || '' };
      default:
        return {};
    }
  },

  attachSemanticActionListeners() {
    document.querySelectorAll('.edit-semantic-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionId = btn.dataset.actionId;
        const action = this.semanticActions.find(a => a.id === actionId);
        if (action) this.showSemanticActionModal(action);
      });
    });

    document.querySelectorAll('.delete-semantic-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionId = btn.dataset.actionId;
        const action = this.semanticActions.find(a => a.id === actionId);
        if (action) this.deleteSemanticAction(action);
      });
    });

    document.querySelectorAll('.toggle-semantic-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const actionId = btn.dataset.actionId;
        const action = this.semanticActions.find(a => a.id === actionId);
        if (action) {
          const { error } = await SemanticMatchAction.toggleActive(action.id, !action.is_active);
          if (!error) {
            action.is_active = !action.is_active;
            const card = document.querySelector(`.semantic-action-card[data-action-id="${action.id}"]`);
            if (card) {
              card.outerHTML = this.renderSemanticActionCard(action);
              this.attachSemanticActionListeners();
            }
          }
        }
      });
    });
  },

  async deleteSemanticAction(action) {
    this.showConfirmModal({
      title: 'Delete Alert',
      message: `Are you sure you want to delete <strong>${action.name}</strong>? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await SemanticMatchAction.delete(action.id);
          if (error) {
            console.error('Error deleting semantic action:', error);
            return;
          }
          this.semanticActions = this.semanticActions.filter(a => a.id !== action.id);
          this._refreshSemanticConfigList();
        } catch (err) {
          console.error('Error deleting semantic action:', err);
        }
      }
    });
  },

  showCustomFunctionModal(existingFunction = null) {
    const isEdit = !!existingFunction;
    const func = existingFunction || {
      name: '',
      description: '',
      http_method: 'POST',
      endpoint_url: '',
      headers: [],
      body_schema: [],
      response_variables: [],
      timeout_ms: 120000,
      max_retries: 2,
      is_active: true
    };

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.id = 'custom-function-modal';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 600px; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="voice-modal-header">
          <h3>${isEdit ? 'Edit' : 'Add'} Custom Function</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
          <!-- Basic Info -->
          <div class="form-group">
            <label class="form-label">Function Name <span style="color: #ef4444;">*</span></label>
            <input type="text" id="cf-name" class="form-input" placeholder="e.g., check_order_status" value="${func.name}" style="font-family: monospace;">
            <p class="form-help">Use snake_case (lowercase letters, numbers, underscores). This is how the LLM will call the function.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Description <span style="color: #ef4444;">*</span></label>
            <textarea id="cf-description" class="form-textarea" rows="2" placeholder="Look up customer order status by order ID">${func.description}</textarea>
            <p class="form-help">Describe what this function does. The AI uses this to decide when to call it.</p>
          </div>

          <!-- HTTP Config -->
          <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">
            <div class="form-group" style="width: 120px; margin: 0;">
              <label class="form-label">Method</label>
              <select id="cf-method" class="form-select">
                <option value="GET" ${func.http_method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${func.http_method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${func.http_method === 'PUT' ? 'selected' : ''}>PUT</option>
                <option value="PATCH" ${func.http_method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                <option value="DELETE" ${func.http_method === 'DELETE' ? 'selected' : ''}>DELETE</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1; margin: 0;">
              <label class="form-label">Endpoint URL <span style="color: #ef4444;">*</span></label>
              <input type="url" id="cf-url" class="form-input" placeholder="https://api.example.com/webhook" value="${func.endpoint_url}">
            </div>
          </div>

          <!-- Headers -->
          <div class="form-group" style="border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label" style="margin: 0;">Headers</label>
              <button type="button" id="add-header-btn" class="btn btn-sm btn-secondary">+ Add Header</button>
            </div>
            <div id="cf-headers-list" style="margin-top: 0.5rem;">
              ${(func.headers || []).map((h, i) => this.renderHeaderRow(h, i)).join('')}
            </div>
          </div>

          <!-- Parameters -->
          <div class="form-group" style="border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label" style="margin: 0;">Parameters</label>
              <button type="button" id="add-param-btn" class="btn btn-sm btn-secondary">+ Add Parameter</button>
            </div>
            <p class="form-help" style="margin-top: 0.25rem;">Define parameters the AI should collect from the conversation.</p>
            <div id="cf-params-list" style="margin-top: 0.5rem;">
              ${(func.body_schema || []).map((p, i) => this.renderParamRow(p, i)).join('')}
            </div>
          </div>

          <!-- Response Variables -->
          <div class="form-group" style="border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label class="form-label" style="margin: 0;">Response Variables</label>
              <button type="button" id="add-response-var-btn" class="btn btn-sm btn-secondary">+ Add Variable</button>
            </div>
            <p class="form-help" style="margin-top: 0.25rem;">Extract specific values from the response using JSON paths.</p>
            <div id="cf-response-vars-list" style="margin-top: 0.5rem;">
              ${(func.response_variables || []).map((v, i) => this.renderResponseVarRow(v, i)).join('')}
            </div>
          </div>

          <!-- Advanced Settings -->
          <details style="border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 1rem; margin-top: 0.5rem;">
            <summary style="cursor: pointer; font-weight: 500; color: var(--text-secondary);">Advanced Settings</summary>
            <div style="margin-top: 0.75rem; display: flex; gap: 1rem;">
              <div class="form-group" style="flex: 1; margin: 0;">
                <label class="form-label">Timeout (ms)</label>
                <input type="number" id="cf-timeout" class="form-input" value="${func.timeout_ms}" min="1000" max="300000">
              </div>
              <div class="form-group" style="flex: 1; margin: 0;">
                <label class="form-label">Max Retries</label>
                <input type="number" id="cf-retries" class="form-input" value="${func.max_retries}" min="0" max="5">
              </div>
            </div>
          </details>
        </div>
        <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
          <button id="save-custom-function-btn" class="btn btn-primary" style="width: 100%;">
            ${isEdit ? 'Save Changes' : 'Create Function'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Store temp data for manipulation
    this.modalHeaders = [...(func.headers || [])];
    this.modalParams = [...(func.body_schema || [])];
    this.modalResponseVars = [...(func.response_variables || [])];

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Add header button
    modal.querySelector('#add-header-btn').addEventListener('click', () => {
      this.modalHeaders.push({ name: '', value: '' });
      this.refreshModalHeaders();
    });

    // Add param button
    modal.querySelector('#add-param-btn').addEventListener('click', () => {
      this.modalParams.push({ name: '', type: 'string', description: '', required: false });
      this.refreshModalParams();
    });

    // Add response var button
    modal.querySelector('#add-response-var-btn').addEventListener('click', () => {
      this.modalResponseVars.push({ name: '', json_path: '' });
      this.refreshModalResponseVars();
    });

    // Save button
    modal.querySelector('#save-custom-function-btn').addEventListener('click', async () => {
      await this.saveCustomFunction(existingFunction?.id);
    });

    // Attach remove listeners for existing rows
    this.attachModalRowListeners();
  },

  renderHeaderRow(header, index) {
    return `
      <div class="cf-row" data-index="${index}" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
        <input type="text" class="form-input cf-header-name" placeholder="Header Name" value="${header.name || ''}" style="flex: 1;">
        <input type="text" class="form-input cf-header-value" placeholder="Header Value" value="${header.value || ''}" style="flex: 1;">
        <button type="button" class="btn btn-sm btn-secondary cf-remove-header" style="padding: 0.5rem;">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
  },

  renderParamRow(param, index) {
    return `
      <div class="cf-row" data-index="${index}" style="border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="text" class="form-input cf-param-name" placeholder="Parameter name" value="${param.name || ''}" style="flex: 1; font-family: monospace;">
          <select class="form-select cf-param-type" style="width: 100px;">
            <option value="string" ${param.type === 'string' ? 'selected' : ''}>String</option>
            <option value="number" ${param.type === 'number' ? 'selected' : ''}>Number</option>
            <option value="boolean" ${param.type === 'boolean' ? 'selected' : ''}>Boolean</option>
          </select>
          <label style="display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; white-space: nowrap;">
            <input type="checkbox" class="cf-param-required" ${param.required ? 'checked' : ''}>
            Required
          </label>
          <button type="button" class="btn btn-sm btn-secondary cf-remove-param" style="padding: 0.5rem;">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <input type="text" class="form-input cf-param-desc" placeholder="Description for the AI (e.g., 'The customer's order ID')" value="${param.description || ''}" style="font-size: 0.875rem;">
      </div>
    `;
  },

  renderResponseVarRow(variable, index) {
    return `
      <div class="cf-row" data-index="${index}" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
        <input type="text" class="form-input cf-var-name" placeholder="Variable name" value="${variable.name || ''}" style="flex: 1; font-family: monospace;">
        <input type="text" class="form-input cf-var-path" placeholder="JSON path (e.g., $.data.status)" value="${variable.json_path || ''}" style="flex: 1; font-family: monospace;">
        <button type="button" class="btn btn-sm btn-secondary cf-remove-var" style="padding: 0.5rem;">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
  },

  refreshModalHeaders() {
    const container = document.getElementById('cf-headers-list');
    if (container) {
      container.innerHTML = this.modalHeaders.map((h, i) => this.renderHeaderRow(h, i)).join('');
      this.attachModalRowListeners();
    }
  },

  refreshModalParams() {
    const container = document.getElementById('cf-params-list');
    if (container) {
      container.innerHTML = this.modalParams.map((p, i) => this.renderParamRow(p, i)).join('');
      this.attachModalRowListeners();
    }
  },

  refreshModalResponseVars() {
    const container = document.getElementById('cf-response-vars-list');
    if (container) {
      container.innerHTML = this.modalResponseVars.map((v, i) => this.renderResponseVarRow(v, i)).join('');
      this.attachModalRowListeners();
    }
  },

  attachModalRowListeners() {
    // Header remove buttons
    document.querySelectorAll('.cf-remove-header').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.modalHeaders.splice(i, 1);
        this.refreshModalHeaders();
      });
    });

    // Param remove buttons
    document.querySelectorAll('.cf-remove-param').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.modalParams.splice(i, 1);
        this.refreshModalParams();
      });
    });

    // Response var remove buttons
    document.querySelectorAll('.cf-remove-var').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.modalResponseVars.splice(i, 1);
        this.refreshModalResponseVars();
      });
    });

    // Update header values on input
    document.querySelectorAll('.cf-header-name').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalHeaders[i].name = input.value;
      });
    });
    document.querySelectorAll('.cf-header-value').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalHeaders[i].value = input.value;
      });
    });

    // Update param values on input
    document.querySelectorAll('.cf-param-name').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalParams[i].name = input.value;
      });
    });
    document.querySelectorAll('.cf-param-type').forEach((select, i) => {
      select.addEventListener('change', () => {
        this.modalParams[i].type = select.value;
      });
    });
    document.querySelectorAll('.cf-param-desc').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalParams[i].description = input.value;
      });
    });
    document.querySelectorAll('.cf-param-required').forEach((checkbox, i) => {
      checkbox.addEventListener('change', () => {
        this.modalParams[i].required = checkbox.checked;
      });
    });

    // Update response var values on input
    document.querySelectorAll('.cf-var-name').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalResponseVars[i].name = input.value;
      });
    });
    document.querySelectorAll('.cf-var-path').forEach((input, i) => {
      input.addEventListener('input', () => {
        this.modalResponseVars[i].json_path = input.value;
      });
    });
  },

  async saveCustomFunction(existingId = null) {
    const name = document.getElementById('cf-name').value.trim();
    const description = document.getElementById('cf-description').value.trim();
    const http_method = document.getElementById('cf-method').value;
    const endpoint_url = document.getElementById('cf-url').value.trim();
    const timeout_ms = parseInt(document.getElementById('cf-timeout').value) || 120000;
    const max_retries = parseInt(document.getElementById('cf-retries').value) || 2;

    // Validation
    if (!name) {
      showToast('Function name is required', 'error');
      return;
    }
    if (!CustomFunction.isValidName(name)) {
      showToast('Function name must be snake_case (lowercase letters, numbers, underscores only)', 'error');
      return;
    }
    if (!description) {
      showToast('Description is required', 'error');
      return;
    }
    if (!endpoint_url) {
      showToast('Endpoint URL is required', 'error');
      return;
    }
    try {
      new URL(endpoint_url);
    } catch {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    const functionData = {
      name,
      description,
      http_method,
      endpoint_url,
      headers: this.modalHeaders.filter(h => h.name),
      body_schema: this.modalParams.filter(p => p.name),
      response_variables: this.modalResponseVars.filter(v => v.name && v.json_path),
      timeout_ms,
      max_retries
    };

    try {
      let result;
      if (existingId) {
        result = await CustomFunction.update(existingId, functionData);
      } else {
        result = await CustomFunction.create(this.userId, this.agent.id, functionData);
      }

      if (result.error) {
        console.error('Error saving custom function:', result.error);
        if (result.error.message?.includes('unique_function_name_per_agent')) {
          showToast('A function with this name already exists for this agent', 'error');
        } else {
          showToast('Failed to save function. Please try again.', 'error');
        }
        return;
      }

      // Refresh the list
      const { functions } = await CustomFunction.listByAgent(this.agent.id);
      this.customFunctions = functions || [];

      // Update the UI
      const listContainer = document.getElementById('custom-functions-list');
      if (listContainer) {
        listContainer.innerHTML = this.customFunctions.length === 0
          ? '<div class="no-numbers-message">No custom functions configured</div>'
          : this.customFunctions.map(f => this.renderCustomFunctionCard(f)).join('');
        this.attachCustomFunctionListeners();
      }

      // Close modal
      document.getElementById('custom-function-modal')?.remove();
    } catch (err) {
      console.error('Error saving custom function:', err);
      showToast('Failed to save function. Please try again.', 'error');
    }
  },

  async deleteCustomFunction(func) {
    this.showConfirmModal({
      title: 'Delete Function',
      message: `Are you sure you want to delete <strong>${func.name}</strong>? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          const { error } = await CustomFunction.delete(func.id);
          if (error) {
            console.error('Error deleting custom function:', error);
            showToast('Failed to delete function', 'error');
            return;
          }

          // Refresh the list
          this.customFunctions = this.customFunctions.filter(f => f.id !== func.id);

          // Update the UI
          const listContainer = document.getElementById('custom-functions-list');
          if (listContainer) {
            listContainer.innerHTML = this.customFunctions.length === 0
              ? '<div class="no-numbers-message">No custom functions configured</div>'
              : this.customFunctions.map(f => this.renderCustomFunctionCard(f)).join('');
            this.attachCustomFunctionListeners();
          }
        } catch (err) {
          console.error('Error deleting custom function:', err);
          showToast('Failed to delete function', 'error');
        }
      }
    });
  },

  async toggleCustomFunctionActive(func) {
    try {
      const { error } = await CustomFunction.toggleActive(func.id, !func.is_active);
      if (error) {
        console.error('Error toggling custom function:', error);
        return;
      }

      // Update local state
      func.is_active = !func.is_active;

      // Update the card UI
      const card = document.querySelector(`.custom-function-card[data-function-id="${func.id}"]`);
      if (card) {
        card.outerHTML = this.renderCustomFunctionCard(func);
        this.attachCustomFunctionListeners();
      }
    } catch (err) {
      console.error('Error toggling custom function:', err);
    }
  },

  async showTransferModal(enablingMode = false) {
    try {
      // enablingMode = true means user is trying to enable the function, needs valid config to proceed
      this._transferEnablingMode = enablingMode;

      // Load transfer numbers from functions config (or fall back to table for migration)
      let numbers = this.agent.functions?.transfer?.numbers || [];

      // If no numbers in functions, try loading from legacy table
      if (numbers.length === 0) {
        const { data: transferNumbers, error } = await supabase
          .from('transfer_numbers')
          .select('*')
          .eq('user_id', this.agent.user_id)
          .order('created_at', { ascending: true });

        if (!error && transferNumbers?.length > 0) {
          // Convert legacy format to new format
          numbers = transferNumbers.map(n => ({
            number: n.phone_number,
            label: n.label || '',
            description: '',
          }));
        }
      }

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.id = 'transfer-modal';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 500px; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="voice-modal-header">
          <h3>Transfer Numbers</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem; flex: 1; overflow-y: auto;">
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Add phone numbers where calls can be transferred. The agent will offer these options to callers.
          </p>
          <div id="transfer-numbers-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${numbers.length === 0 ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No transfer numbers configured</p>' : ''}
            ${numbers.map((num, index) => this.renderTransferNumberRow(num, index)).join('')}
          </div>
          <button id="add-transfer-number-btn" style="
            width: 100%;
            margin-top: 1rem;
            padding: 0.75rem;
            background: var(--bg-secondary, #f3f4f6);
            border: 1px dashed var(--border-color, #e5e7eb);
            border-radius: 8px;
            color: var(--text-secondary);
            font-size: 0.875rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          ">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Transfer Number
          </button>
        </div>
        <div style="padding: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
          <button id="save-transfer-numbers-btn" class="btn btn-primary" style="width: 100%;">
            Save Changes
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Store numbers for manipulation
    this.modalTransferNumbers = [...numbers];

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Add number button
    modal.querySelector('#add-transfer-number-btn').addEventListener('click', () => {
      this.modalTransferNumbers.push({ number: '', label: '', description: '' });
      this.refreshTransferNumbersList();
    });

    // Save button
    modal.querySelector('#save-transfer-numbers-btn').addEventListener('click', async () => {
      await this.saveTransferNumbers();
      modal.remove();
    });

    // Attach input listeners
    this.attachTransferModalListeners();
    } catch (err) {
      console.error('Error in showTransferModal:', err);
    }
  },

  renderTransferNumberRow(num, index) {
    // Support both 'number' (new) and 'phone_number' (legacy) field names
    let displayNumber = num.number || num.phone_number || '';
    if (displayNumber.startsWith('+1')) {
      displayNumber = displayNumber.substring(2);
    }

    return `
      <div class="transfer-row" data-index="${index}" style="
        background: var(--bg-secondary, #f9fafb);
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        padding: 0.75rem;
      ">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input
            type="text"
            class="transfer-label-input form-input"
            placeholder="Label (e.g., Sales, Support)"
            value="${num.label || ''}"
            data-index="${index}"
            style="flex: 1; font-size: 0.875rem;"
          />
          <button class="remove-transfer-btn btn btn-icon" data-index="${index}" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.25rem;
          ">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <div style="flex: 1; display: flex;">
            <span style="
              background: #eff6ff;
              border: 1px solid #dbeafe;
              border-right: none;
              border-radius: 6px 0 0 6px;
              padding: 0.5rem 0.5rem;
              font-size: 0.875rem;
              color: #64748b;
            ">+1</span>
            <input
              type="tel"
              class="transfer-phone-input form-input"
              placeholder="Phone number"
              value="${displayNumber}"
              data-index="${index}"
              maxlength="14"
              style="flex: 1; border-radius: 0 6px 6px 0; font-size: 0.875rem;"
            />
          </div>
        </div>
        <div>
          <input
            type="text"
            class="transfer-description-input form-input"
            placeholder="When to transfer (e.g., Transfer for billing questions)"
            value="${num.description || ''}"
            data-index="${index}"
            style="width: 100%; font-size: 0.875rem;"
          />
        </div>
      </div>
    `;
  },

  refreshTransferNumbersList() {
    const container = document.getElementById('transfer-numbers-list');
    if (!container) return;

    container.innerHTML = this.modalTransferNumbers.length === 0
      ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No transfer numbers configured</p>'
      : this.modalTransferNumbers.map((num, index) => this.renderTransferNumberRow(num, index)).join('');

    this.attachTransferModalListeners();
  },

  attachTransferModalListeners() {
    const modal = document.getElementById('transfer-modal');
    if (!modal) return;

    // Label inputs
    modal.querySelectorAll('.transfer-label-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalTransferNumbers[index].label = e.target.value;
      });
    });

    // Phone inputs with formatting
    modal.querySelectorAll('.transfer-phone-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        let value = e.target.value.replace(/\D/g, '');

        // Format as (XXX) XXX-XXXX
        if (value.length > 0) {
          if (value.length <= 3) {
            value = `(${value}`;
          } else if (value.length <= 6) {
            value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
          } else {
            value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
          }
        }
        e.target.value = value;

        // Store as +1XXXXXXXXXX
        const digits = value.replace(/\D/g, '');
        this.modalTransferNumbers[index].number = digits.length === 10 ? `+1${digits}` : '';
      });
    });

    // Description inputs
    modal.querySelectorAll('.transfer-description-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.modalTransferNumbers[index].description = e.target.value;
      });
    });

    // Remove buttons
    modal.querySelectorAll('.remove-transfer-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.modalTransferNumbers.splice(index, 1);
        this.refreshTransferNumbersList();
      });
    });
  },

  async saveTransferNumbers() {
    const saveBtn = document.querySelector('#save-transfer-numbers-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      // Filter out empty entries and normalize format
      const validNumbers = this.modalTransferNumbers
        .filter(num => num.label || num.number || num.phone_number)
        .map(num => ({
          number: num.number || num.phone_number || '',
          label: num.label || '',
          description: num.description || '',
        }));

      // If enabling mode and no valid numbers, don't enable
      if (this._transferEnablingMode && validNumbers.length === 0) {
        showToast('Please add at least one transfer number to enable this function.', 'warning');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
        return;
      }

      // If enabling mode and has valid numbers, enable the function
      const shouldEnable = this._transferEnablingMode && validNumbers.length > 0;

      // Save to functions.transfer.numbers
      const functions = {
        ...this.agent.functions,
        transfer: {
          ...this.agent.functions?.transfer,
          enabled: shouldEnable ? true : (this.agent.functions?.transfer?.enabled ?? false),
          numbers: validNumbers,
        },
      };
      this.agent.functions = functions;
      await this.scheduleAutoSave({ functions });

      // Update checkbox if we enabled
      if (shouldEnable) {
        const checkbox = document.getElementById('func-transfer');
        if (checkbox) checkbox.checked = true;
      }

      this._transferEnablingMode = false;
    } catch (err) {
      console.error('Error saving transfer numbers:', err);
      showToast('Failed to save transfer numbers. Please try again.', 'error');
    }
  },

};
