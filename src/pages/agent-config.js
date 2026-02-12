/**
 * Agent Configuration Page
 */

import { AgentConfig } from '../models/AgentConfig.js';
import { OutboundTemplate } from '../models/OutboundTemplate.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { User } from '../models/index.js';
import { showToast } from '../lib/toast.js';

// ElevenLabs Voices with metadata
const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Rachel (Default)', accent: 'American', gender: 'Female', description: 'Calm' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', label: 'Adam', accent: 'American', gender: 'Male', description: 'Deep' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', label: 'Sarah', accent: 'American', gender: 'Female', description: 'Soft' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', label: 'Elli', accent: 'American', gender: 'Female', description: 'Youthful' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', label: 'Josh', accent: 'American', gender: 'Male', description: 'Strong' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', label: 'Arnold', accent: 'American', gender: 'Male', description: 'Raspy' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', label: 'Lily', accent: 'British', gender: 'Female', description: 'Warm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', label: 'Brian', accent: 'American', gender: 'Male', description: 'Narration' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', label: 'Callum', accent: 'American', gender: 'Male', description: 'Hoarse' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', label: 'Charlie', accent: 'Australian', gender: 'Male', description: 'Natural' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', label: 'Charlotte', accent: 'English-Swedish', gender: 'Female', description: 'Seductive' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', label: 'Chris', accent: 'American', gender: 'Male', description: 'Casual' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', label: 'Daniel', accent: 'British', gender: 'Male', description: 'Authoritative' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', label: 'Eric', accent: 'American', gender: 'Male', description: 'Friendly' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', label: 'George', accent: 'British', gender: 'Male', description: 'Raspy' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', label: 'Jessica', accent: 'American', gender: 'Female', description: 'Expressive' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', label: 'Laura', accent: 'American', gender: 'Female', description: 'Upbeat' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', label: 'Liam', accent: 'American', gender: 'Male', description: 'Articulate' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', label: 'Matilda', accent: 'American', gender: 'Female', description: 'Warm' },
  { id: 't0jbNlBVZ17f02VDIeMI', name: 'Thomas', label: 'Thomas', accent: 'American', gender: 'Male', description: 'Calm' },
];

// OpenAI Voices with metadata
const OPENAI_VOICES = [
  { id: 'openai-alloy', name: 'Alloy', accent: 'Neutral', gender: 'Neutral', description: 'Balanced' },
  { id: 'openai-echo', name: 'Echo', accent: 'Neutral', gender: 'Male', description: 'Clear' },
  { id: 'openai-fable', name: 'Fable', accent: 'British', gender: 'Male', description: 'Expressive' },
  { id: 'openai-nova', name: 'Nova', accent: 'American', gender: 'Female', description: 'Energetic' },
  { id: 'openai-onyx', name: 'Onyx', accent: 'American', gender: 'Male', description: 'Deep' },
  { id: 'openai-shimmer', name: 'Shimmer', accent: 'American', gender: 'Female', description: 'Warm' },
];

export default class AgentConfigPage {
  constructor() {
    this.isInitialSetup = false;
    this.autoSaveTimeout = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingTimer = null;
    this.recordingStartTime = null;
    this.audioBlob = null;
    this.previewAudio = null;
    this.isPreviewPlaying = false;
    this.previewProgressInterval = null;
    this.transferNumbers = [];
    this.transferSaveTimeout = null;
    this.currentPreviewAudio = null;
    this.outboundTemplates = [];
    this.templateSaveTimeout = null;
    // Global agent editing support
    this.isEditingGlobalAgent = false;
    this.canEditGlobalAgent = false;
    this.globalAgentConfig = null;
  }

