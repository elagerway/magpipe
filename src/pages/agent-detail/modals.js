import { getCurrentUser, supabase } from '../../lib/supabase.js';

const AVATAR_BASE = 'https://api.magpipe.ai/storage/v1/object/public/public/avatars/voices';

export const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American', gender: 'Female', age: 'Young', tone: 'Calm', use: 'Conversational', langs: 'French, German, Spanish, Dutch', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/b4928a68-c03b-411f-8533-3d5c299fd451.mp3' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', accent: 'American', gender: 'Female', age: 'Young', tone: 'Professional', use: 'Entertainment', langs: 'Arabic, Chinese, French, Hindi, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', accent: 'American', gender: 'Female', age: 'Young', tone: 'Youthful', use: 'Conversational', langs: '', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/d8ecadea-9e48-4e5d-868a-2ec3d7397861.mp3' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', accent: 'American', gender: 'Male', age: 'Young', tone: 'Strong', use: 'Conversational', langs: '', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/47de9a7e-773a-42a8-b410-4aa90c581216.mp3' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', accent: 'British', gender: 'Female', age: 'Middle-aged', tone: 'Confident', use: 'Educational', langs: 'Chinese, Czech, Dutch, German, Italian, Polish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Classy', use: 'Social Media', langs: 'Arabic, Chinese, Dutch, German, Hindi, Portuguese, Romanian, Slovak', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/2dd3e72c-4fd3-42f1-93ea-abc5d4e5aa1d.mp3' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', accent: 'British', gender: 'Male', age: 'Middle-aged', tone: 'Formal', use: 'Educational', langs: 'German, Turkish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Classy', use: 'Conversational', langs: 'French, German, Portuguese, Slovak, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', accent: 'American', gender: 'Female', age: 'Young', tone: 'Cute', use: 'Conversational', langs: 'Arabic, Chinese, Czech, French, German, Hindi, Japanese', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', accent: 'American', gender: 'Female', age: 'Middle-aged', tone: 'Upbeat', use: 'Educational', langs: 'Arabic, French, German, Italian, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Classy', use: 'Conversational', langs: 'Dutch, French, German, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', accent: 'American', gender: 'Female', age: 'Young', tone: 'Sassy', use: 'Social Media', langs: 'Arabic, Chinese, French, German', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/FGY2WhTYpPnrIDTdsKH5/67341759-ad08-41a5-be6e-de12fe448618.mp3' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', accent: 'Australian', gender: 'Male', age: 'Young', tone: 'Hyped', use: 'Conversational', langs: 'Chinese, Filipino, Portuguese, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/102de6f2-22ed-43e0-a1f1-111fa75c5481.mp3' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', accent: 'British', gender: 'Male', age: 'Middle-aged', tone: 'Mature', use: 'Storytelling', langs: 'Arabic, Czech, Filipino, French, Hindi, Japanese, Spanish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/JBFqnCBsd6RMkjVDRZzb/e6206d1a-0721-4787-aafb-06a6e705cac5.mp3' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Husky', use: 'Characters', langs: 'French, Hindi', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', accent: 'American', gender: 'Neutral', age: 'Middle-aged', tone: 'Calm', use: 'Conversational', langs: 'Chinese, French, Italian, Portuguese', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', accent: 'American', gender: 'Male', age: 'Young', tone: 'Rough', use: 'Characters', langs: '', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', accent: 'American', gender: 'Male', age: 'Young', tone: 'Confident', use: 'Social Media', langs: 'Czech, German, Hindi, Polish, Portuguese, Turkish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', accent: 'British', gender: 'Female', age: 'Middle-aged', tone: 'Professional', use: 'Educational', langs: 'Arabic, French, Hindi, Italian, Japanese, Polish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', accent: 'American', gender: 'Male', age: 'Young', tone: 'Chill', use: 'Conversational', langs: 'Chinese, Czech, Filipino, French, German, Portuguese, Slovak, Spanish, Swedish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', accent: 'American', gender: 'Female', age: 'Middle-aged', tone: 'Professional', use: 'Educational', langs: '', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Casual', use: 'Conversational', langs: 'Arabic, French, Hindi, Portuguese, Swedish', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/iP95p4xoKVk53GoZ742B/3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Deep', use: 'Social Media', langs: '', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', accent: 'American', gender: 'Male', age: 'Senior', tone: 'Crisp', use: 'Advertisement', langs: 'Arabic, Chinese, Czech, French, German', preview: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pqHfZKP75CvOlQylNhV4/d782b3ff-84ba-4029-848c-acf01285524d.mp3' },
];

const OAI_PREVIEW_BASE = 'https://api.magpipe.ai/storage/v1/object/public/public/avatars/voices';

