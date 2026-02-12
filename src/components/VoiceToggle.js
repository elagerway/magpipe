/**
 * Voice Toggle Component
 * Microphone button for voice input using Web Speech API
 */

import { isSupported, VoiceRecognition } from '../lib/voiceRecognition.js';
import { showToast } from '../lib/toast.js';

/**
 * Create voice toggle button component
 * @param {object} options - Component options
 * @param {function} options.onTranscript - Callback with transcribed text
 * @param {function} options.onError - Callback with error message
 * @param {function} options.onStart - Callback when microphone starts listening
 * @param {function} options.onEnd - Callback when microphone stops listening
 * @param {function} options.onSpeechStart - Callback when user starts speaking
 * @param {function} options.onSpeechEnd - Callback when user stops speaking
 * @returns {HTMLElement}
 */
export function createVoiceToggle({ onTranscript, onError, onStart, onEnd, onSpeechStart, onSpeechEnd }) {
  // Check browser support
  if (!isSupported()) {
    return null; // Don't render if not supported
  }

  // Component state
  let recognition = null;
  let isListening = false;
  let button = null;

  // Create button element
  button = document.createElement('button');
  button.className = 'voice-toggle';
  button.setAttribute('aria-label', 'Voice input');
  button.setAttribute('title', 'Click to speak');
  button.type = 'button';

  // Initial state: inactive
  updateButtonState('inactive');

  // Click handler
  button.addEventListener('click', handleClick);

  /**
   * Update button visual state
   */
  function updateButtonState(state) {
    // Remove all state classes
    button.classList.remove('inactive', 'listening', 'processing');

    // Add current state class
    button.classList.add(state);

    // Update icon
    switch (state) {
      case 'inactive':
        button.innerHTML = `
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
        button.setAttribute('title', 'Click to speak');
        break;

      case 'listening':
        button.innerHTML = `
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2"></line>
            <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2"></line>
          </svg>
          <span class="pulse-ring"></span>
        `;
        button.setAttribute('title', 'Listening... Click to stop');
        break;

      case 'processing':
        button.innerHTML = `
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        `;
        button.setAttribute('title', 'Processing...');
        break;
    }
  }

  /**
   * Handle button click
   */
  function handleClick() {
    console.log('[VoiceToggle] handleClick called, isListening:', isListening);
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  /**
   * Start listening for speech
   */
  function startListening() {
    console.log('[VoiceToggle] startListening called');
    try {
      // Create new recognition instance
      console.log('[VoiceToggle] Creating VoiceRecognition instance...');
      recognition = new VoiceRecognition();
      console.log('[VoiceToggle] VoiceRecognition instance created');

      // Set up callbacks
      recognition.onStart(() => {
        console.log('[VoiceToggle] Recognition started!');
        isListening = true;
        updateButtonState('listening');

        // Call onStart callback
        if (onStart && typeof onStart === 'function') {
          onStart();
        }
      });

      recognition.onResult((result) => {
        console.log('[VoiceToggle] Got result:', result.transcript);
        updateButtonState('processing');

        // Call transcript callback
        if (onTranscript && typeof onTranscript === 'function') {
          onTranscript(result.transcript);
        }

        // In continuous mode, don't stop - let it keep listening
        console.log('[VoiceToggle] Continuing to listen for more input...');
      });

      recognition.onError((errorMessage) => {
        console.log('[VoiceToggle] Error received:', errorMessage);
        isListening = false;
        updateButtonState('inactive');

        // Call onEnd callback
        if (onEnd && typeof onEnd === 'function') {
          onEnd();
        }

        // Call error callback or show default error
        if (onError && typeof onError === 'function') {
          onError(errorMessage);
        } else {
          showToast(errorMessage, 'error');
        }
      });

      recognition.onEnd(() => {
        isListening = false;
        updateButtonState('inactive');

        // Call onEnd callback
        if (onEnd && typeof onEnd === 'function') {
          onEnd();
        }
      });

      // Speech start callback - user actually started speaking
      recognition.onSpeechStart(() => {
        console.log('[VoiceToggle] User started speaking');
        if (onSpeechStart && typeof onSpeechStart === 'function') {
          onSpeechStart();
        }
      });

      // Speech end callback - user stopped speaking
      recognition.onSpeechEnd(() => {
        console.log('[VoiceToggle] User stopped speaking');
        if (onSpeechEnd && typeof onSpeechEnd === 'function') {
          onSpeechEnd();
        }
      });

      // Start recognition
      console.log('[VoiceToggle] Calling recognition.start()...');
      recognition.start();
      console.log('[VoiceToggle] recognition.start() called successfully');

    } catch (error) {
      console.error('[VoiceToggle] Voice recognition error:', error);
      isListening = false;
      updateButtonState('inactive');

      const errorMsg = error.message || 'Voice input failed';
      console.log('[VoiceToggle] Calling onError with:', errorMsg);
      if (onError && typeof onError === 'function') {
        onError(errorMsg);
      } else {
        showToast(errorMsg, 'error');
      }
    }
  }

  /**
   * Stop listening
   */
  function stopListening() {
    if (recognition) {
      recognition.stop();
    }
    isListening = false;
    updateButtonState('inactive');
  }

  // Cleanup function
  button.destroy = () => {
    stopListening();
    button.removeEventListener('click', handleClick);
  };

  return button;
}

/**
 * Add CSS styles for voice toggle
 */
export function addVoiceToggleStyles() {
  if (document.getElementById('voice-toggle-styles')) {
    return; // Already added
  }

  const style = document.createElement('style');
  style.id = 'voice-toggle-styles';
  style.textContent = `
    .voice-toggle {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #666;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      /* iOS Safari fixes */
      -webkit-appearance: none;
      appearance: none;
      padding: 0;
      margin: 0;
      line-height: 1;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .voice-toggle:hover {
      background: rgba(0, 0, 0, 0.05);
      transform: scale(1.05);
    }

    .voice-toggle:hover svg {
      stroke-width: 2.5;
    }

    .voice-toggle:active {
      transform: scale(0.95);
    }

    .voice-toggle.inactive {
      background: transparent;
      color: #666;
    }

    .voice-toggle.listening {
      background: #ef4444;
      color: white;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .voice-toggle.processing {
      background: #3b82f6;
      color: white;
    }

    .voice-toggle .pulse-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border: 2px solid #ef4444;
      border-radius: 50%;
      animation: pulse-ring 1.5s ease-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.8;
      }
    }

    @keyframes pulse-ring {
      0% {
        transform: scale(1);
        opacity: 1;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }

    .voice-toggle .spinner {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .voice-toggle {
        width: 40px !important;
        height: 40px !important;
        min-width: 40px !important;
        min-height: 40px !important;
        max-width: 40px !important;
        max-height: 40px !important;
        aspect-ratio: 1 / 1 !important;
        flex-shrink: 0 !important;
        flex-grow: 0 !important;
        -webkit-appearance: none !important;
        padding: 0 !important;
      }

    }
  `;

  document.head.appendChild(style);
}
