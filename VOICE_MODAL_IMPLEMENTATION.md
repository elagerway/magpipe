# Voice Selection Modal Implementation Plan

## Problem
Native `<select>` dropdown doesn't support custom content (play buttons) inside options.

## Solution
Replace dropdown with a **"Change Voice" button** that opens a modal showing all voices with inline preview buttons.

## UI Design

### Before (Current):
```
[Voice Dropdown ▼] [▶️]
```

### After (New):
```
[Selected Voice: Adam      ] [Change Voice]


[Modal when "Change Voice" clicked:]
┌─────────────────────────────────────┐
│ Select Voice                    [×] │
├─────────────────────────────────────┤
│ 🎤 Your Cloned Voices               │
│ ○ Sarah's Voice            [▶️]     │
│ ○ Professional Voice       [▶️]     │
│                                     │
│ 🔊 ElevenLabs Voices                │
│ ● Adam                     [▶️]     │ ← Selected
│   American • Male • Deep             │
│ ○ Rachel (Default)         [▶️]     │
│   American • Female • Calm           │
│ ○ Sarah                    [▶️]     │
│   American • Female • Soft           │
│ ... (scrollable list)               │
│                                     │
│ 🤖 OpenAI Voices                    │
│ ○ Alloy                    [▶️]     │
│ ○ Echo                     [▶️]     │
│                                     │
│              [Cancel]  [Select]     │
└─────────────────────────────────────┘
```

## Implementation

### 1. Replace Dropdown with Button

**Replace:**
```html
<select id="voice-id" class="form-select" style="flex: 1;">
  <!-- All the options -->
</select>
<div><!-- Preview button --></div>
```

**With:**
```html
<input type="hidden" id="voice-id" value="${config?.voice_id || '21m00Tcm4TlvDq8ikWAM'}" />
<div class="voice-selector-display" style="flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; background: white;">
  <span id="selected-voice-display">
    ${this.getVoiceDisplayName(config?.voice_id || '21m00Tcm4TlvDq8ikWAM', clonedVoices)}
  </span>
  <button type="button" id="change-voice-btn" class="btn btn-sm btn-secondary">
    Change Voice
  </button>
</div>
```

### 2. Create Voice Selection Modal