export const OPENAI_VOICES = [
  { id: 'openai-alloy', name: 'Alloy', accent: 'Neutral', gender: 'Neutral', age: 'Young', tone: 'Balanced', use: 'Conversational', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-alloy-preview.mp3` },
  { id: 'openai-echo', name: 'Echo', accent: 'Neutral', gender: 'Male', age: 'Middle-aged', tone: 'Warm', use: 'Conversational', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-echo-preview.mp3` },
  { id: 'openai-fable', name: 'Fable', accent: 'British', gender: 'Male', age: 'Young', tone: 'Expressive', use: 'Storytelling', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-fable-preview.mp3` },
  { id: 'openai-nova', name: 'Nova', accent: 'American', gender: 'Female', age: 'Young', tone: 'Energetic', use: 'Social Media', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-nova-preview.mp3` },
  { id: 'openai-onyx', name: 'Onyx', accent: 'American', gender: 'Male', age: 'Middle-aged', tone: 'Authoritative', use: 'Advertisement', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-onyx-preview.mp3` },
  { id: 'openai-shimmer', name: 'Shimmer', accent: 'American', gender: 'Female', age: 'Young', tone: 'Soft', use: 'Educational', langs: 'All languages (auto-detect)', preview: `${OAI_PREVIEW_BASE}/openai-shimmer-preview.mp3` },
];

function voiceAvatarUrl(voiceId) {
  return `${AVATAR_BASE}/${voiceId}.jpg`;
}

function renderVoiceCard(v, selectedVoiceId) {
  const isSelected = selectedVoiceId === v.id;
  const avatarUrl = voiceAvatarUrl(v.id);
  return `
    <div class="voice-option ${isSelected ? 'selected' : ''}" data-voice-id="${v.id}">
      <div class="voice-option-top">
        <img class="voice-avatar" src="${avatarUrl}" alt="${v.name}" onerror="this.style.display='none'" />
        <div class="voice-info">
          <span class="voice-name">${v.name}</span>
          <div class="voice-tags">
            <span class="voice-tag">${v.accent}</span>
            ${v.tone ? `<span class="voice-tag">${v.tone}</span>` : ''}
            ${v.age ? `<span class="voice-tag">${v.age}</span>` : ''}
            ${v.use ? `<span class="voice-tag voice-tag-use">${v.use}</span>` : ''}
          </div>
          ${v.langs ? `<div class="voice-langs" title="${v.langs}">+ ${v.langs}</div>` : ''}
        </div>
        ${v.preview ? `<button class="voice-preview-btn" data-preview="${v.preview}" title="Preview voice">
          <svg class="progress-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16"></circle></svg>
          <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>` : ''}
      </div>
    </div>`;
}

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
                ${this.clonedVoices.map(v => {
                  const isSelected = this.agent.voice_id === `11labs-${v.voice_id}`;
                  const initials = (v.voice_name || 'CV').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const previewUrl = v.preview_url || `${AVATAR_BASE}/${v.voice_id}-preview.mp3`;
                  const userAvatar = this.userAvatarUrl;
                  return `
                  <div class="voice-option ${isSelected ? 'selected' : ''}" data-voice-id="11labs-${v.voice_id}">
                    <div class="voice-option-top">
                      ${userAvatar
                        ? `<img class="voice-avatar" src="${userAvatar}" alt="${v.voice_name}" onerror="this.outerHTML='<div class=\\'voice-avatar voice-avatar-placeholder\\'>${initials}</div>'" />`
                        : `<div class="voice-avatar voice-avatar-placeholder">${initials}</div>`}
                      <div class="voice-info">
                        <span class="voice-name">${v.voice_name || 'Cloned Voice'}</span>
                        <div class="voice-tags">
                          <span class="voice-tag voice-tag-use">Cloned</span>
                        </div>
                      </div>
                      ${previewUrl ? `<button class="voice-preview-btn" data-preview="${previewUrl}" title="Preview voice">
                        <svg class="progress-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16"></circle></svg>
                        <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </button>` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="voice-section">
            <h4>ElevenLabs Voices</h4>
            <div class="voice-grid">
              ${ELEVENLABS_VOICES.map(v => renderVoiceCard(v, this.agent.voice_id)).join('')}
            </div>
          </div>

          <div class="voice-section">
            <h4>OpenAI Voices</h4>
            <div class="voice-grid">
              ${OPENAI_VOICES.map(v => renderVoiceCard(v, this.agent.voice_id)).join('')}
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

    // Voice selection — click on card (but not preview button) selects the voice
    modal.querySelectorAll('.voice-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.voice-preview-btn')) return;
        const voiceId = btn.dataset.voiceId;
        this.selectVoice(voiceId);
        document.body.removeChild(modal);
      });
    });

    // Preview audio playback
    let activeAudio = null;
    let activeBtn = null;

    function setPlayIcon(btn) {
      btn.querySelector('.play-icon').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    }
    function setPauseIcon(btn) {
      btn.querySelector('.play-icon').innerHTML = '<rect x="5" y="3" width="4" height="18"></rect><rect x="15" y="3" width="4" height="18"></rect>';
    }

    function stopPlaying() {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }
      if (activeBtn) {
        setPlayIcon(activeBtn);
        activeBtn.classList.remove('playing');
        const ring = activeBtn.querySelector('.progress-ring circle');
        if (ring) ring.style.strokeDashoffset = '100';
        activeBtn = null;
      }
    }

    modal.querySelectorAll('.voice-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.preview;

        if (activeBtn === btn) {
          stopPlaying();
          return;
        }

        stopPlaying();

        activeAudio = new Audio(url);
        activeBtn = btn;
        setPauseIcon(btn);
        btn.classList.add('playing');
        activeAudio.play();

        const ring = btn.querySelector('.progress-ring circle');
        activeAudio.addEventListener('timeupdate', () => {
          if (activeAudio && activeAudio.duration && ring) {
            const pct = activeAudio.currentTime / activeAudio.duration;
            ring.style.strokeDashoffset = String(100 - (pct * 100));
          }
        });

        activeAudio.addEventListener('ended', () => {
          stopPlaying();
        });
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

    // Always regenerate the prompt when identity fields change
    this.regeneratePrompts();
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
