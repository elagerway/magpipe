import { supabase } from '../../lib/supabase.js';
import { ChatWidget } from '../../models/ChatWidget.js';
import { showToast } from '../../lib/toast.js';

export const deploymentTabMethods = {
  renderDeploymentTab() {
    const assignedNumbers = this.serviceNumbers.filter(n => n.agent_id === this.agent.id);
    const availableNumbers = this.serviceNumbers.filter(n => !n.agent_id);

    return `
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Calls & Texts</h3>
          ${availableNumbers.length > 0 ? `
            <button class="btn btn-primary btn-sm" id="assign-numbers-btn" style="display: flex; align-items: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.4rem;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Assign
            </button>
          ` : ''}
        </div>
        <p class="section-desc">Assign phone numbers to this agent for handling calls and text messages.</p>

        ${assignedNumbers.length > 0 ? `
          <div class="assigned-numbers">
            ${assignedNumbers.map(num => {
              // For SIP trunks, show agent name + trunk name; for regular numbers, show agent name
              const label = num.isSipTrunk
                ? `${this.agent.name} - ${num.trunkName || 'SIP Trunk'}`
                : this.agent.name;
              return `
              <div class="assigned-number">
                <div class="number-info">
                  <span class="number-value">${this.formatPhoneNumber(num.phone_number)}</span>
                  <span class="number-name">(${label})</span>
                </div>
                <button class="btn btn-sm btn-secondary detach-btn" data-number-id="${num.id}" data-is-sip="${num.isSipTrunk || false}">Detach</button>
              </div>
            `;}).join('')}
          </div>
        ` : `
          <div class="no-numbers-message">No phone numbers assigned to this agent</div>
        `}

        ${this.serviceNumbers.length === 0 ? `
          <div class="no-numbers-available">
            <p>You don't have any phone numbers yet.</p>
            <a href="#" onclick="navigateTo('/select-number'); return false;" class="btn btn-primary">Get a Phone Number</a>
          </div>
        ` : ''}
      </div>

      <!-- Email Section -->
      ${this.renderEmailSection()}

      <!-- Chat Section -->
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
    `;
  },

  attachDeploymentTabListeners() {
    // Detach buttons
    document.querySelectorAll('.detach-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        await this.detachNumber(numberId);
      });
    });

    // Assign numbers button - opens modal
    const assignBtn = document.getElementById('assign-numbers-btn');
    if (assignBtn) {
      assignBtn.addEventListener('click', () => {
        this.showAssignNumbersModal();
      });
    }

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

      const { error } = await supabase
        .from(table)
        .update({ agent_id: this.agent.id })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      if (num) num.agent_id = this.agent.id;

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error assigning number:', err);
      showToast('Failed to assign number. Please try again.', 'error');
    }
  },

  async detachNumber(numberId) {
    try {
      const num = this.serviceNumbers.find(n => n.id === numberId);
      const table = num?.isSipTrunk ? 'external_sip_numbers' : 'service_numbers';

      const { error } = await supabase
        .from(table)
        .update({ agent_id: null })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      if (num) num.agent_id = null;

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
    const availableNumbers = this.serviceNumbers.filter(n => !n.agent_id);

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
                    <span style="font-weight: 500;">${this.formatPhoneNumber(num.phone_number)}</span>
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

  async assignMultipleNumbers(numberIds) {
    try {
      for (const numberId of numberIds) {
        const num = this.serviceNumbers.find(n => n.id === numberId);
        const table = num?.isSipTrunk ? 'external_sip_numbers' : 'service_numbers';

        const { error } = await supabase
          .from(table)
          .update({ agent_id: this.agent.id })
          .eq('id', numberId);

        if (error) {
          console.error('Error assigning number:', error);
          continue;
        }

        if (num) num.agent_id = this.agent.id;
      }

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error assigning numbers:', err);
      showToast('Failed to assign some numbers. Please try again.', 'error');
    }
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
          <p class="section-desc">Let this agent handle email conversations via Gmail.</p>

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
