export const promptTabMethods = {
  renderPromptTab() {
    // Build the current identity summary
    const hasIdentity = this.agent.agent_role || this.agent.organization_name || this.agent.owner_name;

    return `
      <div class="config-section">
        <h3>System Prompts</h3>
        <p class="section-desc">Define how your agent should behave in conversations.</p>

        ${hasIdentity ? `
        <div class="identity-summary">
          <div class="identity-summary-header">
            <h4>Identity (from Configure tab)</h4>
            <button type="button" class="btn btn-sm btn-secondary" id="regenerate-prompts-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              Regenerate Prompts
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
          <label class="form-label">Inbound Prompt</label>
          <textarea id="system-prompt" class="form-textarea" rows="10" placeholder="Instructions for handling incoming calls...">${this.agent.system_prompt || ''}</textarea>
          <p class="form-help">How the agent handles incoming calls and messages</p>
          <button type="button" id="preview-inbound-prompt-btn" class="btn btn-secondary btn-sm prompt-preview-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Preview Full Prompt
          </button>
        </div>

        <div id="inbound-prompt-preview" class="full-prompt-preview hidden">
          <div class="full-prompt-header">
            <h4>Full Inbound Prompt (as sent to agent)</h4>
            <button type="button" id="close-inbound-preview" class="btn-icon">&times;</button>
          </div>
          <pre class="full-prompt-content">${this.buildFullPromptPreview('inbound')}</pre>
        </div>

        <div class="form-group">
          <label class="form-label">Outbound Prompt</label>
          <textarea id="outbound-prompt" class="form-textarea" rows="10" placeholder="Instructions for making outbound calls...">${this.agent.outbound_system_prompt || ''}</textarea>
          <p class="form-help">How the agent behaves when making calls on your behalf</p>
          <button type="button" id="preview-outbound-prompt-btn" class="btn btn-secondary btn-sm prompt-preview-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Preview Full Prompt
          </button>
        </div>

        <div id="outbound-prompt-preview" class="full-prompt-preview hidden">
          <div class="full-prompt-header">
            <h4>Full Outbound Prompt (as sent to agent)</h4>
            <button type="button" id="close-outbound-preview" class="btn-icon">&times;</button>
          </div>
          <pre class="full-prompt-content">${this.buildFullPromptPreview('outbound')}</pre>
        </div>
      </div>
    `;
  },

  buildFullPromptPreview(type = 'inbound') {
    if (type === 'outbound') {
      return this.buildOutboundPromptPreview();
    }

    const callerPhone = "+1XXXXXXXXXX"; // Placeholder
    const basePrompt = this.agent.system_prompt || "No system prompt configured";

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

    let fullPrompt = rolePrefix + basePrompt + contextSuffix;

    if (this.agent.memory_enabled) {
      fullPrompt += `

## CALLER MEMORY
[If caller has previous history, their conversation summary and key topics will appear here]`;
    }

    if (this.agent.semantic_memory_enabled) {
      fullPrompt += `

## SIMILAR PAST CONVERSATIONS
[If enabled, similar conversations from other callers will appear here to help identify patterns]`;
    }

    return fullPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  buildOutboundPromptPreview() {
    const agentName = this.agent.agent_name || this.agent.name || "Maggie";
    const basePrompt = this.agent.outbound_system_prompt;

    if (basePrompt) {
      // User has a custom outbound prompt
      let fullPrompt = basePrompt;

      if (this.agent.memory_enabled) {
        fullPrompt += `

## CALLER MEMORY
[If contact has previous history, their conversation summary and key topics will appear here]`;
      }

      return fullPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Default outbound prompt when user hasn't configured one
    let fullPrompt = `You are ${agentName}, an AI assistant making an outbound phone call on behalf of your owner.

THIS IS AN OUTBOUND CALL:
- You called them, they did not call you
- They will answer with "Hello?" - then you introduce yourself and explain why you're calling
- Do NOT ask "how can I help you" - you called them, not the other way around
- Be conversational, professional, and respectful of their time
- If they're busy or not interested, be gracious and end the call politely`;

    if (this.agent.memory_enabled) {
      fullPrompt += `

## CALLER MEMORY
[If contact has previous history, their conversation summary and key topics will appear here]`;
    }

    return fullPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  attachPromptTabListeners() {
    // Regenerate prompts button
    const regenerateBtn = document.getElementById('regenerate-prompts-btn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        this.regeneratePrompts();
      });
    }

    // System prompt textarea - also update local state when user edits
    const systemPrompt = document.getElementById('system-prompt');
    if (systemPrompt) {
      systemPrompt.addEventListener('input', () => {
        this.agent.system_prompt = systemPrompt.value;
        this.scheduleAutoSave({ system_prompt: systemPrompt.value });
      });
    }

    // Outbound prompt textarea - also update local state when user edits
    const outboundPrompt = document.getElementById('outbound-prompt');
    if (outboundPrompt) {
      outboundPrompt.addEventListener('input', () => {
        this.agent.outbound_system_prompt = outboundPrompt.value;
        this.scheduleAutoSave({ outbound_system_prompt: outboundPrompt.value });
      });
    }

    // Preview inbound prompt button
    const previewInboundBtn = document.getElementById('preview-inbound-prompt-btn');
    const inboundPreviewPanel = document.getElementById('inbound-prompt-preview');
    const closeInboundBtn = document.getElementById('close-inbound-preview');

    if (previewInboundBtn && inboundPreviewPanel) {
      previewInboundBtn.addEventListener('click', () => {
        const contentEl = inboundPreviewPanel.querySelector('.full-prompt-content');
        if (contentEl) {
          contentEl.innerHTML = this.buildFullPromptPreview('inbound');
        }
        inboundPreviewPanel.classList.remove('hidden');
      });
    }

    if (closeInboundBtn && inboundPreviewPanel) {
      closeInboundBtn.addEventListener('click', () => {
        inboundPreviewPanel.classList.add('hidden');
      });
    }

    // Preview outbound prompt button
    const previewOutboundBtn = document.getElementById('preview-outbound-prompt-btn');
    const outboundPreviewPanel = document.getElementById('outbound-prompt-preview');
    const closeOutboundBtn = document.getElementById('close-outbound-preview');

    if (previewOutboundBtn && outboundPreviewPanel) {
      previewOutboundBtn.addEventListener('click', () => {
        const contentEl = outboundPreviewPanel.querySelector('.full-prompt-content');
        if (contentEl) {
          contentEl.innerHTML = this.buildFullPromptPreview('outbound');
        }
        outboundPreviewPanel.classList.remove('hidden');
      });
    }

    if (closeOutboundBtn && outboundPreviewPanel) {
      closeOutboundBtn.addEventListener('click', () => {
        outboundPreviewPanel.classList.add('hidden');
      });
    }
  }
};