  getVoiceDisplayName(voiceId, clonedVoices = []) {
    // Check cloned voices first
    const clonedVoice = clonedVoices.find(v => `11labs-${v.voice_id}` === voiceId);
    if (clonedVoice) {
      return clonedVoice.voice_name;
    }

    // Check ElevenLabs voices
    const elevenLabsVoice = ELEVENLABS_VOICES.find(v => v.id === voiceId);
    if (elevenLabsVoice) {
      return elevenLabsVoice.label || elevenLabsVoice.name;
    }

    // Check OpenAI voices
    const openAIVoice = OPENAI_VOICES.find(v => v.id === voiceId);
    if (openAIVoice) {
      return openAIVoice.name;
    }

    return 'Unknown Voice';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch user profile for bottom nav and check permissions
    const { profile } = await User.getProfile(user.id);

    // Check if user can edit global agent (god role or explicit permission)
    this.canEditGlobalAgent = profile?.role === 'god' || profile?.can_edit_global_agent === true;

    // Check if this is initial setup or editing existing config
    const { config } = await AgentConfig.getByUserId(user.id);
    this.isInitialSetup = !config;

    // Load global agent config if user has permission
    if (this.canEditGlobalAgent) {
      const { data: globalConfig } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('is_global', true)
        .single();
      this.globalAgentConfig = globalConfig;
    }

    // Determine which config to show (default to personal unless explicitly set to global)
    const activeConfig = this.isEditingGlobalAgent && this.globalAgentConfig
      ? this.globalAgentConfig
      : config;

    // Load cloned voices from voices table
    const { data: clonedVoices } = await supabase
      .from('voices')
      .select('voice_id, voice_name')
      .eq('user_id', user.id)
      .eq('is_cloned', true)
      .order('created_at', { ascending: false });

    // Always using LiveKit - voice cloning is always available
    const isLiveKitActive = true;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 700px; margin: 0 auto; padding-top: 0; padding-bottom: 0;">
        <div class="card agent-config-card" style="padding-bottom: 0; margin-bottom: 0;">
          ${!this.isInitialSetup ? `
            <button onclick="navigateTo('/settings')" style="
              background: none;
              border: none;
              color: var(--text-secondary);
              cursor: pointer;
              padding: 0.5rem 0.5rem 0.5rem 0;
              display: flex;
              align-items: center;
              gap: 0.25rem;
              font-size: 0.875rem;
              transition: color 0.2s;
              margin-bottom: 1rem;
            " onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--text-secondary)'">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
              Back
            </button>
          ` : ''}

          ${this.canEditGlobalAgent && !this.isInitialSetup ? `
          <!-- Agent Selector -->
          <div class="agent-selector-container" style="margin-bottom: 1.5rem;">
            <label style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.5rem; display: block;">Editing:</label>
            <div class="agent-selector" style="display: flex; gap: 0.5rem;">
              <button type="button" id="select-personal-agent" class="agent-selector-btn ${!this.isEditingGlobalAgent ? 'active' : ''}" style="
                flex: 1;
                padding: 0.75rem;
                border: 2px solid ${!this.isEditingGlobalAgent ? 'var(--primary-color)' : 'var(--border-color)'};
                border-radius: 8px;
                background: ${!this.isEditingGlobalAgent ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)'};
                color: ${!this.isEditingGlobalAgent ? 'var(--primary-color)' : 'var(--text-primary)'};
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
              ">My Agent</button>
              <button type="button" id="select-global-agent" class="agent-selector-btn ${this.isEditingGlobalAgent ? 'active' : ''}" style="
                flex: 1;
                padding: 0.75rem;
                border: 2px solid ${this.isEditingGlobalAgent ? 'var(--primary-color)' : 'var(--border-color)'};
                border-radius: 8px;
                background: ${this.isEditingGlobalAgent ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)'};
                color: ${this.isEditingGlobalAgent ? 'var(--primary-color)' : 'var(--text-primary)'};
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Global Agent
              </button>
            </div>
          </div>
          ` : ''}

          <!-- Avatar -->
          ${activeConfig?.avatar_url ? `
            <div style="text-align: center; margin-bottom: 0.5rem;">
              <img
                src="${activeConfig.avatar_url}"
                alt="AI Assistant Avatar"
                style="
                  width: 60px;
                  height: 60px;
                  border-radius: 50%;
                  object-fit: cover;
                  border: 3px solid var(--primary-color);
                  box-shadow: var(--shadow-md);
                "
              />
            </div>
          ` : ''}

          <h1 class="text-center" style="margin-bottom: ${this.isInitialSetup ? '0.25rem' : '0.75rem'}; font-size: 1.5rem;">
            ${this.isInitialSetup ? 'Meet Your Assistant' : (this.isEditingGlobalAgent ? 'Global Agent Configuration' : 'Agent Configuration')}
          </h1>
          ${this.isInitialSetup ? `
            <p class="text-center text-muted" style="margin-bottom: 0.75rem; font-size: 0.875rem;">
              Let's set up your AI assistant. You can customize its behavior and personality.
            </p>
          ` : ''}

          <form id="config-form" style="margin-bottom: 0;">
            <div class="form-group">
              <label class="form-label" for="voice-id">Voice</label>
              <input type="hidden" id="voice-id" value="${activeConfig?.voice_id || '21m00Tcm4TlvDq8ikWAM'}" />
              <div class="voice-selector-display" style="
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background: white;
                cursor: pointer;
                transition: all 0.2s;
              " id="voice-selector-display">
                <span id="selected-voice-display" style="font-weight: 500; pointer-events: none;">
                  ${this.getVoiceDisplayName(activeConfig?.voice_id || '21m00Tcm4TlvDq8ikWAM', clonedVoices)}
                </span>
                <button type="button" id="change-voice-btn" class="btn btn-sm" style="background: var(--primary-color); color: white; padding: 0.35rem 0.75rem; font-size: 0.875rem; pointer-events: none;">
                  Change Voice
                </button>
              </div>
              <p class="form-help">Select the voice for phone calls</p>
            </div>

            <!-- Voice Cloning Section - LiveKit supports custom voices! -->
            ${isLiveKitActive ? `
            <div class="voice-clone-container" style="margin-bottom: 1.5rem;">
              <div id="voice-clone-toggle" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; cursor: pointer;">
                <div style="
                  background: white;
                  color: var(--primary-color);
                  border: 2px solid transparent;
                  background-image: linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6);
                  background-origin: padding-box, border-box;
                  background-clip: padding-box, border-box;
                  border-radius: 50%;
                  width: 36px;
                  height: 36px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  flex-shrink: 0;
                  transition: all 0.2s ease;
                " id="voice-clone-button">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <span style="font-weight: 500; font-size: 0.9rem;">Clone Your Voice</span>
                  <p class="form-help" style="margin: 0; font-size: 0.8rem;">Create a custom voice clone for phone calls</p>
                </div>
                <svg id="voice-clone-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s; color: var(--text-secondary);">
                  <polyline points="4 6 8 10 12 6"></polyline>
                </svg>
              </div>

              <div id="voice-clone-panel" style="display: none;">
                <p class="form-help" style="margin-bottom: 1rem; font-size: 0.875rem;">
                  Record 1-2 minutes of your voice speaking naturally. Speak clearly in a quiet environment for best results.
                </p>

                <!-- Progress Bar -->
                <div id="clone-progress" style="display: none; margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.875rem; font-weight: 500;">Cloning your voice...</span>
                    <span id="progress-percent" style="font-size: 0.875rem; color: var(--text-secondary);">0%</span>
                  </div>
                  <div style="width: 100%; height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary-color), var(--secondary-color)); transition: width 0.3s ease;"></div>
                  </div>
                </div>

                <!-- Input Method Toggle -->
                <div style="margin-bottom: 1.5rem;">
                  <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                    <button type="button" id="record-tab" class="btn btn-secondary" style="flex: 1; background: var(--primary-color); border-color: var(--primary-color); color: white;">
                      Record
                    </button>
                    <button type="button" id="upload-tab" class="btn btn-secondary" style="flex: 1; color: #3b82f6;">
                      Upload File
                    </button>
                  </div>

                  <!-- Recording Controls -->
                  <div id="recording-controls">
                    <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1rem;">
                      <button type="button" id="start-recording-btn" class="btn" style="flex: 1; background: #eff6ff; color: #3b82f6; border: 2px solid #dbeafe;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
                        </svg>
                        Start Recording
                      </button>
                      <button type="button" id="stop-recording-btn" class="btn btn-secondary" style="flex: 1; display: none;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="6" y="6" width="12" height="12" fill="currentColor"></rect>
                        </svg>
                        Stop
                      </button>
                    </div>

                    <div id="recording-timer" style="display: none; text-align: center; font-size: 1.25rem; font-weight: 600; color: var(--primary-color); margin-bottom: 1rem;">
                      <span id="timer-display">0:00</span> / 2:00
                    </div>
                  </div>

                  <!-- Upload Controls -->
                  <div id="upload-controls" style="display: none;">
                    <label for="voice-file-input" class="btn" style="display: block; text-align: center; cursor: pointer; margin-bottom: 0.5rem; background: #eff6ff; color: #3b82f6; border: 2px solid #dbeafe;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.5rem;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      Choose Audio File
                    </label>
                    <input type="file" id="voice-file-input" accept="audio/*" style="display: none;">
                    <div id="file-name" style="display: none; text-align: center; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;"></div>
                    <p class="form-help" style="text-align: center; margin-bottom: 0;">MP3, WAV, or M4A • 1-2 minutes recommended</p>
                  </div>
                </div>

                <!-- Audio Preview -->
                <div id="audio-preview" style="display: none; margin-bottom: 1rem;">
                  <label class="form-label">Preview Recording</label>
                  <audio id="preview-player" controls style="width: 100%; margin-bottom: 0.75rem;"></audio>
                  <div style="display: flex; gap: 0.75rem;">
                    <button type="button" id="retry-recording-btn" class="btn btn-secondary" style="flex: 1;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                      </svg>
                      Re-record
                    </button>
                    <button type="button" id="submit-voice-btn" class="btn btn-primary" style="flex: 1;">
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
              <label class="form-label" for="response-style">Response Style</label>
              <select id="response-style" class="form-select">
                <option value="casual" ${!activeConfig?.response_style || activeConfig?.response_style === 'casual' ? 'selected' : ''}>Casual</option>
                <option value="formal" ${activeConfig?.response_style === 'formal' ? 'selected' : ''}>Formal</option>
                <option value="friendly" ${activeConfig?.response_style === 'friendly' ? 'selected' : ''}>Friendly</option>
                <option value="professional" ${activeConfig?.response_style === 'professional' ? 'selected' : ''}>Professional</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="agent-language">Language</label>
              <select id="agent-language" class="form-select">
                <option value="en-US" ${!activeConfig?.language || activeConfig?.language === 'en-US' ? 'selected' : ''}>English</option>
                <option value="multi" ${activeConfig?.language === 'multi' ? 'selected' : ''}>Multilingual (auto-detect)</option>
                <option value="fr" ${activeConfig?.language === 'fr' ? 'selected' : ''}>French</option>
                <option value="es" ${activeConfig?.language === 'es' ? 'selected' : ''}>Spanish</option>
                <option value="de" ${activeConfig?.language === 'de' ? 'selected' : ''}>German</option>
              </select>
              <p class="form-help">Multilingual starts in English and adapts to the caller's language.</p>
              <p id="language-voice-warning" class="form-help" style="color: #d97706; display: ${activeConfig?.language && activeConfig.language !== 'en-US' ? 'block' : 'none'};">
                Voices cloned from English speech may have an accent in other languages.
              </p>
            </div>

            <div class="form-group" id="translate-group">
              <label class="form-label" for="owner-language">Agent Translation</label>
              <select id="owner-language" class="form-select">
                <option value="">Off</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
              </select>
              <p class="form-help" id="translate-help"></p>
            </div>

            <div class="form-group">
              <label class="form-label" for="vetting-strategy">Unknown Caller Vetting</label>
              <select id="vetting-strategy" class="form-select">
                <option value="name-and-purpose" ${activeConfig?.vetting_strategy === 'name-and-purpose' ? 'selected' : ''}>
                  Name and Purpose (Recommended)
                </option>
                <option value="strict" ${activeConfig?.vetting_strategy === 'strict' ? 'selected' : ''}>
                  Strict (More questions)
                </option>
                <option value="lenient" ${activeConfig?.vetting_strategy === 'lenient' ? 'selected' : ''}>
                  Lenient (Basic screening)
                </option>
              </select>
              <p class="form-help">How your assistant should screen unknown callers</p>
            </div>

            <!-- Advanced Settings Toggle -->
            <div class="advanced-toggle-container" style="margin: 30px 0 1rem 0;">
              <button type="button" id="advanced-toggle" style="
                background: none;
                border: none;
                color: var(--text-secondary);
                font-weight: 400;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0;
                font-size: 0.8rem;
              ">
                <span>Advanced</span>
                <svg id="advanced-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" style="transition: transform 0.2s;">
                  <polyline points="4 6 8 10 12 6"></polyline>
                </svg>
              </button>
            </div>

            <!-- Advanced Settings Panel (Hidden by Default) -->
            <div id="advanced-panel" style="display: none; margin-top: 10px; margin-bottom: 0; padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary);">
              <h3 style="margin: 0 0 1rem 0; font-size: 1rem;">Advanced Settings</h3>

              <div class="form-group">
                <label class="form-label" for="prompt-type-select">Prompt Type</label>
                <select id="prompt-type-select" class="form-input" style="margin-bottom: 0.5rem;">
                  <option value="inbound">Inbound Calls</option>
                  <option value="outbound">Outbound Calls</option>
                </select>
                <p class="form-help">Select which prompt to view/edit</p>
              </div>

              <div class="form-group" id="inbound-prompt-group">
                <label class="form-label" for="adv-system-prompt">Inbound System Prompt</label>
                <textarea
                  id="adv-system-prompt"
                  class="form-textarea"
                  rows="4"
                  placeholder="Instructions for handling inbound calls (when someone calls you)..."
                >${activeConfig?.system_prompt || ''}</textarea>
                <p class="form-help">How your assistant should handle incoming calls from customers</p>
              </div>

              <div class="form-group" id="outbound-prompt-group" style="display: none;">
                <label class="form-label" for="adv-outbound-prompt">Outbound System Prompt</label>
                <textarea
                  id="adv-outbound-prompt"
                  class="form-textarea"
                  rows="4"
                  placeholder="Instructions for making outbound calls (when calling someone on your behalf)..."
                >${activeConfig?.outbound_system_prompt || ''}</textarea>
                <p class="form-help">How your assistant should behave when calling people on your behalf</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-creativity">
                  Creativity Level (Temperature)
                  <span class="text-sm text-muted" id="creativity-value">${activeConfig?.temperature || 0.7}</span>
                </label>
                <input
                  type="range"
                  id="adv-creativity"
                  min="0"
                  max="1"
                  step="0.1"
                  value="${activeConfig?.temperature || 0.7}"
                  style="width: 100%;"
                />
                <p class="form-help">Lower = more focused, Higher = more creative</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-max-response">
                  Max Response Length (tokens)
                </label>
                <input
                  type="number"
                  id="adv-max-response"
                  class="form-input"
                  value="${activeConfig?.max_tokens || 150}"
                  min="50"
                  max="1000"
                />
                <p class="form-help">Maximum length of AI responses</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-agent-volume">
                  Agent Volume
                  <span class="text-sm text-muted" id="agent-volume-value">${activeConfig?.agent_volume || 1.0}</span>
                </label>
                <input
                  type="range"
                  id="adv-agent-volume"
                  min="0"
                  max="2"
                  step="0.1"
                  value="${activeConfig?.agent_volume || 1.0}"
                  style="width: 100%;"
                />
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);">
                  <span>Quiet (0)</span>
                  <span>Normal (1.0)</span>
                  <span>Loud (2.0)</span>
                </div>
                <p class="form-help">Adjust voice volume</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-ambient-sound">Ambient Sound</label>
                <select id="adv-ambient-sound" class="form-select">
                  <option value="off" ${!activeConfig?.ambient_sound || activeConfig?.ambient_sound === 'off' ? 'selected' : ''}>Off (Default)</option>
                  <option value="coffee-shop" ${activeConfig?.ambient_sound === 'coffee-shop' ? 'selected' : ''}>Coffee Shop</option>
                  <option value="convention-hall" ${activeConfig?.ambient_sound === 'convention-hall' ? 'selected' : ''}>Convention Hall</option>
                  <option value="summer-outdoor" ${activeConfig?.ambient_sound === 'summer-outdoor' ? 'selected' : ''}>Summer Outdoor</option>
                  <option value="mountain-outdoor" ${activeConfig?.ambient_sound === 'mountain-outdoor' ? 'selected' : ''}>Mountain Outdoor</option>
                  <option value="high-school-hallway" ${activeConfig?.ambient_sound === 'high-school-hallway' ? 'selected' : ''}>School Hallway</option>
                </select>
                <p class="form-help">Add background ambience to phone calls</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-ambient-volume">
                  Ambient Sound Volume
                  <span class="text-sm text-muted" id="ambient-volume-value">${activeConfig?.ambient_sound_volume || 1.0}</span>
                </label>
                <input
                  type="range"
                  id="adv-ambient-volume"
                  min="0"
                  max="2"
                  step="0.1"
                  value="${activeConfig?.ambient_sound_volume || 1.0}"
                  style="width: 100%;"
                />
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);">
                  <span>Quiet (0)</span>
                  <span>Normal (1.0)</span>
                  <span>Loud (2.0)</span>
                </div>
                <p class="form-help">Adjust ambient sound volume</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-noise-suppression">Background Noise Suppression</label>
                <select id="adv-noise-suppression" class="form-select">
                  <option value="high" ${activeConfig?.noise_suppression === 'high' ? 'selected' : ''}>High</option>
                  <option value="medium" ${activeConfig?.noise_suppression === 'medium' ? 'selected' : 'selected'}>Medium (Default)</option>
                  <option value="low" ${activeConfig?.noise_suppression === 'low' ? 'selected' : ''}>Low</option>
                  <option value="off" ${activeConfig?.noise_suppression === 'off' ? 'selected' : ''}>Off</option>
                </select>
                <p class="form-help">Reduce background noise on phone calls</p>
              </div>

              <div class="form-group">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <label class="form-label" style="margin: 0; flex: 1;">Transfer Numbers</label>
                  <button
                    type="button"
                    id="add-transfer-btn"
                    class="btn btn-icon"
                    style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center;"
                  >
                    <span style="font-size: 20px; line-height: 1;">+</span>
                  </button>
                </div>
                <div id="transfer-numbers-list">
                  <!-- Transfer numbers will be added here dynamically -->
                </div>
                <p class="form-help">Add phone numbers where calls can be transferred. Label them for easy identification (e.g., "Mobile", "Office", "Rick"). Optionally add a passcode for each number - when a caller says that passcode, they'll be transferred immediately without screening.</p>
              </div>

              <div class="form-group">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <label class="form-label" style="margin: 0; flex: 1;">Outbound Call Templates</label>
                  <button
                    type="button"
                    id="add-template-btn"
                    class="btn btn-icon"
                    style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center;"
                  >
                    <span style="font-size: 20px; line-height: 1;">+</span>
                  </button>
                </div>
                <div id="outbound-templates-list">
                  <!-- Outbound templates will be added here dynamically -->
                </div>
                <p class="form-help">Create reusable templates for outbound calls with predefined purpose and goal. Set one as default to auto-select when making calls.</p>
              </div>

            </div>

            ${this.isInitialSetup
              ? `
              <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
                Complete Setup
              </button>
            `
              : ''
            }
          </form>
        </div>
      </div>

      <!-- Voice Selection Modal -->
      <style>
        .voice-option:hover {
          background: var(--bg-secondary);
          border-color: var(--primary-color);
        }
        .voice-option input[type="radio"]:checked ~ div span {
          color: var(--primary-color);
        }
        .voice-preview-btn:hover {
          border-color: var(--primary-color);
          background: rgba(var(--primary-color-rgb), 0.1);
        }
        .voice-preview-btn.playing {
          border-color: var(--primary-color);
          background: var(--primary-color);
          color: white;
        }
        @media (max-width: 600px) {
          #voice-selection-modal .modal-content {
            margin: 20px;
            max-height: calc(100vh - 40px);
          }
        }
      </style>
      <div id="voice-selection-modal" class="modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10000;">
        <div class="modal-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);"></div>
        <div class="modal-content" style="
          position: relative;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          margin: 50px auto;
          background: white;
          border-radius: 12px;
          box-shadow: var(--shadow-lg);
        ">
          <div class="modal-header" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border-color);
          ">
            <h3 style="margin: 0; font-size: 1.125rem; font-weight: 600;">Select Voice</h3>
            <button type="button" class="modal-close" id="close-voice-modal" style="
              background: none;
              border: none;
              font-size: 1.5rem;
              cursor: pointer;
              color: var(--text-secondary);
              line-height: 1;
              padding: 0;
              width: 30px;
              height: 30px;
            ">&times;</button>
          </div>

          <div class="modal-body" style="padding: 1.25rem;">
            ${clonedVoices && clonedVoices.length > 0 ? `
              <div class="voice-section" style="margin-bottom: 1.5rem;">
                <h4 class="voice-section-title" style="
                  font-size: 0.875rem;
                  font-weight: 600;
                  color: var(--text-secondary);
                  margin-bottom: 0.75rem;
                  padding-bottom: 0.5rem;
                  border-bottom: 1px solid var(--border-color);
                ">🎤 Your Cloned Voices</h4>
                ${clonedVoices.map(voice => `
                  <div class="voice-option" data-voice-id="11labs-${voice.voice_id}" data-voice-name="${voice.voice_name}" style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    margin-bottom: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                  ">
                    <label class="voice-radio" style="
                      display: flex;
                      align-items: center;
                      gap: 0.5rem;
                      cursor: pointer;
                      flex: 1;
                    ">
                      <input type="radio" name="modal-voice-select" value="11labs-${voice.voice_id}" ${activeConfig?.voice_id === '11labs-' + voice.voice_id ? 'checked' : ''}>
                      <div>
                        <span style="font-weight: 500;">${voice.voice_name}</span>
                      </div>
                    </label>
                    <button type="button" class="voice-preview-btn" data-voice-id="11labs-${voice.voice_id}" style="
                      background: none;
                      border: 1px solid var(--border-color);
                      border-radius: 50%;
                      width: 32px;
                      height: 32px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      cursor: pointer;
                      transition: all 0.2s;
                    ">
                      <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                      <svg class="stop-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                        <rect x="6" y="6" width="12" height="12"></rect>
                      </svg>
                    </button>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <div class="voice-section" style="margin-bottom: 1.5rem;">
              <h4 class="voice-section-title" style="
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--text-secondary);
                margin-bottom: 0.75rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid var(--border-color);
              ">🔊 ElevenLabs Voices</h4>
              ${ELEVENLABS_VOICES.map(voice => `
                <div class="voice-option" data-voice-id="${voice.id}" data-voice-name="${voice.label || voice.name}" style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0.75rem;
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  margin-bottom: 0.5rem;
                  cursor: pointer;
                  transition: all 0.2s;
                ">
                  <label class="voice-radio" style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    flex: 1;
                  ">
                    <input type="radio" name="modal-voice-select" value="${voice.id}" ${activeConfig?.voice_id === voice.id ? 'checked' : ''}>
                    <div>
                      <span style="font-weight: 500;">${voice.label || voice.name}</span>
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        ${voice.accent} • ${voice.gender} • ${voice.description}
                      </div>
                    </div>
                  </label>
                  <button type="button" class="voice-preview-btn" data-voice-id="${voice.id}" style="
                    background: none;
                    border: 1px solid var(--border-color);
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                  ">
                    <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <svg class="stop-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  </button>
                </div>
              `).join('')}
            </div>

            <div class="voice-section">
              <h4 class="voice-section-title" style="
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--text-secondary);
                margin-bottom: 0.75rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid var(--border-color);
              ">🤖 OpenAI Voices</h4>
              ${OPENAI_VOICES.map(voice => `
                <div class="voice-option" data-voice-id="${voice.id}" data-voice-name="${voice.name}" style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  padding: 0.75rem;
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  margin-bottom: 0.5rem;
                  cursor: pointer;
                  transition: all 0.2s;
                ">
                  <label class="voice-radio" style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    flex: 1;
                  ">
                    <input type="radio" name="modal-voice-select" value="${voice.id}" ${activeConfig?.voice_id === voice.id ? 'checked' : ''}>
                    <div>
                      <span style="font-weight: 500;">${voice.name}</span>
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        ${voice.accent} • ${voice.gender} • ${voice.description}
                      </div>
                    </div>
                  </label>
                  <button type="button" class="voice-preview-btn" data-voice-id="${voice.id}" style="
                    background: none;
                    border: 1px solid var(--border-color);
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                  ">
                    <svg class="play-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <svg class="stop-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  </button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="modal-footer" style="
            display: flex;
            gap: 0.75rem;
            padding: 1rem 1.25rem;
            border-top: 1px solid var(--border-color);
          ">
            <button type="button" class="btn btn-secondary" id="cancel-voice-selection" style="flex: 1;">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirm-voice-selection" style="flex: 1;">Select</button>
          </div>
        </div>
      </div>

      ${renderBottomNav('/agent-config')}
    `;

    await this.loadTransferNumbers();
    this.renderTransferNumbers();
    await this.loadOutboundTemplates();
    this.renderOutboundTemplates();
    this.attachEventListeners();
  }

  async loadTransferNumbers() {
    const { user } = await getCurrentUser();
    const { data, error } = await supabase
      .from('transfer_numbers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      this.transferNumbers = data;
    }

    // If no transfer numbers exist, add one empty row
    if (this.transferNumbers.length === 0) {
      this.transferNumbers.push({ id: null, label: '', phone_number: '', is_default: true });
    }
  }

  renderTransferNumbers() {
    const container = document.getElementById('transfer-numbers-list');
    if (!container) return;

    container.innerHTML = this.transferNumbers.map((transfer, index) => {
      // Format phone number for display (remove +1 prefix if present)
      let displayNumber = transfer.phone_number || '';
      if (displayNumber.startsWith('+1')) {
        displayNumber = displayNumber.substring(2);
      } else if (displayNumber.startsWith('1') && displayNumber.length === 11) {
        displayNumber = displayNumber.substring(1);
      }

      // Determine if number is US or Canadian based on area code
      // Canadian area codes: 204, 226, 236, 249, 250, 289, 306, 343, 365, 367, 403, 416, 418, 431, 437, 438, 450, 506, 514, 519, 548, 579, 581, 587, 604, 613, 639, 647, 705, 709, 778, 780, 782, 807, 819, 825, 867, 873, 902, 905
      const canadianAreaCodes = ['204', '226', '236', '249', '250', '289', '306', '343', '365', '367', '403', '416', '418', '431', '437', '438', '450', '506', '514', '519', '548', '579', '581', '587', '604', '613', '639', '647', '705', '709', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905'];
      const areaCode = displayNumber.replace(/\D/g, '').substring(0, 3);
      const flagIcon = canadianAreaCodes.includes(areaCode) ? '🇨🇦' : '🇺🇸';

      return `
      <div class="transfer-number-row" data-index="${index}" style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
          <input
            type="text"
            class="form-input transfer-label"
            placeholder="Label (e.g., Mobile)"
            value="${transfer.label || ''}"
            style="flex: 1;"
            data-index="${index}"
          />
          <div style="flex: 2; display: flex; align-items: center; gap: 0;">
            <span style="
              background-color: #eff6ff;
              border: 1px solid #dbeafe;
              border-right: none;
              border-radius: 8px 0 0 8px;
              padding: 0.5rem 0.75rem;
              height: 38px;
              display: flex;
              align-items: center;
              justify-content: center;
              user-select: none;
              font-size: 1.5rem;
            ">${flagIcon}</span>
            <input
              type="tel"
              class="form-input transfer-phone"
              placeholder="(555) 123-4567"
              value="${displayNumber}"
              maxlength="14"
              style="flex: 1; border-radius: 0 8px 8px 0; border-left: none; padding-left: 0.5rem;"
              data-index="${index}"
            />
          </div>
          <button
            type="button"
            class="btn btn-icon remove-transfer-btn"
            data-index="${index}"
            style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center; background-color: #ef4444; border-color: #ef4444;"
          >
            <span style="font-size: 20px; line-height: 1; color: white;">×</span>
          </button>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center; padding-left: 0.5rem;">
          <label style="font-size: 0.8rem; color: #6b7280; white-space: nowrap; min-width: 100px;">Passcode (optional):</label>
          <input
            type="text"
            class="form-input transfer-passcode"
            placeholder="e.g., urgent123"
            value="${transfer.transfer_secret || ''}"
            style="flex: 1; font-size: 0.875rem; padding: 0.35rem 0.5rem; height: 32px;"
            data-index="${index}"
          />
        </div>
      </div>
    `;
    }).join('');

    // Attach event listener for header add button
    const headerAddBtn = document.getElementById('add-transfer-btn');
    if (headerAddBtn) {
      headerAddBtn.replaceWith(headerAddBtn.cloneNode(true)); // Remove old listeners
      const newHeaderAddBtn = document.getElementById('add-transfer-btn');
      newHeaderAddBtn.addEventListener('click', () => this.addTransferNumber());
    }

    const removeBtns = container.querySelectorAll('.remove-transfer-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.removeTransferNumber(index);
      });
    });

    // Attach event listeners for input changes
    const labelInputs = container.querySelectorAll('.transfer-label');
    const phoneInputs = container.querySelectorAll('.transfer-phone');
    const passcodeInputs = container.querySelectorAll('.transfer-passcode');

    labelInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.transferNumbers[index].label = e.target.value;

        // Remove red border if field now has value
        if (e.target.value.trim()) {
          e.target.style.borderColor = '';
        }

        this.debounceSaveTransferNumber(index);
      });
    });

    phoneInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);

        // Format phone number as user types
        let value = e.target.value.replace(/\D/g, ''); // Remove non-digits

        // Limit to 10 digits
        if (value.length > 10) {
          value = value.substring(0, 10);
        }

        // Format as (XXX) XXX-XXXX
        let formatted = value;
        if (value.length > 6) {
          formatted = `(${value.substring(0, 3)}) ${value.substring(3, 6)}-${value.substring(6)}`;
        } else if (value.length > 3) {
          formatted = `(${value.substring(0, 3)}) ${value.substring(3)}`;
        } else if (value.length > 0) {
          formatted = `(${value}`;
        }

        e.target.value = formatted;

        // Store with +1 prefix (only digits)
        this.transferNumbers[index].phone_number = value.length === 10 ? `+1${value}` : (value.length > 0 ? value : '');

        // Remove red border if field is complete (10 digits)
        if (value.length === 10) {
          e.target.style.borderColor = '';
        }

        this.debounceSaveTransferNumber(index);
      });
    });

    passcodeInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.transferNumbers[index].transfer_secret = e.target.value;
        this.debounceSaveTransferNumber(index);
      });
    });
  }

  debounceSaveTransferNumber(index) {
    clearTimeout(this.transferSaveTimeout);
    this.transferSaveTimeout = setTimeout(() => {
      this.saveTransferNumber(index);
    }, 1000); // Save 1 second after user stops typing
  }

  addTransferNumber() {
    this.transferNumbers.push({ id: null, label: '', phone_number: '', is_default: false });
    this.renderTransferNumbers();
  }

  async removeTransferNumber(index) {
    const transfer = this.transferNumbers[index];

    // If it has an ID, delete from database
    if (transfer.id) {
      await supabase
        .from('transfer_numbers')
        .delete()
        .eq('id', transfer.id);
    }

    this.transferNumbers.splice(index, 1);

    // If we removed all, add one empty row
    if (this.transferNumbers.length === 0) {
      this.transferNumbers.push({ id: null, label: '', phone_number: '', is_default: true });
    }

    this.renderTransferNumbers();

    // Show deleted message
    showToast('Deleted', 'error');
  }

  async saveTransferNumber(index) {
    const transfer = this.transferNumbers[index];

    // Validate that both fields are filled before saving
    if (!transfer.label || !transfer.phone_number || transfer.phone_number.length < 12) {
      // Add red border to missing fields
      const container = document.getElementById('transfer-numbers-list');
      if (container) {
        const labelInput = container.querySelector(`.transfer-label[data-index="${index}"]`);
        const phoneInput = container.querySelector(`.transfer-phone[data-index="${index}"]`);

        if (!transfer.label && labelInput) {
          labelInput.style.borderColor = '#ef4444';
        }
        if ((!transfer.phone_number || transfer.phone_number.length < 12) && phoneInput) {
          phoneInput.style.borderColor = '#ef4444';
        }
      }

      // Only show message if user has started filling in either field
      if (transfer.label || transfer.phone_number) {
        showToast('Both label and phone number are required for a transfer', 'error');
      }
      return;
    }

    const { user } = await getCurrentUser();

    if (transfer.id) {
      // Update existing
      await supabase
        .from('transfer_numbers')
        .update({
          label: transfer.label,
          phone_number: transfer.phone_number,
          transfer_secret: transfer.transfer_secret || null,
        })
        .eq('id', transfer.id);
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('transfer_numbers')
        .insert({
          user_id: user.id,
          label: transfer.label,
          phone_number: transfer.phone_number,
          transfer_secret: transfer.transfer_secret || null,
          is_default: index === 0,
        })
        .select()
        .single();

      if (!error && data) {
        this.transferNumbers[index].id = data.id;
      }
    }

  }

  // =============================================
  // Outbound Call Templates Management
  // =============================================

  async loadOutboundTemplates() {
    const { user } = await getCurrentUser();
    const { templates, error } = await OutboundTemplate.list(user.id);

    if (!error && templates) {
      this.outboundTemplates = templates;
    }
  }

  renderOutboundTemplates() {
    const container = document.getElementById('outbound-templates-list');
    if (!container) return;

    if (this.outboundTemplates.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
          No templates yet. Click + to create one.
        </div>
      `;
    } else {
      container.innerHTML = this.outboundTemplates.map((template, index) => `
        <div class="template-row" data-index="${index}" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; ${template.is_default ? 'border-color: var(--primary-color); background: rgba(79, 70, 229, 0.05);' : ''}">
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;">
            <input
              type="text"
              class="form-input template-name"
              placeholder="Template name"
              value="${this.escapeHtml(template.name || '')}"
              style="flex: 1; font-weight: 500;"
              data-index="${index}"
            />
            <button
              type="button"
              class="btn btn-icon set-default-template-btn ${template.is_default ? 'active' : ''}"
              data-index="${index}"
              title="${template.is_default ? 'Default template' : 'Set as default'}"
              style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center; ${template.is_default ? 'background: var(--primary-color); border-color: var(--primary-color); color: white;' : ''}"
            >
              <span style="font-size: 16px; line-height: 1;">★</span>
            </button>
            <button
              type="button"
              class="btn btn-icon remove-template-btn"
              data-index="${index}"
              style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center; background-color: #ef4444; border-color: #ef4444;"
            >
              <span style="font-size: 20px; line-height: 1; color: white;">×</span>
            </button>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
            <input
              type="text"
              class="form-input template-purpose"
              placeholder="Purpose (e.g., Follow up on inquiry)"
              value="${this.escapeHtml(template.purpose || '')}"
              style="flex: 1;"
              data-index="${index}"
            />
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <input
              type="text"
              class="form-input template-goal"
              placeholder="Goal (e.g., Schedule appointment)"
              value="${this.escapeHtml(template.goal || '')}"
              style="flex: 1;"
              data-index="${index}"
            />
          </div>
        </div>
      `).join('');
    }

    // Attach event listener for header add button
    const headerAddBtn = document.getElementById('add-template-btn');
    if (headerAddBtn) {
      headerAddBtn.replaceWith(headerAddBtn.cloneNode(true));
      const newHeaderAddBtn = document.getElementById('add-template-btn');
      newHeaderAddBtn.addEventListener('click', () => this.addOutboundTemplate());
    }

    // Attach remove button listeners
    const removeBtns = container.querySelectorAll('.remove-template-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.removeOutboundTemplate(index);
      });
    });

    // Attach set-default button listeners
    const defaultBtns = container.querySelectorAll('.set-default-template-btn');
    defaultBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.setDefaultTemplate(index);
      });
    });

    // Attach input change listeners
    const nameInputs = container.querySelectorAll('.template-name');
    const purposeInputs = container.querySelectorAll('.template-purpose');
    const goalInputs = container.querySelectorAll('.template-goal');

    nameInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.outboundTemplates[index].name = e.target.value;
        this.debounceSaveTemplate(index);
      });
    });

    purposeInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.outboundTemplates[index].purpose = e.target.value;
        this.debounceSaveTemplate(index);
      });
    });

    goalInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.outboundTemplates[index].goal = e.target.value;
        this.debounceSaveTemplate(index);
      });
    });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  debounceSaveTemplate(index) {
    clearTimeout(this.templateSaveTimeout);
    this.templateSaveTimeout = setTimeout(() => {
      this.saveOutboundTemplate(index);
    }, 1000);
  }

  async addOutboundTemplate() {
    const { user } = await getCurrentUser();
    const { template, error } = await OutboundTemplate.create(user.id, {
      name: '',
      purpose: '',
      goal: '',
      is_default: this.outboundTemplates.length === 0 // First template is default
    });

    if (!error && template) {
      this.outboundTemplates.push(template);
      this.renderOutboundTemplates();

      // Focus the name input of the new template
      setTimeout(() => {
        const nameInputs = document.querySelectorAll('.template-name');
        if (nameInputs.length > 0) {
          nameInputs[nameInputs.length - 1].focus();
        }
      }, 100);
    }
  }

  async removeOutboundTemplate(index) {
    const template = this.outboundTemplates[index];

    if (template.id) {
      const { error } = await OutboundTemplate.delete(template.id);
      if (error) {
        console.error('Failed to delete template:', error);
        return;
      }
    }

    this.outboundTemplates.splice(index, 1);
    this.renderOutboundTemplates();

    // Show deleted message
    showToast('Template deleted', 'error');
  }

  async setDefaultTemplate(index) {
    const template = this.outboundTemplates[index];
    if (!template.id) return;

    const { user } = await getCurrentUser();

    // If already default, clear it
    if (template.is_default) {
      const { error } = await OutboundTemplate.clearDefault(user.id);
      if (!error) {
        this.outboundTemplates.forEach(t => t.is_default = false);
        this.renderOutboundTemplates();
      }
    } else {
      // Set as default
      const { error } = await OutboundTemplate.setDefault(user.id, template.id);
      if (!error) {
        this.outboundTemplates.forEach(t => t.is_default = false);
        this.outboundTemplates[index].is_default = true;
        this.renderOutboundTemplates();
      }
    }
  }

  async saveOutboundTemplate(index) {
    const template = this.outboundTemplates[index];

    // Validate required fields
    if (!template.name || !template.purpose || !template.goal) {
      return; // Don't save incomplete templates
    }

    const { user } = await getCurrentUser();

    if (template.id) {
      // Update existing
      const { error } = await OutboundTemplate.update(template.id, {
        name: template.name,
        purpose: template.purpose,
        goal: template.goal
      });

      if (error) {
        console.error('Failed to update template:', error);
      }
    } else {
      // Create new
      const { template: newTemplate, error } = await OutboundTemplate.create(user.id, {
        name: template.name,
        purpose: template.purpose,
        goal: template.goal,
        is_default: template.is_default
      });

      if (!error && newTemplate) {
        this.outboundTemplates[index].id = newTemplate.id;
      }
    }
  }

  // Returns the base language code (e.g. 'en-US' → 'en', 'fr' → 'fr')
  getBaseLanguage(lang) {
    if (!lang) return 'en';
    return lang.split('-')[0].toLowerCase();
  }

  // Compute translate_to based on owner language selection
  computeTranslateTo() {
    const ownerLang = document.getElementById('owner-language')?.value;
    if (!ownerLang) return null; // "Off" selected
    return ownerLang;
  }

  // Update the translate help text based on agent language vs owner language
  updateTranslateGroupVisibility() {
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

    if (agentLang !== 'multi' && this.getBaseLanguage(agentLang) === ownerLang) {
      help.textContent = `Translation off — agent already speaks ${ownerName}`;
    } else if (agentLang === 'multi') {
      help.textContent = `Non-${ownerName} messages translated in inbox`;
    } else {
      help.textContent = `Inbox messages translated to ${ownerName}`;
    }
  }

  async autoSave(voiceChanged = false, transferChanged = false, promptChanged = false) {
    if (this.isInitialSetup) return; // Don't auto-save during initial setup

    try {
      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        outbound_system_prompt: document.getElementById('adv-outbound-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        temperature: parseFloat(document.getElementById('adv-creativity').value),
        max_tokens: parseInt(document.getElementById('adv-max-response').value),
        agent_volume: parseFloat(document.getElementById('adv-agent-volume').value),
        ambient_sound: document.getElementById('adv-ambient-sound').value,
        ambient_sound_volume: parseFloat(document.getElementById('adv-ambient-volume').value),
        noise_suppression: document.getElementById('adv-noise-suppression').value,
        language: document.getElementById('agent-language').value,
        translate_to: this.computeTranslateTo(),
      };

      // Handle global agent save separately
      if (this.isEditingGlobalAgent) {
        const { data, error } = await supabase
          .from('agent_configs')
          .update({
            ...configData,
            updated_at: new Date().toISOString(),
          })
          .eq('is_global', true)
          .select()
          .single();

        if (error) throw error;

        // Update local cache
        this.globalAgentConfig = data;

        // Show success briefly
        showToast('Saved', 'success');

        return; // Don't continue with personal agent logic
      }

      const { user } = await getCurrentUser();

      // Get current config to check for changes
      const { data: currentConfig } = await supabase
        .from('agent_configs')
        .select('system_prompt, outbound_system_prompt, temperature, max_tokens, agent_volume, ambient_sound, ambient_sound_volume, noise_suppression')
        .eq('user_id', user.id)
        .single();

      // Detect if system prompt changed
      if (!promptChanged && currentConfig && currentConfig.system_prompt !== configData.system_prompt) {
        promptChanged = true;
      }

      // Detect if agent settings changed
      const agentSettingsChanged = currentConfig && (
        currentConfig.agent_volume !== configData.agent_volume ||
        currentConfig.ambient_sound !== configData.ambient_sound ||
        currentConfig.ambient_sound_volume !== configData.ambient_sound_volume ||
        currentConfig.noise_suppression !== configData.noise_suppression
      );

      const { config, error } = await AgentConfig.update(user.id, configData);

      if (error) throw error;

      // If voice changed, fetch new avatar and reload
      if (voiceChanged) {
        showToast('Updating voice...', 'info');

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();

        const avatarResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-agent-avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (avatarResponse.ok) {
          showToast('Voice updated successfully', 'success');
          // Reload page after a short delay to show new avatar
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }
      }

      // Success message removed - saving is implied
    } catch (error) {
      console.error('Auto-save error:', error);
      showToast(error.message || 'Failed to save', 'error');
    }
  }

  triggerAutoSave(voiceChanged = false, transferChanged = false) {
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.autoSave(voiceChanged, transferChanged);
    }, 1000); // Save 1 second after user stops typing/changing
  }

  attachEventListeners() {
    const form = document.getElementById('config-form');
    const submitBtn = document.getElementById('submit-btn');
    const fetchAvatarBtn = document.getElementById('fetch-avatar-btn');
    const advancedToggle = document.getElementById('advanced-toggle');
    const advancedPanel = document.getElementById('advanced-panel');
    const advancedIcon = document.getElementById('advanced-icon');
    const advCreativitySlider = document.getElementById('adv-creativity');
    const creativityValue = document.getElementById('creativity-value');
    const agentVolumeSlider = document.getElementById('adv-agent-volume');
    const agentVolumeValue = document.getElementById('agent-volume-value');
    const ambientVolumeSlider = document.getElementById('adv-ambient-volume');
    const ambientVolumeValue = document.getElementById('ambient-volume-value');

    // Agent selector buttons (for users with global agent permission)
    const selectPersonalBtn = document.getElementById('select-personal-agent');
    const selectGlobalBtn = document.getElementById('select-global-agent');

    if (selectPersonalBtn) {
      selectPersonalBtn.addEventListener('click', () => {
        if (!this.isEditingGlobalAgent) return; // Already on personal
        this.isEditingGlobalAgent = false;
        this.render(); // Re-render with personal agent config
      });
    }

    if (selectGlobalBtn) {
      selectGlobalBtn.addEventListener('click', () => {
        if (this.isEditingGlobalAgent) return; // Already on global
        this.isEditingGlobalAgent = true;
        this.render(); // Re-render with global agent config
      });
    }

    // Fetch avatar button (also creates agent if doesn't exist)
    if (fetchAvatarBtn) {
      fetchAvatarBtn.addEventListener('click', async () => {
        fetchAvatarBtn.disabled = true;
        fetchAvatarBtn.textContent = 'Setting up...';

        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const { data: { session } } = await supabase.auth.getSession();

          if (!session) {
            throw new Error('No active session. Please log in again.');
          }

          // First, check if agent exists
          const { data: existingConfig } = await supabase
            .from('agent_configs')
            .select('*')
            .single();

          // Only create agent if it doesn't exist at all
          if (!existingConfig) {
            showToast('Creating your AI assistant...', 'info');

            const defaultPrompt = `Personal AI Agent Prompt (Casual Style)

You're the user's personal AI assistant. Answer calls and texts in a friendly, natural way.

Calls:

Pick up with a casual greeting like: "Hey, this is the assistant, they can't grab the phone right now."

Ask who's calling and what it's about.

If it's family or friends → take a quick message and let them know the user will see it.

If it's unknown → ask their name and reason. If it feels spammy, politely end the call.

Always keep it short, warm, and polite.

SMS:

Reply casually and friendly.

Let friends/family know the user is busy but will see their message.

If important, say you'll pass it on.

If spammy, ignore or politely decline.

Always sound approachable, keep things simple, and update the user with a quick summary after each interaction.`;

            // Create agent config directly in database
            const { data: newConfig, error: createError } = await supabase
              .from('agent_configs')
              .insert({
                user_id: session.user.id,
                name: 'AI Assistant',
                voice_id: '11labs-21m00Tcm4TlvDq8ikWAM',
                system_prompt: defaultPrompt,
                active_voice_stack: 'livekit',
                is_default: true,
              })
              .select()
              .single();

            if (createError) {
              throw new Error(createError.message || 'Failed to create assistant');
            }

            console.log('Agent created:', newConfig);

            showToast('Assistant created! Reloading...', 'success');
          } else if (!existingConfig.avatar_url && existingConfig.voice_id) {
            // Agent exists but missing avatar - fetch it
            showToast('Fetching avatar...', 'info');

            const avatarResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-agent-avatar`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
            });

            if (!avatarResponse.ok) {
              const errorData = await avatarResponse.json().catch(() => ({}));
              throw new Error(errorData.error || 'Failed to fetch avatar');
            }

            showToast('Avatar fetched! Reloading...', 'success');
          } else {
            // Agent exists with avatar - nothing to do
            throw new Error('Avatar already exists');
          }

          // Reload page to show avatar
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          console.error('Error:', error);
          showToast(error.message || 'Failed to set up assistant. Please try again.', 'error');
          fetchAvatarBtn.disabled = false;
          fetchAvatarBtn.textContent = 'Fetch Avatar';
        }
      });
    }

    // Advanced toggle functionality
    if (advancedToggle && advancedPanel && advancedIcon) {
      advancedToggle.addEventListener('click', () => {
        const isHidden = advancedPanel.style.display === 'none';
        advancedPanel.style.display = isHidden ? 'block' : 'none';
        advancedIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
    }

    // Prompt type selector functionality
    const promptTypeSelect = document.getElementById('prompt-type-select');
    const inboundPromptGroup = document.getElementById('inbound-prompt-group');
    const outboundPromptGroup = document.getElementById('outbound-prompt-group');

    if (promptTypeSelect && inboundPromptGroup && outboundPromptGroup) {
      promptTypeSelect.addEventListener('change', () => {
        if (promptTypeSelect.value === 'inbound') {
          inboundPromptGroup.style.display = 'block';
          outboundPromptGroup.style.display = 'none';
        } else {
          inboundPromptGroup.style.display = 'none';
          outboundPromptGroup.style.display = 'block';
        }
      });
    }

    // Voice selection modal functionality
    const voiceSelectorDisplay = document.getElementById('voice-selector-display');
    const voiceModal = document.getElementById('voice-selection-modal');
    const closeModalBtn = document.getElementById('close-voice-modal');
    const cancelBtn = document.getElementById('cancel-voice-selection');
    const confirmBtn = document.getElementById('confirm-voice-selection');
    const modalOverlay = voiceModal?.querySelector('.modal-overlay');

    // Open modal - entire voice selector is clickable
    if (voiceSelectorDisplay && voiceModal) {
      voiceSelectorDisplay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentVoice = document.getElementById('voice-id').value;
        const radio = voiceModal.querySelector(`input[value="${currentVoice}"]`);
        if (radio) radio.checked = true;
        voiceModal.style.display = 'block';
      });

      // Add hover effect
      voiceSelectorDisplay.addEventListener('mouseenter', () => {
        voiceSelectorDisplay.style.borderColor = 'var(--primary-color)';
        voiceSelectorDisplay.style.background = 'var(--bg-secondary)';
      });

      voiceSelectorDisplay.addEventListener('mouseleave', () => {
        voiceSelectorDisplay.style.borderColor = 'var(--border-color)';
        voiceSelectorDisplay.style.background = 'white';
      });
    }

    // Close modal function
    const closeVoiceModal = () => {
      if (voiceModal) {
        voiceModal.style.display = 'none';
        // Stop any playing previews
        if (this.currentPreviewAudio) {
          this.currentPreviewAudio.pause();
          this.currentPreviewAudio = null;
        }
        // Reset all preview buttons
        document.querySelectorAll('.voice-preview-btn').forEach(btn => {
          btn.classList.remove('playing');
          const playIcon = btn.querySelector('.play-icon');
          const stopIcon = btn.querySelector('.stop-icon');
          if (playIcon) playIcon.style.display = 'inline';
          if (stopIcon) stopIcon.style.display = 'none';
        });
      }
    };

    // Close modal events
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeVoiceModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeVoiceModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeVoiceModal);

    // Confirm voice selection
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const selectedRadio = document.querySelector('input[name="modal-voice-select"]:checked');
        if (selectedRadio) {
          const voiceId = selectedRadio.value;
          const voiceOption = selectedRadio.closest('.voice-option');
          const voiceName = voiceOption?.dataset.voiceName;

          // Update hidden input
          document.getElementById('voice-id').value = voiceId;

          // Update display
          document.getElementById('selected-voice-display').textContent = voiceName;

          // Trigger auto-save
          this.triggerAutoSave(true, false);

          closeVoiceModal();
        }
      });
    }

    // Voice preview in modal
    const previewBtns = document.querySelectorAll('.voice-preview-btn');
    previewBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const voiceId = btn.dataset.voiceId;
        await this.playVoicePreview(voiceId, btn);
      });
    });

    // Voice cloning toggle functionality
    const voiceCloneToggle = document.getElementById('voice-clone-toggle');
    const voiceClonePanel = document.getElementById('voice-clone-panel');
    const voiceCloneIcon = document.getElementById('voice-clone-icon');
    const voiceCloneButton = document.getElementById('voice-clone-button');

    if (voiceCloneToggle && voiceClonePanel && voiceCloneIcon) {
      voiceCloneToggle.addEventListener('click', () => {
        const isHidden = voiceClonePanel.style.display === 'none';
        voiceClonePanel.style.display = isHidden ? 'block' : 'none';
        voiceCloneIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });

      // Hover effect for the circular button
      if (voiceCloneButton) {
        voiceCloneToggle.addEventListener('mouseenter', () => {
          voiceCloneButton.style.backgroundImage = 'linear-gradient(var(--bg-secondary), var(--bg-secondary)), linear-gradient(135deg, #6366f1, #8b5cf6)';
        });
        voiceCloneToggle.addEventListener('mouseleave', () => {
          voiceCloneButton.style.backgroundImage = 'linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6)';
        });
      }
    }

    // Voice cloning tab switching
    const recordTab = document.getElementById('record-tab');
    const uploadTab = document.getElementById('upload-tab');
    const recordingControls = document.getElementById('recording-controls');
    const uploadControls = document.getElementById('upload-controls');

    if (recordTab && uploadTab) {
      recordTab.addEventListener('click', () => {
        recordTab.style.background = 'var(--primary-color)';
        recordTab.style.borderColor = 'var(--primary-color)';
        recordTab.style.color = 'white';
        uploadTab.style.background = '';
        uploadTab.style.borderColor = '';
        uploadTab.style.color = '#3b82f6';
        recordingControls.style.display = 'block';
        uploadControls.style.display = 'none';
      });

      uploadTab.addEventListener('click', () => {
        uploadTab.style.background = 'var(--primary-color)';
        uploadTab.style.borderColor = 'var(--primary-color)';
        uploadTab.style.color = 'white';
        recordTab.style.background = '';
        recordTab.style.borderColor = '';
        recordTab.style.color = '#3b82f6';
        recordingControls.style.display = 'none';
        uploadControls.style.display = 'block';
      });
    }

    // File upload handling
    const voiceFileInput = document.getElementById('voice-file-input');
    const fileName = document.getElementById('file-name');

    if (voiceFileInput) {
      voiceFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.uploadedAudioFile = file;
          fileName.textContent = file.name;
          fileName.style.display = 'block';

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

    // Voice preview button
    const previewVoiceBtn = document.getElementById('preview-voice-btn');
    if (previewVoiceBtn) {
      previewVoiceBtn.addEventListener('click', () => this.toggleVoicePreview());
    }


    // Update advanced creativity slider display
    if (advCreativitySlider && creativityValue) {
      advCreativitySlider.addEventListener('input', (e) => {
        creativityValue.textContent = e.target.value;
      });
    }

    // Update agent volume slider display
    if (agentVolumeSlider && agentVolumeValue) {
      agentVolumeSlider.addEventListener('input', (e) => {
        agentVolumeValue.textContent = e.target.value;
      });
    }

    // Update ambient volume slider display
    if (ambientVolumeSlider && ambientVolumeValue) {
      ambientVolumeSlider.addEventListener('input', (e) => {
        ambientVolumeValue.textContent = e.target.value;
      });
    }

    // Auto-save on any form field change
    const formFields = form.querySelectorAll('input, select, textarea');
    formFields.forEach(field => {
      field.addEventListener('change', () => {
        // Don't trigger autoSave for transfer number fields (they have their own save logic)
        if (field.classList.contains('transfer-label') ||
            field.classList.contains('transfer-phone') ||
            field.classList.contains('transfer-passcode')) {
          return;
        }

        const isVoiceField = field.id === 'voice-id';

        // Toggle voice accent warning when language changes
        if (field.id === 'agent-language') {
          const warning = document.getElementById('language-voice-warning');
          if (warning) {
            warning.style.display = field.value !== 'en-US' ? 'block' : 'none';
          }
          this.updateTranslateGroupVisibility();
        }

        // Update translate group when owner language changes
        if (field.id === 'owner-language') {
          this.updateTranslateGroupVisibility();
        }

        // Stop preview audio when voice changes
        if (isVoiceField && this.isPreviewPlaying && this.previewAudio) {
          this.previewAudio.pause();
          this.previewAudio.currentTime = 0;
          this.isPreviewPlaying = false;
          const playIcon = document.getElementById('preview-play-icon');
          const stopIcon = document.getElementById('preview-stop-icon');
          const progressCircle = document.getElementById('preview-progress-circle');
          if (playIcon && stopIcon) {
            playIcon.style.display = 'inline';
            stopIcon.style.display = 'none';
          }
          if (progressCircle) {
            progressCircle.style.strokeDashoffset = '106.81';
          }
          if (this.previewProgressInterval) {
            clearInterval(this.previewProgressInterval);
            this.previewProgressInterval = null;
          }
        }

        this.triggerAutoSave(isVoiceField, false);
      });
      if (field.type === 'text' || field.tagName === 'TEXTAREA') {
        // Don't trigger autoSave for transfer number fields (they have their own save logic)
        if (!field.classList.contains('transfer-label') &&
            !field.classList.contains('transfer-phone') &&
            !field.classList.contains('transfer-passcode')) {
          field.addEventListener('input', () => this.triggerAutoSave());
        }
      }
    });

    // Initialize owner-language dropdown from existing translate_to value
    const ownerLangSelect = document.getElementById('owner-language');
    if (ownerLangSelect) {
      const activeConfig = this.isEditingGlobalAgent ? this.globalAgentConfig : this.config;
      const existingTranslateTo = activeConfig?.translate_to;
      if (existingTranslateTo) {
        // Handle old 'fr-en' format — extract target language
        const targetLang = existingTranslateTo.includes('-') ? existingTranslateTo.split('-').pop() : existingTranslateTo;
        ownerLangSelect.value = targetLang;
      }
      this.updateTranslateGroupVisibility();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        outbound_system_prompt: document.getElementById('adv-outbound-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        temperature: parseFloat(document.getElementById('adv-creativity').value),
        max_tokens: parseInt(document.getElementById('adv-max-response').value),
        agent_volume: parseFloat(document.getElementById('adv-agent-volume').value),
        ambient_sound: document.getElementById('adv-ambient-sound').value,
        ambient_sound_volume: parseFloat(document.getElementById('adv-ambient-volume').value),
        noise_suppression: document.getElementById('adv-noise-suppression').value,
        language: document.getElementById('agent-language').value,
        translate_to: this.computeTranslateTo(),
      };

      // Validate
      const validation = AgentConfig.validate(configData);

      if (!validation.valid) {
        showToast(validation.errors.join(', '), 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = this.isInitialSetup ? 'Setting up...' : 'Saving...';

      try {
        const { user } = await getCurrentUser();

        if (this.isInitialSetup) {
          // Create new config
          const { config, error } = await AgentConfig.create({
            user_id: user.id,
            ...configData,
          });

          if (error) throw error;

          showToast('Agent configured successfully! Redirecting...', 'success');

          setTimeout(() => {
            navigateTo('/inbox');
          }, 1500);
        } else if (this.isEditingGlobalAgent) {
          // Update global agent config
          const { data, error } = await supabase
            .from('agent_configs')
            .update({
              ...configData,
              updated_at: new Date().toISOString(),
            })
            .eq('is_global', true)
            .select()
            .single();

          if (error) throw error;

          // Update local cache
          this.globalAgentConfig = data;

          showToast('Global agent configuration saved successfully!', 'success');

          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Configuration';
        } else {
          // Update existing personal config
          const { config, error } = await AgentConfig.update(user.id, configData);

          if (error) throw error;

          showToast('Configuration saved successfully!', 'success');

          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Configuration';
        }
      } catch (error) {
        console.error('Config error:', error);
        showToast(error.message || 'Failed to save configuration. Please try again.', 'error');

        submitBtn.disabled = false;
        submitBtn.textContent = this.isInitialSetup ? 'Complete Setup' : 'Save Configuration';
      }
    });
  }

  async toggleVoicePreview() {
    const previewBtn = document.getElementById('preview-voice-btn');
    const playIcon = document.getElementById('preview-play-icon');
    const stopIcon = document.getElementById('preview-stop-icon');
    const progressCircle = document.getElementById('preview-progress-circle');

    // If already playing, stop it
    if (this.isPreviewPlaying && this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio.currentTime = 0;
      this.isPreviewPlaying = false;
      playIcon.style.display = 'inline';
      stopIcon.style.display = 'none';
      previewBtn.disabled = false;

      // Reset progress circle
      if (progressCircle) {
        progressCircle.style.strokeDashoffset = '106.81';
      }

      // Clear progress interval
      if (this.previewProgressInterval) {
        clearInterval(this.previewProgressInterval);
        this.previewProgressInterval = null;
      }

      return;
    }

    // Get selected voice
    const voiceSelect = document.getElementById('voice-id');
    const selectedVoice = voiceSelect.value;

    if (!selectedVoice) {
      return;
    }

    try {
      previewBtn.disabled = true;

      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Fetch audio from Edge Function
      const response = await fetch(`${supabaseUrl}/functions/v1/preview-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          voice_id: selectedVoice,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Preview error:', response.status, errorText);
        throw new Error(`Failed to generate voice preview: ${response.status} - ${errorText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create or reuse audio element
      if (this.previewAudio) {
        this.previewAudio.src = audioUrl;
      } else {
        this.previewAudio = new Audio(audioUrl);
      }

      // Setup audio event listeners
      this.previewAudio.onended = () => {
        this.isPreviewPlaying = false;
        playIcon.style.display = 'inline';
        stopIcon.style.display = 'none';
        previewBtn.disabled = false;
        if (progressCircle) {
          progressCircle.style.strokeDashoffset = '106.81';
        }
        if (this.previewProgressInterval) {
          clearInterval(this.previewProgressInterval);
          this.previewProgressInterval = null;
        }
        URL.revokeObjectURL(audioUrl);
      };

      this.previewAudio.onerror = () => {
        this.isPreviewPlaying = false;
        playIcon.style.display = 'inline';
        stopIcon.style.display = 'none';
        previewBtn.disabled = false;
        if (progressCircle) {
          progressCircle.style.strokeDashoffset = '106.81';
        }
        if (this.previewProgressInterval) {
          clearInterval(this.previewProgressInterval);
          this.previewProgressInterval = null;
        }
        URL.revokeObjectURL(audioUrl);
      };

      // Play audio
      await this.previewAudio.play();
      this.isPreviewPlaying = true;
      playIcon.style.display = 'none';
      stopIcon.style.display = 'inline';
      previewBtn.disabled = false;

      // Update progress circle
      const circumference = 106.81;
      this.previewProgressInterval = setInterval(() => {
        if (this.previewAudio && this.previewAudio.duration) {
          const progress = this.previewAudio.currentTime / this.previewAudio.duration;
          const offset = circumference - (progress * circumference);
          if (progressCircle) {
            progressCircle.style.strokeDashoffset = offset;
          }
        }
      }, 100);

    } catch (error) {
      console.error('Error playing voice preview:', error);
      playIcon.style.display = 'inline';
      stopIcon.style.display = 'none';
      previewBtn.disabled = false;
      if (progressCircle) {
        progressCircle.style.strokeDashoffset = '106.81';
      }
      if (this.previewProgressInterval) {
        clearInterval(this.previewProgressInterval);
        this.previewProgressInterval = null;
      }
    }
  }

  async playVoicePreview(voiceId, btn) {
    // Stop any currently playing preview
    if (this.currentPreviewAudio) {
      this.currentPreviewAudio.pause();
      this.currentPreviewAudio = null;
    }

    // Reset all buttons
    document.querySelectorAll('.voice-preview-btn').forEach(b => {
      b.classList.remove('playing');
      const playIcon = b.querySelector('.play-icon');
      const stopIcon = b.querySelector('.stop-icon');
      if (playIcon) playIcon.style.display = 'inline';
      if (stopIcon) stopIcon.style.display = 'none';
    });

    // If clicking the same button that was playing, just stop
    if (btn.classList.contains('playing')) {
      return;
    }

    // Show playing state
    btn.classList.add('playing');
    const playIcon = btn.querySelector('.play-icon');
    const stopIcon = btn.querySelector('.stop-icon');
    if (playIcon) playIcon.style.display = 'none';
    if (stopIcon) stopIcon.style.display = 'inline';

    try {
      // Fetch and play preview
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/preview-voice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ voice_id: voiceId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate voice preview');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      this.currentPreviewAudio = new Audio(audioUrl);
      this.currentPreviewAudio.onended = () => {
        btn.classList.remove('playing');
        if (playIcon) playIcon.style.display = 'inline';
        if (stopIcon) stopIcon.style.display = 'none';
        URL.revokeObjectURL(audioUrl);
      };

      this.currentPreviewAudio.onerror = () => {
        btn.classList.remove('playing');
        if (playIcon) playIcon.style.display = 'inline';
        if (stopIcon) stopIcon.style.display = 'none';
        URL.revokeObjectURL(audioUrl);
      };

      await this.currentPreviewAudio.play();
    } catch (error) {
      console.error('Error playing voice preview:', error);
      btn.classList.remove('playing');
      if (playIcon) playIcon.style.display = 'inline';
      if (stopIcon) stopIcon.style.display = 'none';
    }
  }

  async startRecording() {
    const startBtn = document.getElementById('start-recording-btn');
    const stopBtn = document.getElementById('stop-recording-btn');
    const recordingTimer = document.getElementById('recording-timer');
    const timerDisplay = document.getElementById('timer-display');

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
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      recordingTimer.style.display = 'block';

      // Start timer
      this.recordingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerDisplay.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;

        // Auto-stop at 2 minutes
        if (elapsed >= 120) {
          this.stopRecording();
        }
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      showToast('Failed to access microphone. Please allow microphone access and try again.', 'error');
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      clearInterval(this.recordingTimer);

      const startBtn = document.getElementById('start-recording-btn');
      const stopBtn = document.getElementById('stop-recording-btn');
      const recordingTimer = document.getElementById('recording-timer');

      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      recordingTimer.style.display = 'none';
    }
  }

  showAudioPreview() {
    const audioPreview = document.getElementById('audio-preview');
    const previewPlayer = document.getElementById('preview-player');
    const recordingControls = document.getElementById('recording-controls');

    // Create object URL for audio blob
    const audioUrl = URL.createObjectURL(this.audioBlob);
    previewPlayer.src = audioUrl;

    // Show preview, hide recording controls
    audioPreview.style.display = 'block';
    recordingControls.style.display = 'none';
  }

  retryRecording() {
    const audioPreview = document.getElementById('audio-preview');
    const recordingControls = document.getElementById('recording-controls');
    const timerDisplay = document.getElementById('timer-display');

    // Reset state
    this.audioBlob = null;
    this.audioChunks = [];
    timerDisplay.textContent = '0:00';

    // Hide preview, show recording controls
    audioPreview.style.display = 'none';
    recordingControls.style.display = 'block';
  }

  async submitVoiceClone() {
    const submitBtn = document.getElementById('submit-voice-btn');
    const progressContainer = document.getElementById('clone-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');

    // Check if we have either a recording or uploaded file
    if (!this.audioBlob && !this.uploadedAudioFile) {
      showToast('No audio found. Please record or upload your voice first.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Cloning voice...';
    progressContainer.style.display = 'block';

    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90; // Cap at 90% until complete
      progressBar.style.width = `${progress}%`;
      progressPercent.textContent = `${Math.floor(progress)}%`;
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
      const firstName = userName.split(' ')[0]; // Get first name

      // Create FormData - use uploaded file if available, otherwise use recorded blob
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
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';

      setTimeout(() => {
        showToast('Voice cloned successfully! Reloading...', 'success');
        progressContainer.style.display = 'none';

        // Reload page to show new voice in dropdown
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }, 500);

    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error cloning voice:', error);

      progressContainer.style.display = 'none';
      showToast(error.message || 'Failed to clone voice. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Clone Voice';
    }
  }

}