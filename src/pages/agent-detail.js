/**
 * Agent Detail Page
 * View and edit a single agent with tabbed interface
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { AgentConfig } from '../models/AgentConfig.js';

/* global navigateTo */

// Voice definitions
const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Rachel (Default)', accent: 'American', gender: 'Female', description: 'Calm' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', label: 'Adam', accent: 'American', gender: 'Male', description: 'Deep' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', label: 'Sarah', accent: 'American', gender: 'Female', description: 'Soft' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', label: 'Elli', accent: 'American', gender: 'Female', description: 'Youthful' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', label: 'Josh', accent: 'American', gender: 'Male', description: 'Strong' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', label: 'Lily', accent: 'British', gender: 'Female', description: 'Warm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', label: 'Brian', accent: 'American', gender: 'Male', description: 'Narration' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', label: 'Daniel', accent: 'British', gender: 'Male', description: 'Authoritative' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', label: 'Eric', accent: 'American', gender: 'Male', description: 'Friendly' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', label: 'Jessica', accent: 'American', gender: 'Female', description: 'Expressive' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', label: 'Matilda', accent: 'American', gender: 'Female', description: 'Warm' },
];

const OPENAI_VOICES = [
  { id: 'openai-alloy', name: 'Alloy', accent: 'Neutral', gender: 'Neutral', description: 'Balanced' },
  { id: 'openai-echo', name: 'Echo', accent: 'Neutral', gender: 'Male', description: 'Clear' },
  { id: 'openai-fable', name: 'Fable', accent: 'British', gender: 'Male', description: 'Expressive' },
  { id: 'openai-nova', name: 'Nova', accent: 'American', gender: 'Female', description: 'Energetic' },
  { id: 'openai-onyx', name: 'Onyx', accent: 'American', gender: 'Male', description: 'Deep' },
  { id: 'openai-shimmer', name: 'Shimmer', accent: 'American', gender: 'Female', description: 'Warm' },
];

// Agent type options
const AGENT_TYPES = [
  { value: 'inbound', label: 'Inbound', description: 'Handle incoming calls and messages' },
  { value: 'outbound', label: 'Outbound', description: 'Make outbound calls on your behalf' },
  { value: 'both', label: 'Both', description: 'Handle inbound and outbound communication' },
];

