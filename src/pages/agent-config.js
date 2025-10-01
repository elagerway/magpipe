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

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 700px; margin: 0 auto; padding: 2rem 0 0 0;">
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

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

          <form id="config-form" style="margin-bottom: 0;">
            <div class="form-group">
              <label class="form-label" for="voice-id">Voice</label>
              <select id="voice-id" class="form-select">
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
              <p class="form-help">Select the voice for phone calls</p>
            </div>

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
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                  <input
                    type="checkbox"
                    id="transfer-unknown"
                    ${config?.transfer_unknown_callers ? 'checked' : ''}
                  />
                  <span class="form-label" style="margin: 0;">
                    Transfer unknown callers after vetting
                  </span>
                </label>
                <p class="form-help">After vetting, transfer the call to you instead of handling with AI</p>
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

    this.attachEventListeners();
  }

  async autoSave(voiceChanged = false) {
    if (this.isInitialSetup) return; // Don't auto-save during initial setup

    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');

    try {
      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        transfer_unknown_callers: document.getElementById('transfer-unknown').checked,
        temperature: parseFloat(document.getElementById('adv-creativity').value),
        max_tokens: parseInt(document.getElementById('adv-max-response').value),
        agent_volume: parseFloat(document.getElementById('adv-agent-volume').value),
        ambient_sound: document.getElementById('adv-ambient-sound').value,
        ambient_sound_volume: parseFloat(document.getElementById('adv-ambient-volume').value),
        noise_suppression: document.getElementById('adv-noise-suppression').value,
      };

      const { user } = await getCurrentUser();
      const { config, error } = await AgentConfig.update(user.id, configData);

      if (error) throw error;

      // If voice changed, fetch new avatar
      if (voiceChanged) {
        successMessage.className = 'alert alert-info';
        successMessage.textContent = 'Updating avatar...';

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
          successMessage.textContent = 'Saved & avatar updated';
          // Reload page after a short delay to show new avatar
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }
      }

      successMessage.className = 'alert alert-success';
      successMessage.textContent = 'Saved';
      setTimeout(() => {
        successMessage.classList.add('hidden');
      }, 2000);
    } catch (error) {
      console.error('Auto-save error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to save';
      setTimeout(() => {
        errorMessage.classList.add('hidden');
      }, 3000);
    }
  }

  triggerAutoSave(voiceChanged = false) {
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.autoSave(voiceChanged);
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
                }
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
        const isVoiceField = field.id === 'voice-id';
        this.triggerAutoSave(isVoiceField);
      });
      if (field.type === 'text' || field.tagName === 'TEXTAREA') {
        field.addEventListener('input', () => this.triggerAutoSave());
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const configData = {
        system_prompt: document.getElementById('adv-system-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        transfer_unknown_callers: document.getElementById('transfer-unknown').checked,
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
}