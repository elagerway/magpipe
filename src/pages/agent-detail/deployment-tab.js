import { supabase } from '../../lib/supabase.js';
import { ChatWidget } from '../../models/ChatWidget.js';
import { showToast } from '../../lib/toast.js';
import { formatPhoneNumber } from '../../lib/formatters.js';

const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';

export const deploymentTabMethods = {
  renderDeploymentTab() {
    const agentType = this.agent.agent_type || 'inbound_voice';
    const showEmail = agentType === 'email';
    const showChat = agentType === 'chat_widget';
    const showWhatsApp = agentType === 'whatsapp';
    const isTextAgent = agentType === 'text';
    const isOutboundAgent = agentType === 'outbound_voice';
    const column = isTextAgent ? 'text_agent_id' : isOutboundAgent ? 'outbound_agent_id' : 'agent_id';

    const assignedNumbers = this.serviceNumbers.filter(n =>
      n.agent_id === this.agent.id || n.outbound_agent_id === this.agent.id || n.text_agent_id === this.agent.id
    );
    const isPhoneAgent = ['inbound_voice', 'outbound_voice', 'text'].includes(agentType);
    const showPhone = isPhoneAgent || assignedNumbers.length > 0;
    const availableNumbers = this.serviceNumbers.filter(n => !n[column] || n[column] === SYSTEM_AGENT_ID);

    return `
      ${showWhatsApp ? this.renderWhatsAppSection() : ''}
      ${showPhone ? `
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">${isTextAgent ? 'Text Numbers' : 'Phone Numbers'}</h3>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button id="buy-number-btn" class="btn btn-sm btn-secondary" style="display: flex; align-items: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Number
            </button>
            ${isPhoneAgent && availableNumbers.length > 0 ? `
              <button class="btn btn-primary btn-sm" id="assign-numbers-btn" style="display: flex; align-items: center;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Assign
              </button>
            ` : ''}
          </div>
        </div>
        <p class="section-desc">Assign phone numbers to this agent for handling ${isTextAgent ? 'text messages' : 'calls'}.</p>

        ${assignedNumbers.length > 0 ? `
          <div class="assigned-numbers">
            ${assignedNumbers.map(num => {
              // Determine which slot this agent is actually in (may differ from agent type)
              const numColumn = num.agent_id === this.agent.id ? 'agent_id'
                : num.outbound_agent_id === this.agent.id ? 'outbound_agent_id'
                : 'text_agent_id';
              const label = num.isSipTrunk
                ? `${this.agent.name} - ${num.trunkName || 'SIP Trunk'}`
                : this.agent.name;
              return `
              <div class="assigned-number">
                <div class="number-info">
                  <span class="number-value">${formatPhoneNumber(num.phone_number)}</span>
                  <span class="number-name">(${label})</span>
                </div>
                <button class="btn btn-sm btn-secondary detach-btn" data-number-id="${num.id}" data-column="${numColumn}" data-is-sip="${num.isSipTrunk || false}">Detach</button>
              </div>
            `;}).join('')}
          </div>
        ` : `
          <div class="no-numbers-message">No phone numbers assigned to this agent</div>
        `}

        ${this.serviceNumbers.length === 0 ? `
          <div class="no-numbers-available">
            <p>You don't have any phone numbers yet.</p>
            <button class="btn btn-primary" id="get-phone-number-btn">Get a Phone Number</button>
          </div>
        ` : ''}
      </div>
      ` : ''}

      <!-- Email Section -->
      ${showEmail ? this.renderEmailSection() : ''}

      <!-- Chat Section -->
      ${showChat ? `
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Chat</h3>
          ${!this.chatWidget ? `
            <button class="btn btn-primary btn-sm" id="create-widget-btn" style="display: flex; align-items: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Widget
            </button>
          ` : ''}
        </div>
        <p class="section-desc">Embed a chat widget on your website so visitors can interact with this agent.</p>

        ${this.chatWidget ? `
          <div class="assigned-numbers">
            <div class="assigned-number" style="flex-direction: column; align-items: flex-start; gap: 0.75rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="number-info">
                  <span class="widget-status-dot ${this.chatWidget.is_active ? 'active' : 'inactive'}"></span>
                  <span class="number-value">${this.chatWidget.name || 'Website Chat'}</span>
                  <span class="number-name">(${this.chatWidget.is_active ? 'Active' : 'Inactive'})</span>
                </div>
                <label class="toggle-switch-sm">
                  <input type="checkbox" id="widget-active-toggle" ${this.chatWidget.is_active ? 'checked' : ''} />
                  <span class="toggle-slider-sm"></span>
                </label>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-sm btn-primary" id="get-embed-code-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                  </svg>
                  Get Embed Code
                </button>
                <button class="btn btn-sm btn-secondary" id="widget-settings-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  Settings
                </button>
                <button class="btn btn-sm ${this.chatWidget.is_portal_widget ? 'btn-primary' : 'btn-secondary'}" id="portal-widget-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                  </svg>
                  ${this.chatWidget.is_portal_widget ? 'On Portal' : 'Add to Portal'}
                </button>
                <button class="btn btn-sm btn-secondary" id="delete-widget-btn" style="color: #ef4444;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ` : `
          <div class="no-numbers-message">No chat widget configured for this agent</div>
        `}
      </div>
      ` : ''}
    `;
  },

  attachDeploymentTabListeners() {
    // Detach buttons
    document.querySelectorAll('.detach-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        const column = btn.dataset.column || null;
        await this.detachNumber(numberId, column);
      });
    });

    // Assign numbers button - opens modal
    const assignBtn = document.getElementById('assign-numbers-btn');
    if (assignBtn) {
      assignBtn.addEventListener('click', () => {
        this.showAssignNumbersModal();
      });
    }

    // Buy number buttons - open inline purchase modal
    const buyNumberBtn = document.getElementById('buy-number-btn');
    if (buyNumberBtn) { buyNumberBtn.addEventListener('click', () => this.showBuyNumberModal()); }

    const getPhoneNumberBtn = document.getElementById('get-phone-number-btn');
    if (getPhoneNumberBtn) { getPhoneNumberBtn.addEventListener('click', () => this.showBuyNumberModal()); }

    // WhatsApp buttons
    this.attachWhatsAppListeners();

    // Chat Widget buttons
    const createWidgetBtn = document.getElementById('create-widget-btn');
    if (createWidgetBtn) {
      createWidgetBtn.addEventListener('click', () => this.createChatWidget());
    }

    const getEmbedCodeBtn = document.getElementById('get-embed-code-btn');
    if (getEmbedCodeBtn) {
      getEmbedCodeBtn.addEventListener('click', () => this.showEmbedCodeModal());
    }

    const widgetSettingsBtn = document.getElementById('widget-settings-btn');
    if (widgetSettingsBtn) {
      widgetSettingsBtn.addEventListener('click', () => {
        window.router.navigate(`/chat-widget/${this.chatWidget.id}`);
      });
    }

    const deleteWidgetBtn = document.getElementById('delete-widget-btn');
    if (deleteWidgetBtn) {
      deleteWidgetBtn.addEventListener('click', () => this.deleteChatWidget());
    }

    const portalWidgetBtn = document.getElementById('portal-widget-btn');
    if (portalWidgetBtn) {
      portalWidgetBtn.addEventListener('click', () => this.togglePortalWidget());
    }

    const widgetActiveToggle = document.getElementById('widget-active-toggle');
    if (widgetActiveToggle) {
      widgetActiveToggle.addEventListener('change', async () => {
        await this.toggleChatWidgetActive(widgetActiveToggle.checked);
      });
    }

    // Email section listeners
    const connectEmailBtn = document.getElementById('connect-email-btn');
    if (connectEmailBtn) {
      connectEmailBtn.addEventListener('click', () => this.connectEmail());
    }

    const emailActiveToggle = document.getElementById('email-active-toggle');
    if (emailActiveToggle) {
      emailActiveToggle.addEventListener('change', async () => {
        if (!this.emailConfig) {
          // No config yet — create one on first enable
          await this.assignEmail();
        } else {
          await this.saveEmailConfig({ is_active: emailActiveToggle.checked });
        }
      });
    }

    const emailSendAs = document.getElementById('email-send-as');
    if (emailSendAs) {
      emailSendAs.addEventListener('blur', async () => {
        await this.saveEmailConfig({ send_as_email: emailSendAs.value.trim() || null });
      });
    }

    const emailAgentMode = document.getElementById('email-agent-mode');
    if (emailAgentMode) {
      emailAgentMode.addEventListener('change', async () => {
        await this.saveEmailConfig({ agent_mode: emailAgentMode.value });
      });
    }

    const detachEmailBtn = document.getElementById('detach-email-btn');
    if (detachEmailBtn) {
      detachEmailBtn.addEventListener('click', () => this.detachEmail());
    }
  },

  async assignNumber(numberId) {
    try {
      const num = this.serviceNumbers.find(n => n.id === numberId);
      const table = num?.isSipTrunk ? 'external_sip_numbers' : 'service_numbers';
      const isTextAgent = this.agent.agent_type === 'text';
      const isOutboundAgent = this.agent.agent_type === 'outbound_voice';
      const column = isTextAgent ? 'text_agent_id' : isOutboundAgent ? 'outbound_agent_id' : 'agent_id';

      const { error } = await supabase
        .from(table)
        .update({ [column]: this.agent.id })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      if (num) num[column] = this.agent.id;

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error assigning number:', err);
      showToast('Failed to assign number. Please try again.', 'error');
    }
  },

  async detachNumber(numberId, explicitColumn = null) {
    try {
      const num = this.serviceNumbers.find(n => n.id === numberId);
      const table = num?.isSipTrunk ? 'external_sip_numbers' : 'service_numbers';
      const isTextAgent = this.agent.agent_type === 'text';
      const isOutboundAgent = this.agent.agent_type === 'outbound_voice';
      const column = explicitColumn || (isTextAgent ? 'text_agent_id' : isOutboundAgent ? 'outbound_agent_id' : 'agent_id');

      const { error } = await supabase
        .from(table)
        .update({ [column]: null })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      if (num) num[column] = null;

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error detaching number:', err);
      showToast('Failed to detach number. Please try again.', 'error');
    }
  },

  async createChatWidget() {
    try {
      const { widget, error } = await ChatWidget.create({
        user_id: this.userId,
        agent_id: this.agent.id,
        name: `${this.agent.name} Chat`,
        primary_color: '#6366f1',
        welcome_message: 'Hi! How can I help you today?',
      });

      if (error) {
        console.error('Error creating widget:', error);
        showToast('Failed to create chat widget. Please try again.', 'error');
        return;
      }

      this.chatWidget = widget;
      this.switchTab('deployment');
    } catch (err) {
      console.error('Error creating widget:', err);
      showToast('Failed to create chat widget. Please try again.', 'error');
    }
  },

  async toggleChatWidgetActive(isActive) {
    if (!this.chatWidget) return;

    try {
      const { widget, error } = await ChatWidget.setActive(this.chatWidget.id, isActive);

      if (error) {
        console.error('Error updating widget:', error);
        return;
      }

      this.chatWidget = widget;
      this.switchTab('deployment');
    } catch (err) {
      console.error('Error updating widget:', err);
    }
  },

  async deleteChatWidget() {
    if (!this.chatWidget) return;

    this.showConfirmModal(
      'Delete Chat Widget',
      'Are you sure you want to delete this chat widget? This will remove the widget from your website and delete all chat history.',
      async () => {
        try {
          const { error } = await ChatWidget.delete(this.chatWidget.id);

          if (error) {
            console.error('Error deleting widget:', error);
            showToast('Failed to delete chat widget. Please try again.', 'error');
            return;
          }

          this.chatWidget = null;
          this.switchTab('deployment');
        } catch (err) {
          console.error('Error deleting widget:', err);
          showToast('Failed to delete chat widget. Please try again.', 'error');
        }
      },
      'Delete',
      'Cancel'
    );
  },

  async togglePortalWidget() {
    if (!this.chatWidget) return;

    const isCurrentlyPortal = this.chatWidget.is_portal_widget;

    if (isCurrentlyPortal) {
      // Remove from portal - no confirmation needed
      await this.executePortalToggle(false);
    } else {
      // Show confirmation modal before adding to portal
      this.showPortalConfirmModal();
    }
  },

  showPortalConfirmModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'portal-confirm-modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 420px;">
        <div class="modal-header">
          <h3>Add to Portal</h3>
          <button class="close-btn" id="close-portal-confirm">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 16px;">This will add the chat widget to your MAGPIPE portal, allowing you to chat with your own AI agent.</p>
          <p style="margin-bottom: 16px; color: var(--text-secondary);">The chat bubble will appear in the bottom-right corner of the app. Any existing portal widget will be replaced.</p>
          <p style="font-size: 13px; color: var(--text-tertiary);">You can remove it anytime from this page.</p>
        </div>
        <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-secondary" id="cancel-portal-confirm">Cancel</button>
          <button class="btn btn-primary" id="confirm-portal-add">Add to Portal</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('close-portal-confirm').addEventListener('click', () => modal.remove());
    document.getElementById('cancel-portal-confirm').addEventListener('click', () => modal.remove());
    document.getElementById('confirm-portal-add').addEventListener('click', async () => {
      modal.remove();
      await this.executePortalToggle(true);
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  },

  async executePortalToggle(addToPortal) {
    try {
      if (!addToPortal) {
        // Remove from portal
        const { widget, error } = await ChatWidget.update(this.chatWidget.id, {
          is_portal_widget: false
        });

        if (error) {
          console.error('Error removing from portal:', error);
          showToast('Failed to remove from portal. Please try again.', 'error');
          return;
        }

        this.chatWidget = widget;
      } else {
        // First, clear any existing portal widget for this user
        const { data: existingWidgets } = await supabase
          .from('chat_widgets')
          .select('id')
          .eq('user_id', this.userId)
          .eq('is_portal_widget', true);

        if (existingWidgets && existingWidgets.length > 0) {
          await supabase
            .from('chat_widgets')
            .update({ is_portal_widget: false })
            .eq('user_id', this.userId)
            .eq('is_portal_widget', true);
        }

        // Now set this widget as the portal widget
        const { widget, error } = await ChatWidget.update(this.chatWidget.id, {
          is_portal_widget: true
        });

        if (error) {
          console.error('Error adding to portal:', error);
          showToast('Failed to add to portal. Please try again.', 'error');
          return;
        }

        this.chatWidget = widget;
      }

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error toggling portal widget:', err);
      showToast('Failed to update portal widget. Please try again.', 'error');
    }
  },

  showEmbedCodeModal() {
    if (!this.chatWidget) return;

    const embedCode = `<!-- Solo Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['SoloWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','MagpipeChat','https://magpipe.ai/widget/magpipe-chat.js'));
  MagpipeChat('init', { widgetKey: '${this.chatWidget.widget_key}' });
</script>`;

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 550px;">
        <div class="voice-modal-header">
          <h3>Embed Code</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem;">
          <p style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Copy and paste this code into your website's HTML, just before the closing <code>&lt;/body&gt;</code> tag.
          </p>
          <textarea readonly style="
            width: 100%;
            height: 200px;
            padding: 0.75rem;
            font-family: monospace;
            font-size: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            resize: none;
            background: var(--bg-secondary);
          ">${embedCode}</textarea>
          <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
            <button class="btn btn-primary" id="copy-embed-code-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy to Clipboard
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const copyBtn = modal.querySelector('#copy-embed-code-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(embedCode).then(() => {
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copied!
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy to Clipboard
          `;
        }, 2000);
      });
    });
  },

  showAssignNumbersModal() {
    const isTextAgent = this.agent.agent_type === 'text';
    const isOutboundAgent = this.agent.agent_type === 'outbound_voice';
    const column = isTextAgent ? 'text_agent_id' : isOutboundAgent ? 'outbound_agent_id' : 'agent_id';
    const availableNumbers = this.serviceNumbers.filter(n => !n[column] || n[column] === SYSTEM_AGENT_ID);

    if (availableNumbers.length === 0) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 450px;">
        <div class="voice-modal-header">
          <h3>Assign Phone Numbers</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1rem;">
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.9rem;">
            Select the phone numbers you want to assign to this agent.
          </p>
          <div class="number-list" style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto;">
            ${availableNumbers.map(num => {
              // Only show label for SIP trunks
              const label = num.isSipTrunk ? (num.trunkName || 'SIP Trunk') : '';
              return `
                <label class="number-option" style="
                  display: flex;
                  align-items: center;
                  gap: 0.75rem;
                  padding: 0.75rem;
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  cursor: pointer;
                  transition: background 0.15s;
                ">
                  <input type="checkbox" value="${num.id}" data-is-sip="${num.isSipTrunk || false}" style="width: 18px; height: 18px; cursor: pointer;" />
                  <div style="flex: 1; display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-weight: 500;">${formatPhoneNumber(num.phone_number)}</span>
                    ${label ? `<span style="font-size: 0.8rem; color: var(--text-secondary);">(${label})</span>` : ''}
                  </div>
                </label>
              `;
            }).join('')}
          </div>
          <button class="assign-selected-btn" style="
            width: 100%;
            margin-top: 1rem;
            padding: 0.75rem 1rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
          " disabled>Assign Selected</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    const assignBtn = modal.querySelector('.assign-selected-btn');

    // Enable/disable button based on selection
    const updateButtonState = () => {
      const checked = modal.querySelectorAll('input[type="checkbox"]:checked');
      assignBtn.disabled = checked.length === 0;
      assignBtn.textContent = checked.length > 0 ? `Assign ${checked.length} Number${checked.length > 1 ? 's' : ''}` : 'Assign Selected';
    };

    checkboxes.forEach(cb => {
      cb.addEventListener('change', updateButtonState);
    });

    // Hover effect for labels
    modal.querySelectorAll('.number-option').forEach(label => {
      label.addEventListener('mouseenter', () => {
        label.style.background = 'var(--bg-secondary, #f9fafb)';
      });
      label.addEventListener('mouseleave', () => {
        label.style.background = '';
      });
    });

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Assign button
    assignBtn.addEventListener('click', async () => {
      const selectedIds = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      if (selectedIds.length > 0) {
        assignBtn.disabled = true;
        assignBtn.textContent = 'Assigning...';
        await this.assignMultipleNumbers(selectedIds);
        document.body.removeChild(modal);
      }
    });
  },

  showBuyNumberModal() {
    document.getElementById('buy-number-modal-overlay')?.remove();

    let step = 'search';
    let searchResults = [];
    let selectedNumber = null;
    let provisionedNumber = null;
    let errorMessage = '';
    let selectedCountry = 'US';
    let selectedType = 'local';

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'buy-number-modal-overlay';

    const closeModal = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && step !== 'provisioning') closeModal();
    });

    const getModalHTML = () => {
      if (step === 'search') {
        return `
          <div class="contact-modal" style="max-width: 460px;" onclick="event.stopPropagation()">
            <div class="contact-modal-header">
              <h3>Get a Phone Number</h3>
              <button class="close-modal-btn" id="buy-num-close">&times;</button>
            </div>
            <div class="contact-modal-body">
              <div class="form-group">
                <label class="form-label">Country</label>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="country-us" class="btn btn-sm btn-primary">US</button>
                  <button id="country-ca" class="btn btn-sm btn-secondary">Canada</button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Number Type</label>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="type-local" class="btn btn-sm btn-primary">Local</button>
                  <button id="type-tollfree" class="btn btn-sm btn-secondary">Toll-Free</button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Area Code</label>
                <input type="text" id="buy-num-area-code" class="form-input" placeholder="e.g. 604" maxlength="3" />
              </div>
              <div id="buy-num-error" style="display:none; color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;"></div>
            </div>
            <div class="contact-modal-footer">
              <button class="btn btn-secondary" id="buy-num-cancel">Cancel</button>
              <button class="btn btn-primary" id="buy-num-search">Search</button>
            </div>
          </div>
        `;
      }

      if (step === 'results') {
        const rows = searchResults.length === 0
          ? `<div style="text-align:center; padding: 2rem; color: var(--text-secondary);">No numbers found. Try a different area code.</div>`
          : searchResults.map(n => `
            <div class="buy-num-result-row" data-number="${n.phone_number}" style="
              display: flex; align-items: center; gap: 0.75rem;
              padding: 0.75rem; border: 1px solid var(--border-color);
              border-radius: 8px; cursor: pointer; transition: background 0.15s;
            ">
              <input type="radio" name="buy-num-select" value="${n.phone_number}" style="width:18px;height:18px;cursor:pointer;flex-shrink:0;" />
              <div style="flex:1;">
                <div style="font-weight:600;">${formatPhoneNumber(n.phone_number)}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary);">${[n.locality, n.region].filter(Boolean).join(', ')}</div>
              </div>
              <div style="display:flex; gap:0.25rem; flex-shrink:0;">
                ${n.capabilities?.voice ? `<span style="font-size:0.7rem;padding:0.15rem 0.4rem;background:rgba(34,197,94,0.1);color:rgb(34,197,94);border-radius:4px;">Voice</span>` : ''}
                ${n.capabilities?.sms ? `<span style="font-size:0.7rem;padding:0.15rem 0.4rem;background:rgba(59,130,246,0.1);color:rgb(59,130,246);border-radius:4px;">SMS</span>` : ''}
              </div>
            </div>
          `).join('');

        return `
          <div class="contact-modal" style="max-width: 460px;" onclick="event.stopPropagation()">
            <div class="contact-modal-header">
              <h3>Choose a Number</h3>
              <button class="close-modal-btn" id="buy-num-close">&times;</button>
            </div>
            <div class="contact-modal-body scrollable">
              <div style="display:flex; flex-direction:column; gap:0.5rem;">${rows}</div>
            </div>
            <div class="contact-modal-footer">
              <button class="btn btn-secondary" id="buy-num-back">Back</button>
              <button class="btn btn-primary" id="buy-num-get" disabled>Get This Number</button>
            </div>
          </div>
        `;
      }

      if (step === 'provisioning') {
        return `
          <div class="contact-modal" style="max-width: 360px;" onclick="event.stopPropagation()">
            <div class="contact-modal-body" style="text-align:center; padding: 2.5rem 1.5rem;">
              <div class="spinner" style="margin: 0 auto 1rem;"></div>
              <p style="margin:0; color:var(--text-secondary);">Setting up your number...</p>
            </div>
          </div>
        `;
      }

      if (step === 'success') {
        return `
          <div class="contact-modal" style="max-width: 360px;" onclick="event.stopPropagation()">
            <div class="contact-modal-body" style="text-align:center; padding: 2.5rem 1.5rem;">
              <div style="width:52px;height:52px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <h3 style="margin:0 0 0.5rem;">Your number is ready!</h3>
              <p style="margin:0; color:var(--text-secondary);">${formatPhoneNumber(provisionedNumber)}</p>
            </div>
            <div class="contact-modal-footer" style="justify-content:center;">
              <button class="btn btn-primary" id="buy-num-done">Done</button>
            </div>
          </div>
        `;
      }

      if (step === 'error') {
        return `
          <div class="contact-modal" style="max-width: 360px;" onclick="event.stopPropagation()">
            <div class="contact-modal-body" style="text-align:center; padding: 2.5rem 1.5rem;">
              <div style="width:52px;height:52px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h3 style="margin:0 0 0.5rem;">Something went wrong</h3>
              <p style="margin:0; color:var(--text-secondary); font-size:0.875rem;">${errorMessage}</p>
            </div>
            <div class="contact-modal-footer" style="justify-content:center; gap:0.75rem;">
              <button class="btn btn-secondary" id="buy-num-close">Close</button>
              <button class="btn btn-primary" id="buy-num-try-again">Try Again</button>
            </div>
          </div>
        `;
      }
    };

    const attachStepListeners = () => {
      overlay.querySelector('#buy-num-close')?.addEventListener('click', closeModal);

      if (step === 'search') {
        const btnUS = overlay.querySelector('#country-us');
        const btnCA = overlay.querySelector('#country-ca');
        const btnLocal = overlay.querySelector('#type-local');
        const btnTollFree = overlay.querySelector('#type-tollfree');

        const syncCountryBtns = () => {
          btnUS.className = `btn btn-sm ${selectedCountry === 'US' ? 'btn-primary' : 'btn-secondary'}`;
          btnCA.className = `btn btn-sm ${selectedCountry === 'CA' ? 'btn-primary' : 'btn-secondary'}`;
        };
        const syncTypeBtns = () => {
          btnLocal.className = `btn btn-sm ${selectedType === 'local' ? 'btn-primary' : 'btn-secondary'}`;
          btnTollFree.className = `btn btn-sm ${selectedType === 'tollFree' ? 'btn-primary' : 'btn-secondary'}`;
        };

        btnUS.addEventListener('click', () => { selectedCountry = 'US'; syncCountryBtns(); });
        btnCA.addEventListener('click', () => { selectedCountry = 'CA'; syncCountryBtns(); });
        btnLocal.addEventListener('click', () => { selectedType = 'local'; syncTypeBtns(); });
        btnTollFree.addEventListener('click', () => { selectedType = 'tollFree'; syncTypeBtns(); });

        overlay.querySelector('#buy-num-cancel').addEventListener('click', closeModal);

        const searchBtn = overlay.querySelector('#buy-num-search');
        const areaCodeInput = overlay.querySelector('#buy-num-area-code');
        const errorDiv = overlay.querySelector('#buy-num-error');

        areaCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { searchBtn.click(); } });
        areaCodeInput.focus();

        searchBtn.addEventListener('click', async () => {
          const areaCode = areaCodeInput.value.trim();
          if (!areaCode) {
            errorDiv.textContent = 'Please enter an area code.';
            errorDiv.style.display = 'block';
            return;
          }
          errorDiv.style.display = 'none';
          searchBtn.disabled = true;
          searchBtn.textContent = 'Searching...';

          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${supabaseUrl}/functions/v1/search-phone-numbers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ areaCode, country: selectedCountry, numberType: selectedType }),
            });
            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || 'Search failed');
            }
            const result = await response.json();
            searchResults = result.numbers || [];
            step = 'results';
            renderStep();
          } catch (err) {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
            errorDiv.textContent = err.message || 'Failed to search. Please try again.';
            errorDiv.style.display = 'block';
          }
        });
      }

      if (step === 'results') {
        const getBtn = overlay.querySelector('#buy-num-get');

        overlay.querySelectorAll('.buy-num-result-row').forEach(row => {
          const radio = row.querySelector('input[type="radio"]');
          row.addEventListener('click', () => {
            overlay.querySelectorAll('.buy-num-result-row').forEach(r => {
              r.style.background = '';
              r.querySelector('input[type="radio"]').checked = false;
            });
            row.style.background = 'rgba(99,102,241,0.08)';
            radio.checked = true;
            selectedNumber = row.dataset.number;
            getBtn.disabled = false;
          });
          row.addEventListener('mouseenter', () => { if (row.dataset.number !== selectedNumber) { row.style.background = 'rgba(99,102,241,0.04)'; } });
          row.addEventListener('mouseleave', () => { if (row.dataset.number !== selectedNumber) { row.style.background = ''; } });
        });

        overlay.querySelector('#buy-num-back').addEventListener('click', () => {
          step = 'search';
          selectedNumber = null;
          renderStep();
        });

        getBtn.addEventListener('click', async () => {
          if (!selectedNumber) { return; }
          step = 'provisioning';
          renderStep();

          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`${supabaseUrl}/functions/v1/provision-phone-number`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ phone_number: selectedNumber, agent_id: this.agent.id, agent_type: this.agent.agent_type }),
            });
            if (!response.ok) {
              const err = await response.json();
              throw new Error(err.message || err.error || 'Provisioning failed');
            }
            const result = await response.json();
            provisionedNumber = result.phoneNumber || selectedNumber;
            step = 'success';
            renderStep();
          } catch (err) {
            errorMessage = err.message || 'Failed to provision number. Please try again.';
            step = 'error';
            renderStep();
          }
        });
      }

      if (step === 'success') {
        overlay.querySelector('#buy-num-done').addEventListener('click', () => {
          closeModal();
          this.refreshDeploymentTab();
        });
      }

      if (step === 'error') {
        overlay.querySelector('#buy-num-try-again').addEventListener('click', () => {
          step = 'search';
          selectedNumber = null;
          errorMessage = '';
          renderStep();
        });
      }
    };

    const renderStep = () => {
      overlay.innerHTML = getModalHTML();
      attachStepListeners();
    };

    document.body.appendChild(overlay);
    renderStep();
  },

  async assignMultipleNumbers(numberIds) {
    try {
      const isTextAgent = this.agent.agent_type === 'text';
      const isOutboundAgent = this.agent.agent_type === 'outbound_voice';
      const column = isTextAgent ? 'text_agent_id' : isOutboundAgent ? 'outbound_agent_id' : 'agent_id';

      for (const numberId of numberIds) {
        const num = this.serviceNumbers.find(n => n.id === numberId);
        const table = num?.isSipTrunk ? 'external_sip_numbers' : 'service_numbers';

        const { error } = await supabase
          .from(table)
          .update({ [column]: this.agent.id })
          .eq('id', numberId);

        if (error) {
          console.error('Error assigning number:', error);
          continue;
        }

        if (num) num[column] = this.agent.id;
      }

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error assigning numbers:', err);
      showToast('Failed to assign some numbers. Please try again.', 'error');
    }
  },

  // --- WhatsApp section methods ---

  renderWhatsAppSection() {
    const accounts = this.whatsappAccounts || [];
    const agentAccounts = accounts.filter(a => a.agent_id === this.agent.id);
    const unassignedAccounts = accounts.filter(a => !a.agent_id);

    return `
    <div class="config-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#15803d"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </h3>
        <button class="btn btn-sm btn-primary" id="connect-whatsapp-btn" style="display: flex; align-items: center; gap: 0.4rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Connect Number
        </button>
      </div>
      <p class="section-desc">Connect a WhatsApp Business number to this agent. Messages will be handled automatically.</p>

      ${agentAccounts.length > 0 ? `
        <div class="assigned-numbers">
          ${agentAccounts.map(acc => `
            <div class="assigned-number">
              <div class="number-info">
                <span class="number-value">${acc.phone_number || acc.phone_number_id}</span>
                <span class="number-name">(${acc.display_name || 'WhatsApp Business'})</span>
              </div>
              <button class="btn btn-sm btn-secondary wa-disconnect-btn" data-account-id="${acc.id}" style="color: #ef4444;">Disconnect</button>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="no-numbers-message">No WhatsApp number connected to this agent</div>
      `}

      ${unassignedAccounts.length > 0 ? `
        <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <p class="section-desc" style="margin-bottom: 0.5rem;">Connected numbers not yet assigned:</p>
          ${unassignedAccounts.map(acc => `
            <div class="assigned-number">
              <div class="number-info">
                <span class="number-value">${acc.phone_number || acc.phone_number_id}</span>
                <span class="number-name">(${acc.display_name || 'WhatsApp Business'})</span>
              </div>
              <button class="btn btn-sm btn-primary wa-assign-btn" data-account-id="${acc.id}">Assign to Agent</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
    `;
  },

  attachWhatsAppListeners() {
    const connectBtn = document.getElementById('connect-whatsapp-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.showConnectWhatsAppModal());
    }

    document.querySelectorAll('.wa-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accountId = btn.dataset.accountId;
        await this.disconnectWhatsAppAccount(accountId);
      });
    });

    document.querySelectorAll('.wa-assign-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accountId = btn.dataset.accountId;
        await this.assignWhatsAppAccount(accountId);
      });
    });
  },

  showConnectWhatsAppModal() {
    const existing = document.getElementById('connect-wa-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'connect-wa-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); this._cleanupWASignup(); } };

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()">
        <div class="contact-modal-header">
          <h3>Connect WhatsApp Number</h3>
          <button class="close-modal-btn" id="close-wa-modal-btn">&times;</button>
        </div>
        <div class="contact-modal-body">
          <!-- Primary: Embedded Signup -->
          <div id="wa-embedded-signup-section">
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1.25rem;">
              Connect your WhatsApp Business number in a few clicks.
            </p>
            <button type="button" id="wa-meta-connect-btn" style="
              display: flex; align-items: center; justify-content: center; gap: 0.6rem;
              width: 100%; padding: 0.75rem 1rem;
              background: #1877F2; color: white; border: none; border-radius: 8px;
              font-size: 0.95rem; font-weight: 600; cursor: pointer;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Continue with Meta
            </button>
            <div id="wa-signup-status" style="display:none; margin-top: 1rem; padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; text-align: center;"></div>
            <div style="margin-top: 1.25rem; text-align: center;">
              <button type="button" id="wa-show-manual-btn" style="background:none; border:none; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; text-decoration: underline;">
                Enter credentials manually instead
              </button>
            </div>
          </div>

          <!-- Fallback: Manual form -->
          <form id="connect-wa-form" style="display: none;">
            <div class="form-group">
              <label class="form-label">WhatsApp Business Account ID (WABA ID)</label>
              <input type="text" id="wa-waba-id" class="form-input" placeholder="e.g. 4378166712468208" required />
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number ID</label>
              <input type="text" id="wa-phone-number-id" class="form-input" placeholder="e.g. 1056136157579586" required />
            </div>
            <div class="form-group">
              <label class="form-label">Access Token</label>
              <input type="password" id="wa-access-token" class="form-input" placeholder="EAAm..." required />
            </div>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem; font-size: 0.8rem; color: #15803d; margin-bottom: 0.5rem;">
              Find these in Meta for Developers → Your App → WhatsApp → API Setup
            </div>
            <div style="text-align: center; margin-top: 0.5rem;">
              <button type="button" id="wa-show-embedded-btn" style="background:none; border:none; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; text-decoration: underline;">
                ← Back to Connect with Meta
              </button>
            </div>
          </form>
        </div>
        <div class="contact-modal-footer">
          <button type="button" class="btn btn-secondary" id="wa-cancel-btn">Cancel</button>
          <button type="submit" form="connect-wa-form" class="btn btn-primary" id="connect-wa-submit-btn" style="display:none;">Connect</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('close-wa-modal-btn').onclick = () => { overlay.remove(); this._cleanupWASignup(); };
    document.getElementById('wa-cancel-btn').onclick = () => { overlay.remove(); this._cleanupWASignup(); };

    // Toggle manual form
    document.getElementById('wa-show-manual-btn').onclick = () => {
      document.getElementById('wa-embedded-signup-section').style.display = 'none';
      document.getElementById('connect-wa-form').style.display = 'block';
      document.getElementById('connect-wa-submit-btn').style.display = '';
    };
    document.getElementById('wa-show-embedded-btn').onclick = () => {
      document.getElementById('connect-wa-form').style.display = 'none';
      document.getElementById('wa-embedded-signup-section').style.display = 'block';
      document.getElementById('connect-wa-submit-btn').style.display = 'none';
    };

    // Load FB SDK and wire up Embedded Signup
    this._initFBSDK().then(() => {
      document.getElementById('wa-meta-connect-btn').onclick = () => this._launchEmbeddedSignup(overlay);
    });

    // Manual form submit
    document.getElementById('connect-wa-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const wabaId = document.getElementById('wa-waba-id').value.trim();
      const phoneNumberId = document.getElementById('wa-phone-number-id').value.trim();
      const accessToken = document.getElementById('wa-access-token').value.trim();
      const submitBtn = document.getElementById('connect-wa-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Connecting...';
      try {
        await this._connectWhatsAppAccount({ waba_id: wabaId, phone_number_id: phoneNumberId, access_token: accessToken });
        overlay.remove();
        this._cleanupWASignup();
      } catch (err) {
        showToast(err.message || 'Failed to connect WhatsApp', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Connect';
      }
    });
  },

  _initFBSDK() {
    if (window.FB) return Promise.resolve();
    return new Promise((resolve) => {
      window.fbAsyncInit = function() {
        FB.init({ appId: '902326325753936', autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
        resolve();
      };
      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        document.head.appendChild(js);
      } else {
        // SDK script already added but fbAsyncInit hasn't fired yet — wait
        const check = setInterval(() => { if (window.FB) { clearInterval(check); resolve(); } }, 100);
      }
    });
  },

  _launchEmbeddedSignup(overlay) {
    const btn = document.getElementById('wa-meta-connect-btn');
    const status = document.getElementById('wa-signup-status');
    btn.disabled = true;
    btn.textContent = 'Opening Meta...';

    const showStatus = (msg, isError = false) => {
      status.style.display = 'block';
      status.style.background = isError ? '#fef2f2' : '#f0fdf4';
      status.style.color = isError ? '#dc2626' : '#15803d';
      status.textContent = msg;
    };

    // Open Meta OAuth popup directly — avoids FB SDK async popup blocking
    const extras = encodeURIComponent(JSON.stringify({
      setup: {},
      featureName: 'whatsapp_embedded_signup',
      sessionInfoVersion: '3',
    }));
    const redirectUri = encodeURIComponent(`${window.location.origin}/whatsapp-callback.html`);
    const oauthUrl = `https://www.facebook.com/dialog/oauth?client_id=902326325753936&config_id=3230830187113383&response_type=code&display=popup&redirect_uri=${redirectUri}&extras=${extras}`;

    const w = 600, h = 700;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(oauthUrl, 'wa_signup', `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);

    if (!popup) {
      btn.disabled = false;
      btn.textContent = 'Continue with Meta';
      showStatus('Popup blocked — please allow popups for magpipe.ai and try again.', true);
      return;
    }

    // Listen for WA_EMBEDDED_SIGNUP (waba_id + phone_number_id) and our callback (code)
    let sessionInfo = {};
    let authCode = null;

    this._waMessageHandler = async (event) => {
      if (event.origin === 'https://www.facebook.com') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'WA_EMBEDDED_SIGNUP') sessionInfo = data.data || {};
        } catch (_) {}
        return;
      }

      if (event.origin === window.location.origin && event.data?.type === 'MAGPIPE_WA_CALLBACK') {
        authCode = event.data.code;
        const wabaId = sessionInfo.waba_id;
        const phoneNumberId = sessionInfo.phone_number_id;

        btn.disabled = false;
        btn.textContent = 'Continue with Meta';

        if (event.data.error || !authCode) {
          showStatus('Connection cancelled.', true);
          this._cleanupWASignup();
          return;
        }

        if (!wabaId || !phoneNumberId) {
          showStatus('Could not retrieve account info. Please use manual entry.', true);
          this._cleanupWASignup();
          return;
        }

        showStatus('Connecting your number...');
        try {
          await this._connectWhatsAppAccount({ code: authCode, waba_id: wabaId, phone_number_id: phoneNumberId });
          overlay.remove();
          this._cleanupWASignup();
        } catch (err) {
          showStatus(err.message || 'Connection failed.', true);
          this._cleanupWASignup();
        }
      }
    };
    window.addEventListener('message', this._waMessageHandler);

    // Detect if user closes popup without completing
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        if (!authCode) {
          btn.disabled = false;
          btn.textContent = 'Continue with Meta';
          this._cleanupWASignup();
        }
      }
    }, 500);
  },

  _cleanupWASignup() {
    if (this._waMessageHandler) {
      window.removeEventListener('message', this._waMessageHandler);
      this._waMessageHandler = null;
    }
  },

  async _connectWhatsAppAccount(payload) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Connection failed');

    // Assign to this agent
    const assignRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ account_id: result.account.id, agent_id: this.agent.id }),
    });
    if (!assignRes.ok) throw new Error('Failed to assign WhatsApp number to agent');

    showToast('WhatsApp number connected successfully', 'success');
    await this.loadWhatsAppAccounts();
    this.renderTabContent('deployment');
    this.attachDeploymentTabListeners();
  },

  async loadWhatsAppAccounts() {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    this.whatsappAccounts = result.accounts || [];
  },

  async disconnectWhatsAppAccount(accountId) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect?account_id=${accountId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    if (response.ok) {
      showToast('WhatsApp number disconnected', 'success');
      await this.loadWhatsAppAccounts();
      this.renderTabContent('deployment');
      this.attachDeploymentTabListeners();
    } else {
      showToast('Failed to disconnect', 'error');
    }
  },

  async assignWhatsAppAccount(accountId) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ account_id: accountId, agent_id: this.agent.id }),
    });
    if (!res.ok) { showToast('Failed to assign WhatsApp number', 'error'); return; }
    showToast('WhatsApp number assigned', 'success');
    await this.loadWhatsAppAccounts();
    this.renderTabContent('deployment');
    this.attachDeploymentTabListeners();
  },

  // --- Email section methods ---

  renderEmailSection() {
    const gmailAddress = this.gmailIntegration?.config?.gmail_address || this.gmailIntegration?.external_user_id || null;

    // State 3: Email configured for this agent
    if (this.emailConfig) {
      const displayEmail = this.emailConfig.gmail_address || gmailAddress || 'Gmail';
      return `
        <div class="config-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h3 style="margin: 0;">Email</h3>
            <label class="toggle-switch-sm">
              <input type="checkbox" id="email-active-toggle" ${this.emailConfig.is_active ? 'checked' : ''} />
              <span class="toggle-slider-sm"></span>
            </label>
          </div>
          <p class="section-desc">Let this agent handle email conversations via Gmail.</p>
          ${this.emailConfig.is_active ? '<p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.25rem 0 0.5rem; padding: 0.4rem 0.6rem; background: var(--bg-secondary); border-radius: 0.375rem;">Add-on: $0.01 per email sent or received</p>' : ''}

          <div class="assigned-numbers">
            <div class="assigned-number" style="flex-direction: column; align-items: flex-start; gap: 0.75rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div class="number-info">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem; flex-shrink: 0;">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <span class="number-value">${displayEmail}</span>
                  <span class="number-name">(${this.emailConfig.is_active ? 'Active' : 'Inactive'})</span>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Send As</label>
                  <input type="email" id="email-send-as" class="form-input" placeholder="${displayEmail}"
                    value="${this.emailConfig.send_as_email || ''}" />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">AI Mode</label>
                  <select id="email-agent-mode" class="form-select">
                    <option value="off" ${this.emailConfig.agent_mode === 'off' ? 'selected' : ''}>Off</option>
                    <option value="draft" ${this.emailConfig.agent_mode === 'draft' ? 'selected' : ''}>Draft</option>
                    <option value="auto" ${this.emailConfig.agent_mode === 'auto' ? 'selected' : ''}>Auto</option>
                  </select>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-sm btn-secondary" id="detach-email-btn" style="color: #ef4444;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  Detach
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // State 2: Gmail connected but not yet assigned to this agent — show toggle (off)
    if (this.gmailIntegration && gmailAddress) {
      return `
        <div class="config-section">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h3 style="margin: 0;">Email</h3>
            <label class="toggle-switch-sm">
              <input type="checkbox" id="email-active-toggle" />
              <span class="toggle-slider-sm"></span>
            </label>
          </div>
          <p class="section-desc">Let this agent handle email conversations via Gmail. <span style="color: var(--text-secondary);">Add-on: $0.01/email.</span></p>

          <div class="assigned-numbers">
            <div class="assigned-number">
              <div class="number-info">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem; flex-shrink: 0;">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span class="number-value">${gmailAddress}</span>
                <span class="number-name">(Inactive)</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // State 1: No Gmail connected
    return `
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Email</h3>
          <button class="btn btn-primary btn-sm" id="connect-email-btn" style="display: flex; align-items: center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Connect
          </button>
        </div>
        <p class="section-desc">Connect a Gmail account to let this agent handle email conversations.</p>
        <div class="no-numbers-message">No email configured for this agent</div>
      </div>
    `;
  },

  async connectEmail() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please log in again', 'error');
        return;
      }

      const response = await fetch('https://api.magpipe.ai/functions/v1/integration-oauth-start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          provider: 'google_email',
          redirect_path: `/agents/${this.agentId}?tab=deployment`,
        }),
      });

      const result = await response.json();

      if (result.url) {
        window.location.href = result.url;
      } else {
        showToast(result.error || 'Failed to start Gmail connection', 'error');
      }
    } catch (err) {
      console.error('Error connecting email:', err);
      showToast('Failed to start Gmail connection. Please try again.', 'error');
    }
  },

  async assignEmail() {
    if (!this.gmailIntegration) return;

    try {
      const gmailAddress = this.gmailIntegration.config?.gmail_address || null;

      const { data, error } = await supabase
        .from('agent_email_configs')
        .insert({
          agent_id: this.agentId,
          user_id: this.userId,
          integration_id: this.gmailIntegration.id,
          gmail_address: gmailAddress,
          agent_mode: 'off',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      this.emailConfig = data;
      this.switchTab('deployment');
      showToast('Email assigned to agent', 'success');
    } catch (err) {
      console.error('Error assigning email:', err);
      showToast('Failed to assign email. Please try again.', 'error');
    }
  },

  async saveEmailConfig(updates) {
    if (!this.emailConfig) return;

    try {
      const { data, error } = await supabase
        .from('agent_email_configs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', this.emailConfig.id)
        .select()
        .single();

      if (error) throw error;

      this.emailConfig = data;

      // Show save indicator
      const indicator = document.getElementById('save-indicator');
      if (indicator) {
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 2000);
      }
    } catch (err) {
      console.error('Error saving email config:', err);
      showToast('Failed to save email settings', 'error');
    }
  },

  async detachEmail() {
    if (!this.emailConfig) return;

    this.showConfirmModal({
      title: 'Detach Email',
      message: 'Are you sure you want to remove the email configuration from this agent? The Gmail connection will remain active for other agents.',
      confirmText: 'Detach',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('agent_email_configs')
            .delete()
            .eq('id', this.emailConfig.id);

          if (error) throw error;

          this.emailConfig = null;
          this.switchTab('deployment');
          showToast('Email detached from agent', 'success');
        } catch (err) {
          console.error('Error detaching email:', err);
          showToast('Failed to detach email. Please try again.', 'error');
        }
      },
    });
  },

  showNoNumberModal() {
    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 400px;">
        <div class="voice-modal-header">
          <h3>Phone Number Required</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1.5rem;">
          <p style="margin: 0 0 1.5rem; color: var(--text-secondary);">
            Your agent can't go live without a phone number. Please deploy a number first in the Deploy tab.
          </p>
          <button class="go-to-deploy-btn" style="
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
          ">Go to Deploy</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Go to Deploy button
    modal.querySelector('.go-to-deploy-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
      this.switchTab('deployment');
    });
  },
};
