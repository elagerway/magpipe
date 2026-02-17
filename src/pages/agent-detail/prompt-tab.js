export const promptTabMethods = {
  getPromptHelpText() {
    const typeHelp = {
      inbound_voice: 'How the agent handles incoming phone calls',
      outbound_voice: 'How the agent behaves when making calls on your behalf',
      text: 'How the agent handles SMS and text conversations',
      email: 'How the agent drafts and responds to emails',
      chat_widget: 'How the agent interacts with website visitors',
    };
    return typeHelp[this.agent.agent_type] || 'Define how your agent should behave';
  },

  renderPromptTab() {
    // Build the current identity summary
    const hasIdentity = this.agent.agent_role || this.agent.organization_name || this.agent.owner_name;

    return `
      <div class="config-section">
        <h3>System Prompt</h3>
        <p class="section-desc">Define how your agent should behave in conversations.</p>

        ${hasIdentity ? `
        <div class="identity-summary">
          <div class="identity-summary-header">
            <h4>Identity (from Configure tab)</h4>
            <button type="button" class="btn btn-sm btn-secondary" id="regenerate-prompts-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              Regenerate Prompt
            </button>
          </div>
          ${this.agent.agent_role ? `<p class="identity-role">${this.agent.agent_role}</p>` : ''}
          <div class="identity-details">
            ${this.agent.name ? `<span><strong>Agent:</strong> ${this.agent.name}</span>` : ''}
            ${this.agent.organization_name ? `<span><strong>Organization:</strong> ${this.agent.organization_name}</span>` : ''}
            ${this.agent.owner_name ? `<span><strong>Owner:</strong> ${this.agent.owner_name}</span>` : ''}
          </div>
        </div>
        ` : `
        <div class="identity-empty">
          <p>Set up your agent's identity in the <strong>Configure</strong> tab to auto-generate prompts.</p>
          <p class="identity-empty-hint">Fill in Organization Name, Owner Name, and Role to get started.</p>
        </div>
        `}

        <div class="form-group">
          <label class="form-label">System Prompt</label>
          <textarea id="system-prompt" class="form-textarea" rows="12" placeholder="Instructions for your agent...">${this.agent.system_prompt || ''}</textarea>
          <p class="form-help">${this.getPromptHelpText()}</p>
          <button type="button" id="preview-prompt-btn" class="btn btn-secondary btn-sm prompt-preview-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Preview Full Prompt
          </button>
        </div>

        <div id="prompt-preview" class="full-prompt-preview hidden">
          <div class="full-prompt-header">
            <h4>Full Prompt (as sent to agent)</h4>
            <button type="button" id="close-prompt-preview" class="btn-icon">&times;</button>
          </div>
          <pre class="full-prompt-content">${this.buildFullPromptPreview()}</pre>
        </div>
      </div>
    `;
  },

  buildFullPromptPreview() {
    const agentType = this.agent.agent_type || 'inbound_voice';
    const basePrompt = this.agent.system_prompt || "No system prompt configured";
    const isVoice = ['inbound_voice', 'outbound_voice'].includes(agentType);

    let fullPrompt = '';

    if (agentType === 'inbound_voice') {
      const callerPhone = "+1XXXXXXXXXX";
      const rolePrefix = `CRITICAL - UNDERSTAND YOUR ROLE:
The person on this call is a CALLER/CUSTOMER calling in - they are NOT the business owner.
- You work for the business owner (your boss) who configured you
- The CALLER is a customer/client reaching out to the business
- Do NOT treat the caller as your boss or as if they set you up
- Do NOT say "your assistant" or "your number" to them - you're not THEIR assistant
- Treat every caller professionally as a potential customer
- The caller's phone number is: ${callerPhone}

YOUR CONFIGURED PERSONALITY:
`;
      const contextSuffix = `

CALL CONTEXT:
- This is a LIVE VOICE CALL with a customer calling in
- Speak naturally and conversationally
- Be warm, friendly, and professional
- You can transfer calls, take messages, or help customers directly`;

      fullPrompt = rolePrefix + basePrompt + contextSuffix;
    } else if (agentType === 'outbound_voice') {
      fullPrompt = basePrompt;
    } else {
      // text, email, chat_widget — show prompt as-is
      fullPrompt = basePrompt;
    }

    if (this.agent.memory_enabled) {
      const memoryLabel = isVoice ? 'CALLER MEMORY' : 'CONTACT MEMORY';
      fullPrompt += `

## ${memoryLabel}
[If contact has previous history, their conversation summary and key topics will appear here]`;
    }

    if (this.agent.semantic_memory_enabled) {
      fullPrompt += `

## SIMILAR PAST CONVERSATIONS
[If enabled, similar conversations will appear here to help identify patterns]`;
    }

    return fullPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  attachPromptTabListeners() {
    // Regenerate prompt button
    const regenerateBtn = document.getElementById('regenerate-prompts-btn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        this.regeneratePrompts();
      });
    }

    // System prompt textarea
    const systemPrompt = document.getElementById('system-prompt');
    if (systemPrompt) {
      systemPrompt.addEventListener('input', () => {
        this.agent.system_prompt = systemPrompt.value;
        this.scheduleAutoSave({ system_prompt: systemPrompt.value });
      });
    }

    // Preview prompt button
    const previewBtn = document.getElementById('preview-prompt-btn');
    const previewPanel = document.getElementById('prompt-preview');
    const closeBtn = document.getElementById('close-prompt-preview');

    if (previewBtn && previewPanel) {
      previewBtn.addEventListener('click', () => {
        const contentEl = previewPanel.querySelector('.full-prompt-content');
        if (contentEl) {
          contentEl.innerHTML = this.buildFullPromptPreview();
        }
        previewPanel.classList.remove('hidden');
      });
    }

    if (closeBtn && previewPanel) {
      closeBtn.addEventListener('click', () => {
        previewPanel.classList.add('hidden');
      });
    }
  }
};
