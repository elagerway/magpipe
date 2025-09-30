/**
 * Agent Configuration Page
 */

import { AgentConfig } from '../models/AgentConfig.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class AgentConfigPage {
  constructor() {
    this.isInitialSetup = false;
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
      <div class="container with-bottom-nav" style="max-width: 700px; margin-top: 4rem;">
        <div class="card">
          <!-- Avatar -->
          ${config?.avatar_url ? `
            <div style="text-align: center; margin-bottom: 2rem;">
              <img
                src="${config.avatar_url}"
                alt="Pat AI Avatar"
                style="
                  width: 120px;
                  height: 120px;
                  border-radius: 50%;
                  object-fit: cover;
                  border: 4px solid var(--primary-color);
                  box-shadow: var(--shadow-lg);
                "
              />
            </div>
          ` : ''}

          <h1 class="text-center">
            ${this.isInitialSetup ? 'Meet Pat' : 'Agent Configuration'}
          </h1>
          <p class="text-center text-muted">
            ${this.isInitialSetup
              ? "Let's set up your AI assistant. You can customize Pat's behavior and personality."
              : "Update Pat's configuration and behavior settings."
            }
          </p>

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

          <form id="config-form">
            <div class="form-group">
              <label class="form-label" for="system-prompt">
                System Prompt
                <span class="text-sm text-muted">(How Pat should behave)</span>
              </label>
              <textarea
                id="system-prompt"
                class="form-textarea"
                placeholder="e.g., You are Pat, my helpful AI assistant. Be professional and concise when answering calls and messages..."
                required
              >${config?.system_prompt || 'You are Pat, a helpful AI assistant. '}</textarea>
              <p class="form-help">This sets Pat's personality and behavior guidelines</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="voice-id">Voice</label>
              <select id="voice-id" class="form-select">
                <option value="kate" ${config?.voice_id === 'kate' ? 'selected' : ''}>Kate (Default)</option>
                <option value="alloy" ${config?.voice_id === 'alloy' ? 'selected' : ''}>Alloy</option>
                <option value="nova" ${config?.voice_id === 'nova' ? 'selected' : ''}>Nova</option>
                <option value="shimmer" ${config?.voice_id === 'shimmer' ? 'selected' : ''}>Shimmer</option>
                <option value="echo" ${config?.voice_id === 'echo' ? 'selected' : ''}>Echo</option>
                <option value="fable" ${config?.voice_id === 'fable' ? 'selected' : ''}>Fable</option>
              </select>
              <p class="form-help">Select the voice for phone calls</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="response-style">Response Style</label>
              <select id="response-style" class="form-select">
                <option value="professional" ${config?.response_style === 'professional' ? 'selected' : ''}>Professional</option>
                <option value="friendly" ${config?.response_style === 'friendly' ? 'selected' : ''}>Friendly</option>
                <option value="casual" ${config?.response_style === 'casual' ? 'selected' : ''}>Casual</option>
                <option value="formal" ${config?.response_style === 'formal' ? 'selected' : ''}>Formal</option>
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

            <div class="form-group">
              <label class="form-label" for="temperature">
                Creativity Level
                <span class="text-sm text-muted">(0 = focused, 1 = creative)</span>
              </label>
              <input
                type="range"
                id="temperature"
                min="0"
                max="1"
                step="0.1"
                value="${config?.temperature || 0.7}"
                style="width: 100%;"
              />
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);">
                <span>Focused</span>
                <span id="temperature-value">${config?.temperature || 0.7}</span>
                <span>Creative</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="max-tokens">Max Response Length</label>
              <input
                type="number"
                id="max-tokens"
                class="form-input"
                value="${config?.max_tokens || 150}"
                min="50"
                max="500"
                step="10"
              />
              <p class="form-help">Maximum words in AI responses (50-500)</p>
            </div>

            <button type="submit" class="btn btn-primary btn-full" id="submit-btn">
              ${this.isInitialSetup ? 'Complete Setup' : 'Save Configuration'}
            </button>

            ${!this.isInitialSetup
              ? `
              <button type="button" class="btn btn-secondary btn-full mt-2" onclick="navigateTo('/dashboard')">
                Cancel
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

  attachEventListeners() {
    const form = document.getElementById('config-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    const fetchAvatarBtn = document.getElementById('fetch-avatar-btn');

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

    // Update temperature display
    temperatureSlider.addEventListener('input', (e) => {
      temperatureValue.textContent = e.target.value;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const configData = {
        system_prompt: document.getElementById('system-prompt').value,
        voice_id: document.getElementById('voice-id').value,
        response_style: document.getElementById('response-style').value,
        vetting_strategy: document.getElementById('vetting-strategy').value,
        transfer_unknown_callers: document.getElementById('transfer-unknown').checked,
        temperature: parseFloat(document.getElementById('temperature').value),
        max_tokens: parseInt(document.getElementById('max-tokens').value),
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