```html
<!-- Voice Selection Modal (hidden by default) -->
<div id="voice-selection-modal" class="modal" style="display: none;">
  <div class="modal-overlay"></div>
  <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
    <div class="modal-header">
      <h3>Select Voice</h3>
      <button type="button" class="modal-close" id="close-voice-modal">&times;</button>
    </div>

    <div class="modal-body">
      ${clonedVoices && clonedVoices.length > 0 ? `
        <div class="voice-section">
          <h4 class="voice-section-title">🎤 Your Cloned Voices</h4>
          ${clonedVoices.map(voice => `
            <div class="voice-option" data-voice-id="11labs-${voice.voice_id}" data-voice-name="${voice.voice_name}">
              <label class="voice-radio">
                <input type="radio" name="modal-voice-select" value="11labs-${voice.voice_id}">
                <span>${voice.voice_name}</span>
              </label>
              <button type="button" class="voice-preview-btn" data-voice-id="11labs-${voice.voice_id}">
                <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <svg class="stop-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                  <rect x="6" y="6" width="12" height="12"></rect>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="voice-section">
        <h4 class="voice-section-title">🔊 ElevenLabs Voices</h4>
        ${ELEVENLABS_VOICES.map(voice => `
          <div class="voice-option" data-voice-id="${voice.id}" data-voice-name="${voice.name}">
            <label class="voice-radio">
              <input type="radio" name="modal-voice-select" value="${voice.id}">
              <span>${voice.name}</span>
            </label>
            <button type="button" class="voice-preview-btn" data-voice-id="${voice.id}">
              <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>

      <div class="voice-section">
        <h4 class="voice-section-title">🤖 OpenAI Voices</h4>
        ${OPENAI_VOICES.map(voice => `
          <div class="voice-option" data-voice-id="${voice.id}" data-voice-name="${voice.name}">
            <label class="voice-radio">
              <input type="radio" name="modal-voice-select" value="${voice.id}">
              <span>${voice.name}</span>
            </label>
            <button type="button" class="voice-preview-btn" data-voice-id="${voice.id}">
              <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" id="cancel-voice-selection">Cancel</button>
      <button type="button" class="btn btn-primary" id="confirm-voice-selection">Select</button>
    </div>
  </div>
</div>
```

### 3. CSS Styles

```css
.voice-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.voice-option:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.voice-option input[type="radio"]:checked + span {
  font-weight: 600;
  color: var(--primary-color);
}

.voice-radio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  flex: 1;
}

.voice-preview-btn {
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
}

.voice-preview-btn:hover {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.voice-preview-btn.playing {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}

.voice-section {
  margin-bottom: 1.5rem;
}

.voice-section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}
```

### 4. JavaScript Logic

```javascript
// Open modal
const changeVoiceBtn = document.getElementById('change-voice-btn');
changeVoiceBtn.addEventListener('click', () => {
  const modal = document.getElementById('voice-selection-modal');
  const currentVoice = document.getElementById('voice-id').value;

  // Pre-select current voice
  const radio = modal.querySelector(`input[value="${currentVoice}"]`);
  if (radio) radio.checked = true;

  modal.style.display = 'block';
});

// Close modal
const closeModalBtn = document.getElementById('close-voice-modal');
const cancelBtn = document.getElementById('cancel-voice-selection');
closeModalBtn.addEventListener('click', () => closeVoiceModal());
cancelBtn.addEventListener('click', () => closeVoiceModal());

// Select voice
const confirmBtn = document.getElementById('confirm-voice-selection');
confirmBtn.addEventListener('click', () => {
  const selectedRadio = document.querySelector('input[name="modal-voice-select"]:checked');
  if (selectedRadio) {
    const voiceId = selectedRadio.value;
    const voiceOption = selectedRadio.closest('.voice-option');
    const voiceName = voiceOption.dataset.voiceName;

    // Update hidden input
    document.getElementById('voice-id').value = voiceId;

    // Update display
    document.getElementById('selected-voice-display').textContent = voiceName;

    // Trigger auto-save
    this.handleFieldChange({ target: { id: 'voice-id' } });

    closeVoiceModal();
  }
});

// Preview voice in modal
const previewBtns = modal.querySelectorAll('.voice-preview-btn');
previewBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Don't trigger radio selection

    const voiceId = btn.dataset.voiceId;
    await this.playVoicePreview(voiceId, btn);
  });
});

// Stop all previews when clicking another
async playVoicePreview(voiceId, btn) {
  // Stop any currently playing preview
  if (this.currentPreviewAudio) {
    this.currentPreviewAudio.pause();
    this.currentPreviewAudio = null;
  }

  // Reset all buttons
  document.querySelectorAll('.voice-preview-btn').forEach(b => {
    b.classList.remove('playing');
    b.querySelector('.play-icon').style.display = 'inline';
    b.querySelector('.stop-icon').style.display = 'none';
  });

  // If clicking the same button, just stop
  if (btn.classList.contains('playing')) {
    return;
  }

  // Show loading/playing state
  btn.classList.add('playing');
  btn.querySelector('.play-icon').style.display = 'none';
  btn.querySelector('.stop-icon').style.display = 'inline';

  // Fetch and play preview
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${supabaseUrl}/functions/v1/preview-voice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ voice_id: voiceId }),
  });

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);

  this.currentPreviewAudio = new Audio(audioUrl);
  this.currentPreviewAudio.onended = () => {
    btn.classList.remove('playing');
    btn.querySelector('.play-icon').style.display = 'inline';
    btn.querySelector('.stop-icon').style.display = 'none';
  };

  await this.currentPreviewAudio.play();
}
```

## Data Structure

### Voice Lists (to avoid hardcoding in HTML)

```javascript
const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Default)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  // ... rest of voices
];

const OPENAI_VOICES = [
  { id: 'openai-alloy', name: 'Alloy' },
  { id: 'openai-echo', name: 'Echo' },
  // ... rest
];
```

## Benefits

✅ Users can preview voices **before** selecting
✅ Clear visual separation between voice categories
✅ Better UX - see all options at once
✅ Play buttons next to each voice (as requested)
✅ Mobile-friendly (modal is responsive)
✅ Accessible (radio buttons for keyboard navigation)

## Timeline

- Create modal HTML: 30 min
- Add CSS styles: 20 min
- Wire up JavaScript: 40 min
- Test & polish: 30 min
- **Total: ~2 hours**
