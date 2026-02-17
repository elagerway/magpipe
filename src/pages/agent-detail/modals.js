import { getCurrentUser, supabase } from '../../lib/supabase.js';

export const ELEVENLABS_VOICES = [
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

export const OPENAI_VOICES = [
  { id: 'openai-alloy', name: 'Alloy', accent: 'Neutral', gender: 'Neutral', description: 'Balanced' },
  { id: 'openai-echo', name: 'Echo', accent: 'Neutral', gender: 'Male', description: 'Clear' },
  { id: 'openai-fable', name: 'Fable', accent: 'British', gender: 'Male', description: 'Expressive' },
  { id: 'openai-nova', name: 'Nova', accent: 'American', gender: 'Female', description: 'Energetic' },
  { id: 'openai-onyx', name: 'Onyx', accent: 'American', gender: 'Male', description: 'Deep' },
  { id: 'openai-shimmer', name: 'Shimmer', accent: 'American', gender: 'Female', description: 'Warm' },
];

export const modalsMethods = {
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
  },

  selectVoice(voiceId) {
    this.agent.voice_id = voiceId;
    this.scheduleAutoSave({ voice_id: voiceId });

    // Update display
    const display = document.querySelector('.voice-current');
    if (display) {
      display.textContent = this.getVoiceDisplayName(voiceId);
    }
  },

  /**
   * Generate prompt from identity fields based on agent type
   */
  generatePromptForType(agentType) {
    const agentName = this.agent.name || 'Assistant';
    const organization = this.agent.organization_name || '';
    const owner = this.agent.owner_name || '';
    const role = this.agent.agent_role || '';

    // Build the identity prefix
    let identityPrefix = '';
    if (role) {
      identityPrefix = role + '\n\n';
    } else {
      identityPrefix = `You are ${agentName}`;
      if (organization) {
        identityPrefix += `, a professional AI assistant for ${organization}`;
      }
      if (owner) {
        identityPrefix += `. You work on behalf of ${owner}`;
      }
      identityPrefix += '.\n\n';
    }

    switch (agentType) {
      case 'inbound_voice': {
        let prompt = identityPrefix;
        prompt += `When someone calls:\n`;
        prompt += `1. Greet them warmly and introduce yourself as ${agentName}`;
        if (organization) prompt += ` from ${organization}`;
        prompt += `\n`;
        prompt += `2. Ask for their name and the purpose of their call\n`;
        prompt += `3. Be helpful, professional, and courteous\n`;
        if (owner) {
          prompt += `\nYou are answering calls on behalf of ${owner}. `;
          prompt += `Offer to take a message, transfer the call, or schedule a callback as appropriate.`;
        }
        return prompt;
      }

      case 'outbound_voice': {
        let prompt = '';
        if (role) {
          prompt = role + '\n\n';
        } else {
          prompt = `You are ${agentName}`;
          if (organization) prompt += `, a professional AI assistant for ${organization}`;
          if (owner) prompt += `, making calls on behalf of ${owner}`;
          prompt += '.\n\n';
        }
        prompt += `THIS IS AN OUTBOUND CALL - you called them, they did not call you.\n\n`;
        prompt += `When the call is answered:\n`;
        prompt += `1. Introduce yourself: "Hi, this is ${agentName}`;
        if (organization) prompt += ` from ${organization}`;
        if (owner) prompt += ` calling on behalf of ${owner}`;
        prompt += `"\n`;
        prompt += `2. Clearly state the purpose of your call\n`;
        prompt += `3. Be respectful of their time\n\n`;
        prompt += `If you reach voicemail, leave a clear message with who you are and how to reach back.`;
        return prompt;
      }

      case 'text': {
        let prompt = identityPrefix;
        prompt += `You handle SMS and text message conversations.\n\n`;
        prompt += `Guidelines:\n`;
        prompt += `- Keep responses concise and mobile-friendly (1-3 sentences)\n`;
        prompt += `- Use a warm, conversational tone\n`;
        prompt += `- Ask for the contact's name if unknown\n`;
        if (owner) prompt += `- Offer to connect them with ${owner} for complex matters\n`;
        prompt += `- Never send sensitive information via text`;
        return prompt;
      }

      case 'email': {
        let prompt = identityPrefix;
        prompt += `You draft and respond to emails.\n\n`;
        prompt += `Guidelines:\n`;
        prompt += `- Use proper email formatting with greeting, body, and sign-off\n`;
        prompt += `- Match the formality level of the incoming email\n`;
        prompt += `- Be thorough but concise\n`;
        prompt += `- Include relevant details and next steps\n`;
        if (owner) prompt += `- Sign emails as "${owner}'s Assistant" unless instructed otherwise\n`;
        prompt += `- Flag urgent matters for personal attention`;
        return prompt;
      }

      case 'chat_widget': {
        let prompt = identityPrefix;
        prompt += `You help website visitors with questions and guide them to the right resources.\n\n`;
        prompt += `Guidelines:\n`;
        prompt += `- Respond quickly and concisely\n`;
        prompt += `- Be friendly and professional\n`;
        prompt += `- Share relevant links when available\n`;
        prompt += `- Collect visitor name and email for follow-up\n`;
        if (owner) prompt += `- Offer to connect visitors with ${owner} for complex inquiries\n`;
        prompt += `- Focus on being genuinely helpful`;
        return prompt;
      }

      default:
        return identityPrefix;
    }
  },

  /**
   * Regenerate prompt from identity fields (single prompt)
   */
  regeneratePrompts() {
    const prompt = this.generatePromptForType(this.agent.agent_type || 'inbound_voice');

    // Update local state
    this.agent.system_prompt = prompt;

    // Update UI if on prompt tab
    const systemPromptEl = document.getElementById('system-prompt');
    if (systemPromptEl) systemPromptEl.value = prompt;

    // Save to database
    this.scheduleAutoSave({ system_prompt: prompt });
  },

  /**
   * Called when identity fields change - optionally auto-regenerate prompt
   */
  onIdentityFieldChange(field, value) {
    // Update local state and save
    this.agent[field] = value;
    this.scheduleAutoSave({ [field]: value });

    // If prompt is empty or user hasn't customized it much, auto-regenerate
    const hasCustomPrompt = this.agent.system_prompt && this.agent.system_prompt.length > 100;
    if (!hasCustomPrompt) {
      this.regeneratePrompts();
    }
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  cleanup() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
    }
  },
};
