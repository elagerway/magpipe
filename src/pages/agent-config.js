/**
 * Agent Configuration Page
 */

import { AgentConfig } from '../models/AgentConfig.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

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
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Check if this is initial setup or editing existing config
    const { config } = await AgentConfig.getByUserId(user.id);
    this.isInitialSetup = !config;

    // Load cloned voices from voices table
    const { data: clonedVoices } = await supabase
      .from('voices')
      .select('voice_id, voice_name')
      .eq('user_id', user.id)
      .eq('is_cloned', true)
      .order('created_at', { ascending: false });

    // Check active voice stack to determine if voice cloning is available
    const isLiveKitActive = config?.active_voice_stack === 'livekit';

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 700px; margin: 0 auto; padding-top: 0; padding-bottom: 0;">
        <div class="card agent-config-card" style="padding-bottom: 0; margin-bottom: 0;">
          <!-- Avatar -->
          ${config?.avatar_url ? `
            <div style="text-align: center; margin-bottom: 0.5rem;">
              <img
                src="${config.avatar_url}"
                alt="Pat AI Avatar"
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
            ${this.isInitialSetup ? 'Meet Pat' : 'Agent Configuration'}
          </h1>
          ${this.isInitialSetup ? `
            <p class="text-center text-muted" style="margin-bottom: 0.75rem; font-size: 0.875rem;">
              Let's set up your AI assistant. You can customize Pat's behavior and personality.
            </p>
          ` : ''}

          <div id="error-message" class="hidden" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; min-width: 200px; text-align: center; font-size: 0.8rem; padding: 0.4rem 0.8rem; border-left: none;"></div>
          <div id="success-message" class="hidden" style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 9999; min-width: 200px; text-align: center; font-size: 0.8rem; padding: 0.4rem 0.8rem; border-left: none;"></div>

          <form id="config-form" style="margin-bottom: 0;">
            <div class="form-group">
              <label class="form-label" for="voice-id">Voice</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <select id="voice-id" class="form-select" style="flex: 1;">
                ${clonedVoices && clonedVoices.length > 0 ? `
                  <optgroup label="Your Cloned Voices">
                    ${clonedVoices.map(voice => `
                      <option value="11labs-${voice.voice_id}" ${config?.voice_id === '11labs-' + voice.voice_id ? 'selected' : ''}>${voice.voice_name}</option>
                    `).join('')}
                  </optgroup>
                ` : ''}
                <optgroup label="ElevenLabs Voices">
                  <option value="11labs-Kate" ${config?.voice_id === '11labs-Kate' ? 'selected' : ''}>Kate (Default)</option>
                  <option value="11labs-Adrian" ${config?.voice_id === '11labs-Adrian' ? 'selected' : ''}>Adrian</option>
                  <option value="11labs-Alice" ${config?.voice_id === '11labs-Alice' ? 'selected' : ''}>Alice</option>
                  <option value="11labs-Aria" ${config?.voice_id === '11labs-Aria' ? 'selected' : ''}>Aria</option>
                  <option value="11labs-Bill" ${config?.voice_id === '11labs-Bill' ? 'selected' : ''}>Bill</option>
                  <option value="11labs-Brian" ${config?.voice_id === '11labs-Brian' ? 'selected' : ''}>Brian</option>
                  <option value="11labs-Callum" ${config?.voice_id === '11labs-Callum' ? 'selected' : ''}>Callum</option>
                  <option value="11labs-Charlie" ${config?.voice_id === '11labs-Charlie' ? 'selected' : ''}>Charlie</option>
                  <option value="11labs-Charlotte" ${config?.voice_id === '11labs-Charlotte' ? 'selected' : ''}>Charlotte</option>
                  <option value="11labs-Chris" ${config?.voice_id === '11labs-Chris' ? 'selected' : ''}>Chris</option>
                  <option value="11labs-Daniel" ${config?.voice_id === '11labs-Daniel' ? 'selected' : ''}>Daniel</option>
                  <option value="11labs-Eric" ${config?.voice_id === '11labs-Eric' ? 'selected' : ''}>Eric</option>
                  <option value="11labs-George" ${config?.voice_id === '11labs-George' ? 'selected' : ''}>George</option>
                  <option value="11labs-Jessica" ${config?.voice_id === '11labs-Jessica' ? 'selected' : ''}>Jessica</option>
                  <option value="11labs-Laura" ${config?.voice_id === '11labs-Laura' ? 'selected' : ''}>Laura</option>
                  <option value="11labs-Liam" ${config?.voice_id === '11labs-Liam' ? 'selected' : ''}>Liam</option>
                  <option value="11labs-Lily" ${config?.voice_id === '11labs-Lily' ? 'selected' : ''}>Lily</option>
                  <option value="11labs-Matilda" ${config?.voice_id === '11labs-Matilda' ? 'selected' : ''}>Matilda</option>
                  <option value="11labs-River" ${config?.voice_id === '11labs-River' ? 'selected' : ''}>River</option>
                  <option value="11labs-Roger" ${config?.voice_id === '11labs-Roger' ? 'selected' : ''}>Roger</option>
                  <option value="11labs-Sarah" ${config?.voice_id === '11labs-Sarah' ? 'selected' : ''}>Sarah</option>
                  <option value="11labs-Will" ${config?.voice_id === '11labs-Will' ? 'selected' : ''}>Will</option>
                </optgroup>
                <optgroup label="OpenAI Voices">
                  <option value="openai-alloy" ${config?.voice_id === 'openai-alloy' ? 'selected' : ''}>Alloy</option>
                  <option value="openai-echo" ${config?.voice_id === 'openai-echo' ? 'selected' : ''}>Echo</option>
                  <option value="openai-fable" ${config?.voice_id === 'openai-fable' ? 'selected' : ''}>Fable</option>
                  <option value="openai-nova" ${config?.voice_id === 'openai-nova' ? 'selected' : ''}>Nova</option>
                  <option value="openai-onyx" ${config?.voice_id === 'openai-onyx' ? 'selected' : ''}>Onyx</option>
                  <option value="openai-shimmer" ${config?.voice_id === 'openai-shimmer' ? 'selected' : ''}>Shimmer</option>
                </optgroup>
              </select>
              <div style="position: relative; flex-shrink: 0; width: 38px; height: 38px;">
                <!-- Circular progress ring -->
                <svg width="38" height="38" style="position: absolute; top: 0; left: 0; transform: rotate(-90deg); pointer-events: none;">
                  <circle
                    cx="19"
                    cy="19"
                    r="17"
                    fill="none"
                    stroke="#e5e7eb"
                    stroke-width="2"
                  />
                  <circle
                    id="preview-progress-circle"
                    cx="19"
                    cy="19"
                    r="17"
                    fill="none"
                    stroke="var(--primary-color)"
                    stroke-width="2"
                    stroke-dasharray="106.81"
                    stroke-dashoffset="106.81"
                    stroke-linecap="round"
                    style="transition: stroke-dashoffset 0.1s linear;"
                  />
                </svg>
                <button type="button" id="preview-voice-btn" style="background: none; border: none; padding: 0; cursor: pointer; color: var(--text-color); display: flex; align-items: center; justify-content: center; width: 38px; height: 38px;">
                  <svg id="preview-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <svg id="preview-stop-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display: none;">
                    <rect x="6" y="6" width="12" height="12"></rect>
                  </svg>
                </button>
              </div>
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

                <div id="voice-clone-status" class="hidden" style="margin-bottom: 1rem;"></div>

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
                <option value="casual" ${!config?.response_style || config?.response_style === 'casual' ? 'selected' : ''}>Casual</option>
                <option value="formal" ${config?.response_style === 'formal' ? 'selected' : ''}>Formal</option>
                <option value="friendly" ${config?.response_style === 'friendly' ? 'selected' : ''}>Friendly</option>
                <option value="professional" ${config?.response_style === 'professional' ? 'selected' : ''}>Professional</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="vetting-strategy">Unknown Caller Vetting</label>
              <select id="vetting-strategy" class="form-select">
                <option value="name-and-purpose" ${config?.vetting_strategy === 'name-and-purpose' ? 'selected' : ''}>
                  Name and Purpose (Recommended)
                </option>
                <option value="strict" ${config?.vetting_strategy === 'strict' ? 'selected' : ''}>
                  Strict (More questions)
                </option>
                <option value="lenient" ${config?.vetting_strategy === 'lenient' ? 'selected' : ''}>
                  Lenient (Basic screening)
                </option>
              </select>
              <p class="form-help">How Pat should screen unknown callers</p>
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
                <label class="form-label" for="adv-system-prompt">Custom System Prompt</label>
                <textarea
                  id="adv-system-prompt"
                  class="form-textarea"
                  rows="4"
                  placeholder="Override the default system prompt with your own..."
                >${config?.system_prompt || ''}</textarea>
                <p class="form-help">Full control over Pat's behavior instructions</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-creativity">
                  Creativity Level (Temperature)
                  <span class="text-sm text-muted" id="creativity-value">${config?.temperature || 0.7}</span>
                </label>
                <input
                  type="range"
                  id="adv-creativity"
                  min="0"
                  max="1"
                  step="0.1"
                  value="${config?.temperature || 0.7}"
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
                  value="${config?.max_tokens || 150}"
                  min="50"
                  max="1000"
                />
                <p class="form-help">Maximum length of AI responses</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-agent-volume">
                  Agent Volume
                  <span class="text-sm text-muted" id="agent-volume-value">${config?.agent_volume || 1.0}</span>
                </label>
                <input
                  type="range"
                  id="adv-agent-volume"
                  min="0"
                  max="2"
                  step="0.1"
                  value="${config?.agent_volume || 1.0}"
                  style="width: 100%;"
                />
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);">
                  <span>Quiet (0)</span>
                  <span>Normal (1.0)</span>
                  <span>Loud (2.0)</span>
                </div>
                <p class="form-help">Adjust Pat's voice volume</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-ambient-sound">Ambient Sound</label>
                <select id="adv-ambient-sound" class="form-select">
                  <option value="off" ${!config?.ambient_sound || config?.ambient_sound === 'off' ? 'selected' : ''}>Off (Default)</option>
                  <option value="coffee-shop" ${config?.ambient_sound === 'coffee-shop' ? 'selected' : ''}>Coffee Shop</option>
                  <option value="convention-hall" ${config?.ambient_sound === 'convention-hall' ? 'selected' : ''}>Convention Hall</option>
                  <option value="summer-outdoor" ${config?.ambient_sound === 'summer-outdoor' ? 'selected' : ''}>Summer Outdoor</option>
                  <option value="mountain-outdoor" ${config?.ambient_sound === 'mountain-outdoor' ? 'selected' : ''}>Mountain Outdoor</option>
                  <option value="high-school-hallway" ${config?.ambient_sound === 'high-school-hallway' ? 'selected' : ''}>School Hallway</option>
                </select>
                <p class="form-help">Add background ambience to phone calls</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adv-ambient-volume">
                  Ambient Sound Volume
                  <span class="text-sm text-muted" id="ambient-volume-value">${config?.ambient_sound_volume || 1.0}</span>
                </label>
                <input
                  type="range"
                  id="adv-ambient-volume"
                  min="0"
                  max="2"
                  step="0.1"
                  value="${config?.ambient_sound_volume || 1.0}"
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
                  <option value="high" ${config?.noise_suppression === 'high' ? 'selected' : ''}>High</option>
                  <option value="medium" ${config?.noise_suppression === 'medium' ? 'selected' : 'selected'}>Medium (Default)</option>
                  <option value="low" ${config?.noise_suppression === 'low' ? 'selected' : ''}>Low</option>
                  <option value="off" ${config?.noise_suppression === 'off' ? 'selected' : ''}>Off</option>
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
      ${renderBottomNav('/agent-config')}
    `;

    await this.loadTransferNumbers();
    this.renderTransferNumbers();
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

    // Update Retell transfer tools
    await this.updateRetellTransferTools();

    // Show deleted message
    const successMessage = document.getElementById('success-message');
    if (successMessage) {
      successMessage.className = 'alert';
      successMessage.classList.remove('hidden');
      successMessage.style.backgroundColor = '#fee2e2';
      successMessage.style.color = '#991b1b';
      successMessage.textContent = 'Deleted';
      setTimeout(() => {
        successMessage.classList.add('hidden');
        successMessage.style.backgroundColor = '';
        successMessage.style.color = '';
      }, 2000);
    }
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
        const successMessage = document.getElementById('success-message');
        if (successMessage) {
          // Clear any pending timeout to prevent "Saved" from showing
          clearTimeout(this.successMessageTimeout);

          successMessage.className = 'alert';
          successMessage.classList.remove('hidden');
          successMessage.style.backgroundColor = '#fee2e2';
          successMessage.style.color = '#991b1b';
          successMessage.style.borderColor = '#fecaca';
          successMessage.textContent = 'Both label and phone number are required for a transfer';

          this.successMessageTimeout = setTimeout(() => {
            successMessage.classList.add('hidden');
            successMessage.style.backgroundColor = '';
            successMessage.style.color = '';
            successMessage.style.borderColor = '';
          }, 3000);
        }
      }
      return;
    }

    const { user } = await getCurrentUser();

    // Get agent config for agent_id and llm_id
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('retell_agent_id, retell_llm_id')
      .eq('user_id', user.id)
      .single();

    if (transfer.id) {
      // Update existing
      await supabase
        .from('transfer_numbers')
        .update({
          label: transfer.label,
          phone_number: transfer.phone_number,
          transfer_secret: transfer.transfer_secret || null,
          agent_id: agentConfig?.retell_agent_id,
          llm_id: agentConfig?.retell_llm_id,
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
          agent_id: agentConfig?.retell_agent_id,
          llm_id: agentConfig?.retell_llm_id,
        })
        .select()
        .single();

      if (!error && data) {
        this.transferNumbers[index].id = data.id;
      }
    }

    // Update Retell transfer tools
    await this.updateRetellTransferTools();

    // Show success message
    const successMessage = document.getElementById('success-message');
    if (successMessage) {
      // Clear any pending timeout
      clearTimeout(this.successMessageTimeout);

      successMessage.className = 'alert alert-success';
      successMessage.classList.remove('hidden');
      successMessage.style.backgroundColor = '#d1fae5';
      successMessage.style.color = '#065f46';
      successMessage.style.borderColor = '#6ee7b7';
      successMessage.textContent = 'Saved';

      this.successMessageTimeout = setTimeout(() => {
        successMessage.classList.add('hidden');
        successMessage.style.backgroundColor = '';
        successMessage.style.color = '';
        successMessage.style.borderColor = '';
      }, 2000);
    }
  }

  async updateRetellTransferTools() {
    console.log('Updating Retell transfer tools...');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${supabaseUrl}/functions/v1/update-retell-transfer-tool`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    console.log('Update Retell transfer tools result:', result);

    if (!response.ok) {
      console.error('Failed to update transfer tools:', result);
    }
  }

  async autoSave(voiceChanged = false, transferChanged = false, promptChanged = false) {
    if (this.isInitialSetup) return; // Don't auto-save during initial setup

    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');

    try {
      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        temperature: parseFloat(document.getElementById('adv-creativity').value),
        max_tokens: parseInt(document.getElementById('adv-max-response').value),
        agent_volume: parseFloat(document.getElementById('adv-agent-volume').value),
        ambient_sound: document.getElementById('adv-ambient-sound').value,
        ambient_sound_volume: parseFloat(document.getElementById('adv-ambient-volume').value),
        noise_suppression: document.getElementById('adv-noise-suppression').value,
      };

      const { user } = await getCurrentUser();

      // Get current config to check for changes
      const { data: currentConfig } = await supabase
        .from('agent_configs')
        .select('system_prompt, retell_llm_id, retell_agent_id, temperature, max_tokens, agent_volume, ambient_sound, ambient_sound_volume, noise_suppression')
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

      // If system prompt or LLM settings changed, update Retell LLM
      const llmSettingsChanged = promptChanged ||
        (currentConfig && (
          currentConfig.temperature !== configData.temperature ||
          currentConfig.max_tokens !== configData.max_tokens
        ));

      if (currentConfig?.retell_llm_id && (promptChanged || llmSettingsChanged)) {
        const retellApiKey = 'key_0a5961a05d130a9ba00d5766f081';

        const llmUpdatePayload = {};

        if (promptChanged) {
          llmUpdatePayload.general_prompt = configData.system_prompt;
        }

        // Always update temperature and max_tokens if settings changed
        if (llmSettingsChanged) {
          llmUpdatePayload.temperature = configData.temperature;
          llmUpdatePayload.max_tokens = configData.max_tokens;
        }

        const llmResponse = await fetch(
          `https://api.retellai.com/update-retell-llm/${currentConfig.retell_llm_id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(llmUpdatePayload),
          }
        );

        if (!llmResponse.ok) {
          console.error('Failed to update Retell LLM settings');
        } else {
          console.log('Retell LLM settings updated successfully');
        }
      }

      // If transfer settings changed, update Retell transfer tool
      if (transferChanged) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();

        await fetch(`${supabaseUrl}/functions/v1/update-retell-transfer-tool`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      // If voice or agent settings changed, update Retell agent directly
      if (voiceChanged || agentSettingsChanged) {
        if (voiceChanged) {
          successMessage.className = 'alert alert-info';
          successMessage.classList.remove('hidden');
          successMessage.textContent = 'Updating voice...';
        }

        const retellApiKey = 'key_0a5961a05d130a9ba00d5766f081'; // Retell API key

        if (currentConfig?.retell_agent_id) {
          // Update Retell agent with new settings
          const updatePayload = {};

          // Add voice if changed
          if (voiceChanged) {
            updatePayload.voice_id = configData.voice_id;
          }

          // Add ambient sound settings
          if (configData.ambient_sound && configData.ambient_sound !== 'off') {
            updatePayload.ambient_sound = configData.ambient_sound;
            if (configData.ambient_sound_volume) {
              updatePayload.ambient_sound_volume = configData.ambient_sound_volume;
            }
          } else {
            updatePayload.ambient_sound = null;
          }

          // Add other settings
          if (configData.agent_volume) {
            updatePayload.agent_volume = configData.agent_volume;
          }
          if (configData.noise_suppression) {
            updatePayload.enable_backchannel = configData.noise_suppression === 'enabled';
          }
          if (configData.temperature) {
            updatePayload.responsiveness = configData.temperature;
          }

          console.log('Updating Retell agent:', currentConfig.retell_agent_id);
          console.log('Update payload:', updatePayload);
          console.log('Request URL:', `https://api.retellai.com/update-agent/${currentConfig.retell_agent_id}`);

          // Try updating the agent first
          let retellResponse = await fetch(
            `https://api.retellai.com/update-agent/${currentConfig.retell_agent_id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${retellApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updatePayload),
            }
          );

          console.log('Agent update response status:', retellResponse.status);
          console.log('Agent update response headers:', Object.fromEntries(retellResponse.headers.entries()));

          const responseText = await retellResponse.text();
          console.log('Agent update response body:', responseText);

          // Store logs in localStorage so they persist across page reload
          const logEntry = {
            timestamp: new Date().toISOString(),
            status: retellResponse.status,
            url: `https://api.retellai.com/update-agent/${currentConfig.retell_agent_id}`,
            payload: updatePayload,
            response: responseText,
            headers: Object.fromEntries(retellResponse.headers.entries())
          };

          const existingLogs = JSON.parse(localStorage.getItem('retell_update_logs') || '[]');
          existingLogs.unshift(logEntry);
          localStorage.setItem('retell_update_logs', JSON.stringify(existingLogs.slice(0, 10))); // Keep last 10
          console.log('✅ LOG SAVED TO localStorage.retell_update_logs');

          if (!retellResponse.ok && retellResponse.status !== 404) {
            // Only fail on non-404 errors
            console.error('Failed to update Retell agent. Status:', retellResponse.status);
            console.error('Response:', responseText);
            console.error('Agent ID was:', currentConfig.retell_agent_id);
            errorMessage.className = 'alert alert-error';
            errorMessage.classList.remove('hidden');
            errorMessage.textContent = 'Failed to update voice settings';
            setTimeout(() => {
              errorMessage.classList.add('hidden');
            }, 3000);
            return;
          }

          if (retellResponse.ok) {
            console.log('Retell agent updated successfully');
            console.log('Update response:', responseText);
          } else {
            console.log('Agent update returned non-OK status');
            console.log('Voice change saved to database, will be used for calls');
          }
        }

        // Fetch new avatar
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
          successMessage.className = 'alert alert-success';
          successMessage.classList.remove('hidden');
          successMessage.style.backgroundColor = '#d1fae5';
          successMessage.style.color = '#065f46';
          successMessage.style.borderColor = '#6ee7b7';
          successMessage.textContent = 'Voice updated successfully';
          // Reload page after a short delay to show new avatar
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }
      }

      // Don't show "Saved" message for transfer-only changes (transfers have their own validation)
      if (!transferChanged || voiceChanged) {
        successMessage.className = 'alert alert-success';
        successMessage.classList.remove('hidden');
        successMessage.style.backgroundColor = '#d1fae5';
        successMessage.style.color = '#065f46';
        successMessage.style.borderColor = '#6ee7b7';
        successMessage.textContent = 'Saved';
        setTimeout(() => {
          successMessage.classList.add('hidden');
          successMessage.style.backgroundColor = '';
          successMessage.style.color = '';
          successMessage.style.borderColor = '';
        }, 2000);
      }
    } catch (error) {
      console.error('Auto-save error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.classList.remove('hidden');
      errorMessage.textContent = error.message || 'Failed to save';
      setTimeout(() => {
        errorMessage.classList.add('hidden');
      }, 3000);
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
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
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

    // Fetch avatar button (also creates agent if doesn't exist)
    if (fetchAvatarBtn) {
      fetchAvatarBtn.addEventListener('click', async () => {
        fetchAvatarBtn.disabled = true;
        fetchAvatarBtn.textContent = 'Setting up...';
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');

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
          if (!existingConfig || !existingConfig.retell_agent_id) {
            successMessage.className = 'alert alert-info';
            successMessage.textContent = 'Creating your AI assistant...';

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

            // Get voice stack preference from localStorage (set during signup)
            const voiceStack = localStorage.getItem('voice_stack_preference') || 'retell';

            const createResponse = await fetch(`${supabaseUrl}/functions/v1/create-retell-agent`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                agentConfig: {
                  name: 'Pat AI Assistant',
                  voice_id: '11labs-Kate',
                  prompt: defaultPrompt,
                },
                voiceStack: voiceStack,
              }),
            });

            if (!createResponse.ok) {
              const error = await createResponse.json();
              throw new Error(error.error || 'Failed to create assistant');
            }

            const createResult = await createResponse.json();
            console.log('Agent created:', createResult);

            successMessage.className = 'alert alert-success';
            successMessage.textContent = 'Assistant created with avatar! Reloading...';
          } else if (!existingConfig.avatar_url && existingConfig.voice_id) {
            // Agent exists but missing avatar - fetch it
            successMessage.className = 'alert alert-info';
            successMessage.textContent = 'Fetching avatar...';

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

            successMessage.className = 'alert alert-success';
            successMessage.textContent = 'Avatar fetched! Reloading...';
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
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = error.message || 'Failed to set up assistant. Please try again.';
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

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        temperature: parseFloat(document.getElementById('adv-creativity').value),
        max_tokens: parseInt(document.getElementById('adv-max-response').value),
        agent_volume: parseFloat(document.getElementById('adv-agent-volume').value),
        ambient_sound: document.getElementById('adv-ambient-sound').value,
        ambient_sound_volume: parseFloat(document.getElementById('adv-ambient-volume').value),
        noise_suppression: document.getElementById('adv-noise-suppression').value,
      };

      // Validate
      const validation = AgentConfig.validate(configData);

      if (!validation.valid) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = validation.errors.join(', ');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = this.isInitialSetup ? 'Setting up...' : 'Saving...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        const { user } = await getCurrentUser();

        if (this.isInitialSetup) {
          // Create new config
          const { config, error } = await AgentConfig.create({
            user_id: user.id,
            ...configData,
          });

          if (error) throw error;

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Agent configured successfully! Redirecting...';

          setTimeout(() => {
            navigateTo('/dashboard');
          }, 1500);
        } else {
          // Update existing config
          const { config, error } = await AgentConfig.update(user.id, configData);

          if (error) throw error;

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Configuration saved successfully!';

          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Configuration';
        }
      } catch (error) {
        console.error('Config error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to save configuration. Please try again.';

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
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      recordingTimer.style.display = 'block';
      statusDiv.classList.add('hidden');

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
      statusDiv.className = 'alert alert-error';
      statusDiv.textContent = 'Failed to access microphone. Please allow microphone access and try again.';
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
    const statusDiv = document.getElementById('voice-clone-status');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const progressContainer = document.getElementById('clone-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');

    // Check if we have either a recording or uploaded file
    if (!this.audioBlob && !this.uploadedAudioFile) {
      statusDiv.className = 'alert alert-error';
      statusDiv.textContent = 'No audio found. Please record or upload your voice first.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Cloning voice...';
    statusDiv.classList.add('hidden');
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
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Voice cloned successfully! Reloading...';
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
      statusDiv.className = 'alert alert-error';
      statusDiv.textContent = error.message || 'Failed to clone voice. Please try again.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Clone Voice';
    }
  }

  async updateRetellTransferTool() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/update-retell-transfer-tool`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update transfer tool:', error);
        return;
      }

      const result = await response.json();
      console.log('Transfer tool updated:', result);
    } catch (error) {
      console.error('Error updating transfer tool:', error);
    }
  }

}