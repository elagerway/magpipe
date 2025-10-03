import { RetellWebClient } from 'retell-client-js-sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mtxbiyilvgwhbdptysex.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs'
);

const voiceIdInput = document.getElementById('voiceId');
const sampleTextArea = document.getElementById('sampleText');
const generateBtn = document.getElementById('generateBtn');
const hangupBtn = document.getElementById('hangupBtn');
const statusDiv = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');
const audioElement = document.getElementById('audioElement');
const replayBtn = document.getElementById('replayBtn');
const voiceOptionsContainer = document.getElementById('voiceOptions');

let retellClient = null;
let currentCallId = null;
let pollingInterval = null;

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

    // Step 1: Create the preview session
    showStatus('Creating temporary agent...', 'info');

    const { data: session, error: sessionError } = await supabase.functions.invoke(
      'generate-voice-preview',
      {
        body: { voice_id: voiceId, sample_text: sampleText }
      }
    );

    if (sessionError) throw sessionError;
    if (!session.access_token) throw new Error('No access token received');

    currentCallId = session.call_id;

    // Step 2: Connect to the call
    showStatus('Connecting to call... Please wait for the voice to speak.', 'info');
    generateBtn.innerHTML = 'Recording in progress...<span class="loading"></span>';

    retellClient = new RetellWebClient();

    retellClient.on('call_started', () => {
      console.log('Call started');
      showStatus('Call connected! The voice is speaking...', 'info');
      hangupBtn.style.display = 'block';
      generateBtn.style.display = 'none';
    });

    retellClient.on('call_ended', () => {
      console.log('Call ended');
      showStatus('Call ended. Processing recording...', 'info');
      hangupBtn.style.display = 'none';
      generateBtn.style.display = 'block';
      startPollingForRecording();
    });

    retellClient.on('error', (error) => {
      console.error('Retell error:', error);
      showStatus('Call error: ' + error.message, 'error');
      generateBtn.disabled = false;
      generateBtn.innerHTML = 'Generate & Record Preview';
    });

    await retellClient.startCall({
      accessToken: session.access_token
    });

  } catch (error) {
    console.error('Error:', error);
    showStatus('Error: ' + error.message, 'error');
    generateBtn.disabled = false;
    generateBtn.innerHTML = 'Generate & Record Preview';
  }
}

function startPollingForRecording() {
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds

  pollingInterval = setInterval(async () => {
    attempts++;

    try {
      const response = await supabase.functions.invoke(
        'check-preview-recording',
        {
          body: { call_id: currentCallId, voice_id: voiceIdInput.value }
        }
      );

      console.log('Response:', response);

      if (response.error) {
        console.error('Error from check-preview-recording:', response.error);

        // Try to get the actual error message from the HTTP response
        if (response.response) {
          const errorText = await response.response.text();
          console.error('Error response body:', errorText);
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              throw new Error(errorJson.error);
            }
          } catch (e) {
            // If not JSON, throw the text
            throw new Error(errorText);
          }
        }

        throw response.error;
      }

      const data = response.data;

      if (data?.error) {
        console.error('Function returned error:', data.error);
        throw new Error(data.error);
      }

      if (data.recording_url) {
        clearInterval(pollingInterval);
        showRecording(data.recording_url);
      } else if (attempts >= maxAttempts) {
        clearInterval(pollingInterval);
        showStatus('Recording not available after 60 seconds. Please try again.', 'error');
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Generate & Record Preview';
      } else {
        showStatus(`Waiting for recording... (${attempts}s)`, 'info');
      }
    } catch (error) {
      clearInterval(pollingInterval);
      showStatus('Error checking recording: ' + error.message, 'error');
      generateBtn.disabled = false;
      generateBtn.innerHTML = 'Generate & Record Preview';
    }
  }, 1000);
}

function showRecording(url) {
  showStatus('Recording saved successfully!', 'success');
  // Add cache busting to prevent browser from using old cached audio
  audioElement.src = url + '?t=' + Date.now();
  audioPlayer.style.display = 'block';
  generateBtn.disabled = false;
  generateBtn.innerHTML = 'Generate & Record Preview';
}

replayBtn.addEventListener('click', () => {
  audioElement.play();
});

hangupBtn.addEventListener('click', () => {
  if (retellClient) {
    retellClient.stopCall();
    hangupBtn.style.display = 'none';
    generateBtn.style.display = 'block';
    showStatus('Call ended. Processing recording...', 'info');
  }
});

generateBtn.addEventListener('click', generatePreview);
