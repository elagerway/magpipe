/**
 * Agent Detail Page
 * View and edit a single agent with tabbed interface
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { AgentConfig } from '../models/AgentConfig.js';
import { ChatWidget } from '../models/ChatWidget.js';

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
    this.chatWidget = null; // Chat widget for this agent
    // Voice cloning state
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioBlob = null;
    this.uploadedAudioFile = null;
    this.recordingStartTime = null;
    this.recordingTimer = null;
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

    // Load service numbers for deployment tab (both regular and external SIP)
    const [serviceNumbersResult, externalSipResult] = await Promise.all([
      supabase
        .from('service_numbers')
        .select('id, phone_number, friendly_name, agent_id, termination_uri')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('external_sip_numbers')
        .select('id, phone_number, friendly_name, agent_id, trunk_id, external_sip_trunks(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
    ]);

    const regularNumbers = (serviceNumbersResult.data || []).map(n => ({ ...n, isSipTrunk: false }));
    const sipNumbers = (externalSipResult.data || []).map(n => ({
      ...n,
      isSipTrunk: true,
      trunkName: n.external_sip_trunks?.name || null
    }));
    this.serviceNumbers = [...regularNumbers, ...sipNumbers];

    // Load chat widget for this agent
    const { widget } = await ChatWidget.getByAgentId(this.agent.id);
    this.chatWidget = widget;

    // Add styles
    this.addStyles();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 1.5rem 1rem;">
        <!-- Back Button Row -->
        <div class="agent-back-row">
          <button class="back-btn" onclick="navigateTo('/agents')">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Agents
          </button>
          <!-- Mobile-only toggle -->
          <div class="agent-status-toggle mobile-toggle">
            <span class="status-label ${this.agent.is_active !== false ? 'active' : 'inactive'}">${this.agent.is_active !== false ? 'Active' : 'Inactive'}</span>
            <label class="toggle-switch-sm">
              <input type="checkbox" class="agent-active-toggle-input" ${this.agent.is_active !== false ? 'checked' : ''} />
              <span class="toggle-slider-sm"></span>
            </label>
          </div>
        </div>

        <!-- Header -->
        <div class="agent-detail-header">
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
                ${this.agent.is_default ? '<span class="default-badge">DEFAULT</span>' : ''}
              </div>
            </div>
          </div>
          <!-- Desktop-only toggle -->
          <div class="agent-detail-actions desktop-toggle">
            <div class="agent-status-toggle">
              <span class="status-label ${this.agent.is_active !== false ? 'active' : 'inactive'}">${this.agent.is_active !== false ? 'Active' : 'Inactive'}</span>
              <label class="agent-toggle">
                <input type="checkbox" class="agent-active-toggle-input" ${this.agent.is_active !== false ? 'checked' : ''} />
                <span class="agent-toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="agent-tabs-container">
          <div class="agent-tabs" id="agent-tabs">
            <button class="agent-tab active" data-tab="configure">Configure</button>
            <button class="agent-tab" data-tab="prompt">Prompt</button>
            <button class="agent-tab" data-tab="functions">Functions</button>
            <button class="agent-tab" data-tab="schedule">Schedule</button>
            <button class="agent-tab" data-tab="deployment">Deployment</button>
            <button class="agent-tab" data-tab="analytics">Analytics</button>
          </div>
          <div class="tabs-scroll-indicator" id="tabs-scroll-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
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

    // Check for tab query parameter and switch to it
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      this.switchTab(tabParam);
    }
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
  }

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
        </div>

        <div class="form-group">
          <label class="form-label">Outbound Prompt</label>
          <textarea id="outbound-prompt" class="form-textarea" rows="10" placeholder="Instructions for making outbound calls...">${this.agent.outbound_system_prompt || ''}</textarea>
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Phone Numbers</h3>
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
        <p class="section-desc">Assign phone numbers to this agent for handling calls and messages.</p>

        ${assignedNumbers.length > 0 ? `
          <div class="assigned-numbers">
            ${assignedNumbers.map(num => {
              // Clean up friendly_name - remove "Pat AI - email" format
              let displayName = '';
              if (num.friendly_name && !num.friendly_name.startsWith('AI Assistant')) {
                displayName = num.friendly_name;
              }
              const label = num.isSipTrunk ? (num.trunkName || displayName || 'SIP Trunk') : displayName;
              return `
              <div class="assigned-number">
                <div class="number-info">
                  <span class="number-value">${this.formatPhoneNumber(num.phone_number)}</span>
                  ${label ? `<span class="number-name">(${label})</span>` : ''}
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

      <!-- Web Chat Widget Section -->
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <h3 style="margin: 0;">Web Chat Widget</h3>
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
        <p class="section-desc">Embed a chat widget on your website so visitors can chat with this agent.</p>

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

  renderScheduleTab() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    const defaultSchedule = {
      monday: { enabled: true, start: '09:00', end: '17:00' },
      tuesday: { enabled: true, start: '09:00', end: '17:00' },
      wednesday: { enabled: true, start: '09:00', end: '17:00' },
      thursday: { enabled: true, start: '09:00', end: '17:00' },
      friday: { enabled: true, start: '09:00', end: '17:00' },
      saturday: { enabled: false, start: '09:00', end: '17:00' },
      sunday: { enabled: false, start: '09:00', end: '17:00' },
    };

    const callsSchedule = this.agent.calls_schedule || null;
    const textsSchedule = this.agent.texts_schedule || null;
    const timezone = this.agent.schedule_timezone || 'America/Los_Angeles';

    const renderDayRow = (day, label, schedule, prefix) => {
      const daySchedule = schedule ? schedule[day] : defaultSchedule[day];
      const enabled = daySchedule?.enabled ?? defaultSchedule[day].enabled;
      const start = daySchedule?.start || defaultSchedule[day].start;
      const end = daySchedule?.end || defaultSchedule[day].end;

      return `
        <div class="schedule-day-row ${!enabled ? 'disabled' : ''}">
          <label class="schedule-day-toggle">
            <input type="checkbox" id="${prefix}-${day}-enabled" ${enabled ? 'checked' : ''} />
            <span class="schedule-day-name">${label}</span>
          </label>
          <div class="schedule-time-inputs">
            <input type="time" id="${prefix}-${day}-start" class="schedule-time-input" value="${start}" ${!enabled ? 'disabled' : ''} />
            <span class="schedule-time-separator">to</span>
            <input type="time" id="${prefix}-${day}-end" class="schedule-time-input" value="${end}" ${!enabled ? 'disabled' : ''} />
            <button type="button" class="btn-apply-time" data-prefix="${prefix}" data-day="${day}" title="Apply this time to all days">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    };

    const timezones = [
      { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
      { value: 'America/Denver', label: 'Mountain Time (Denver)' },
      { value: 'America/Chicago', label: 'Central Time (Chicago)' },
      { value: 'America/New_York', label: 'Eastern Time (New York)' },
      { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
      { value: 'America/Phoenix', label: 'Arizona Time (Phoenix)' },
      { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
      { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
      { value: 'Europe/London', label: 'GMT (London)' },
      { value: 'Europe/Paris', label: 'CET (Paris)' },
      { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
      { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
    ];

    return `
      <div class="config-section">
        <h3>Schedule Settings</h3>
        <p class="section-desc">Set when your agent handles calls and texts. Leave empty to always be available.</p>

        <div class="form-group">
          <label class="form-label">Timezone</label>
          <select id="schedule-timezone" class="form-select">
            ${timezones.map(tz => `
              <option value="${tz.value}" ${timezone === tz.value ? 'selected' : ''}>${tz.label}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="config-section">
        <div class="schedule-section-header">
          <h3>Calls Schedule</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="apply-calls-to-all">Apply to All Days</button>
        </div>
        <p class="section-desc">When your agent will answer phone calls.</p>

        <div class="schedule-grid" id="calls-schedule-grid">
          ${days.map((day, i) => renderDayRow(day, dayLabels[i], callsSchedule, 'calls')).join('')}
        </div>

        <div class="schedule-clear-row">
          <button type="button" class="btn btn-sm btn-secondary" id="clear-calls-schedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear Schedule (Always Available)
          </button>
        </div>
      </div>

      <div class="config-section">
        <div class="schedule-section-header">
          <h3>Texts Schedule</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="apply-texts-to-all">Apply to All Days</button>
        </div>
        <p class="section-desc">When your agent will respond to text messages.</p>

        <div class="schedule-grid" id="texts-schedule-grid">
          ${days.map((day, i) => renderDayRow(day, dayLabels[i], textsSchedule, 'texts')).join('')}
        </div>

        <div class="schedule-clear-row">
          <button type="button" class="btn btn-sm btn-secondary" id="clear-texts-schedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear Schedule (Always Available)
          </button>
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

    // Name input - also triggers prompt regeneration since it's part of identity
    const nameInput = document.getElementById('agent-name-input');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        this.onIdentityFieldChange('name', nameInput.value);
      });
    }

    // Set default button
    const setDefaultBtn = document.getElementById('set-default-btn');
    if (setDefaultBtn) {
      setDefaultBtn.addEventListener('click', () => this.setAsDefault());
    }

    // Active toggles (both mobile and desktop)
    document.querySelectorAll('.agent-active-toggle-input').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const isActive = e.target.checked;

        // Check if trying to activate without a deployed number
        if (isActive) {
          const assignedNumbers = this.serviceNumbers.filter(n => n.agent_id === this.agent.id);
          if (assignedNumbers.length === 0) {
            // Revert the toggle
            e.target.checked = false;
            // Show modal
            this.showNoNumberModal();
            return;
          }
        }

        // Sync both toggles
        document.querySelectorAll('.agent-active-toggle-input').forEach(t => {
          t.checked = isActive;
        });
        // Update all status labels
        document.querySelectorAll('.agent-status-toggle .status-label').forEach(label => {
          label.textContent = isActive ? 'Active' : 'Inactive';
          label.classList.toggle('active', isActive);
          label.classList.toggle('inactive', !isActive);
        });
        this.scheduleAutoSave({ is_active: isActive });
      });
    });

    // Tabs scroll indicator
    const tabsContainer = document.getElementById('agent-tabs');
    const scrollIndicator = document.getElementById('tabs-scroll-indicator');
    if (tabsContainer && scrollIndicator) {
      const updateScrollIndicator = () => {
        const hasMoreToScroll = tabsContainer.scrollWidth > tabsContainer.clientWidth &&
          tabsContainer.scrollLeft < (tabsContainer.scrollWidth - tabsContainer.clientWidth - 10);
        scrollIndicator.classList.toggle('visible', hasMoreToScroll);
      };

      // Initial check
      updateScrollIndicator();

      // Check on scroll
      tabsContainer.addEventListener('scroll', updateScrollIndicator);

      // Check on resize
      window.addEventListener('resize', updateScrollIndicator);

      // Click indicator to scroll right
      scrollIndicator.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        tabsContainer.scrollBy({ left: 150, behavior: 'smooth' });
      });
    }

    // Attach tab-specific listeners
    this.attachConfigureTabListeners();
  }

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
  }

  attachScheduleTabListeners() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Timezone dropdown
    const timezoneSelect = document.getElementById('schedule-timezone');
    if (timezoneSelect) {
      timezoneSelect.addEventListener('change', () => {
        this.scheduleAutoSave({ schedule_timezone: timezoneSelect.value });
      });
    }

    // Helper to build schedule object from form
    const buildSchedule = (prefix) => {
      const schedule = {};
      days.forEach(day => {
        const enabledCheckbox = document.getElementById(`${prefix}-${day}-enabled`);
        const startInput = document.getElementById(`${prefix}-${day}-start`);
        const endInput = document.getElementById(`${prefix}-${day}-end`);
        schedule[day] = {
          enabled: enabledCheckbox?.checked ?? false,
          start: startInput?.value || '09:00',
          end: endInput?.value || '17:00',
        };
      });
      return schedule;
    };

    // Helper to save schedule
    const saveCallsSchedule = () => {
      const schedule = buildSchedule('calls');
      this.agent.calls_schedule = schedule;
      this.scheduleAutoSave({ calls_schedule: schedule });
    };

    const saveTextsSchedule = () => {
      const schedule = buildSchedule('texts');
      this.agent.texts_schedule = schedule;
      this.scheduleAutoSave({ texts_schedule: schedule });
    };

    // Attach listeners for calls schedule
    days.forEach(day => {
      const enabledCheckbox = document.getElementById(`calls-${day}-enabled`);
      const startInput = document.getElementById(`calls-${day}-start`);
      const endInput = document.getElementById(`calls-${day}-end`);
      const row = enabledCheckbox?.closest('.schedule-day-row');

      if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', () => {
          const enabled = enabledCheckbox.checked;
          if (startInput) startInput.disabled = !enabled;
          if (endInput) endInput.disabled = !enabled;
          if (row) row.classList.toggle('disabled', !enabled);
          saveCallsSchedule();
        });
      }
      if (startInput) startInput.addEventListener('change', saveCallsSchedule);
      if (endInput) endInput.addEventListener('change', saveCallsSchedule);
    });

    // Attach listeners for texts schedule
    days.forEach(day => {
      const enabledCheckbox = document.getElementById(`texts-${day}-enabled`);
      const startInput = document.getElementById(`texts-${day}-start`);
      const endInput = document.getElementById(`texts-${day}-end`);
      const row = enabledCheckbox?.closest('.schedule-day-row');

      if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', () => {
          const enabled = enabledCheckbox.checked;
          if (startInput) startInput.disabled = !enabled;
          if (endInput) endInput.disabled = !enabled;
          if (row) row.classList.toggle('disabled', !enabled);
          saveTextsSchedule();
        });
      }
      if (startInput) startInput.addEventListener('change', saveTextsSchedule);
      if (endInput) endInput.addEventListener('change', saveTextsSchedule);
    });

    // Apply to all days buttons
    const applyCallsBtn = document.getElementById('apply-calls-to-all');
    if (applyCallsBtn) {
      applyCallsBtn.addEventListener('click', () => {
        // Get values from the first day (Monday)
        const mondayEnabled = document.getElementById('calls-monday-enabled')?.checked ?? true;
        const mondayStart = document.getElementById('calls-monday-start')?.value || '09:00';
        const mondayEnd = document.getElementById('calls-monday-end')?.value || '17:00';

        days.forEach(day => {
          const enabledCheckbox = document.getElementById(`calls-${day}-enabled`);
          const startInput = document.getElementById(`calls-${day}-start`);
          const endInput = document.getElementById(`calls-${day}-end`);
          const row = enabledCheckbox?.closest('.schedule-day-row');

          if (enabledCheckbox) enabledCheckbox.checked = mondayEnabled;
          if (startInput) {
            startInput.value = mondayStart;
            startInput.disabled = !mondayEnabled;
          }
          if (endInput) {
            endInput.value = mondayEnd;
            endInput.disabled = !mondayEnabled;
          }
          if (row) row.classList.toggle('disabled', !mondayEnabled);
        });

        saveCallsSchedule();
      });
    }

    const applyTextsBtn = document.getElementById('apply-texts-to-all');
    if (applyTextsBtn) {
      applyTextsBtn.addEventListener('click', () => {
        // Get values from the first day (Monday)
        const mondayEnabled = document.getElementById('texts-monday-enabled')?.checked ?? true;
        const mondayStart = document.getElementById('texts-monday-start')?.value || '09:00';
        const mondayEnd = document.getElementById('texts-monday-end')?.value || '17:00';

        days.forEach(day => {
          const enabledCheckbox = document.getElementById(`texts-${day}-enabled`);
          const startInput = document.getElementById(`texts-${day}-start`);
          const endInput = document.getElementById(`texts-${day}-end`);
          const row = enabledCheckbox?.closest('.schedule-day-row');

          if (enabledCheckbox) enabledCheckbox.checked = mondayEnabled;
          if (startInput) {
            startInput.value = mondayStart;
            startInput.disabled = !mondayEnabled;
          }
          if (endInput) {
            endInput.value = mondayEnd;
            endInput.disabled = !mondayEnabled;
          }
          if (row) row.classList.toggle('disabled', !mondayEnabled);
        });

        saveTextsSchedule();
      });
    }

    // Clear schedule buttons
    const clearCallsBtn = document.getElementById('clear-calls-schedule');
    if (clearCallsBtn) {
      clearCallsBtn.addEventListener('click', () => {
        this.agent.calls_schedule = null;
        this.scheduleAutoSave({ calls_schedule: null });
        // Re-render to show default state
        this.switchTab('schedule');
      });
    }

    const clearTextsBtn = document.getElementById('clear-texts-schedule');
    if (clearTextsBtn) {
      clearTextsBtn.addEventListener('click', () => {
        this.agent.texts_schedule = null;
        this.scheduleAutoSave({ texts_schedule: null });
        // Re-render to show default state
        this.switchTab('schedule');
      });
    }

    // Apply time to all buttons (per-row)
    document.querySelectorAll('.btn-apply-time').forEach(btn => {
      btn.addEventListener('click', () => {
        const prefix = btn.dataset.prefix; // 'calls' or 'texts'
        const sourceDay = btn.dataset.day;
        const dayLabel = sourceDay.charAt(0).toUpperCase() + sourceDay.slice(1);

        // Get the source row's times
        const sourceStart = document.getElementById(`${prefix}-${sourceDay}-start`)?.value;
        const sourceEnd = document.getElementById(`${prefix}-${sourceDay}-end`)?.value;

        if (!sourceStart || !sourceEnd) return;

        // Format times for display
        const formatTime = (t) => {
          const [h, m] = t.split(':');
          const hour = parseInt(h);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${m} ${ampm}`;
        };

        const scheduleType = prefix === 'calls' ? 'Calls' : 'Texts';

        // Show custom confirmation modal
        this.showConfirmModal({
          title: 'Apply to All Days',
          message: `Apply <strong>${dayLabel}'s</strong> hours <strong>(${formatTime(sourceStart)} - ${formatTime(sourceEnd)})</strong> to all enabled days for <strong>${scheduleType}</strong>?`,
          confirmText: 'Apply',
          onConfirm: () => {
            // Apply to all days
            days.forEach(day => {
              const startInput = document.getElementById(`${prefix}-${day}-start`);
              const endInput = document.getElementById(`${prefix}-${day}-end`);

              if (startInput && !startInput.disabled) startInput.value = sourceStart;
              if (endInput && !endInput.disabled) endInput.value = sourceEnd;
            });

            // Save the schedule
            if (prefix === 'calls') {
              saveCallsSchedule();
            } else {
              saveTextsSchedule();
            }
          }
        });
      });
    });
  }

  showConfirmModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm }) {
    // Remove existing modal if any
    document.getElementById('confirm-modal-overlay')?.remove();

    const modal = document.createElement('div');
    modal.id = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal-backdrop"></div>
      <div class="confirm-modal">
        <h3 class="confirm-modal-title">${title}</h3>
        <p class="confirm-modal-message">${message}</p>
        <div class="confirm-modal-actions">
          <button class="btn btn-secondary" id="confirm-modal-cancel">${cancelText}</button>
          <button class="btn btn-primary" id="confirm-modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    document.getElementById('confirm-modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('.confirm-modal-backdrop').addEventListener('click', closeModal);

    document.getElementById('confirm-modal-confirm').addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });
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
      case 'schedule':
        tabContent.innerHTML = this.renderScheduleTab();
        this.attachScheduleTabListeners();
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
      alert('Failed to assign number. Please try again.');
    }
  }

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
      alert('Failed to detach number. Please try again.');
    }
  }

  // ============================================
  // Chat Widget Methods
  // ============================================

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
        alert('Failed to create chat widget. Please try again.');
        return;
      }

      this.chatWidget = widget;
      this.switchTab('deployment');
    } catch (err) {
      console.error('Error creating widget:', err);
      alert('Failed to create chat widget. Please try again.');
    }
  }

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
  }

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
            alert('Failed to delete chat widget. Please try again.');
            return;
          }

          this.chatWidget = null;
          this.switchTab('deployment');
        } catch (err) {
          console.error('Error deleting widget:', err);
          alert('Failed to delete chat widget. Please try again.');
        }
      },
      'Delete',
      'Cancel'
    );
  }

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
  }

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
          <p style="margin-bottom: 16px;">This will add the chat widget to your Solo Mobile portal, allowing you to chat with your own AI agent.</p>
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
  }

  async executePortalToggle(addToPortal) {
    try {
      if (!addToPortal) {
        // Remove from portal
        const { widget, error } = await ChatWidget.update(this.chatWidget.id, {
          is_portal_widget: false
        });

        if (error) {
          console.error('Error removing from portal:', error);
          alert('Failed to remove from portal. Please try again.');
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
          alert('Failed to add to portal. Please try again.');
          return;
        }

        this.chatWidget = widget;
      }

      this.switchTab('deployment');
    } catch (err) {
      console.error('Error toggling portal widget:', err);
      alert('Failed to update portal widget. Please try again.');
    }
  }

  showEmbedCodeModal() {
    if (!this.chatWidget) return;

    const embedCode = `<!-- Solo Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['SoloWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','SoloChat','https://solomobile.ai/widget/solo-chat.js'));
  SoloChat('init', { widgetKey: '${this.chatWidget.widget_key}' });
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
  }

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
  }

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
              let displayName = '';
              if (num.friendly_name && !num.friendly_name.startsWith('AI Assistant')) {
                displayName = num.friendly_name;
              }
              const label = num.isSipTrunk ? (num.trunkName || displayName || 'SIP Trunk') : displayName;
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
  }

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
      alert('Failed to assign some numbers. Please try again.');
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

  /**
   * Generate inbound prompt from identity fields
   */
  generateInboundPrompt() {
    const agentName = this.agent.name || 'Assistant';
    const organization = this.agent.organization_name || '';
    const owner = this.agent.owner_name || '';
    const role = this.agent.agent_role || '';

    let prompt = '';

    // Start with the role if defined
    if (role) {
      prompt = role + '\n\n';
    } else {
      // Default role based on identity
      prompt = `You are ${agentName}`;
      if (organization) {
        prompt += `, a professional AI assistant for ${organization}`;
      }
      if (owner) {
        prompt += `. You work on behalf of ${owner}`;
      }
      prompt += '.\n\n';
    }

    // Add inbound-specific instructions
    prompt += `When someone calls:\n`;
    prompt += `1. Greet them warmly and introduce yourself as ${agentName}`;
    if (organization) {
      prompt += ` from ${organization}`;
    }
    prompt += `\n`;
    prompt += `2. Ask for their name and the purpose of their call\n`;
    prompt += `3. Be helpful, professional, and courteous\n`;

    if (owner) {
      prompt += `\nYou are answering calls on behalf of ${owner}. `;
      prompt += `Offer to take a message, transfer the call, or schedule a callback as appropriate.`;
    }

    return prompt;
  }

  /**
   * Generate outbound prompt from identity fields
   */
  generateOutboundPrompt() {
    const agentName = this.agent.name || 'Assistant';
    const organization = this.agent.organization_name || '';
    const owner = this.agent.owner_name || '';
    const role = this.agent.agent_role || '';

    let prompt = '';

    // Start with the role if defined
    if (role) {
      prompt = role + '\n\n';
    } else {
      // Default role based on identity
      prompt = `You are ${agentName}`;
      if (organization) {
        prompt += `, a professional AI assistant for ${organization}`;
      }
      if (owner) {
        prompt += `, making calls on behalf of ${owner}`;
      }
      prompt += '.\n\n';
    }

    // Add outbound-specific instructions
    prompt += `THIS IS AN OUTBOUND CALL - you called them, they did not call you.\n\n`;
    prompt += `When the call is answered:\n`;
    prompt += `1. Introduce yourself: "Hi, this is ${agentName}`;
    if (organization) {
      prompt += ` from ${organization}`;
    }
    if (owner) {
      prompt += ` calling on behalf of ${owner}`;
    }
    prompt += `"\n`;
    prompt += `2. Clearly state the purpose of your call\n`;
    prompt += `3. Be respectful of their time\n\n`;
    prompt += `If you reach voicemail, leave a clear message with who you are and how to reach back.`;

    return prompt;
  }

  /**
   * Regenerate both prompts from identity fields
   */
  regeneratePrompts() {
    const inboundPrompt = this.generateInboundPrompt();
    const outboundPrompt = this.generateOutboundPrompt();

    // Update local state
    this.agent.system_prompt = inboundPrompt;
    this.agent.outbound_system_prompt = outboundPrompt;

    // Update UI if on prompt tab
    const systemPromptEl = document.getElementById('system-prompt');
    const outboundPromptEl = document.getElementById('outbound-prompt');
    if (systemPromptEl) systemPromptEl.value = inboundPrompt;
    if (outboundPromptEl) outboundPromptEl.value = outboundPrompt;

    // Save to database
    this.scheduleAutoSave({
      system_prompt: inboundPrompt,
      outbound_system_prompt: outboundPrompt
    });
  }

  /**
   * Called when identity fields change - optionally auto-regenerate prompts
   */
  onIdentityFieldChange(field, value) {
    // Update local state and save
    this.agent[field] = value;
    this.scheduleAutoSave({ [field]: value });

    // If prompts are empty or user hasn't customized them much, auto-regenerate
    const hasCustomPrompt = this.agent.system_prompt && this.agent.system_prompt.length > 100;
    if (!hasCustomPrompt) {
      this.regeneratePrompts();
    }
  }

  addStyles() {
    if (document.getElementById('agent-detail-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'agent-detail-styles';
    styles.textContent = `
      .agent-back-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .mobile-toggle.agent-status-toggle {
        display: none;
      }

      .desktop-toggle.agent-detail-actions {
        display: block;
      }

      /* Small toggle for mobile */
      .toggle-switch-sm {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
      }

      .toggle-switch-sm input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .toggle-slider-sm {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-color);
        transition: 0.3s;
        border-radius: 20px;
      }

      .toggle-slider-sm:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      .toggle-switch-sm input:checked + .toggle-slider-sm {
        background-color: var(--primary-color);
      }

      .toggle-switch-sm input:checked + .toggle-slider-sm:before {
        transform: translateX(16px);
      }

      .mobile-toggle .status-label {
        font-size: 0.75rem;
      }

      .agent-detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
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

      .agent-status-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .agent-status-toggle .status-label {
        font-size: 0.875rem;
        font-weight: 500;
      }

      .agent-status-toggle .status-label.active {
        color: var(--success-color, #22c55e);
      }

      .agent-status-toggle .status-label.inactive {
        color: var(--text-secondary);
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
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: transparent;
        padding: 0.25rem 0.5rem;
        width: 100%;
        max-width: 300px;
        transition: border-color 0.2s, background-color 0.2s;
      }

      .agent-name-input:hover {
        background: var(--bg-secondary);
      }

      .agent-name-input:focus {
        outline: none;
        border-color: var(--primary-color);
        background: white;
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

      .agent-tabs-container {
        position: relative;
        margin-bottom: 1.5rem;
      }

      .agent-tabs {
        display: flex;
        gap: 0.25rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .agent-tabs::-webkit-scrollbar {
        display: none;
      }

      .tabs-scroll-indicator {
        display: none;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 40px;
        background: linear-gradient(to right, transparent, white 50%);
        align-items: center;
        justify-content: flex-end;
        color: var(--text-secondary);
        z-index: 5;
        cursor: default;
      }

      .tabs-scroll-indicator svg {
        pointer-events: none;
      }

      .tabs-scroll-indicator.visible {
        display: flex;
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

      .variables-reference {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: var(--radius-md);
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .variables-reference h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        color: var(--primary-color);
      }

      .variables-reference p {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0 0 0.75rem 0;
      }

      .variables-reference ul {
        list-style: none;
        padding: 0;
        margin: 0 0 0.75rem 0;
      }

      .variables-reference li {
        font-size: 0.85rem;
        padding: 0.25rem 0;
        color: var(--text-primary);
      }

      .variables-reference code {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
        padding: 0.15rem 0.4rem;
        border-radius: var(--radius-sm);
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 0.8rem;
      }

      .variables-reference .example {
        font-style: italic;
        font-size: 0.8rem;
        color: var(--text-tertiary);
        margin: 0;
      }

      /* Identity Summary in Prompt Tab */
      .identity-summary {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(16, 185, 129, 0.05));
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: var(--radius-md);
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .identity-summary-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .identity-summary-header h4 {
        margin: 0;
        font-size: 0.9rem;
        color: #16a34a;
      }

      .identity-summary-header .btn {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .identity-role {
        font-size: 0.9rem;
        color: var(--text-primary);
        margin: 0 0 0.75rem 0;
        padding: 0.75rem;
        background: white;
        border-radius: var(--radius-sm);
        border-left: 3px solid #22c55e;
      }

      .identity-details {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .identity-details span {
        white-space: nowrap;
      }

      .identity-details strong {
        color: var(--text-primary);
      }

      .identity-empty {
        background: var(--bg-secondary);
        border: 1px dashed var(--border-color);
        border-radius: var(--radius-md);
        padding: 1.5rem;
        text-align: center;
        margin-bottom: 1.5rem;
      }

      .identity-empty p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .identity-empty-hint {
        margin-top: 0.5rem !important;
        font-size: 0.8rem !important;
        color: var(--text-tertiary) !important;
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

      /* Voice Cloning Styles */
      .voice-clone-section {
        margin-bottom: 1.25rem;
      }

      .voice-clone-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 2px solid transparent;
        background: linear-gradient(white, white) padding-box,
                    linear-gradient(135deg, #6366f1, #8b5cf6) border-box;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s;
      }

      .voice-clone-toggle:hover {
        background: linear-gradient(var(--bg-secondary), var(--bg-secondary)) padding-box,
                    linear-gradient(135deg, #6366f1, #8b5cf6) border-box;
      }

      .voice-clone-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .voice-clone-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .voice-clone-title {
        font-weight: 500;
        font-size: 0.9rem;
      }

      .voice-clone-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .voice-clone-chevron {
        color: var(--text-secondary);
        transition: transform 0.2s;
      }

      .voice-clone-panel {
        margin-top: 1rem;
        padding: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .clone-method-tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .clone-tab {
        flex: 1;
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: white;
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .clone-tab.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: white;
      }

      .recording-buttons {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }

      .btn-record {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: #eff6ff;
        color: #3b82f6;
        border: 2px solid #dbeafe;
      }

      .btn-record:hover {
        background: #dbeafe;
      }

      .btn-upload {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.75rem;
        background: #eff6ff;
        color: #3b82f6;
        border: 2px solid #dbeafe;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
      }

      .btn-upload:hover {
        background: #dbeafe;
      }

      .recording-timer {
        text-align: center;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--primary-color);
        margin-bottom: 1rem;
      }

      .file-name {
        text-align: center;
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-bottom: 1rem;
      }

      .audio-preview {
        margin-top: 1rem;
      }

      .preview-actions {
        display: flex;
        gap: 0.75rem;
      }

      .preview-actions .btn {
        flex: 1;
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

      .form-help code {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
        padding: 0.1rem 0.3rem;
        border-radius: var(--radius-sm);
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 0.75rem;
      }

      .toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .agent-toggle {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }

      .agent-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .agent-toggle-slider {
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

      .agent-toggle-slider:before {
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

      .agent-toggle input:checked + .agent-toggle-slider {
        background-color: var(--primary-color);
      }

      .agent-toggle input:checked + .agent-toggle-slider:before {
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
        align-items: center;
        gap: 0.5rem;
      }

      .number-value {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .number-name {
        font-size: 0.85rem;
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

      /* Widget status dot */
      .widget-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #9ca3af;
      }

      .widget-status-dot.active {
        background: #10b981;
      }

      .widget-status-dot.inactive {
        background: #ef4444;
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
        .mobile-toggle.agent-status-toggle {
          display: flex;
        }

        .desktop-toggle.agent-detail-actions {
          display: none;
        }

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

        .agent-tabs-container {
          margin-left: -1rem;
          margin-right: -1rem;
        }

        .agent-tabs {
          padding-left: 1rem;
          padding-right: 2rem;
        }

        .tabs-scroll-indicator {
          right: 0;
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

  // Voice cloning methods
  async startRecording() {
    const startBtn = document.getElementById('start-recording-btn');
    const stopBtn = document.getElementById('stop-recording-btn');
    const recordingTimer = document.getElementById('recording-timer');
    const timerDisplay = document.getElementById('timer-display');
    const statusDiv = document.getElementById('voice-clone-status');

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        this.audioChunks.push(event.data);
      });

      this.mediaRecorder.addEventListener('stop', () => {
        this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.showAudioPreview();
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      });

      // Start recording
      this.mediaRecorder.start();
      this.recordingStartTime = Date.now();

      // Update UI
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
      if (recordingTimer) recordingTimer.style.display = 'block';
      if (statusDiv) statusDiv.classList.add('hidden');

      // Start timer
      this.recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        if (timerDisplay) {
          timerDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
        // Auto-stop at 2 minutes
        if (elapsed >= 120) {
          this.stopRecording();
        }
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      if (statusDiv) {
        statusDiv.className = 'alert alert-error';
        statusDiv.textContent = 'Failed to access microphone. Please allow microphone access and try again.';
        statusDiv.classList.remove('hidden');
      }
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      clearInterval(this.recordingTimer);

      const startBtn = document.getElementById('start-recording-btn');
      const stopBtn = document.getElementById('stop-recording-btn');
      const recordingTimer = document.getElementById('recording-timer');

      if (startBtn) startBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
      if (recordingTimer) recordingTimer.style.display = 'none';
    }
  }

  showAudioPreview() {
    const audioPreview = document.getElementById('audio-preview');
    const previewPlayer = document.getElementById('preview-player');
    const recordingControls = document.getElementById('recording-controls');

    if (this.audioBlob && previewPlayer) {
      const audioUrl = URL.createObjectURL(this.audioBlob);
      previewPlayer.src = audioUrl;
    }

    if (audioPreview) audioPreview.style.display = 'block';
    if (recordingControls) recordingControls.style.display = 'none';
  }

  retryRecording() {
    const audioPreview = document.getElementById('audio-preview');
    const recordingControls = document.getElementById('recording-controls');
    const timerDisplay = document.getElementById('timer-display');
    const uploadControls = document.getElementById('upload-controls');
    const fileNameDisplay = document.getElementById('file-name');

    // Reset state
    this.audioBlob = null;
    this.audioChunks = [];
    this.uploadedAudioFile = null;

    if (timerDisplay) timerDisplay.textContent = '0:00';
    if (fileNameDisplay) fileNameDisplay.style.display = 'none';

    // Hide preview, show appropriate controls based on active tab
    if (audioPreview) audioPreview.style.display = 'none';

    const recordTab = document.getElementById('record-tab');
    if (recordTab && recordTab.classList.contains('active')) {
      if (recordingControls) recordingControls.style.display = 'block';
    } else {
      if (uploadControls) uploadControls.style.display = 'block';
    }
  }

  async submitVoiceClone() {
    const submitBtn = document.getElementById('submit-voice-btn');
    const statusDiv = document.getElementById('voice-clone-status');
    const progressContainer = document.getElementById('clone-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');

    // Check if we have either a recording or uploaded file
    if (!this.audioBlob && !this.uploadedAudioFile) {
      if (statusDiv) {
        statusDiv.className = 'alert alert-error';
        statusDiv.textContent = 'No audio found. Please record or upload your voice first.';
        statusDiv.classList.remove('hidden');
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Cloning voice...';
    }
    if (statusDiv) statusDiv.classList.add('hidden');
    if (progressContainer) progressContainer.style.display = 'block';

    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressPercent) progressPercent.textContent = `${Math.floor(progress)}%`;
    }, 500);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { user } = await getCurrentUser();

      if (!session || !user) {
        throw new Error('Please log in to clone your voice');
      }

      // Get user's name from users table
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single();

      const userName = userData?.name || user.email;
      const firstName = userName.split(' ')[0];

      // Create FormData
      const formData = new FormData();
      if (this.uploadedAudioFile) {
        formData.append('audio', this.uploadedAudioFile);
      } else {
        formData.append('audio', this.audioBlob, 'voice-recording.wav');
      }
      formData.append('name', `${firstName}'s Voice`);
      formData.append('remove_background_noise', 'true');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/clone-voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clone voice');
      }

      const result = await response.json();
      console.log('Voice cloned:', result);

      // Complete progress
      clearInterval(progressInterval);
      if (progressBar) progressBar.style.width = '100%';
      if (progressPercent) progressPercent.textContent = '100%';

      setTimeout(() => {
        if (statusDiv) {
          statusDiv.className = 'alert alert-success';
          statusDiv.textContent = 'Voice cloned successfully! Reloading...';
          statusDiv.classList.remove('hidden');
        }
        if (progressContainer) progressContainer.style.display = 'none';

        // Reload page to show new voice in dropdown
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }, 500);

    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error cloning voice:', error);

      if (progressContainer) progressContainer.style.display = 'none';
      if (statusDiv) {
        statusDiv.className = 'alert alert-error';
        statusDiv.textContent = error.message || 'Failed to clone voice. Please try again.';
        statusDiv.classList.remove('hidden');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Clone Voice';
      }
    }
  }

  cleanup() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
  }
}