export default class AgentDetailPage {
  constructor(params = {}) {
    this.agentId = params.id;
    this.agent = null;
    this.userId = null;
    this.activeTab = 'configure';
    this.autoSaveTimeout = null;
    this.clonedVoices = [];
    this.serviceNumbers = [];
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    // Handle "new" agent creation
    if (this.agentId === 'new') {
      const { config: newAgent, error } = await AgentConfig.createAgent(user.id, {
        name: 'New Agent',
        agent_type: 'inbound',
      });

      if (error) {
        console.error('Error creating agent:', error);
        navigateTo('/agents');
        return;
      }

      this.agentId = newAgent.id;
      this.agent = newAgent;
      // Update URL without reloading
      window.history.replaceState({}, '', `/agents/${newAgent.id}`);
    } else {
      // Load existing agent
      const { config: agent, error } = await AgentConfig.getById(this.agentId);

      if (error || !agent) {
        console.error('Agent not found:', error);
        navigateTo('/agents');
        return;
      }

      // Verify user owns this agent
      if (agent.user_id !== user.id) {
        navigateTo('/agents');
        return;
      }

      this.agent = agent;
    }

    // Load cloned voices
    const { data: clonedVoices } = await supabase
      .from('voices')
      .select('voice_id, voice_name')
      .eq('user_id', user.id)
      .eq('is_cloned', true)
      .order('created_at', { ascending: false });

    this.clonedVoices = clonedVoices || [];

    // Load service numbers for deployment tab
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('id, phone_number, friendly_name, agent_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    this.serviceNumbers = serviceNumbers || [];

    // Add styles
    this.addStyles();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 1.5rem 1rem;">
        <!-- Header -->
        <div class="agent-detail-header">
          <button class="back-btn" onclick="navigateTo('/agents')">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Agents
          </button>
          <div class="agent-detail-title">
            <div class="agent-detail-avatar" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
              ${this.agent.avatar_url
                ? `<img src="${this.agent.avatar_url}" alt="${this.agent.name}" />`
                : `<span>${this.getInitials(this.agent.name)}</span>`
              }
            </div>
            <div>
              <input type="text" id="agent-name-input" class="agent-name-input" value="${this.agent.name || ''}" placeholder="Agent Name" />
              <div class="agent-detail-meta">
                <span class="agent-id" onclick="navigator.clipboard.writeText('${this.agent.agent_id}'); this.textContent='Copied!'; setTimeout(() => this.textContent='ID: ${this.agent.agent_id?.substring(0, 8)}...', 1500);">
                  ID: ${this.agent.agent_id?.substring(0, 8)}...
                </span>
                ${this.agent.is_default ? '<span class="default-badge">Default</span>' : ''}
              </div>
            </div>
          </div>
          <div class="agent-detail-actions">
            ${!this.agent.is_default ? `
              <button class="btn btn-secondary btn-sm" id="set-default-btn">Set as Default</button>
            ` : ''}
          </div>
        </div>

        <!-- Tabs -->
        <div class="agent-tabs">
          <button class="agent-tab active" data-tab="configure">Configure</button>
          <button class="agent-tab" data-tab="prompt">Prompt</button>
          <button class="agent-tab" data-tab="functions">Functions</button>
          <button class="agent-tab" data-tab="deployment">Deployment</button>
          <button class="agent-tab" data-tab="analytics">Analytics</button>
        </div>

        <!-- Tab Content -->
        <div id="tab-content" class="tab-content">
          ${this.renderConfigureTab()}
        </div>

        <!-- Auto-save indicator -->
        <div id="save-indicator" class="save-indicator hidden">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Saved
        </div>
      </div>
      ${renderBottomNav('/agents')}
    `;

    attachBottomNav();
    this.attachEventListeners();
  }

  getInitials(name) {
    if (!name) return 'AI';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getVoiceDisplayName(voiceId) {
    // Check cloned voices first
    const clonedVoice = this.clonedVoices.find(v => `11labs-${v.voice_id}` === voiceId);
    if (clonedVoice) return clonedVoice.voice_name;

    // Check ElevenLabs voices
    const elevenLabsVoice = ELEVENLABS_VOICES.find(v => v.id === voiceId);
    if (elevenLabsVoice) return elevenLabsVoice.label || elevenLabsVoice.name;

    // Check OpenAI voices
    const openAIVoice = OPENAI_VOICES.find(v => v.id === voiceId);
    if (openAIVoice) return openAIVoice.name;

    return 'Rachel (Default)';
  }

  renderConfigureTab() {
    return `
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

        <div class="form-group">
          <label class="form-label">Voice</label>
          <div class="voice-selector" id="voice-selector">
            <span class="voice-current">${this.getVoiceDisplayName(this.agent.voice_id)}</span>
            <button type="button" class="btn btn-sm btn-secondary" id="change-voice-btn">Change</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Response Style</label>
          <select id="response-style" class="form-select">
            <option value="casual" ${this.agent.response_style === 'casual' ? 'selected' : ''}>Casual</option>
            <option value="friendly" ${this.agent.response_style === 'friendly' ? 'selected' : ''}>Friendly</option>
            <option value="professional" ${this.agent.response_style === 'professional' ? 'selected' : ''}>Professional</option>
            <option value="formal" ${this.agent.response_style === 'formal' ? 'selected' : ''}>Formal</option>
          </select>
        </div>
      </div>

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
            <label class="toggle">
              <input type="checkbox" id="backchannel-enabled" ${this.agent.backchannel_enabled !== false ? 'checked' : ''} />
              <span class="toggle-slider"></span>
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

      <div class="config-section">
        <h3>AI Settings</h3>

        <div class="form-group">
          <label class="form-label">AI Model</label>
          <select id="ai-model" class="form-select">
            <option value="gpt-4o" ${this.agent.ai_model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Recommended)</option>
            <option value="gpt-4o-mini" ${this.agent.ai_model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o Mini (Faster)</option>
            <option value="gpt-4.1" ${this.agent.ai_model === 'gpt-4.1' ? 'selected' : ''}>GPT-4.1</option>
            <option value="claude-3.5-sonnet" ${this.agent.ai_model === 'claude-3.5-sonnet' ? 'selected' : ''}>Claude 3.5 Sonnet</option>
            <option value="claude-3-haiku" ${this.agent.ai_model === 'claude-3-haiku' ? 'selected' : ''}>Claude 3 Haiku (Faster)</option>
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
            <label class="toggle">
              <input type="checkbox" id="priority-sequencing" ${this.agent.priority_sequencing ? 'checked' : ''} />
              <span class="toggle-slider"></span>
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
  }

  renderPromptTab() {
    return `
      <div class="config-section">
        <h3>System Prompts</h3>
        <p class="section-desc">Define how your agent should behave in conversations.</p>

        <div class="form-group">
          <label class="form-label">Inbound Prompt</label>
          <textarea id="system-prompt" class="form-textarea" rows="8" placeholder="Instructions for handling incoming calls...">${this.agent.system_prompt || ''}</textarea>
          <p class="form-help">How the agent handles incoming calls and messages</p>
        </div>

        <div class="form-group">
          <label class="form-label">Outbound Prompt</label>
          <textarea id="outbound-prompt" class="form-textarea" rows="8" placeholder="Instructions for making outbound calls...">${this.agent.outbound_system_prompt || ''}</textarea>
          <p class="form-help">How the agent behaves when making calls on your behalf</p>
        </div>
      </div>

      <div class="config-section">
        <h3>Knowledge Base</h3>
        <p class="section-desc">Connect knowledge sources for your agent to reference.</p>
        <div class="placeholder-message">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          <span>Knowledge base management coming soon</span>
        </div>
      </div>
    `;
  }

  renderFunctionsTab() {
    return `
      <div class="config-section">
        <h3>Built-in Functions</h3>
        <p class="section-desc">Enable capabilities for your agent.</p>

        <div class="function-toggles">
          <label class="function-toggle">
            <input type="checkbox" id="func-sms" ${this.agent.custom_instructions?.enable_sms !== false ? 'checked' : ''} />
            <div class="toggle-content">
              <span class="toggle-label">Send SMS</span>
              <span class="toggle-desc">Allow agent to send text messages</span>
            </div>
          </label>

          <label class="function-toggle">
            <input type="checkbox" id="func-transfer" ${this.agent.custom_instructions?.enable_transfer !== false ? 'checked' : ''} />
            <div class="toggle-content">
              <span class="toggle-label">Transfer Calls</span>
              <span class="toggle-desc">Allow agent to transfer calls to another number</span>
            </div>
          </label>

          <label class="function-toggle">
            <input type="checkbox" id="func-booking" ${this.agent.custom_instructions?.enable_booking ? 'checked' : ''} />
            <div class="toggle-content">
              <span class="toggle-label">Book Appointments</span>
              <span class="toggle-desc">Allow agent to schedule appointments (requires Cal.com)</span>
            </div>
          </label>

          <label class="function-toggle">
            <input type="checkbox" id="func-end-call" checked disabled />
            <div class="toggle-content">
              <span class="toggle-label">End Call</span>
              <span class="toggle-desc">Allow agent to end calls (always enabled)</span>
            </div>
          </label>
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
  }

  renderDeploymentTab() {
    const assignedNumbers = this.serviceNumbers.filter(n => n.agent_id === this.agent.id);
    const availableNumbers = this.serviceNumbers.filter(n => !n.agent_id);

    return `
      <div class="config-section">
        <h3>Phone Numbers</h3>
        <p class="section-desc">Assign phone numbers to this agent for handling calls and messages.</p>

        ${assignedNumbers.length > 0 ? `
          <div class="assigned-numbers">
            <label class="form-label">Assigned Numbers</label>
            ${assignedNumbers.map(num => `
              <div class="assigned-number">
                <div class="number-info">
                  <span class="number-value">${this.formatPhoneNumber(num.phone_number)}</span>
                  ${num.friendly_name ? `<span class="number-name">${num.friendly_name}</span>` : ''}
                </div>
                <button class="btn btn-sm btn-secondary detach-btn" data-number-id="${num.id}">Detach</button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="no-numbers-message">No phone numbers assigned to this agent</div>
        `}

        ${availableNumbers.length > 0 ? `
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Assign a Number</label>
            <div class="assign-number-row">
              <select id="number-to-assign" class="form-select">
                <option value="">Select a number...</option>
                ${availableNumbers.map(num => `
                  <option value="${num.id}">${this.formatPhoneNumber(num.phone_number)}${num.friendly_name ? ` (${num.friendly_name})` : ''}</option>
                `).join('')}
              </select>
              <button class="btn btn-primary" id="assign-number-btn">Assign</button>
            </div>
          </div>
        ` : this.serviceNumbers.length === 0 ? `
          <div class="no-numbers-available">
            <p>You don't have any phone numbers yet.</p>
            <a href="#" onclick="navigateTo('/select-number'); return false;" class="btn btn-primary">Get a Phone Number</a>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderAnalyticsTab() {
    return `
      <div class="config-section">
        <h3>Analytics</h3>
        <p class="section-desc">View performance metrics for this agent.</p>

        <div class="analytics-grid">
          <div class="analytics-card">
            <span class="analytics-label">Total Calls</span>
            <span class="analytics-value" id="stat-calls">--</span>
          </div>
          <div class="analytics-card">
            <span class="analytics-label">Total Messages</span>
            <span class="analytics-value" id="stat-messages">--</span>
          </div>
          <div class="analytics-card">
            <span class="analytics-label">Avg. Call Duration</span>
            <span class="analytics-value" id="stat-duration">--</span>
          </div>
          <div class="analytics-card">
            <span class="analytics-label">Success Rate</span>
            <span class="analytics-value" id="stat-success">--</span>
          </div>
        </div>

        <div class="placeholder-message" style="margin-top: 2rem;">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          <span>Detailed analytics coming soon</span>
        </div>
      </div>
    `;
  }

  formatPhoneNumber(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.agent-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Name input
    const nameInput = document.getElementById('agent-name-input');
    if (nameInput) {
      nameInput.addEventListener('input', () => this.scheduleAutoSave({ name: nameInput.value }));
    }

    // Set default button
    const setDefaultBtn = document.getElementById('set-default-btn');
    if (setDefaultBtn) {
      setDefaultBtn.addEventListener('click', () => this.setAsDefault());
    }

    // Attach tab-specific listeners
    this.attachConfigureTabListeners();
  }

  attachConfigureTabListeners() {
    // Agent type radio buttons
    document.querySelectorAll('input[name="agent_type"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.querySelectorAll('.type-option').forEach(opt => opt.classList.remove('selected'));
        e.target.closest('.type-option').classList.add('selected');
        this.scheduleAutoSave({ agent_type: e.target.value });
      });
    });

    // Response style
    const responseStyle = document.getElementById('response-style');
    if (responseStyle) {
      responseStyle.addEventListener('change', () => {
        this.scheduleAutoSave({ response_style: responseStyle.value });
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
        this.scheduleAutoSave({ ai_model: aiModel.value });
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
  }

  attachPromptTabListeners() {
    const systemPrompt = document.getElementById('system-prompt');
    if (systemPrompt) {
      systemPrompt.addEventListener('input', () => {
        this.scheduleAutoSave({ system_prompt: systemPrompt.value });
      });
    }

    const outboundPrompt = document.getElementById('outbound-prompt');
    if (outboundPrompt) {
      outboundPrompt.addEventListener('input', () => {
        this.scheduleAutoSave({ outbound_system_prompt: outboundPrompt.value });
      });
    }
  }

  attachFunctionsTabListeners() {
    const funcSms = document.getElementById('func-sms');
    const funcTransfer = document.getElementById('func-transfer');
    const funcBooking = document.getElementById('func-booking');

    const updateCustomInstructions = () => {
      const customInstructions = {
        ...this.agent.custom_instructions,
        enable_sms: funcSms?.checked ?? true,
        enable_transfer: funcTransfer?.checked ?? true,
        enable_booking: funcBooking?.checked ?? false,
      };
      this.scheduleAutoSave({ custom_instructions: customInstructions });
    };

    [funcSms, funcTransfer, funcBooking].forEach(el => {
      if (el) el.addEventListener('change', updateCustomInstructions);
    });
  }

  attachDeploymentTabListeners() {
    // Detach buttons
    document.querySelectorAll('.detach-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        await this.detachNumber(numberId);
      });
    });

    // Assign button
    const assignBtn = document.getElementById('assign-number-btn');
    const numberSelect = document.getElementById('number-to-assign');
    if (assignBtn && numberSelect) {
      assignBtn.addEventListener('click', async () => {
        const numberId = numberSelect.value;
        if (numberId) {
          await this.assignNumber(numberId);
        }
      });
    }
  }

  async switchTab(tabName) {
    this.activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.agent-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Render tab content
    const tabContent = document.getElementById('tab-content');
    switch (tabName) {
      case 'configure':
        tabContent.innerHTML = this.renderConfigureTab();
        this.attachConfigureTabListeners();
        break;
      case 'prompt':
        tabContent.innerHTML = this.renderPromptTab();
        this.attachPromptTabListeners();
        break;
      case 'functions':
        tabContent.innerHTML = this.renderFunctionsTab();
        this.attachFunctionsTabListeners();
        break;
      case 'deployment':
        tabContent.innerHTML = this.renderDeploymentTab();
        this.attachDeploymentTabListeners();
        break;
      case 'analytics':
        tabContent.innerHTML = this.renderAnalyticsTab();
        this.loadAnalytics();
        break;
    }
  }

  async loadAnalytics() {
    try {
      // Get call count
      const { count: callCount } = await supabase
        .from('call_records')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', this.agent.id);

      // Get message count
      const { count: msgCount } = await supabase
        .from('sms_messages')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', this.agent.id);

      // Update UI
      const callsEl = document.getElementById('stat-calls');
      const msgsEl = document.getElementById('stat-messages');
      if (callsEl) callsEl.textContent = callCount || 0;
      if (msgsEl) msgsEl.textContent = msgCount || 0;

      // These would need more complex queries
      const durationEl = document.getElementById('stat-duration');
      const successEl = document.getElementById('stat-success');
      if (durationEl) durationEl.textContent = '--';
      if (successEl) successEl.textContent = '--';
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }

  scheduleAutoSave(updates) {
    // Merge with pending updates
    Object.assign(this.agent, updates);

    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Schedule save
    this.autoSaveTimeout = setTimeout(() => this.saveAgent(updates), 1000);
  }

  async saveAgent(updates) {
    try {
      const { config, error } = await AgentConfig.updateById(this.agentId, updates);

      if (error) {
        console.error('Error saving agent:', error);
        return;
      }

      // Update local state
      this.agent = { ...this.agent, ...config };

      // Show save indicator
      const indicator = document.getElementById('save-indicator');
      if (indicator) {
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 2000);
      }
    } catch (err) {
      console.error('Error saving agent:', err);
    }
  }

  async setAsDefault() {
    try {
      const { error } = await AgentConfig.setDefault(this.agentId);

      if (error) {
        console.error('Error setting default:', error);
        alert('Failed to set as default. Please try again.');
        return;
      }

      this.agent.is_default = true;

      // Re-render header
      location.reload();
    } catch (err) {
      console.error('Error setting default:', err);
    }
  }

  async assignNumber(numberId) {
    try {
      const { error } = await supabase
        .from('service_numbers')
        .update({ agent_id: this.agent.id })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      const num = this.serviceNumbers.find(n => n.id === numberId);
      if (num) num.agent_id = this.agent.id;

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error assigning number:', err);
      alert('Failed to assign number. Please try again.');
    }
  }

  async detachNumber(numberId) {
    try {
      const { error } = await supabase
        .from('service_numbers')
        .update({ agent_id: null })
        .eq('id', numberId);

      if (error) throw error;

      // Update local state and re-render
      const num = this.serviceNumbers.find(n => n.id === numberId);
      if (num) num.agent_id = null;

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error detaching number:', err);
      alert('Failed to detach number. Please try again.');
    }
  }

  showVoiceModal() {
    // Create voice selection modal
    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.innerHTML = `
      <div class="voice-modal">
        <div class="voice-modal-header">
          <h3>Select Voice</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content">
          ${this.clonedVoices.length > 0 ? `
            <div class="voice-section">
              <h4>Your Cloned Voices</h4>
              <div class="voice-grid">
                ${this.clonedVoices.map(v => `
                  <button class="voice-option ${this.agent.voice_id === `11labs-${v.voice_id}` ? 'selected' : ''}" data-voice-id="11labs-${v.voice_id}">
                    ${v.voice_name}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="voice-section">
            <h4>ElevenLabs Voices</h4>
            <div class="voice-grid">
              ${ELEVENLABS_VOICES.map(v => `
                <button class="voice-option ${this.agent.voice_id === v.id ? 'selected' : ''}" data-voice-id="${v.id}">
                  <span class="voice-name">${v.name}</span>
                  <span class="voice-meta">${v.gender} - ${v.description}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="voice-section">
            <h4>OpenAI Voices</h4>
            <div class="voice-grid">
              ${OPENAI_VOICES.map(v => `
                <button class="voice-option ${this.agent.voice_id === v.id ? 'selected' : ''}" data-voice-id="${v.id}">
                  <span class="voice-name">${v.name}</span>
                  <span class="voice-meta">${v.gender} - ${v.description}</span>
                </button>
              `).join('')}
            </div>
          </div>
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

    // Voice selection
    modal.querySelectorAll('.voice-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const voiceId = btn.dataset.voiceId;
        this.selectVoice(voiceId);
        document.body.removeChild(modal);
      });
    });
  }

