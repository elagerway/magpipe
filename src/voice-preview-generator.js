import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://api.magpipe.ai',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs'
);

const voiceIdInput = document.getElementById('voiceId');
const sampleTextArea = document.getElementById('sampleText');
const generateBtn = document.getElementById('generateBtn');
const statusDiv = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');
const audioElement = document.getElementById('audioElement');
const replayBtn = document.getElementById('replayBtn');
const voiceOptionsContainer = document.getElementById('voiceOptions');

// Load and display cloned voices
async function loadClonedVoices() {
  try {
    // Use edge function to bypass RLS
    const response = await supabase.functions.invoke('get-cloned-voices');

    if (response.error) throw response.error;

    const data = response.data?.voices || [];

    if (data.length > 0) {
      // Create a document fragment to hold cloned voices section
      const fragment = document.createDocumentFragment();

      // Create a section header for cloned voices
      const clonedVoicesHeader = document.createElement('div');
      clonedVoicesHeader.style.cssText = 'width: 100%; font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin: 1rem 0 0.5rem 0; padding-top: 1rem; border-top: 1px solid var(--border-color);';
      clonedVoicesHeader.textContent = 'Your Cloned Voices';
      fragment.appendChild(clonedVoicesHeader);

      // Add each cloned voice as a chip
      data.forEach(voice => {
        const chip = document.createElement('div');
        chip.className = 'voice-chip';
        chip.dataset.voice = `11labs-${voice.voice_id}`;
        chip.textContent = voice.voice_name || 'Cloned Voice';
        fragment.appendChild(chip);
      });

      // Add ElevenLabs section header
      const elevenlabsHeader = document.createElement('div');
      elevenlabsHeader.style.cssText = 'width: 100%; font-weight: 600; font-size: 0.875rem; color: var(--text-secondary); margin: 1rem 0 0.5rem 0; padding-top: 1rem; border-top: 1px solid var(--border-color);';
      elevenlabsHeader.textContent = 'ElevenLabs Voices';
      fragment.appendChild(elevenlabsHeader);

      // Insert fragment at the beginning of container
      voiceOptionsContainer.insertBefore(fragment, voiceOptionsContainer.firstChild);
    }

    // Now attach event listeners to all voice chips (including newly added ones)
    attachVoiceChipListeners();
  } catch (error) {
    console.error('Error loading cloned voices:', error);
  }
}

// Attach event listeners to voice chips
function attachVoiceChipListeners() {
  const voiceChips = document.querySelectorAll('.voice-chip');

  voiceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      voiceChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      voiceIdInput.value = chip.dataset.voice;

      // Update sample text with voice name
      const voiceName = chip.textContent.trim();
      sampleTextArea.value = `Hi! Thanks for calling, my name is ${voiceName}. I'm here to answer calls and texts. How can I help you?`;
    });
  });
}

voiceIdInput.addEventListener('input', () => {
  const voiceChips = document.querySelectorAll('.voice-chip');
  voiceChips.forEach(c => c.classList.remove('selected'));
});

// Load cloned voices when page loads
loadClonedVoices();

function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
}

function hideStatus() {
  statusDiv.style.display = 'none';
}

async function generatePreview() {
  const voiceId = voiceIdInput.value.trim();
  const sampleText = sampleTextArea.value.trim();

  if (!voiceId || !sampleText) {
    showStatus('Please enter both voice ID and sample text', 'error');
    return;
  }

  try {
    generateBtn.disabled = true;
    generateBtn.innerHTML = 'Creating preview...<span class="loading"></span>';
    audioPlayer.style.display = 'none';
    hideStatus();

    showStatus('Generating preview with ElevenLabs...', 'info');

    const { data: session, error: sessionError } = await supabase.functions.invoke(
      'generate-voice-preview',
      {
        body: { voice_id: voiceId, sample_text: sampleText, voice_stack: 'livekit' }
      }
    );

    if (sessionError) throw sessionError;

    if (!session.success) throw new Error('Failed to generate preview');

    showStatus('Preview generated successfully! Refresh the agent config page to hear it.', 'success');
    generateBtn.disabled = false;
    generateBtn.innerHTML = 'Generate & Record Preview';

  } catch (error) {
    console.error('Error:', error);
    showStatus('Error: ' + error.message, 'error');
    generateBtn.disabled = false;
    generateBtn.innerHTML = 'Generate & Record Preview';
  }
}

replayBtn.addEventListener('click', () => {
  audioElement.play();
});

generateBtn.addEventListener('click', generatePreview);
