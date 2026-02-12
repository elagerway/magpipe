/**
 * Agent Detail Page
 * View and edit a single agent with tabbed interface
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { AgentConfig } from '../models/AgentConfig.js';
import { ChatWidget } from '../models/ChatWidget.js';
import { CustomFunction } from '../models/CustomFunction.js';
import { SemanticMatchAction } from '../models/SemanticMatchAction.js';
import { getAgentMemories, getMemory, updateMemory, clearMemory, searchSimilarMemories } from '../services/memoryService.js';
import { showToast } from '../lib/toast.js';

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
    this.knowledgeSources = []; // Knowledge bases for this user
    this.memories = []; // Agent memory entries
    this.memoryCount = 0; // Count of memory entries
    this.customFunctions = []; // Custom webhook functions for this agent
    this.semanticActions = []; // Semantic match alert actions
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

    // Load knowledge sources for this user
    const { data: knowledgeSources } = await supabase
      .from('knowledge_sources')
      .select('id, title, url, sync_status, chunk_count, crawl_mode')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    this.knowledgeSources = knowledgeSources || [];

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

    // Check Cal.com connection status
    const { data: userData } = await supabase
      .from('users')
      .select('cal_com_access_token')
      .eq('id', user.id)
      .single();
    this.isCalComConnected = !!userData?.cal_com_access_token;

    // Load chat widget for this agent
    const { widget } = await ChatWidget.getByAgentId(this.agent.id);
    this.chatWidget = widget;

    // Load custom functions for this agent
    const { functions: customFunctions } = await CustomFunction.listByAgent(this.agent.id);
    this.customFunctions = customFunctions || [];

    // Load semantic match actions for this agent
    const { actions: semanticActions } = await SemanticMatchAction.listByAgent(this.agent.id);
    this.semanticActions = semanticActions || [];

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
            <button class="agent-tab" data-tab="knowledge">Knowledge</button>
            <button class="agent-tab" data-tab="memory">Memory</button>
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

    // Check for Cal.com OAuth callback success
    if (urlParams.get('cal_connected') === 'true') {
      // Clean URL
      window.history.replaceState({}, '', `/agents/${this.agentId}`);

      // Enable booking in functions
      const functions = {
        ...this.agent.functions,
        booking: { ...this.agent.functions?.booking, enabled: true },
      };
      this.agent.functions = functions;
      this.scheduleAutoSave({ functions });

      // Update the checkbox if on functions tab
      const funcBooking = document.getElementById('func-booking');
      if (funcBooking) {
        funcBooking.checked = true;
      }

      // Show success message and open modal to configure event types
      setTimeout(() => {
        this.showBookingModal();
      }, 500);
    }

    // Check for Cal.com error
    const calError = urlParams.get('cal_error');
    if (calError) {
      window.history.replaceState({}, '', `/agents/${this.agentId}`);
      showToast(`Cal.com connection failed: ${calError}`, 'error');
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
  }

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
  }

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
  }

  renderKnowledgeTab() {
    // Ensure knowledge_source_ids is an array
    const selectedIds = this.agent.knowledge_source_ids || [];

    return `
      <div class="config-section">
        <h3>Knowledge Bases</h3>
        <p class="section-desc">Connect knowledge sources for your agent to reference when answering questions.</p>

        <div class="form-group">
          <label class="form-label">Select Knowledge Bases</label>
          <div class="kb-selector-container">
            <button type="button" class="kb-selector-button" id="kb-selector-button">
              ${this.renderKBSelectorButtonContent()}
              <svg class="kb-selector-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- KB Selection Modal -->
            <div class="kb-selector-modal" id="kb-selector-modal">
              <div class="kb-modal-section">
                <div class="kb-modal-section-title">Select Knowledge Bases</div>
                ${this.knowledgeSources.length === 0 ? `
                <div class="kb-modal-empty">
                  <p>No knowledge bases available</p>
                </div>
                ` : this.knowledgeSources.map(kb => `
                <button class="kb-modal-item ${selectedIds.includes(kb.id) ? 'selected' : ''}" data-kb-id="${kb.id}">
                  <div class="kb-modal-item-checkbox">
                    ${selectedIds.includes(kb.id) ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                  </div>
                  <div class="kb-modal-item-content">
                    <span class="kb-modal-item-title">${kb.title || 'Untitled'}</span>
                    <span class="kb-modal-item-desc">${kb.chunk_count ? `${kb.chunk_count} chunks` : ''}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}</span>
                  </div>
                </button>
                `).join('')}
              </div>

              <div class="kb-modal-divider"></div>

              <button class="kb-modal-item kb-modal-action" id="kb-modal-create">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
                <span>Create New Knowledge Base</span>
              </button>
              <button class="kb-modal-item kb-modal-action" id="kb-modal-manage">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span>Manage Knowledge Bases</span>
              </button>
            </div>
          </div>
          <p class="form-help">Your agent will search these knowledge bases to provide informed responses.</p>
        </div>

        ${this.renderSelectedKBs()}
      </div>
    `;
  }

  renderKBSelectorButtonContent() {
    const selectedIds = this.agent.knowledge_source_ids || [];
    const selectedKBs = this.knowledgeSources.filter(kb => selectedIds.includes(kb.id));

    if (selectedKBs.length === 0) {
      return `
        <div class="kb-selector-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <div class="kb-selector-text">
          <span class="kb-selector-title">None selected</span>
          <span class="kb-selector-subtitle">Click to connect knowledge bases</span>
        </div>
      `;
    }

    const totalChunks = selectedKBs.reduce((sum, kb) => sum + (kb.chunk_count || 0), 0);

    return `
      <div class="kb-selector-icon kb-selector-icon-connected">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div class="kb-selector-text">
        <span class="kb-selector-title">${selectedKBs.length} knowledge base${selectedKBs.length > 1 ? 's' : ''} connected</span>
        <span class="kb-selector-subtitle">${totalChunks} total chunks</span>
      </div>
    `;
  }

  renderSelectedKBs() {
    const selectedIds = this.agent.knowledge_source_ids || [];
    const selectedKBs = this.knowledgeSources.filter(kb => selectedIds.includes(kb.id));

    if (selectedKBs.length === 0) return '';

    return `
      <div class="kb-selected-list">
        ${selectedKBs.map(kb => `
        <div class="kb-selected-item">
          <div class="kb-selected-item-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="kb-selected-item-content">
            <span class="kb-selected-item-title">${kb.title || 'Untitled'}</span>
            <span class="kb-selected-item-meta">${kb.chunk_count ? `${kb.chunk_count} chunks` : ''}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}</span>
          </div>
          <button type="button" class="kb-selected-item-remove" data-kb-id="${kb.id}" title="Remove">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        `).join('')}
      </div>
    `;
  }

  renderMemoryTab() {
    const memoryEnabled = this.agent.memory_enabled || false;
    const memoryConfig = this.agent.memory_config || {
      max_history_calls: 5,
      include_summaries: true,
      include_key_topics: true,
      include_preferences: true
    };
    const semanticEnabled = this.agent.semantic_memory_enabled || false;
    const semanticConfig = this.agent.semantic_memory_config || {
      max_results: 3,
      similarity_threshold: 0.75,
      include_other_callers: true
    };

    return `
      <div class="config-section">
        <h3>Memory Settings</h3>
        <p class="section-desc">Enable your agent to remember past conversations with callers.</p>

        <div class="memory-status-container ${memoryEnabled ? 'enabled' : 'disabled'}">
          <div class="memory-status-content">
            <div class="memory-status-icon">
              ${memoryEnabled ? `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              ` : `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              `}
            </div>
            <div class="memory-status-text">
              <span class="memory-status-title">${memoryEnabled ? 'Memory Enabled' : 'Memory Disabled'}</span>
              <span class="memory-status-desc">${memoryEnabled ? 'Agent remembers past conversations with callers' : 'Agent treats each call as a new conversation'}</span>
            </div>
          </div>
          <button type="button" id="memory-toggle-btn" class="memory-toggle-btn ${memoryEnabled ? 'btn-disable' : 'btn-enable'}">
            ${memoryEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div id="memory-config-section" class="${memoryEnabled ? '' : 'hidden'}" style="margin-top: 1rem;">
          <div class="form-group">
            <label class="form-label">Max History Calls</label>
            <select id="memory-max-calls" class="form-select">
              <option value="3" ${memoryConfig.max_history_calls === 3 ? 'selected' : ''}>Last 3 calls</option>
              <option value="5" ${memoryConfig.max_history_calls === 5 ? 'selected' : ''}>Last 5 calls</option>
              <option value="10" ${memoryConfig.max_history_calls === 10 ? 'selected' : ''}>Last 10 calls</option>
            </select>
            <p class="form-help">How many recent calls to consider for context.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Include in Context</label>
            <div class="memory-context-options">
              <label class="memory-option-item">
                <input type="checkbox" id="memory-summaries" ${memoryConfig.include_summaries !== false ? 'checked' : ''} />
                <span>Conversation summaries</span>
              </label>
              <label class="memory-option-item">
                <input type="checkbox" id="memory-topics" ${memoryConfig.include_key_topics !== false ? 'checked' : ''} />
                <span>Key topics discussed</span>
              </label>
              <label class="memory-option-item">
                <input type="checkbox" id="memory-preferences" ${memoryConfig.include_preferences !== false ? 'checked' : ''} />
                <span>Caller preferences</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="config-section">
        <h3>Semantic Memory</h3>
        <p class="section-desc">Find patterns across conversations using AI-powered similarity search.</p>

        <div class="memory-status-container semantic ${semanticEnabled ? 'enabled' : 'disabled'}">
          <div class="memory-status-content">
            <div class="memory-status-icon semantic-icon">
              ${semanticEnabled ? `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              ` : `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              `}
            </div>
            <div class="memory-status-text">
              <span class="memory-status-title">${semanticEnabled ? 'Semantic Memory Enabled' : 'Semantic Memory Disabled'}</span>
              <span class="memory-status-desc">${semanticEnabled ? 'Agent finds similar past conversations to identify patterns' : 'Agent only uses individual caller history'}</span>
            </div>
          </div>
          <button type="button" id="semantic-toggle-btn" class="memory-toggle-btn ${semanticEnabled ? 'btn-disable' : 'btn-enable'}">
            ${semanticEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div id="semantic-config-section" class="${semanticEnabled ? '' : 'hidden'}" style="margin-top: 1rem;">
          <div class="form-group">
            <label class="form-label">Similar Conversations to Show</label>
            <select id="semantic-max-results" class="form-select">
              <option value="2" ${semanticConfig.max_results === 2 ? 'selected' : ''}>2 similar conversations</option>
              <option value="3" ${semanticConfig.max_results === 3 ? 'selected' : ''}>3 similar conversations</option>
              <option value="5" ${semanticConfig.max_results === 5 ? 'selected' : ''}>5 similar conversations</option>
            </select>
            <p class="form-help">Maximum number of similar past conversations to include.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Similarity Threshold</label>
            <select id="semantic-threshold" class="form-select">
              <option value="0.6" ${semanticConfig.similarity_threshold === 0.6 ? 'selected' : ''}>Low (60%) - More results, less accurate</option>
              <option value="0.75" ${semanticConfig.similarity_threshold === 0.75 ? 'selected' : ''}>Medium (75%) - Balanced</option>
              <option value="0.85" ${semanticConfig.similarity_threshold === 0.85 ? 'selected' : ''}>High (85%) - Fewer results, more accurate</option>
            </select>
            <p class="form-help">How similar conversations must be to be included.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Semantic Match Threshold</label>
            <select id="semantic-match-threshold" class="form-select">
              <option value="2" ${semanticConfig.semantic_match_threshold === 2 ? 'selected' : ''}>2 matches</option>
              <option value="3" ${(semanticConfig.semantic_match_threshold || 3) === 3 ? 'selected' : ''}>3 matches (Default)</option>
              <option value="5" ${semanticConfig.semantic_match_threshold === 5 ? 'selected' : ''}>5 matches</option>
              <option value="10" ${semanticConfig.semantic_match_threshold === 10 ? 'selected' : ''}>10 matches</option>
            </select>
            <p class="form-help">How many times a memory must be matched before it's labeled as a semantic pattern.</p>
          </div>
        </div>

        <div class="semantic-info-box">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Semantic memory helps identify common issues across callers. For example, if multiple customers report the same problem, your agent will recognize the pattern.</span>
        </div>

      </div>

      <div class="config-section" id="memory-list-section">
        <div class="memory-section-header">
          <h3>Agent Memory <span id="memory-count-badge" class="memory-count-badge">${this.memoryCount}</span></h3>
          ${this.memoryCount > 0 ? `
            <button type="button" id="clear-all-memories-btn" class="btn-text-danger">Clear All</button>
          ` : ''}
        </div>
        ${semanticEnabled ? `
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
            <input type="text" id="semantic-search-input" class="form-input" placeholder="Search memories..." style="flex: 1;" />
            <button type="button" id="semantic-search-btn" class="btn btn-secondary" style="white-space: nowrap;">Search</button>
          </div>
          <div id="semantic-search-results"></div>
        ` : ''}
        <div id="memories-container" class="memories-container">
          <div class="memory-loading">Loading memories...</div>
        </div>
      </div>
    `;
  }

  renderMemoryList() {
    if (this.memories.length === 0) {
      return `
        <div class="memory-empty-state">
          <div class="memory-empty-icon">
            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
          </div>
          <p class="memory-empty-title">No caller memories yet</p>
          <p class="memory-empty-desc">Memories will appear here after conversations when memory is enabled.</p>
        </div>
      `;
    }

    return this.memories.map(mem => `
      <div class="memory-card" data-memory-id="${mem.id}">
        <div class="memory-card-header">
          <div class="memory-contact">
            <div class="memory-contact-avatar" ${mem.contact?.avatar_url ? 'style="padding: 0; background: none;"' : ''}>
              ${mem.contact?.avatar_url
                ? `<img src="${mem.contact.avatar_url}" alt="${mem.contact.name || ''}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`
                : `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>`
              }
            </div>
            <div class="memory-contact-details">
              <span class="memory-contact-phone">${mem.contact?.phone_number || 'Unknown'}</span>
              ${mem.contact?.name ? `<span class="memory-contact-name">${mem.contact.name}</span>` : ''}
            </div>
          </div>
          <div class="memory-header-right">
            ${mem.direction ? `<span class="memory-direction-badge memory-direction-${mem.direction}">${mem.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>` : ''}
            ${mem.hasEmbedding ? (() => {
              const matchThreshold = this.agent?.semantic_memory_config?.semantic_match_threshold || 3;
              if (mem.semanticMatchCount >= matchThreshold) {
                return `<button type="button" class="memory-direction-badge memory-semantic-match-badge semantic-match-pill" data-memory-id="${mem.id}" data-match-count="${mem.semanticMatchCount}">${mem.semanticMatchCount} Semantic Match${mem.semanticMatchCount !== 1 ? 'es' : ''}</button>`;
              }
              return `<span class="memory-direction-badge memory-semantic-badge">Indexed${mem.semanticMatchCount > 0 ? ` · ${mem.semanticMatchCount} match${mem.semanticMatchCount !== 1 ? 'es' : ''}` : ''}</span>`;
            })() : ''}
            <span class="memory-call-count">${(() => {
              const calls = mem.interactionCount || 0;
              const texts = mem.smsInteractionCount || 0;
              const parts = [];
              if (calls > 0) parts.push(`${calls} call${calls !== 1 ? 's' : ''}`);
              if (texts > 0) parts.push(`${texts} text${texts !== 1 ? 's' : ''}`);
              return parts.length > 0 ? parts.join(', ') : '0 interactions';
            })()}</span>
          </div>
        </div>
        <p class="memory-card-summary">${mem.summary || 'No summary available'}</p>
        ${mem.keyTopics && mem.keyTopics.length > 0 ? `
          <div class="memory-card-topics">
            ${mem.keyTopics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        <div class="memory-card-actions">
          <button type="button" class="memory-action-btn view-memory-btn" data-memory-id="${mem.id}">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            View
          </button>
          <button type="button" class="memory-action-btn memory-action-danger clear-memory-btn" data-memory-id="${mem.id}">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Clear
          </button>
          <span class="copy-memory-id-btn" data-memory-id="${mem.id}" title="Click to copy">${mem.id}</span>
        </div>
      </div>
    `).join('');
  }

  async loadMemories() {
    try {
      this.memories = await getAgentMemories(this.agentId);
      this.memoryCount = this.memories.length;

      const container = document.getElementById('memories-container');
      if (container) {
        container.innerHTML = this.renderMemoryList();
        this.attachMemoryListListeners();
      }

      // Update count badge
      const badge = document.getElementById('memory-count-badge');
      if (badge) {
        badge.textContent = this.memoryCount;
      }

      // Show/hide clear all button
      const clearAllBtn = document.getElementById('clear-all-memories-btn');
      if (clearAllBtn) {
        clearAllBtn.style.display = this.memoryCount > 0 ? 'inline-flex' : 'none';
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
      const container = document.getElementById('memories-container');
      if (container) {
        container.innerHTML = `<div class="memory-error-state">Failed to load memories. Please try again.</div>`;
      }
    }
  }

  attachMemoryTabListeners() {
    // Memory toggle button
    const memoryToggleBtn = document.getElementById('memory-toggle-btn');
    const memoryConfigSection = document.getElementById('memory-config-section');
    const memoryStatusContainer = document.querySelector('.memory-status-container');

    if (memoryToggleBtn) {
      memoryToggleBtn.addEventListener('click', async () => {
        const currentlyEnabled = this.agent.memory_enabled || false;
        const newEnabled = !currentlyEnabled;

        // Update local state
        this.agent.memory_enabled = newEnabled;

        // Update UI immediately
        if (memoryConfigSection) {
          memoryConfigSection.classList.toggle('hidden', !newEnabled);
        }

        // Update the status container appearance
        if (memoryStatusContainer) {
          memoryStatusContainer.classList.toggle('enabled', newEnabled);
          memoryStatusContainer.classList.toggle('disabled', !newEnabled);

          // Update icon
          const iconContainer = memoryStatusContainer.querySelector('.memory-status-icon');
          if (iconContainer) {
            iconContainer.innerHTML = newEnabled ? `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            ` : `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            `;
          }

          // Update text
          const titleEl = memoryStatusContainer.querySelector('.memory-status-title');
          const descEl = memoryStatusContainer.querySelector('.memory-status-desc');
          if (titleEl) titleEl.textContent = newEnabled ? 'Memory Enabled' : 'Memory Disabled';
          if (descEl) descEl.textContent = newEnabled ? 'Agent remembers past conversations with callers' : 'Agent treats each call as a new conversation';
        }

        // Update button
        memoryToggleBtn.textContent = newEnabled ? 'Disable' : 'Enable';
        memoryToggleBtn.classList.toggle('btn-disable', newEnabled);
        memoryToggleBtn.classList.toggle('btn-enable', !newEnabled);

        await this.updateAgentField('memory_enabled', newEnabled);
      });
    }

    // Memory config options
    const maxCallsSelect = document.getElementById('memory-max-calls');
    const summariesCheck = document.getElementById('memory-summaries');
    const topicsCheck = document.getElementById('memory-topics');
    const preferencesCheck = document.getElementById('memory-preferences');

    const updateMemoryConfig = async () => {
      const config = {
        max_history_calls: parseInt(maxCallsSelect?.value || '5'),
        include_summaries: summariesCheck?.checked ?? true,
        include_key_topics: topicsCheck?.checked ?? true,
        include_preferences: preferencesCheck?.checked ?? true,
      };
      await this.updateAgentField('memory_config', config);
    };

    maxCallsSelect?.addEventListener('change', updateMemoryConfig);
    summariesCheck?.addEventListener('change', updateMemoryConfig);
    topicsCheck?.addEventListener('change', updateMemoryConfig);
    preferencesCheck?.addEventListener('change', updateMemoryConfig);

    // Clear all memories button
    const clearAllBtn = document.getElementById('clear-all-memories-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.showConfirmModal(
          'Clear All Memories',
          'Are you sure you want to clear all caller memories for this agent? This cannot be undone.',
          async () => {
            try {
              const { clearAllAgentMemories } = await import('../services/memoryService.js');
              await clearAllAgentMemories(this.agentId);
              await this.loadMemories();
            } catch (error) {
              console.error('Failed to clear memories:', error);
            }
          }
        );
      });
    }

    // Semantic Memory toggle
    const semanticToggleBtn = document.getElementById('semantic-toggle-btn');
    const semanticConfigSection = document.getElementById('semantic-config-section');
    if (semanticToggleBtn) {
      semanticToggleBtn.addEventListener('click', async () => {
        const newEnabled = !this.agent.semantic_memory_enabled;

        // Show/hide config section
        if (semanticConfigSection) {
          semanticConfigSection.classList.toggle('hidden', !newEnabled);
        }

        // Update UI immediately
        const semanticStatusContainer = document.querySelector('.memory-status-container.semantic');
        if (semanticStatusContainer) {
          semanticStatusContainer.classList.toggle('enabled', newEnabled);
          semanticStatusContainer.classList.toggle('disabled', !newEnabled);

          // Update icon
          const iconEl = semanticStatusContainer.querySelector('.memory-status-icon');
          if (iconEl) {
            iconEl.innerHTML = newEnabled ? `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            ` : `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            `;
          }

          // Update text
          const titleEl = semanticStatusContainer.querySelector('.memory-status-title');
          const descEl = semanticStatusContainer.querySelector('.memory-status-desc');
          if (titleEl) titleEl.textContent = newEnabled ? 'Semantic Memory Enabled' : 'Semantic Memory Disabled';
          if (descEl) descEl.textContent = newEnabled ? 'Agent finds patterns across all callers' : 'Agent only uses individual caller memory';
        }

        // Update button
        semanticToggleBtn.textContent = newEnabled ? 'Disable' : 'Enable';
        semanticToggleBtn.classList.toggle('btn-disable', newEnabled);
        semanticToggleBtn.classList.toggle('btn-enable', !newEnabled);

        // Update local state
        this.agent.semantic_memory_enabled = newEnabled;

        await this.updateAgentField('semantic_memory_enabled', newEnabled);
      });
    }

    // Semantic Memory config options
    const semanticMaxResults = document.getElementById('semantic-max-results');
    const semanticThreshold = document.getElementById('semantic-threshold');
    const semanticMatchThreshold = document.getElementById('semantic-match-threshold');

    const updateSemanticConfig = async () => {
      const config = {
        max_results: parseInt(semanticMaxResults?.value || '3'),
        similarity_threshold: parseFloat(semanticThreshold?.value || '0.75'),
        semantic_match_threshold: parseInt(semanticMatchThreshold?.value || '3'),
        include_other_callers: true,
      };
      this.agent.semantic_memory_config = config;
      await this.updateAgentField('semantic_memory_config', config);
    };

    semanticMaxResults?.addEventListener('change', updateSemanticConfig);
    semanticThreshold?.addEventListener('change', updateSemanticConfig);
    semanticMatchThreshold?.addEventListener('change', updateSemanticConfig);

    // Semantic search tool
    const searchBtn = document.getElementById('semantic-search-btn');
    const searchInput = document.getElementById('semantic-search-input');
    const searchResults = document.getElementById('semantic-search-results');

    if (searchBtn && searchInput) {
      const doSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';
        if (searchResults) searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Searching...</div>';

        try {
          const results = await searchSimilarMemories({ agentId: this.agentId, query });

          if (!searchResults) return;
          if (results.length === 0) {
            searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">No matching memories found.</div>';
            return;
          }

          searchResults.innerHTML = results.map(r => {
            const pct = Math.round((r.similarity || 0) * 100);
            return `
              <div style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <span style="font-weight: 500; font-size: 0.85rem;">${r.contact_name || r.contact_phone || 'Unknown'}</span>
                  <span class="memory-direction-badge memory-semantic-badge">${pct}%</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${r.summary || 'No summary'}</div>
                ${r.key_topics && r.key_topics.length > 0 ? `
                  <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.25rem;">
                    ${r.key_topics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        } catch (err) {
          console.error('Semantic search failed:', err);
          if (searchResults) searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Search failed. Please try again.</div>';
        } finally {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Search';
        }
      };

      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

  }

  attachMemoryListListeners() {
    // View memory buttons
    document.querySelectorAll('.view-memory-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const memoryId = btn.dataset.memoryId;
        await this.showMemoryDetailModal(memoryId);
      });
    });

    // Copy memory ID buttons
    document.querySelectorAll('.copy-memory-id-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const memoryId = btn.dataset.memoryId;
        if (memoryId) {
          navigator.clipboard.writeText(memoryId).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Semantic match pill buttons
    document.querySelectorAll('.semantic-match-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memoryId = btn.dataset.memoryId;
        this.showSemanticMatchModal(memoryId);
      });
    });

    // Clear memory buttons
    document.querySelectorAll('.clear-memory-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const memoryId = btn.dataset.memoryId;
        const mem = this.memories.find(m => m.id === memoryId);
        const contactName = mem?.contact?.name || mem?.contact?.phone_number || 'this caller';

        this.showConfirmModal(
          'Clear Memory',
          `Are you sure you want to clear the memory for ${contactName}? This cannot be undone.`,
          async () => {
            try {
              await clearMemory(memoryId);
              await this.loadMemories();
            } catch (error) {
              console.error('Failed to clear memory:', error);
            }
          }
        );
      });
    });
  }

  async showMemoryDetailModal(memoryId) {
    try {
      const memory = await getMemory(memoryId);

      // Remove existing modal
      document.getElementById('memory-detail-modal')?.remove();

      const modal = document.createElement('div');
      modal.id = 'memory-detail-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content memory-detail-modal">
          <div class="modal-mobile-header">
            <button type="button" class="back-btn" id="memory-modal-back">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span>Agent Memory</span>
          </div>

          <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">Agent Memory: ${memory.contact?.name || memory.contact?.phone_number || 'Unknown'}</h3>
            <button type="button" id="close-memory-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
          </div>

          <div class="memory-detail-phone">${memory.contact?.phone_number || ''}</div>

          <div class="memory-detail-section">
            <label class="form-label">Summary</label>
            <textarea id="memory-summary-edit" class="form-textarea" rows="3">${memory.summary || ''}</textarea>
          </div>

          <div class="memory-detail-section">
            <label class="form-label">Key Topics</label>
            <div class="memory-topics-display">
              ${(memory.keyTopics || []).map(t => `<span class="topic-tag">${t}</span>`).join('') || '<span class="text-muted">No topics</span>'}
            </div>
          </div>

          ${memory.preferences && Object.keys(memory.preferences).length > 0 ? `
            <div class="memory-detail-section">
              <label class="form-label">Preferences</label>
              <pre class="memory-prefs-display">${JSON.stringify(memory.preferences, null, 2)}</pre>
            </div>
          ` : ''}

          <div class="memory-detail-section">
            <label class="form-label">Call History (${memory.callHistory?.length || 0} calls)</label>
            <div class="call-history-list">
              ${memory.callHistory && memory.callHistory.length > 0 ? memory.callHistory.map(call => `
                <div class="call-history-item">
                  <span class="call-date">${new Date(call.started_at).toLocaleDateString()}</span>
                  <span class="call-duration">${Math.floor((call.duration_seconds || 0) / 60)} min</span>
                  <span class="call-summary-preview">${call.call_summary || 'No summary'}</span>
                </div>
              `).join('') : '<div class="text-muted">No call history available</div>'}
            </div>
          </div>

          <div class="memory-detail-section">
            <label class="form-label">Similar Memories</label>
            <div id="similar-memories-container">
              <div class="text-muted" style="font-size: 0.85rem;">Loading...</div>
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button type="button" class="btn btn-secondary" id="close-memory-detail" style="flex: 1;">Close</button>
            <button type="button" class="btn btn-primary" id="save-memory-changes" style="flex: 1;">Save Changes</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();

      modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
      document.getElementById('close-memory-modal')?.addEventListener('click', closeModal);
      document.getElementById('memory-modal-back')?.addEventListener('click', closeModal);
      document.getElementById('close-memory-detail')?.addEventListener('click', closeModal);

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });

      // Save changes handler
      document.getElementById('save-memory-changes')?.addEventListener('click', async () => {
        const newSummary = document.getElementById('memory-summary-edit')?.value;
        try {
          await updateMemory(memoryId, { summary: newSummary });
          closeModal();
          await this.loadMemories();
        } catch (error) {
          console.error('Failed to save memory:', error);
        }
      });

      // Load similar memories
      const memFromList = this.memories.find(m => m.id === memoryId);
      const similarContainer = document.getElementById('similar-memories-container');
      if (memFromList?.hasEmbedding && this.agent.semantic_memory_enabled) {
        const excludeContactId = memory.contact?.id || null;
        searchSimilarMemories({ agentId: this.agentId, memoryId, excludeContactId })
          .then(results => {
            if (!similarContainer) return;
            if (results.length === 0) {
              similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">No similar memories found.</div>';
              return;
            }
            similarContainer.innerHTML = results.map(r => {
              const pct = Math.round((r.similarity || 0) * 100);
              return `
                <div style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 500; font-size: 0.85rem;">${r.contact_name || r.contact_phone || 'Unknown'}</span>
                    <span class="memory-direction-badge memory-semantic-badge">${pct}% similar</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${r.summary || 'No summary'}</div>
                  ${r.key_topics && r.key_topics.length > 0 ? `
                    <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                      ${r.key_topics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('');
          })
          .catch(() => {
            if (similarContainer) {
              similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Failed to load similar memories.</div>';
            }
          });
      } else if (similarContainer) {
        similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Enable semantic memory to find similar conversations.</div>';
      }

    } catch (error) {
      console.error('Failed to load memory detail:', error);
    }
  }

  async showSemanticMatchModal(memoryId) {
    const mem = this.memories.find(m => m.id === memoryId);
    if (!mem) return;

    const contactName = mem.contact?.name || mem.contact?.phone_number || 'Unknown';
    const matchCount = mem.semanticMatchCount || 0;

    document.getElementById('semantic-match-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'semantic-match-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-mobile-header">
          <button type="button" class="back-btn" id="semantic-modal-back">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span>Semantic Pattern</span>
        </div>

        <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">Semantic Pattern</h3>
          <button type="button" id="close-semantic-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; padding: 0.75rem; background: var(--bg-secondary, #f9fafb); border-radius: 10px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="20" height="20" fill="none" stroke="#d97706" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 0.95rem;">${matchCount} Semantic Match${matchCount !== 1 ? 'es' : ''}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">This memory was surfaced ${matchCount} time${matchCount !== 1 ? 's' : ''} during other conversations</div>
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Contact</label>
          <div style="font-size: 0.9rem; font-weight: 500;">${contactName}</div>
          ${mem.contact?.phone_number && mem.contact?.name ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">${mem.contact.phone_number}</div>` : ''}
        </div>

        <div style="margin-bottom: 1rem;">
          <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Summary</label>
          <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary);">${mem.summary || 'No summary available'}</div>
        </div>

        ${mem.keyTopics && mem.keyTopics.length > 0 ? `
          <div style="margin-bottom: 1rem;">
            <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Topics</label>
            <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
              ${mem.keyTopics.map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div style="padding: 0.75rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-bottom: 1.25rem;">
          <div style="font-size: 0.8rem; color: #92400e; line-height: 1.5;">
            This pattern is appearing across multiple callers. Consider whether this represents a recurring issue that needs attention.
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" id="close-semantic-detail" style="flex: 1;">Close</button>
          <button type="button" class="btn btn-primary" id="create-semantic-alert-btn" style="flex: 1;">Create Alert</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('close-semantic-modal')?.addEventListener('click', closeModal);
    document.getElementById('close-semantic-detail')?.addEventListener('click', closeModal);
    document.getElementById('semantic-modal-back')?.addEventListener('click', closeModal);

    // Create Alert button: navigate to Functions tab and open config modal
    document.getElementById('create-semantic-alert-btn')?.addEventListener('click', () => {
      const topics = mem.keyTopics || [];
      closeModal();
      // Switch to Functions tab
      const functionsTab = document.querySelector('[data-tab="functions"]');
      if (functionsTab) functionsTab.click();
      // Open semantic match config modal, then immediately open add-alert with pre-filled topics
      setTimeout(() => this.showSemanticMatchConfigModal(false, topics), 200);
    });
  }

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
      <div class="config-section agent-analytics">
        <h3>Analytics</h3>
        <p class="section-desc">View performance metrics for this agent.</p>

        <!-- Row 1: Summary Cards -->
        <div class="analytics-grid analytics-grid-4">
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-calls">--</div>
            <div class="analytics-card-label">Total Calls</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-messages">--</div>
            <div class="analytics-card-label">Total Messages</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-duration">--</div>
            <div class="analytics-card-label">Avg. Call Duration</div>
          </div>
          <div class="analytics-card">
            <div class="analytics-card-value" id="stat-success">--</div>
            <div class="analytics-card-label">Success Rate</div>
          </div>
        </div>

        <!-- Row 2: Calls & Messages Panels -->
        <div class="analytics-grid analytics-grid-2" style="margin-top: 1.5rem;">
          <div class="analytics-panel">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
              Calls
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-inbound">--</span>
                <span class="analytics-stat-label">Inbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-outbound">--</span>
                <span class="analytics-stat-label">Outbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-month">--</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-calls-minutes">--</span>
                <span class="analytics-stat-label">Total Minutes</span>
              </div>
            </div>
          </div>

          <div class="analytics-panel">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              Messages
            </h3>
            <div class="analytics-stats">
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-inbound">--</span>
                <span class="analytics-stat-label">Inbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-outbound">--</span>
                <span class="analytics-stat-label">Outbound</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-month">--</span>
                <span class="analytics-stat-label">This Month</span>
              </div>
              <div class="analytics-stat">
                <span class="analytics-stat-value" id="stat-msgs-delivery">--</span>
                <span class="analytics-stat-label">Delivery Rate</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Row 3: Call Volume Chart -->
        <div class="analytics-panel" style="margin-top: 1.5rem;">
          <h3>Call Volume (Last 30 Days)</h3>
          <div class="aa-chart-container">
            <canvas id="agent-calls-chart"></canvas>
          </div>
        </div>

        <!-- Row 4: Disposition & Sentiment -->
        <div class="analytics-grid analytics-grid-2" style="margin-top: 1.5rem;">
          <div class="analytics-panel">
            <h3>Disposition</h3>
            <div id="disposition-breakdown" class="aa-breakdown-list">
              <div class="aa-breakdown-empty">Loading...</div>
            </div>
          </div>
          <div class="analytics-panel">
            <h3>Sentiment</h3>
            <div id="sentiment-breakdown" class="aa-breakdown-list">
              <div class="aa-breakdown-empty">Loading...</div>
            </div>
          </div>
        </div>

        <!-- Row 5: Recent Sessions -->
        <div class="analytics-panel aa-recent-calls-panel" style="margin-top: 1.5rem;">
          <h3>Recent Sessions</h3>
          <div id="recent-calls-container">
            <div class="aa-breakdown-empty">Loading...</div>
          </div>
        </div>
      </div>
    `;
  }

  renderScheduleTab() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Default when no schedule saved = always available (all days unchecked)
    // User enables specific days to RESTRICT availability
    const defaultSchedule = {
      monday: { enabled: false, start: '09:00', end: '17:00' },
      tuesday: { enabled: false, start: '09:00', end: '17:00' },
      wednesday: { enabled: false, start: '09:00', end: '17:00' },
      thursday: { enabled: false, start: '09:00', end: '17:00' },
      friday: { enabled: false, start: '09:00', end: '17:00' },
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

        <div class="form-group">
          <label class="form-label" for="after-hours-call-forwarding">After-Hours Call Forwarding</label>
          <input type="tel" id="after-hours-call-forwarding" class="form-input"
            placeholder="+1 (555) 123-4567"
            value="${this.agent.after_hours_call_forwarding || ''}" />
          <p class="form-help">Forward calls to this number outside scheduled hours. Leave empty to take a message instead.</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="after-hours-sms-forwarding">After-Hours SMS Forwarding</label>
          <input type="tel" id="after-hours-sms-forwarding" class="form-input"
            placeholder="+1 (555) 123-4567"
            value="${this.agent.after_hours_sms_forwarding || ''}" />
          <p class="form-help">Forward texts to this number outside scheduled hours. Leave empty to auto-reply.</p>
        </div>
      </div>

      <div class="config-section">
        <div class="schedule-section-header">
          <h3>Calls Schedule</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="apply-calls-to-all">Apply to All Days</button>
        </div>
        <p class="section-desc">When your agent will answer phone calls.</p>

        ${!callsSchedule ? `
        <div class="schedule-status-banner schedule-status-24-7">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span><strong>Always Available</strong> - No schedule restrictions. Toggle days below to set specific hours.</span>
        </div>
        ` : `
        <div class="schedule-status-banner schedule-status-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span><strong>Schedule Active</strong> - Calls outside these hours will be handled by your agent.</span>
        </div>
        `}

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

        ${!textsSchedule ? `
        <div class="schedule-status-banner schedule-status-24-7">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span><strong>Always Available</strong> - No schedule restrictions. Toggle days below to set specific hours.</span>
        </div>
        ` : `
        <div class="schedule-status-banner schedule-status-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span><strong>Schedule Active</strong> - Texts outside these hours will be handled by your agent.</span>
        </div>
        `}

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

    // Language
    const agentLanguage = document.getElementById('agent-language');
    if (agentLanguage) {
      agentLanguage.addEventListener('change', () => {
        this.scheduleAutoSave({ language: agentLanguage.value });
        const warning = document.getElementById('language-voice-warning');
        if (warning) {
          warning.style.display = agentLanguage.value !== 'en-US' ? 'block' : 'none';
        }
      });
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

  attachKnowledgeTabListeners() {
    // Ensure knowledge_source_ids is initialized
    if (!this.agent.knowledge_source_ids) {
      this.agent.knowledge_source_ids = [];
    }

    // Knowledge base modal selector
    const kbSelectorBtn = document.getElementById('kb-selector-button');
    const kbModal = document.getElementById('kb-selector-modal');

    if (kbSelectorBtn && kbModal) {
      // Toggle modal on button click
      kbSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        kbModal.classList.toggle('open');
        kbSelectorBtn.classList.toggle('open');
      });

      // Close modal when clicking outside
      document.addEventListener('click', (e) => {
        if (!kbModal.contains(e.target) && !kbSelectorBtn.contains(e.target)) {
          kbModal.classList.remove('open');
          kbSelectorBtn.classList.remove('open');
        }
      });

      // Handle KB checkbox selection (toggle)
      const kbItems = kbModal.querySelectorAll('.kb-modal-item[data-kb-id]');
      kbItems.forEach(item => {
        item.addEventListener('click', () => {
          const kbId = item.dataset.kbId;
          if (!kbId) return;

          const selectedIds = this.agent.knowledge_source_ids || [];
          const isSelected = selectedIds.includes(kbId);

          if (isSelected) {
            // Remove from selection
            this.agent.knowledge_source_ids = selectedIds.filter(id => id !== kbId);
          } else {
            // Add to selection
            this.agent.knowledge_source_ids = [...selectedIds, kbId];
          }

          this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });

          // Update checkbox state in modal
          const checkbox = item.querySelector('.kb-modal-item-checkbox');
          if (isSelected) {
            item.classList.remove('selected');
            checkbox.innerHTML = '';
          } else {
            item.classList.add('selected');
            checkbox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          }

          // Update button content
          this.updateKBSelectorButton();

          // Update the selected KBs list
          this.updateSelectedKBsList();
        });
      });

      // Manage KB button - navigate to knowledge page
      const manageKbBtn = document.getElementById('kb-modal-manage');
      if (manageKbBtn) {
        manageKbBtn.addEventListener('click', () => {
          window.location.href = '/knowledge';
        });
      }

      // Create KB button - navigate to knowledge page
      const createKbBtn = document.getElementById('kb-modal-create');
      if (createKbBtn) {
        createKbBtn.addEventListener('click', () => {
          window.location.href = '/knowledge';
        });
      }
    }

    // Attach remove button listeners for selected KBs
    this.attachKBRemoveListeners();
  }

  updateKBSelectorButton() {
    const kbSelectorBtn = document.getElementById('kb-selector-button');
    if (kbSelectorBtn) {
      kbSelectorBtn.innerHTML = this.renderKBSelectorButtonContent() + `
        <svg class="kb-selector-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;
    }
  }

  updateSelectedKBsList() {
    const existingList = document.querySelector('.kb-selected-list');
    if (existingList) existingList.remove();

    const kbsHtml = this.renderSelectedKBs();
    if (kbsHtml) {
      const formGroup = document.querySelector('.kb-selector-container')?.closest('.form-group');
      if (formGroup) {
        formGroup.insertAdjacentHTML('afterend', kbsHtml);
        this.attachKBRemoveListeners();
      }
    }
  }

  attachKBRemoveListeners() {
    const removeButtons = document.querySelectorAll('.kb-selected-item-remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kbId = btn.dataset.kbId;
        const kb = this.knowledgeSources.find(k => k.id === kbId);
        const kbName = kb?.title || 'this knowledge base';

        this.showKBRemoveConfirmModal(kbId, kbName);
      });
    });
  }

  showKBRemoveConfirmModal(kbId, kbName) {
    // Create modal overlay
    const modalHtml = `
      <div class="modal-overlay kb-remove-modal-overlay" id="kb-remove-modal">
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h3>Remove Knowledge Base</h3>
            <button class="modal-close-btn" id="kb-remove-modal-close">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 1.5rem;">
            <p>Are you sure you want to remove <strong>${kbName}</strong> from this agent?</p>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">The knowledge base will not be deleted, only disconnected from this agent.</p>
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);">
            <button class="btn btn-secondary" id="kb-remove-modal-cancel">Cancel</button>
            <button class="btn btn-danger" id="kb-remove-modal-confirm">Remove</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('kb-remove-modal');
    const closeBtn = document.getElementById('kb-remove-modal-close');
    const cancelBtn = document.getElementById('kb-remove-modal-cancel');
    const confirmBtn = document.getElementById('kb-remove-modal-confirm');

    const closeModal = () => modal.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    confirmBtn.addEventListener('click', () => {
      // Remove KB from selection
      this.agent.knowledge_source_ids = (this.agent.knowledge_source_ids || []).filter(id => id !== kbId);
      this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });

      // Update the modal checkbox state
      const modalItem = document.querySelector(`.kb-modal-item[data-kb-id="${kbId}"]`);
      if (modalItem) {
        modalItem.classList.remove('selected');
        const checkbox = modalItem.querySelector('.kb-modal-item-checkbox');
        if (checkbox) checkbox.innerHTML = '';
      }

      // Update UI
      this.updateKBSelectorButton();
      this.updateSelectedKBsList();

      closeModal();
    });
  }

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
  }

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

    // Helper to save schedule - if no days enabled, save null (always available)
    const saveCallsSchedule = () => {
      const schedule = buildSchedule('calls');
      const hasEnabledDays = Object.values(schedule).some(day => day.enabled);
      const scheduleToSave = hasEnabledDays ? schedule : null;
      this.agent.calls_schedule = scheduleToSave;
      this.scheduleAutoSave({ calls_schedule: scheduleToSave });
    };

    const saveTextsSchedule = () => {
      const schedule = buildSchedule('texts');
      const hasEnabledDays = Object.values(schedule).some(day => day.enabled);
      const scheduleToSave = hasEnabledDays ? schedule : null;
      this.agent.texts_schedule = scheduleToSave;
      this.scheduleAutoSave({ texts_schedule: scheduleToSave });
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

    // After-hours forwarding number inputs
    const callForwardingInput = document.getElementById('after-hours-call-forwarding');
    if (callForwardingInput) {
      callForwardingInput.addEventListener('change', () => {
        const value = callForwardingInput.value.trim() || null;
        this.updateAgentField('after_hours_call_forwarding', value);
      });
    }

    const smsForwardingInput = document.getElementById('after-hours-sms-forwarding');
    if (smsForwardingInput) {
      smsForwardingInput.addEventListener('change', () => {
        const value = smsForwardingInput.value.trim() || null;
        this.updateAgentField('after_hours_sms_forwarding', value);
      });
    }
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
      case 'knowledge':
        tabContent.innerHTML = this.renderKnowledgeTab();
        this.attachKnowledgeTabListeners();
        break;
      case 'memory':
        tabContent.innerHTML = this.renderMemoryTab();
        this.attachMemoryTabListeners();
        this.loadMemories();
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

    // Update URL with tab parameter
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
  }

  async loadAnalytics() {
    try {
      // Fetch call records and SMS messages in parallel
      const [callsResult, msgsResult] = await Promise.all([
        supabase
          .from('call_records')
          .select('id, direction, duration_seconds, call_successful, status, disposition, user_sentiment, started_at, caller_number, service_number, contact_phone')
          .eq('agent_id', this.agent.id)
          .order('started_at', { ascending: false })
          .limit(500),
        supabase
          .from('sms_messages')
          .select('id, direction, status, sentiment, sent_at, sender_number, recipient_number')
          .eq('agent_id', this.agent.id)
          .order('sent_at', { ascending: false })
          .limit(500)
      ]);

      const calls = callsResult.data || [];
      const messages = msgsResult.data || [];

      // --- Summary Cards ---
      const totalCalls = calls.length;
      const totalMessages = messages.length;

      const durationsWithValues = calls.filter(c => c.duration_seconds && c.duration_seconds > 0);
      const avgDuration = durationsWithValues.length > 0
        ? durationsWithValues.reduce((sum, c) => sum + c.duration_seconds, 0) / durationsWithValues.length
        : 0;

      const successfulCalls = calls.filter(c => c.call_successful === true || (c.status && c.status !== 'failed'));
      const successRate = totalCalls > 0 ? Math.round((successfulCalls.length / totalCalls) * 100) : 0;

      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      setText('stat-calls', totalCalls.toLocaleString());
      setText('stat-messages', totalMessages.toLocaleString());
      setText('stat-duration', this.formatAgentDuration(avgDuration));
      setText('stat-success', totalCalls > 0 ? `${successRate}%` : '--');

      // --- Calls Panel ---
      const callsInbound = calls.filter(c => c.direction === 'inbound').length;
      const callsOutbound = calls.filter(c => c.direction === 'outbound').length;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const callsThisMonth = calls.filter(c => new Date(c.started_at) >= monthStart).length;
      const totalMinutes = Math.round(calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 60);

      setText('stat-calls-inbound', callsInbound.toLocaleString());
      setText('stat-calls-outbound', callsOutbound.toLocaleString());
      setText('stat-calls-month', callsThisMonth.toLocaleString());
      setText('stat-calls-minutes', totalMinutes.toLocaleString());

      // --- Messages Panel ---
      const msgsInbound = messages.filter(m => m.direction === 'inbound').length;
      const msgsOutbound = messages.filter(m => m.direction === 'outbound').length;
      const msgsThisMonth = messages.filter(m => new Date(m.sent_at) >= monthStart).length;
      const deliveredMsgs = messages.filter(m => m.status === 'delivered' || m.status === 'sent');
      const deliveryRate = messages.length > 0 ? Math.round((deliveredMsgs.length / messages.length) * 100) : 0;

      setText('stat-msgs-inbound', msgsInbound.toLocaleString());
      setText('stat-msgs-outbound', msgsOutbound.toLocaleString());
      setText('stat-msgs-month', msgsThisMonth.toLocaleString());
      setText('stat-msgs-delivery', messages.length > 0 ? `${deliveryRate}%` : '--');

      // --- Disposition Breakdown ---
      const dispositionCounts = {};
      calls.forEach(c => {
        const d = c.disposition || 'unknown';
        dispositionCounts[d] = (dispositionCounts[d] || 0) + 1;
      });
      this.renderBreakdownBars('disposition-breakdown', dispositionCounts, totalCalls, {
        'answered_by_pat': { label: 'Answered', color: '#10b981' },
        'transferred': { label: 'Transferred', color: '#6366f1' },
        'voicemail': { label: 'Voicemail', color: '#f59e0b' },
        'user_hung_up': { label: 'User Hung Up', color: '#8b5cf6' },
        'agent_hung_up': { label: 'Agent Hung Up', color: '#64748b' },
        'failed': { label: 'Failed', color: '#ef4444' },
        'no_answer': { label: 'No Answer', color: '#94a3b8' },
        'completed': { label: 'Completed', color: '#10b981' },
        'unknown': { label: 'Unknown', color: '#94a3b8' }
      });

      // --- Sentiment Breakdown ---
      const sentimentCounts = {};
      calls.forEach(c => {
        const s = (c.user_sentiment || 'unknown').toLowerCase();
        sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
      });
      this.renderBreakdownBars('sentiment-breakdown', sentimentCounts, totalCalls, {
        'positive': { label: 'Positive', color: '#10b981' },
        'neutral': { label: 'Neutral', color: '#64748b' },
        'negative': { label: 'Negative', color: '#ef4444' },
        'unknown': { label: 'Unknown', color: '#94a3b8' }
      });

      // --- Call Volume Chart ---
      await this.renderAgentCallChart(calls);

      // --- Recent Sessions Table (calls + SMS merged) ---
      const callSessions = calls.slice(0, 50).map(c => ({
        type: 'Phone',
        id: c.id,
        time: c.started_at,
        phone: c.direction === 'inbound' ? (c.caller_number || '--') : (c.contact_phone || '--'),
        direction: c.direction || '--',
        duration: c.duration_seconds ? this.formatAgentDuration(c.duration_seconds) : '--',
        disposition: c.disposition,
        sentiment: c.user_sentiment,
        navigable: true
      }));
      const smsSessions = messages.slice(0, 50).map(m => ({
        type: 'SMS',
        id: m.id,
        time: m.sent_at,
        phone: m.direction === 'inbound' ? (m.sender_number || '--') : (m.recipient_number || '--'),
        direction: m.direction || '--',
        duration: '-',
        disposition: m.status || 'sent',
        sentiment: m.sentiment,
        navigable: false
      }));
      const allSessions = [...callSessions, ...smsSessions]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 20);
      this.renderRecentSessionsTable(allSessions);

    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }

  formatAgentDuration(seconds) {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  renderBreakdownBars(containerId, counts, total, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0 || total === 0) {
      container.innerHTML = '<div class="aa-breakdown-empty">No data yet</div>';
      return;
    }

    container.innerHTML = sorted.map(([key, count]) => {
      const cfg = config[key] || { label: key, color: '#94a3b8' };
      const pct = Math.round((count / total) * 100);
      return `
        <div class="aa-bar-row">
          <div class="aa-bar-header">
            <span class="aa-bar-label">${cfg.label}</span>
            <span class="aa-bar-value">${count} (${pct}%)</span>
          </div>
          <div class="aa-bar-track">
            <div class="aa-bar-fill" style="width: ${pct}%; background: ${cfg.color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  async renderAgentCallChart(calls) {
    // Load Chart.js if needed
    if (!window.Chart) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      } catch (e) {
        console.error('Failed to load Chart.js:', e);
        return;
      }
    }

    const canvas = document.getElementById('agent-calls-chart');
    if (!canvas) return;

    // Build daily counts for last 30 days
    const labels = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toISOString().split('T')[0]);
    }

    const dailyCounts = {};
    calls.forEach(c => {
      if (!c.started_at) return;
      const day = new Date(c.started_at).toISOString().split('T')[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    });

    const chartData = labels.map(d => dailyCounts[d] || 0);

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: chartData,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: {
              maxTicksLimit: 7,
              callback: function(val, index) {
                const date = new Date(labels[index]);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }
            }
          },
          y: {
            display: true,
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  renderRecentSessionsTable(sessions) {
    const container = document.getElementById('recent-calls-container');
    if (!container) return;

    if (sessions.length === 0) {
      container.innerHTML = '<div class="aa-breakdown-empty">No sessions recorded yet</div>';
      return;
    }

    const formatDisp = (d) => {
      const map = {
        'user_hung_up': 'User Hung Up',
        'agent_hung_up': 'Agent Hung Up',
        'completed': 'Completed',
        'failed': 'Failed',
        'no_answer': 'No Answer',
        'voicemail': 'Voicemail',
        'transferred': 'Transferred',
        'answered_by_pat': 'Answered',
        'sent': 'Sent',
        'delivered': 'Delivered'
      };
      return map[d?.toLowerCase()] || d || '--';
    };

    const formatSentiment = (s) => {
      if (!s || s === 'unknown') return '--';
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };

    const sentimentClass = (s) => {
      if (!s) return '';
      const lower = s.toLowerCase();
      if (lower === 'positive') return 'positive';
      if (lower === 'negative') return 'negative';
      if (lower === 'neutral') return 'neutral';
      return '';
    };

    container.innerHTML = `
      <div class="aa-table-wrapper">
        <table class="aa-calls-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Time</th>
              <th>From / To</th>
              <th>Dir</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Sentiment</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map(s => {
              const typeClass = s.type === 'SMS' ? 'sms' : 'phone';
              const time = s.time ? new Date(s.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '--';
              return `
                <tr class="aa-call-row${s.navigable ? '' : ' aa-no-nav'}" ${s.navigable ? `data-call-id="${s.id}"` : ''}>
                  <td><span class="type-badge ${typeClass}">${s.type}</span></td>
                  <td>${time}</td>
                  <td>${s.phone}</td>
                  <td><span class="direction-badge ${s.direction}">${s.direction}</span></td>
                  <td>${s.duration}</td>
                  <td>${formatDisp(s.disposition)}</td>
                  <td><span class="sentiment-badge ${sentimentClass(s.sentiment)}">${formatSentiment(s.sentiment)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach click handlers for navigable rows → navigate to inbox
    container.querySelectorAll('.aa-call-row:not(.aa-no-nav)').forEach(row => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        const callId = row.dataset.callId;
        if (callId) navigateTo(`/inbox?call=${callId}`);
      });
    });
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

  async updateAgentField(field, value) {
    await this.saveAgent({ [field]: value });
  }

  async setAsDefault() {
    try {
      const { error } = await AgentConfig.setDefault(this.agentId);

      if (error) {
        console.error('Error setting default:', error);
        showToast('Failed to set as default. Please try again.', 'error');
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
      showToast('Failed to assign number. Please try again.', 'error');
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
      showToast('Failed to detach number. Please try again.', 'error');
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
        showToast('Failed to create chat widget. Please try again.', 'error');
        return;
      }

      this.chatWidget = widget;
      this.switchTab('deployment');
    } catch (err) {
      console.error('Error creating widget:', err);
      showToast('Failed to create chat widget. Please try again.', 'error');
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
  }

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
      showToast('Failed to assign some numbers. Please try again.', 'error');
    }
  }

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
  }

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
  }

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
  }

  renderDynamicVarRow(v, index) {
    const types = [
      { value: 'text', label: 'Text' },
      { value: 'number', label: 'Number' },
      { value: 'boolean', label: 'Boolean' },
      { value: 'enum', label: 'Enum (list)' },
    ];

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
          style="width: 100%; font-size: 0.875rem; margin-bottom: 0.5rem;"
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
      </div>
    `;
  }

  refreshDynamicVarsList() {
    const list = document.getElementById('dynamic-vars-list');
    if (!list) return;

    if (this.modalDynamicVars.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No variables configured</p>';
    } else {
      list.innerHTML = this.modalDynamicVars.map((v, index) => this.renderDynamicVarRow(v, index)).join('');
    }

    this.attachExtractModalListeners();
  }

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
  }

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
            });
        }
      }

      // If enabling mode and has valid variables, enable the function
      if (this._extractEnablingMode && validVars.length > 0) {
        const functions = {
          ...this.agent.functions,
          extract_data: {
            ...this.agent.functions?.extract_data,
            enabled: true,
          },
        };
        this.agent.functions = functions;
        await this.scheduleAutoSave({ functions });

        // Update checkbox
        const checkbox = document.getElementById('func-extract');
        if (checkbox) checkbox.checked = true;
      }

      this._extractEnablingMode = false;
    } catch (err) {
      console.error('Error saving dynamic variables:', err);
      showToast('Failed to save variables. Please try again.', 'error');
    }
  }

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
  }

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
  }

  refreshSmsTemplatesList() {
    const list = document.getElementById('sms-templates-list');
    if (!list) return;

    if (this.modalSmsTemplates.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No templates configured</p>';
    } else {
      list.innerHTML = this.modalSmsTemplates.map((tmpl, index) => this.renderSmsTemplateRow(tmpl, index)).join('');
    }

    this.attachSmsModalListeners();
  }

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
  }

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
  }

  // ============================================
  // Custom Functions Methods
  // ============================================

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
  }

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
  }

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
  }

  _refreshSemanticConfigList() {
    const listContainer = document.getElementById('semantic-alerts-list');
    if (listContainer) {
      listContainer.innerHTML = this.semanticActions.length === 0
        ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No alerts configured</p>'
        : this.semanticActions.map(a => this.renderSemanticActionCard(a)).join('');
      this.attachSemanticActionListeners();
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  refreshModalHeaders() {
    const container = document.getElementById('cf-headers-list');
    if (container) {
      container.innerHTML = this.modalHeaders.map((h, i) => this.renderHeaderRow(h, i)).join('');
      this.attachModalRowListeners();
    }
  }

  refreshModalParams() {
    const container = document.getElementById('cf-params-list');
    if (container) {
      container.innerHTML = this.modalParams.map((p, i) => this.renderParamRow(p, i)).join('');
      this.attachModalRowListeners();
    }
  }

  refreshModalResponseVars() {
    const container = document.getElementById('cf-response-vars-list');
    if (container) {
      container.innerHTML = this.modalResponseVars.map((v, i) => this.renderResponseVarRow(v, i)).join('');
      this.attachModalRowListeners();
    }
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  refreshTransferNumbersList() {
    const container = document.getElementById('transfer-numbers-list');
    if (!container) return;

    container.innerHTML = this.modalTransferNumbers.length === 0
      ? '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No transfer numbers configured</p>'
      : this.modalTransferNumbers.map((num, index) => this.renderTransferNumberRow(num, index)).join('');

    this.attachTransferModalListeners();
  }

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
  }

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

      /* Full Prompt Preview */
      .prompt-preview-btn {
        margin-top: 0.5rem;
      }

      .full-prompt-preview {
        margin-top: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: #1e293b;
        overflow: hidden;
      }

      .full-prompt-preview.hidden {
        display: none;
      }

      .full-prompt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #334155;
        border-bottom: 1px solid #475569;
      }

      .full-prompt-header h4 {
        margin: 0;
        font-size: 0.85rem;
        color: #e2e8f0;
        font-weight: 500;
      }

      .full-prompt-header .btn-icon {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.25rem;
        line-height: 1;
      }

      .full-prompt-header .btn-icon:hover {
        color: #f1f5f9;
      }

      .full-prompt-content {
        padding: 1rem;
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.6;
        color: #e2e8f0;
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 400px;
        overflow-y: auto;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
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

      .function-toggle.transfer-toggle-container:hover,
      .function-toggle.sms-toggle-container:hover,
      .function-toggle.booking-toggle-container:hover,
      .function-toggle.extract-toggle-container:hover {
        border-color: var(--border-color);
      }

      .configure-btn {
        padding: 10px;
        background: var(--bg-secondary, #f3f4f6);
        border: none;
        border-left: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        align-self: stretch;
        border-radius: 0 var(--radius-md) var(--radius-md) 0;
        transition: background 0.2s, color 0.2s;
      }

      .configure-btn:hover {
        background: var(--border-color, #e5e7eb);
        color: var(--text-primary);
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

      /* Agent Analytics */
      .agent-analytics .analytics-grid {
        display: grid;
        gap: 1rem;
      }

      .agent-analytics .analytics-grid-4 {
        grid-template-columns: repeat(4, 1fr);
      }

      .agent-analytics .analytics-grid-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      .agent-analytics .analytics-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
      }

      .agent-analytics .analytics-card-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.2;
      }

      .agent-analytics .analytics-card-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      .agent-analytics .analytics-panel {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
      }

      .agent-analytics .analytics-panel h3 {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .agent-analytics .analytics-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .agent-analytics .analytics-stat {
        display: flex;
        flex-direction: column;
      }

      .agent-analytics .analytics-stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .agent-analytics .analytics-stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .aa-chart-container {
        height: 200px;
        margin-top: 0.5rem;
      }

      .aa-breakdown-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .aa-breakdown-empty {
        text-align: center;
        padding: 1.5rem;
        color: var(--text-secondary);
        font-size: 0.875rem;
      }

      .aa-bar-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .aa-bar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .aa-bar-label {
        font-size: 0.875rem;
        color: var(--text-primary);
      }

      .aa-bar-value {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .aa-bar-track {
        height: 6px;
        background: var(--bg-secondary);
        border-radius: 3px;
        overflow: hidden;
      }

      .aa-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
      }

      .aa-recent-calls-panel {
        padding: 1.25rem;
      }

      .aa-table-wrapper {
        overflow-x: auto;
        margin-top: 0.5rem;
      }

      .aa-calls-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .aa-calls-table th,
      .aa-calls-table td {
        padding: 0.625rem 0.75rem;
        text-align: left;
        white-space: nowrap;
      }

      .aa-calls-table th {
        font-weight: 600;
        color: var(--text-secondary);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--border-color);
      }

      .aa-calls-table td {
        border-bottom: 1px solid var(--border-color);
      }

      .aa-calls-table tbody tr:hover {
        background: var(--bg-secondary);
      }

      .aa-calls-table tbody tr:last-child td {
        border-bottom: none;
      }

      .direction-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .direction-badge.inbound {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
      }

      .direction-badge.outbound {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
      }

      .sentiment-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .sentiment-badge.positive {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
      }

      .sentiment-badge.neutral {
        background: rgba(107, 114, 128, 0.1);
        color: var(--text-secondary);
      }

      .sentiment-badge.negative {
        background: rgba(239, 68, 68, 0.1);
        color: var(--error-color);
      }

      .type-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .type-badge.phone {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
      }

      .type-badge.sms {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
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

      /* Memory Tab Styles */
      .memory-status-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        transition: all 0.2s;
      }

      .memory-status-container.enabled {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.03));
        border-color: #86efac;
      }

      .memory-status-container.disabled {
        background: var(--bg-secondary, #f9fafb);
        border-color: var(--border-color);
      }

      .memory-status-content {
        display: flex;
        align-items: center;
        gap: 0.875rem;
      }

      .memory-status-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .memory-status-container.enabled .memory-status-icon {
        background: #dcfce7;
        color: #16a34a;
      }

      .memory-status-container.disabled .memory-status-icon {
        background: #f3f4f6;
        color: #9ca3af;
      }

      .memory-status-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .memory-status-title {
        font-weight: 600;
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .memory-status-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .memory-toggle-btn {
        padding: 0.5rem 1.25rem;
        border-radius: var(--radius-md);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .memory-toggle-btn.btn-enable {
        background: var(--primary-color);
        color: white;
      }

      .memory-toggle-btn.btn-enable:hover {
        background: #4f46e5;
      }

      .memory-toggle-btn.btn-disable {
        background: white;
        color: #dc2626;
        border: 1px solid #fecaca;
      }

      .memory-toggle-btn.btn-disable:hover {
        background: #fef2f2;
        border-color: #dc2626;
      }

      .memory-context-options {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }

      .memory-option-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        font-size: 0.9rem;
      }

      .memory-option-item input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      .memory-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .memory-section-header h3 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .memory-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--primary-color);
        color: white;
        border-radius: 11px;
      }

      .btn-text-danger {
        background: none;
        border: none;
        color: #dc2626;
        font-size: 0.85rem;
        cursor: pointer;
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-sm);
        transition: background 0.2s;
      }

      .btn-text-danger:hover {
        background: #fef2f2;
      }

      .memories-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .memory-loading {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .memory-card {
        padding: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: white;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .memory-card:hover {
        border-color: #d1d5db;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .memory-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
      }

      .memory-contact {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .memory-contact-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
      }

      .memory-contact-details {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .memory-contact-phone {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .memory-contact-name {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .memory-header-right {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
      }

      .memory-direction-badge {
        font-size: 0.7rem;
        padding: 0.2rem 0.5rem;
        border-radius: 10px;
        font-weight: 500;
      }

      .memory-direction-inbound {
        color: #059669;
        background: #ecfdf5;
      }

      .memory-direction-outbound {
        color: #7c3aed;
        background: #f5f3ff;
      }

      .memory-semantic-badge {
        color: #d97706;
        background: #fffbeb;
      }

      .memory-semantic-match-badge {
        color: #fff;
        background: #6366f1;
        border: none;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }

      .memory-semantic-match-badge:hover {
        background: #8b5cf6;
      }

      .memory-call-count {
        font-size: 0.75rem;
        color: var(--text-secondary);
        background: var(--bg-secondary, #f3f4f6);
        padding: 0.25rem 0.6rem;
        border-radius: 12px;
        font-weight: 500;
      }

      .memory-card-summary {
        font-size: 0.85rem;
        color: #4b5563;
        line-height: 1.5;
        margin: 0 0 0.75rem 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .memory-card-topics {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
      }

      .memory-topic-tag {
        font-size: 0.7rem;
        padding: 0.25rem 0.6rem;
        background: #eef2ff;
        color: #4f46e5;
        border-radius: 12px;
        font-weight: 500;
      }

      .memory-card-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
      }

      .copy-memory-id-btn {
        margin-left: auto;
        font-family: monospace;
        font-size: 0.65rem;
        color: var(--text-secondary);
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.2s;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }

      .copy-memory-id-btn:hover {
        opacity: 1;
      }

      .memory-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: none;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
      }

      .memory-action-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
        background: rgba(99, 102, 241, 0.05);
      }

      .memory-action-btn.memory-action-danger:hover {
        border-color: #dc2626;
        color: #dc2626;
        background: #fef2f2;
      }

      .memory-empty-state {
        text-align: center;
        padding: 2.5rem 1rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px dashed var(--border-color);
      }

      .memory-empty-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 1rem;
        border-radius: 50%;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
      }

      .memory-empty-title {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--text-primary);
        margin: 0 0 0.35rem 0;
      }

      .memory-empty-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
      }

      .memory-error-state {
        text-align: center;
        padding: 1.5rem;
        color: #dc2626;
        background: #fef2f2;
        border-radius: var(--radius-md);
        border: 1px solid #fecaca;
      }

      /* Memory Detail Modal */
      #memory-detail-modal .modal-content.memory-detail-modal {
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
      }

      .memory-detail-phone {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin-bottom: 1rem;
      }

      .memory-detail-section {
        margin-bottom: 1.25rem;
      }

      .memory-detail-section:last-child {
        margin-bottom: 0;
      }

      .memory-topics-display {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .memory-prefs-display {
        font-size: 0.8rem;
        background: var(--bg-secondary, #f3f4f6);
        padding: 0.75rem;
        border-radius: var(--radius-md);
        overflow-x: auto;
        margin: 0;
      }

      .call-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .call-history-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.85rem;
        padding: 0.5rem;
        background: var(--bg-secondary, #f3f4f6);
        border-radius: var(--radius-sm);
      }

      .call-date {
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .call-duration {
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .call-summary-preview {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .text-muted {
        color: var(--text-secondary);
      }

      /* Semantic Memory Styles */
      .memory-section {
        margin-bottom: 1.5rem;
      }

      .memory-section:last-child {
        margin-bottom: 0;
      }

      .memory-section-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 0.75rem 0;
      }

      .memory-status-container.semantic.enabled {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03));
        border-color: #93c5fd;
      }

      .memory-status-container.semantic.enabled .memory-status-icon {
        background: #dbeafe;
        color: #2563eb;
      }

      .semantic-config-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }

      .semantic-config-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .semantic-config-item label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--text-secondary);
      }

      .semantic-config-item select {
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        font-size: 0.85rem;
        background: white;
        cursor: pointer;
      }

      .semantic-config-item select:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      .semantic-info-box {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        background: #eff6ff;
        border-radius: var(--radius-md);
        border: 1px solid #bfdbfe;
      }

      .semantic-info-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: #3b82f6;
        margin-top: 1px;
      }

      .semantic-info-text {
        font-size: 0.82rem;
        color: #1e40af;
        line-height: 1.45;
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

        /* Memory Tab Mobile */
        .memory-status-container {
          flex-direction: column;
          align-items: stretch;
          gap: 1rem;
          padding: 1rem;
        }

        .memory-status-content {
          justify-content: flex-start;
        }

        .memory-toggle-btn {
          width: 100%;
          padding: 0.65rem;
        }

        .memory-section-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .memory-card-header {
          flex-direction: column;
          gap: 0.5rem;
        }

        .memory-call-count {
          align-self: flex-start;
        }

        .memory-card-actions {
          flex-wrap: wrap;
        }

        .memory-action-btn {
          flex: 1;
          justify-content: center;
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

        .agent-analytics .analytics-grid-4 {
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .agent-analytics .analytics-grid-2 {
          grid-template-columns: 1fr;
        }

        .agent-analytics .analytics-card {
          padding: 0.875rem;
        }

        .agent-analytics .analytics-card-value {
          font-size: 1.4rem;
        }

        .aa-calls-table th:nth-child(5),
        .aa-calls-table td:nth-child(5),
        .aa-calls-table th:nth-child(6),
        .aa-calls-table td:nth-child(6) {
          display: none;
        }

        .voice-modal {
          max-height: 90vh;
        }

        .voice-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* Schedule Status Banners */
      .schedule-status-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        border-radius: var(--radius-md);
        margin-bottom: 1rem;
        font-size: 0.9rem;
      }

      .schedule-status-banner svg {
        flex-shrink: 0;
      }

      .schedule-status-24-7 {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.08));
        border: 1px solid rgba(34, 197, 94, 0.25);
        color: #16a34a;
      }

      .schedule-status-24-7 span {
        color: var(--text-primary);
      }

      .schedule-status-24-7 strong {
        color: #16a34a;
      }

      .schedule-status-active {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
        border: 1px solid rgba(99, 102, 241, 0.25);
        color: var(--primary-color);
      }

      .schedule-status-active span {
        color: var(--text-primary);
      }

      .schedule-status-active strong {
        color: var(--primary-color);
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