  selectVoice(voiceId) {
    this.agent.voice_id = voiceId;
    this.scheduleAutoSave({ voice_id: voiceId });

    // Update display
    const display = document.querySelector('.voice-current');
    if (display) {
      display.textContent = this.getVoiceDisplayName(voiceId);
    }
  }

  addStyles() {
    if (document.getElementById('agent-detail-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'agent-detail-styles';
    styles.textContent = `
      .agent-detail-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }

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

      .agent-detail-title {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
      }

      .agent-detail-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 1rem;
        overflow: hidden;
        flex-shrink: 0;
      }

      .agent-detail-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .agent-name-input {
        font-size: 1.25rem;
        font-weight: 600;
        border: none;
        background: transparent;
        padding: 0;
        width: 100%;
        max-width: 300px;
      }

      .agent-name-input:focus {
        outline: none;
        border-bottom: 2px solid var(--primary-color);
      }

      .agent-detail-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
      }

      .agent-id {
        font-size: 0.75rem;
        color: var(--text-tertiary);
        cursor: pointer;
      }

      .agent-id:hover {
        color: var(--primary-color);
      }

      .default-badge {
        background: var(--primary-color);
        color: white;
        font-size: 0.65rem;
        font-weight: 600;
        padding: 0.15rem 0.4rem;
        border-radius: var(--radius-sm);
        text-transform: uppercase;
      }

      .agent-tabs {
        display: flex;
        gap: 0.25rem;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 1.5rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .agent-tab {
        padding: 0.75rem 1rem;
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: all 0.2s;
      }

      .agent-tab:hover {
        color: var(--text-primary);
      }

      .agent-tab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .tab-content {
        min-height: 400px;
      }

      .config-section {
        background: white;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.5rem;
        margin-bottom: 1rem;
      }

      .config-section h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
      }

      .section-desc {
        color: var(--text-secondary);
        font-size: 0.875rem;
        margin: 0 0 1.25rem 0;
      }

      .agent-type-selector {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .type-option {
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s;
      }

      .type-option:hover {
        border-color: var(--primary-color);
      }

      .type-option.selected {
        border-color: var(--primary-color);
        background: rgba(99, 102, 241, 0.05);
      }

      .type-option input {
        display: none;
      }

      .type-label {
        font-weight: 600;
        font-size: 0.9rem;
      }

      .type-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .voice-selector {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .voice-current {
        font-weight: 500;
      }

      .range-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-tertiary);
        margin-top: 0.25rem;
      }

      .value-display {
        float: right;
        font-weight: normal;
        color: var(--text-secondary);
      }

      .form-group {
        margin-bottom: 1.25rem;
      }

      .form-group:last-child {
        margin-bottom: 0;
      }

      .form-select,
      .form-input,
      .form-textarea {
        width: 100%;
        padding: 0.6rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        background: white;
        font-family: inherit;
      }

      .form-textarea {
        resize: vertical;
        min-height: 100px;
      }

      .form-select:focus,
      .form-input:focus,
      .form-textarea:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      input[type="range"] {
        width: 100%;
        margin: 0.25rem 0;
      }

      .form-help {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.35rem;
      }

      .toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .toggle {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }

      .toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-color);
        transition: 0.3s;
        border-radius: 24px;
      }

      .toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      .toggle input:checked + .toggle-slider {
        background-color: var(--primary-color);
      }

      .toggle input:checked + .toggle-slider:before {
        transform: translateX(20px);
      }

      .function-toggles {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .function-toggle {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: border-color 0.2s;
      }

      .function-toggle:hover {
        border-color: var(--primary-color);
      }

      .function-toggle input[type="checkbox"] {
        margin-top: 0.2rem;
      }

      .toggle-content {
        flex: 1;
      }

      .toggle-label {
        display: block;
        font-weight: 500;
        font-size: 0.9rem;
      }

      .toggle-desc {
        display: block;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .assigned-numbers {
        margin-bottom: 1rem;
      }

      .assigned-number {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        margin-top: 0.5rem;
      }

      .number-info {
        display: flex;
        flex-direction: column;
      }

      .number-value {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .number-name {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .no-numbers-message {
        padding: 1rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
      }

      .no-numbers-available {
        text-align: center;
        padding: 1.5rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        margin-top: 1rem;
      }

      .no-numbers-available p {
        margin: 0 0 1rem 0;
        color: var(--text-secondary);
      }

      .assign-number-row {
        display: flex;
        gap: 0.5rem;
      }

      .assign-number-row .form-select {
        flex: 1;
      }

      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
      }

      .analytics-card {
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        padding: 1rem;
        text-align: center;
      }

      .analytics-label {
        display: block;
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-bottom: 0.5rem;
      }

      .analytics-value {
        display: block;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .placeholder-message {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 2rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .save-indicator {
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        box-shadow: var(--shadow-md);
        transition: opacity 0.2s;
      }

      .save-indicator.hidden {
        opacity: 0;
        pointer-events: none;
      }

      /* Voice Modal */
      .voice-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
      }

      .voice-modal {
        background: white;
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 500px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .voice-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--border-color);
      }

      .voice-modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
      }

      .close-modal-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      .voice-modal-content {
        padding: 1rem 1.25rem;
        overflow-y: auto;
      }

      .voice-section {
        margin-bottom: 1.5rem;
      }

      .voice-section:last-child {
        margin-bottom: 0;
      }

      .voice-section h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .voice-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.5rem;
      }

      .voice-option {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 0.75rem;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      }

      .voice-option:hover {
        border-color: var(--primary-color);
      }

      .voice-option.selected {
        border-color: var(--primary-color);
        background: rgba(99, 102, 241, 0.1);
      }

      .voice-option .voice-name {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
      }

      .voice-option .voice-meta {
        display: block;
        font-size: 0.7rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      @media (max-width: 600px) {
        .agent-detail-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .agent-detail-actions {
          width: 100%;
        }

        .agent-detail-actions .btn {
          width: 100%;
        }

        .agent-tabs {
          margin-left: -1rem;
          margin-right: -1rem;
          padding-left: 1rem;
          padding-right: 1rem;
        }

        .agent-tab {
          padding: 0.6rem 0.75rem;
          font-size: 0.8rem;
        }

        .config-section {
          padding: 1rem;
          margin-left: -0.5rem;
          margin-right: -0.5rem;
          border-radius: var(--radius-md);
        }

        .config-section h3 {
          font-size: 0.95rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-label {
          font-size: 0.85rem;
        }

        .form-help {
          font-size: 0.75rem;
        }

        .type-option {
          padding: 0.6rem 0.75rem;
        }

        .type-label {
          font-size: 0.85rem;
        }

        .type-desc {
          font-size: 0.75rem;
        }

        .voice-selector {
          padding: 0.6rem 0.75rem;
        }

        .analytics-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .analytics-card {
          padding: 0.75rem;
        }

        .analytics-label {
          font-size: 0.7rem;
        }

        .analytics-value {
          font-size: 1.25rem;
        }

        .voice-modal {
          max-height: 90vh;
        }

        .voice-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;

    document.head.appendChild(styles);
  }

  cleanup() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
  }
}
