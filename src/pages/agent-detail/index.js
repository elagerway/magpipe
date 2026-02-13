/**
 * Agent Detail Page
 * View and edit a single agent with tabbed interface
 *
 * Split into modules for maintainability:
 * - configure-tab.js, prompt-tab.js, knowledge-tab.js, memory-tab.js
 * - functions-tab.js, deployment-tab.js, schedule-tab.js, analytics-tab.js
 * - modals.js (voice modal, voice cloning, prompt generation)
 * - styles.js (CSS-in-JS)
 */

import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../../components/BottomNav.js';
import { AgentConfig } from '../../models/AgentConfig.js';
import { ChatWidget } from '../../models/ChatWidget.js';
import { CustomFunction } from '../../models/CustomFunction.js';
import { SemanticMatchAction } from '../../models/SemanticMatchAction.js';
import { showToast } from '../../lib/toast.js';

// Tab modules (prototype mixins)
import { configureTabMethods } from './configure-tab.js';
import { promptTabMethods } from './prompt-tab.js';
import { knowledgeTabMethods } from './knowledge-tab.js';
import { memoryTabMethods } from './memory-tab.js';
import { functionsTabMethods } from './functions-tab.js';
import { deploymentTabMethods } from './deployment-tab.js';
import { scheduleTabMethods } from './schedule-tab.js';
import { analyticsTabMethods } from './analytics-tab.js';
import { modalsMethods, ELEVENLABS_VOICES, OPENAI_VOICES } from './modals.js';
import { stylesMethods } from './styles.js';

/* global navigateTo */

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
    this.gmailIntegration = null; // Gmail integration for this user
    this.emailConfig = null; // Agent email config
    this.knowledgeSources = []; // Knowledge bases for this user
    this.memories = []; // Agent memory entries
    this.memoryCount = 0; // Count of memory entries
    this.customFunctions = []; // Custom webhook functions for this agent
    this.semanticActions = []; // Semantic match alert actions
    this.connectedApps = []; // Connected integration apps (slack, hubspot, etc.)
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

    // Load connected integration apps for App Functions section
    const { data: connectedApps } = await supabase
      .from('user_integrations')
      .select('provider_id, status, integration_providers(slug, name, icon_url)')
      .eq('user_id', user.id)
      .eq('status', 'connected');
    this.connectedApps = (connectedApps || [])
      .filter(a => a.integration_providers?.slug)
      .map(a => ({
        slug: a.integration_providers.slug,
        name: a.integration_providers.name,
        icon_url: a.integration_providers.icon_url,
      }));

    // Load Gmail integration status for this user
    const { data: gmailProvider } = await supabase
      .from('integration_providers')
      .select('id')
      .eq('slug', 'google_email')
      .single();

    if (gmailProvider) {
      const { data: gmailIntegration } = await supabase
        .from('user_integrations')
        .select('id, status, config, external_user_id')
        .eq('user_id', user.id)
        .eq('provider_id', gmailProvider.id)
        .eq('status', 'connected')
        .single();
      this.gmailIntegration = gmailIntegration;
    }

    // Load agent email config
    const { data: emailConfig } = await supabase
      .from('agent_email_configs')
      .select('*')
      .eq('agent_id', this.agentId)
      .single();
    this.emailConfig = emailConfig;

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

    // Check for Gmail OAuth callback success
    if (urlParams.get('integration_connected') === 'google_email') {
      window.history.replaceState({}, '', `/agents/${this.agentId}?tab=deployment`);
      showToast('Gmail connected successfully', 'success');

      // Reload Gmail integration data
      if (gmailProvider) {
        const { data: freshGmail } = await supabase
          .from('user_integrations')
          .select('id, status, config, external_user_id')
          .eq('user_id', user.id)
          .eq('provider_id', gmailProvider.id)
          .eq('status', 'connected')
          .single();
        this.gmailIntegration = freshGmail;
      }

      this.switchTab('deployment');
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

  computeTranslateTo() {
    const ownerLang = document.getElementById('owner-language')?.value;
    if (!ownerLang) return null; // "Off" selected
    return ownerLang;
  }

  updateTranslateHelp() {
    const help = document.getElementById('translate-help');
    if (!help) return;
    const ownerLang = document.getElementById('owner-language')?.value;
    if (!ownerLang) {
      help.textContent = 'No translation applied to inbox messages';
      return;
    }
    const agentLang = document.getElementById('agent-language')?.value || 'en-US';
    const langNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German' };
    const ownerName = langNames[ownerLang] || ownerLang;
    const baseLang = agentLang.split('-')[0].toLowerCase();
    if (agentLang !== 'multi' && baseLang === ownerLang) {
      help.textContent = `Translation off — agent already speaks ${ownerName}`;
    } else if (agentLang === 'multi') {
      help.textContent = `Non-${ownerName} messages translated in inbox`;
    } else {
      help.textContent = `Inbox messages translated to ${ownerName}`;
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
}

// Mix in all tab module methods onto the prototype
Object.assign(AgentDetailPage.prototype,
  configureTabMethods,
  promptTabMethods,
  knowledgeTabMethods,
  memoryTabMethods,
  functionsTabMethods,
  deploymentTabMethods,
  scheduleTabMethods,
  analyticsTabMethods,
  modalsMethods,
  stylesMethods,
);
