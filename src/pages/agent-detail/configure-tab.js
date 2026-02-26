const AGENT_TYPES = [
  { value: 'inbound_voice', label: 'Inbound Voice', description: 'Answer incoming phone calls' },
  { value: 'outbound_voice', label: 'Outbound Voice', description: 'Make calls on your behalf' },
  { value: 'text', label: 'Text / SMS', description: 'Handle text message conversations' },
  { value: 'email', label: 'Email', description: 'Draft and respond to emails' },
  { value: 'chat_widget', label: 'Chat Widget', description: 'Live chat on your website' },
];

export const configureTabMethods = {
  renderConfigureTab() {
    const isVoice = ['inbound_voice', 'outbound_voice'].includes(this.agent.agent_type);
    return `
      <div class="config-section">
        <h3>Identity</h3>

        <div class="form-group">
          <label class="form-label">Organization Name</label>
          <input type="text" id="organization-name" class="form-input"
                 placeholder="e.g., ACME Corp"
                 value="${this.agent.organization_name || ''}">
          <p class="form-help">The organization your agent represents. Use <code>&lt;organization&gt;</code> in prompts.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Owner Name</label>
          <input type="text" id="owner-name" class="form-input"
                 placeholder="e.g., John Smith"
                 value="${this.agent.owner_name || ''}">
          <p class="form-help">The person this agent works for. Use <code>&lt;owner&gt;</code> in prompts.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Agent Role</label>
          <textarea id="agent-role" class="form-textarea" rows="4"
                    placeholder="e.g., You are a helpful, courteous assistant for ACME Corp. Your duty is to route calls, take messages and book appointments for John Smith.">${this.agent.agent_role || ''}</textarea>
          <p class="form-help">Define your agent's role and responsibilities. Use <code>&lt;role&gt;</code> in prompts to insert this.</p>
        </div>
      </div>

      <div class="config-section">
        <h3>Basic Settings</h3>

        <div class="form-group">
          <label class="form-label">Agent Type</label>
          <div class="agent-type-selector">
            ${AGENT_TYPES.map(type => `
              <label class="type-option ${this.agent.agent_type === type.value ? 'selected' : ''}">
                <input type="radio" name="agent_type" value="${type.value}" ${this.agent.agent_type === type.value ? 'checked' : ''} />
                <span class="type-label">${type.label}</span>
                <span class="type-desc">${type.description}</span>
              </label>
            `).join('')}
          </div>
        </div>

        ${isVoice ? `
        <div class="form-group">
          <label class="form-label">Voice</label>
          <div class="voice-selector" id="voice-selector">
            <span class="voice-current">${this.getVoiceDisplayName(this.agent.voice_id)}</span>
            <button type="button" class="btn btn-sm btn-secondary" id="change-voice-btn">Change</button>
          </div>
        </div>

        <!-- Voice Cloning Section -->
        <div class="voice-clone-section">
          <div id="voice-clone-toggle" class="voice-clone-toggle">
            <div class="voice-clone-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </div>
            <div class="voice-clone-info">
              <span class="voice-clone-title">Clone Your Voice</span>
              <span class="voice-clone-desc">Create a custom voice clone for phone calls</span>
            </div>
            <svg id="voice-clone-chevron" class="voice-clone-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 6 8 10 12 6"></polyline>
            </svg>
          </div>

          <div id="voice-clone-panel" class="voice-clone-panel" style="display: none;">
            <p class="form-help" style="margin-bottom: 1rem;">
              Record 1-2 minutes of your voice speaking naturally. Speak clearly in a quiet environment for best results.
            </p>

            <div id="voice-clone-status" class="hidden"></div>

            <!-- Progress Bar -->
            <div id="clone-progress" style="display: none; margin-bottom: 1rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-size: 0.875rem; font-weight: 500;">Cloning your voice...</span>
                <span id="progress-percent" style="font-size: 0.875rem; color: var(--text-secondary);">0%</span>
              </div>
              <div style="width: 100%; height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
                <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary-color), #8b5cf6); transition: width 0.3s ease;"></div>
              </div>
            </div>

            <!-- Input Method Toggle -->
            <div class="clone-method-tabs">
              <button type="button" id="record-tab" class="clone-tab active">Record</button>
              <button type="button" id="upload-tab" class="clone-tab">Upload File</button>
            </div>

            <!-- Recording Controls -->
            <div id="recording-controls">
              <div class="recording-buttons">
                <button type="button" id="start-recording-btn" class="btn btn-record">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                  </svg>
                  Start Recording
                </button>
                <button type="button" id="stop-recording-btn" class="btn btn-secondary" style="display: none;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="6" width="12" height="12" fill="currentColor"></rect>
                  </svg>
                  Stop
                </button>
              </div>

              <div id="recording-timer" class="recording-timer" style="display: none;">
                <span id="timer-display">0:00</span> / 2:00
              </div>
            </div>

            <!-- Upload Controls -->
            <div id="upload-controls" style="display: none;">
              <label for="voice-file-input" class="btn btn-upload">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Choose Audio File
              </label>
              <input type="file" id="voice-file-input" accept="audio/*" style="display: none;">
              <div id="file-name" class="file-name" style="display: none;"></div>
              <p class="form-help" style="text-align: center; margin: 0;">MP3, WAV, or M4A • 1-2 minutes recommended</p>
            </div>

            <!-- Audio Preview -->
            <div id="audio-preview" class="audio-preview" style="display: none;">
              <label class="form-label">Preview Recording</label>
              <audio id="preview-player" controls style="width: 100%; margin-bottom: 0.75rem;"></audio>
              <div class="preview-actions">
                <button type="button" id="retry-recording-btn" class="btn btn-secondary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                  </svg>
                  Re-record
                </button>
                <button type="button" id="submit-voice-btn" class="btn btn-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Clone Voice
                </button>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">Response Style</label>
          <select id="response-style" class="form-select">
            <option value="casual" ${this.agent.response_style === 'casual' ? 'selected' : ''}>Casual</option>
            <option value="friendly" ${this.agent.response_style === 'friendly' ? 'selected' : ''}>Friendly</option>
            <option value="professional" ${this.agent.response_style === 'professional' ? 'selected' : ''}>Professional</option>
            <option value="formal" ${this.agent.response_style === 'formal' ? 'selected' : ''}>Formal</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Language</label>
          <select id="agent-language" class="form-select">
            <option value="en-US" ${!this.agent.language || this.agent.language === 'en-US' ? 'selected' : ''}>English</option>
            <option value="multi" ${this.agent.language === 'multi' ? 'selected' : ''}>Multilingual (auto-detect)</option>
            <option value="fr" ${this.agent.language === 'fr' ? 'selected' : ''}>French</option>
            <option value="es" ${this.agent.language === 'es' ? 'selected' : ''}>Spanish</option>
            <option value="de" ${this.agent.language === 'de' ? 'selected' : ''}>German</option>
          </select>
          <p class="form-help">Multilingual starts in English and adapts to the caller's language.</p>
          <p id="language-voice-warning" class="form-help" style="color: #d97706; display: ${this.agent.language && this.agent.language !== 'en-US' ? 'block' : 'none'};">
            Voices cloned from English speech may have an accent in other languages.
          </p>
        </div>

        <div class="form-group" id="translate-group">
          <label class="form-label">Agent Translation</label>
          <select id="owner-language" class="form-select">
            <option value="" ${!this.agent.translate_to ? 'selected' : ''}>Off</option>
            <option value="en" ${this.agent.translate_to === 'en' ? 'selected' : ''}>English</option>
            <option value="fr" ${this.agent.translate_to === 'fr' ? 'selected' : ''}>French</option>
            <option value="es" ${this.agent.translate_to === 'es' ? 'selected' : ''}>Spanish</option>
            <option value="de" ${this.agent.translate_to === 'de' ? 'selected' : ''}>German</option>
          </select>
          <p class="form-help" id="translate-help"></p>
        </div>

        <div class="form-group">
          <label class="form-label">Unknown Caller Vetting</label>
          <select id="vetting-strategy" class="form-select">
            <option value="name-and-purpose" ${this.agent.vetting_strategy === 'name-and-purpose' ? 'selected' : ''}>Name and Purpose (Recommended)</option>
            <option value="strict" ${this.agent.vetting_strategy === 'strict' ? 'selected' : ''}>Strict (More questions)</option>
            <option value="lenient" ${this.agent.vetting_strategy === 'lenient' ? 'selected' : ''}>Lenient (Basic screening)</option>
          </select>
          <p class="form-help">How your assistant should screen unknown callers</p>
        </div>
      </div>

      ${isVoice ? `
      <div class="config-section">
        <h3>Advanced Voice Settings</h3>

        <div class="form-group">
          <label class="form-label">
            Agent Volume
            <span class="value-display" id="volume-value">${this.agent.agent_volume || 1.0}</span>
          </label>
          <input type="range" id="agent-volume" min="0" max="2" step="0.1" value="${this.agent.agent_volume || 1.0}" />
          <div class="range-labels">
            <span>Quiet</span>
            <span>Normal</span>
            <span>Loud</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            Speed
            <span class="value-display" id="speed-value">${this.agent.speed || 1.0}</span>
          </label>
          <input type="range" id="speed" min="0.5" max="2" step="0.1" value="${this.agent.speed || 1.0}" />
          <div class="range-labels">
            <span>Slow</span>
            <span>Normal</span>
            <span>Fast</span>
          </div>
          <p class="form-help">Speech speed of the agent</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Stability
            <span class="value-display" id="stability-value">${this.agent.stability || 0.75}</span>
          </label>
          <input type="range" id="stability" min="0" max="2" step="0.05" value="${this.agent.stability || 0.75}" />
          <div class="range-labels">
            <span>Stable</span>
            <span>Balanced</span>
            <span>Expressive</span>
          </div>
          <p class="form-help">Lower = consistent tone, Higher = more variation</p>
        </div>

        <div class="form-group">
          <label class="form-label">Ambient Sound</label>
          <select id="ambient-sound" class="form-select">
            <option value="off" ${!this.agent.ambient_sound || this.agent.ambient_sound === 'off' ? 'selected' : ''}>Off (Default)</option>
            <option value="coffee-shop" ${this.agent.ambient_sound === 'coffee-shop' ? 'selected' : ''}>Coffee Shop</option>
            <option value="convention-hall" ${this.agent.ambient_sound === 'convention-hall' ? 'selected' : ''}>Convention Hall</option>
            <option value="summer-outdoor" ${this.agent.ambient_sound === 'summer-outdoor' ? 'selected' : ''}>Summer Outdoor</option>
            <option value="mountain-outdoor" ${this.agent.ambient_sound === 'mountain-outdoor' ? 'selected' : ''}>Mountain Outdoor</option>
            <option value="call-center" ${this.agent.ambient_sound === 'call-center' ? 'selected' : ''}>Call Center</option>
          </select>
          <p class="form-help">Add background ambience to phone calls</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Ambient Sound Volume
            <span class="value-display" id="ambient-volume-value">${this.agent.ambient_sound_volume || 0.25}</span>
          </label>
          <input type="range" id="ambient-sound-volume" min="0" max="2" step="0.05" value="${this.agent.ambient_sound_volume || 0.25}" />
          <div class="range-labels">
            <span>Quiet</span>
            <span>Normal</span>
            <span>Loud</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Background Noise Suppression</label>
          <select id="noise-suppression" class="form-select">
            <option value="high" ${this.agent.noise_suppression === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${!this.agent.noise_suppression || this.agent.noise_suppression === 'medium' ? 'selected' : ''}>Medium (Default)</option>
            <option value="low" ${this.agent.noise_suppression === 'low' ? 'selected' : ''}>Low</option>
            <option value="off" ${this.agent.noise_suppression === 'off' ? 'selected' : ''}>Off</option>
          </select>
          <p class="form-help">Reduce background noise on phone calls</p>
        </div>
      </div>

      <div class="config-section">
        <h3>Conversation Settings</h3>

        <div class="form-group">
          <label class="form-label toggle-row">
            <span>Backchannel</span>
            <label class="agent-toggle">
              <input type="checkbox" id="backchannel-enabled" ${this.agent.backchannel_enabled !== false ? 'checked' : ''} />
              <span class="agent-toggle-slider"></span>
            </label>
          </label>
          <p class="form-help">Agent says "uh-huh", "I see" while listening</p>
        </div>

        <div class="form-group" id="backchannel-words-group">
          <label class="form-label">Backchannel Words</label>
          <input type="text" id="backchannel-words" class="form-input" value="${this.agent.backchannel_words || 'uh-huh, I see, okay'}" placeholder="uh-huh, I see, okay" />
          <p class="form-help">Comma-separated words the agent uses while listening</p>
        </div>

        <div class="form-group" id="backchannel-freq-group">
          <label class="form-label">
            Backchannel Frequency
            <span class="value-display" id="backchannel-freq-value">${this.agent.backchannel_frequency || 0.2}</span>
          </label>
          <input type="range" id="backchannel-frequency" min="0" max="1" step="0.05" value="${this.agent.backchannel_frequency || 0.2}" />
          <div class="range-labels">
            <span>Rare</span>
            <span>Occasional</span>
            <span>Frequent</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">
            Interrupt Sensitivity
            <span class="value-display" id="interrupt-value">${this.agent.interrupt_sensitivity || 0.6}</span>
          </label>
          <input type="range" id="interrupt-sensitivity" min="0" max="1" step="0.05" value="${this.agent.interrupt_sensitivity || 0.6}" />
          <div class="range-labels">
            <span>Hard to interrupt</span>
            <span>Normal</span>
            <span>Easy to interrupt</span>
          </div>
          <p class="form-help">How easily the user can interrupt the agent</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Responsiveness
            <span class="value-display" id="responsiveness-value">${this.agent.responsiveness || 1.0}</span>
          </label>
          <input type="range" id="responsiveness" min="0" max="1" step="0.05" value="${this.agent.responsiveness || 1.0}" />
          <div class="range-labels">
            <span>Patient</span>
            <span>Balanced</span>
            <span>Quick</span>
          </div>
          <p class="form-help">How quickly the agent responds after you stop talking</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Idle Trigger (seconds)
            <span class="value-display" id="idle-trigger-value">${this.agent.idle_trigger || 2.0}</span>
          </label>
          <input type="range" id="idle-trigger" min="0" max="10" step="0.5" value="${this.agent.idle_trigger || 2.0}" />
          <div class="range-labels">
            <span>0s</span>
            <span>5s</span>
            <span>10s</span>
          </div>
          <p class="form-help">Seconds of silence before prompting the user</p>
        </div>

        <div class="form-group">
          <label class="form-label">
            Max Idle Reminders
            <span class="value-display" id="idle-reminders-value">${this.agent.idle_reminders ?? 0}</span>
          </label>
          <input type="range" id="idle-reminders" min="0" max="5" step="1" value="${this.agent.idle_reminders ?? 0}" />
          <div class="range-labels">
            <span>None</span>
            <span></span>
            <span>5</span>
          </div>
          <p class="form-help">How many times to prompt before ending call (0 = disabled)</p>
        </div>
      </div>
      ` : ''}

      <div class="config-section">
        <h3>AI Settings</h3>

        <div class="form-group">
          <label class="form-label">AI Model</label>
          <select id="ai-model" class="form-select">
            <option value="gpt-4.1" ${this.agent.llm_model === 'gpt-4.1' ? 'selected' : ''}>GPT-4.1 (Recommended)</option>
            <option value="gpt-4o" ${this.agent.llm_model === 'gpt-4o' ? 'selected' : ''}>GPT-4o</option>
            <option value="gpt-4o-mini" ${this.agent.llm_model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Faster)</option>
            <option value="claude-3.5-sonnet" ${this.agent.llm_model === 'claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet</option>
            <option value="claude-3-haiku" ${this.agent.llm_model === 'claude-3-haiku' ? 'selected' : ''}>Claude 3 Haiku (Faster)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">
            Creativity (Temperature)
            <span class="value-display" id="temp-value">${this.agent.temperature || 0.7}</span>
          </label>
          <input type="range" id="temperature" min="0" max="1" step="0.1" value="${this.agent.temperature || 0.7}" />
          <div class="range-labels">
            <span>Focused</span>
            <span>Balanced</span>
            <span>Creative</span>
          </div>
          <p class="form-help">Lower = more consistent responses, Higher = more creative</p>
        </div>

        <div class="form-group">
          <label class="form-label">Max Response Length</label>
          <input type="number" id="max-tokens" class="form-input" value="${this.agent.max_tokens || 150}" min="50" max="1000" />
          <p class="form-help">Maximum length of AI responses (in tokens)</p>
        </div>

        <div class="form-group">
          <label class="form-label toggle-row">
            <span>Priority Sequencing</span>
            <label class="agent-toggle">
              <input type="checkbox" id="priority-sequencing" ${this.agent.priority_sequencing ? 'checked' : ''} />
              <span class="agent-toggle-slider"></span>
            </label>
          </label>
          <p class="form-help">OpenAI fast mode - lower latency (+$0.10/min)</p>
        </div>

        <div class="form-group">
          <label class="form-label">Vocabulary</label>
          <input type="text" id="vocabulary" class="form-input" value="${this.agent.vocabulary || ''}" placeholder="Enter custom terms, brand names..." />
          <p class="form-help">Custom words/phrases the agent should recognize (comma-separated)</p>
        </div>
      </div>

      <div class="config-section">
        <h3>Privacy</h3>

        <div class="form-group">
          <label class="form-label">PII Storage</label>
          <select id="pii-storage" class="form-select">
            <option value="enabled" ${!this.agent.pii_storage || this.agent.pii_storage === 'enabled' ? 'selected' : ''}>Enabled (Default)</option>
            <option value="disabled" ${this.agent.pii_storage === 'disabled' ? 'selected' : ''}>Disabled</option>
            <option value="redacted" ${this.agent.pii_storage === 'redacted' ? 'selected' : ''}>Store Redacted</option>
          </select>
          <p class="form-help">How to handle personally identifiable information</p>
        </div>
      </div>
    `;
  },

  attachConfigureTabListeners() {
    // Organization name input - triggers prompt regeneration
    const organizationName = document.getElementById('organization-name');
    if (organizationName) {
      organizationName.addEventListener('input', () => {
        this.onIdentityFieldChange('organization_name', organizationName.value);
      });
    }

    // Owner name input - triggers prompt regeneration
    const ownerName = document.getElementById('owner-name');
    if (ownerName) {
      ownerName.addEventListener('input', () => {
        this.onIdentityFieldChange('owner_name', ownerName.value);
      });
    }

    // Agent role textarea - triggers prompt regeneration
    const agentRole = document.getElementById('agent-role');
    if (agentRole) {
      agentRole.addEventListener('input', () => {
        this.onIdentityFieldChange('agent_role', agentRole.value);
      });
    }

    // Agent type radio buttons (with warning on type change)
    document.querySelectorAll('input[name="agent_type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const newType = e.target.value;
        const oldType = this.agent.agent_type;

        if (newType === oldType) return;

        const applyChange = () => {
          document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('selected'));
          e.target.closest('.type-option').classList.add('selected');
          this.agent.agent_type = newType;
          this.scheduleAutoSave({ agent_type: newType });
          // Re-render tab to show/hide voice settings
          const tabContent = document.getElementById('tab-content');
          if (tabContent) {
            tabContent.innerHTML = this.renderConfigureTab();
            this.attachConfigureTabListeners();
          }
        };

        this.showConfirmModal({
          title: 'Change Agent Type',
          message: 'Changing agent type may require updating your prompt. Continue?',
          confirmText: 'Change Type',
          onConfirm: applyChange,
        });

        // Revert the radio selection until confirmed
        e.target.checked = false;
        document.querySelector(`input[name="agent_type"][value="${oldType}"]`).checked = true;
      });
    });

    // Response style
    const responseStyle = document.getElementById('response-style');
    if (responseStyle) {
      responseStyle.addEventListener('change', () => {
        this.scheduleAutoSave({ response_style: responseStyle.value });
      });
    }

    // Language
    const agentLanguage = document.getElementById('agent-language');
    if (agentLanguage) {
      agentLanguage.addEventListener('change', () => {
        this.scheduleAutoSave({ language: agentLanguage.value, translate_to: this.computeTranslateTo() });
        const warning = document.getElementById('language-voice-warning');
        if (warning) {
          warning.style.display = agentLanguage.value !== 'en-US' ? 'block' : 'none';
        }
        this.updateTranslateHelp();
      });
    }

    // Agent Translation (owner language)
    const ownerLanguage = document.getElementById('owner-language');
    if (ownerLanguage) {
      ownerLanguage.addEventListener('change', () => {
        const translateTo = this.computeTranslateTo();
        this.scheduleAutoSave({ translate_to: translateTo });
        this.updateTranslateHelp();
      });
      // Initialize help text
      this.updateTranslateHelp();
    }

    // Vetting strategy
    const vettingStrategy = document.getElementById('vetting-strategy');
    if (vettingStrategy) {
      vettingStrategy.addEventListener('change', () => {
        this.scheduleAutoSave({ vetting_strategy: vettingStrategy.value });
      });
    }

    // Volume slider
    const volumeSlider = document.getElementById('agent-volume');
    const volumeValue = document.getElementById('volume-value');
    if (volumeSlider && volumeValue) {
      volumeSlider.addEventListener('input', () => {
        volumeValue.textContent = volumeSlider.value;
        this.scheduleAutoSave({ agent_volume: parseFloat(volumeSlider.value) });
      });
    }

    // Temperature slider
    const tempSlider = document.getElementById('temperature');
    const tempValue = document.getElementById('temp-value');
    if (tempSlider && tempValue) {
      tempSlider.addEventListener('input', () => {
        tempValue.textContent = tempSlider.value;
        this.scheduleAutoSave({ temperature: parseFloat(tempSlider.value) });
      });
    }

    // Ambient sound dropdown
    const ambientSound = document.getElementById('ambient-sound');
    if (ambientSound) {
      ambientSound.addEventListener('change', () => {
        this.scheduleAutoSave({ ambient_sound: ambientSound.value });
      });
    }

    // Ambient sound volume slider
    const ambientVolumeSlider = document.getElementById('ambient-sound-volume');
    const ambientVolumeValue = document.getElementById('ambient-volume-value');
    if (ambientVolumeSlider && ambientVolumeValue) {
      ambientVolumeSlider.addEventListener('input', () => {
        ambientVolumeValue.textContent = ambientVolumeSlider.value;
        this.scheduleAutoSave({ ambient_sound_volume: parseFloat(ambientVolumeSlider.value) });
      });
    }

    // Noise suppression dropdown
    const noiseSuppression = document.getElementById('noise-suppression');
    if (noiseSuppression) {
      noiseSuppression.addEventListener('change', () => {
        this.scheduleAutoSave({ noise_suppression: noiseSuppression.value });
      });
    }

    // Max tokens input
    const maxTokens = document.getElementById('max-tokens');
    if (maxTokens) {
      maxTokens.addEventListener('change', () => {
        this.scheduleAutoSave({ max_tokens: parseInt(maxTokens.value, 10) });
      });
    }

    // Speed slider
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speed-value');
    if (speedSlider && speedValue) {
      speedSlider.addEventListener('input', () => {
        speedValue.textContent = speedSlider.value;
        this.scheduleAutoSave({ speed: parseFloat(speedSlider.value) });
      });
    }

    // Stability slider
    const stabilitySlider = document.getElementById('stability');
    const stabilityValue = document.getElementById('stability-value');
    if (stabilitySlider && stabilityValue) {
      stabilitySlider.addEventListener('input', () => {
        stabilityValue.textContent = stabilitySlider.value;
        this.scheduleAutoSave({ stability: parseFloat(stabilitySlider.value) });
      });
    }

    // Backchannel toggle
    const backchannelEnabled = document.getElementById('backchannel-enabled');
    if (backchannelEnabled) {
      backchannelEnabled.addEventListener('change', () => {
        this.scheduleAutoSave({ backchannel_enabled: backchannelEnabled.checked });
      });
    }

    // Backchannel words
    const backchannelWords = document.getElementById('backchannel-words');
    if (backchannelWords) {
      backchannelWords.addEventListener('change', () => {
        this.scheduleAutoSave({ backchannel_words: backchannelWords.value });
      });
    }

    // Backchannel frequency slider
    const backchannelFreqSlider = document.getElementById('backchannel-frequency');
    const backchannelFreqValue = document.getElementById('backchannel-freq-value');
    if (backchannelFreqSlider && backchannelFreqValue) {
      backchannelFreqSlider.addEventListener('input', () => {
        backchannelFreqValue.textContent = backchannelFreqSlider.value;
        this.scheduleAutoSave({ backchannel_frequency: parseFloat(backchannelFreqSlider.value) });
      });
    }

    // Interrupt sensitivity slider
    const interruptSlider = document.getElementById('interrupt-sensitivity');
    const interruptValue = document.getElementById('interrupt-value');
    if (interruptSlider && interruptValue) {
      interruptSlider.addEventListener('input', () => {
        interruptValue.textContent = interruptSlider.value;
        this.scheduleAutoSave({ interrupt_sensitivity: parseFloat(interruptSlider.value) });
      });
    }

    // Responsiveness slider
    const responsivenessSlider = document.getElementById('responsiveness');
    const responsivenessValue = document.getElementById('responsiveness-value');
    if (responsivenessSlider && responsivenessValue) {
      responsivenessSlider.addEventListener('input', () => {
        responsivenessValue.textContent = responsivenessSlider.value;
        this.scheduleAutoSave({ responsiveness: parseFloat(responsivenessSlider.value) });
      });
    }

    // Idle trigger slider
    const idleTriggerSlider = document.getElementById('idle-trigger');
    const idleTriggerValue = document.getElementById('idle-trigger-value');
    if (idleTriggerSlider && idleTriggerValue) {
      idleTriggerSlider.addEventListener('input', () => {
        idleTriggerValue.textContent = idleTriggerSlider.value;
        this.scheduleAutoSave({ idle_trigger: parseFloat(idleTriggerSlider.value) });
      });
    }

    // Idle reminders slider
    const idleRemindersSlider = document.getElementById('idle-reminders');
    const idleRemindersValue = document.getElementById('idle-reminders-value');
    if (idleRemindersSlider && idleRemindersValue) {
      idleRemindersSlider.addEventListener('input', () => {
        idleRemindersValue.textContent = idleRemindersSlider.value;
        this.scheduleAutoSave({ idle_reminders: parseInt(idleRemindersSlider.value, 10) });
      });
    }

    // AI Model dropdown
    const aiModel = document.getElementById('ai-model');
    if (aiModel) {
      aiModel.addEventListener('change', () => {
        this.scheduleAutoSave({ llm_model: aiModel.value });
      });
    }

    // Priority sequencing toggle
    const prioritySequencing = document.getElementById('priority-sequencing');
    if (prioritySequencing) {
      prioritySequencing.addEventListener('change', () => {
        this.scheduleAutoSave({ priority_sequencing: prioritySequencing.checked });
      });
    }

    // Vocabulary input
    const vocabulary = document.getElementById('vocabulary');
    if (vocabulary) {
      vocabulary.addEventListener('change', () => {
        this.scheduleAutoSave({ vocabulary: vocabulary.value });
      });
    }

    // PII Storage dropdown
    const piiStorage = document.getElementById('pii-storage');
    if (piiStorage) {
      piiStorage.addEventListener('change', () => {
        this.scheduleAutoSave({ pii_storage: piiStorage.value });
      });
    }

    // Change voice button
    const changeVoiceBtn = document.getElementById('change-voice-btn');
    if (changeVoiceBtn) {
      changeVoiceBtn.addEventListener('click', () => this.showVoiceModal());
    }

    // Voice cloning toggle
    const voiceCloneToggle = document.getElementById('voice-clone-toggle');
    const voiceClonePanel = document.getElementById('voice-clone-panel');
    const voiceCloneChevron = document.getElementById('voice-clone-chevron');

    if (voiceCloneToggle && voiceClonePanel) {
      voiceCloneToggle.addEventListener('click', () => {
        const isHidden = voiceClonePanel.style.display === 'none';
        voiceClonePanel.style.display = isHidden ? 'block' : 'none';
        if (voiceCloneChevron) {
          voiceCloneChevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }

    // Voice cloning tab switching
    const recordTab = document.getElementById('record-tab');
    const uploadTab = document.getElementById('upload-tab');
    const recordingControls = document.getElementById('recording-controls');
    const uploadControls = document.getElementById('upload-controls');

    if (recordTab && uploadTab) {
      recordTab.addEventListener('click', () => {
        recordTab.classList.add('active');
        uploadTab.classList.remove('active');
        if (recordingControls) recordingControls.style.display = 'block';
        if (uploadControls) uploadControls.style.display = 'none';
      });

      uploadTab.addEventListener('click', () => {
        uploadTab.classList.add('active');
        recordTab.classList.remove('active');
        if (recordingControls) recordingControls.style.display = 'none';
        if (uploadControls) uploadControls.style.display = 'block';
      });
    }

    // File upload handling
    const voiceFileInput = document.getElementById('voice-file-input');
    const fileNameDisplay = document.getElementById('file-name');

    if (voiceFileInput) {
      voiceFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.uploadedAudioFile = file;
          if (fileNameDisplay) {
            fileNameDisplay.textContent = file.name;
            fileNameDisplay.style.display = 'block';
          }
          // Show preview for uploaded file
          const audioPreview = document.getElementById('audio-preview');
          const previewPlayer = document.getElementById('preview-player');
          if (audioPreview && previewPlayer) {
            previewPlayer.src = URL.createObjectURL(file);
            audioPreview.style.display = 'block';
          }
        }
      });
    }

    // Voice cloning recording controls
    const startRecordingBtn = document.getElementById('start-recording-btn');
    const stopRecordingBtn = document.getElementById('stop-recording-btn');
    const retryRecordingBtn = document.getElementById('retry-recording-btn');
    const submitVoiceBtn = document.getElementById('submit-voice-btn');

    if (startRecordingBtn) {
      startRecordingBtn.addEventListener('click', () => this.startRecording());
    }
    if (stopRecordingBtn) {
      stopRecordingBtn.addEventListener('click', () => this.stopRecording());
    }
    if (retryRecordingBtn) {
      retryRecordingBtn.addEventListener('click', () => this.retryRecording());
    }
    if (submitVoiceBtn) {
      submitVoiceBtn.addEventListener('click', () => this.submitVoiceClone());
    }
  }
};
