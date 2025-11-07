/**
 * Voice Recognition Utility
 * Wrapper around Web Speech API for voice input
 */

/**
 * Check if browser supports speech recognition
 * @returns {boolean}
 */
export function isSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Voice Recognition class
 * Provides simple interface to Web Speech API
 */
export class VoiceRecognition {
  constructor() {
    if (!isSupported()) {
      throw new Error('Speech recognition not supported in this browser');
    }

    // Initialize recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configure recognition
    this.recognition.continuous = true;        // Keep listening continuously
    this.recognition.interimResults = true;    // Get interim results for better responsiveness
    this.recognition.lang = 'en-US';          // English (US)
    this.recognition.maxAlternatives = 1;     // Only need top result

    // Callbacks
    this.resultCallback = null;
    this.errorCallback = null;
    this.startCallback = null;
    this.endCallback = null;
    this.speechStartCallback = null;
    this.speechEndCallback = null;

    // Bind event handlers
    this._setupEventHandlers();
  }

  /**
   * Set up event handlers for recognition events
   * @private
   */
  _setupEventHandlers() {
    // Result event - fired when speech is recognized
    this.recognition.onresult = (event) => {
      // Get the latest result
      const lastResultIndex = event.results.length - 1;
      const result = event.results[lastResultIndex][0];
      const transcript = result.transcript;
      const confidence = result.confidence;
      const isFinal = event.results[lastResultIndex].isFinal;

      console.log('[VoiceRecognition] Result:', { transcript, isFinal, confidence });

      // Only process final results
      if (isFinal && this.resultCallback) {
        console.log('[VoiceRecognition] Final result - calling callback');
        this.resultCallback({
          transcript,
          confidence,
          isFinal: true,
        });
      }
    };

    // Error event
    this.recognition.onerror = (event) => {
      console.log('[VoiceRecognition] Error event:', event.error);
      const errorMessage = this._getErrorMessage(event.error);

      if (this.errorCallback) {
        // Pass the error message (which includes the error code)
        this.errorCallback(errorMessage);
      }
    };

    // Start event
    this.recognition.onstart = () => {
      console.log('[VoiceRecognition] Recognition started, listening continuously...');
      if (this.startCallback) {
        this.startCallback();
      }
    };

    // End event
    this.recognition.onend = () => {
      console.log('[VoiceRecognition] Recognition ended');
      if (this.endCallback) {
        this.endCallback();
      }
    };

    // Speech start event - user started speaking
    this.recognition.onspeechstart = () => {
      console.log('[VoiceRecognition] Speech detected');
      if (this.speechStartCallback) {
        this.speechStartCallback();
      }
    };

    // Speech end event - user stopped speaking
    this.recognition.onspeechend = () => {
      console.log('[VoiceRecognition] Speech ended');
      if (this.speechEndCallback) {
        this.speechEndCallback();
      }
    };
  }

  /**
   * Get user-friendly error message
   * @private
   */
  _getErrorMessage(error) {
    switch (error) {
      case 'no-speech':
        return 'No speech detected. Please try again.';
      case 'audio-capture':
        return 'Microphone not accessible. Please check permissions.';
      case 'not-allowed':
        return 'Microphone permission denied.';
      case 'network':
        return 'Network error. Please check your connection.';
      case 'aborted':
        return 'Speech recognition aborted.';
      case 'language-not-supported':
        return 'Language not supported.';
      default:
        return 'Speech recognition error. Please try again.';
    }
  }

  /**
   * Start listening for speech
   */
  start() {
    console.log('[VoiceRecognition] start() called');
    try {
      console.log('[VoiceRecognition] Calling this.recognition.start()...');
      this.recognition.start();
      console.log('[VoiceRecognition] this.recognition.start() completed');
    } catch (error) {
      // Already started - ignore
      if (error.name === 'InvalidStateError') {
        console.warn('[VoiceRecognition] Speech recognition already started');
      } else {
        console.error('[VoiceRecognition] Error starting recognition:', error);
        throw error;
      }
    }
  }

  /**
   * Stop listening for speech
   */
  stop() {
    try {
      this.recognition.stop();
    } catch (error) {
      // Ignore errors on stop
      console.warn('[VoiceRecognition] Error stopping speech recognition:', error);
    }
  }

  /**
   * Abort speech recognition immediately
   */
  abort() {
    try {
      this.recognition.abort();
    } catch (error) {
      // Ignore errors on abort
      console.warn('[VoiceRecognition] Error aborting speech recognition:', error);
    }
  }

  /**
   * Set callback for when speech is recognized
   * @param {Function} callback - Called with {transcript, confidence, isFinal}
   */
  onResult(callback) {
    this.resultCallback = callback;
  }

  /**
   * Set callback for errors
   * @param {Function} callback - Called with {error, message}
   */
  onError(callback) {
    this.errorCallback = callback;
  }

  /**
   * Set callback for when listening starts
   * @param {Function} callback
   */
  onStart(callback) {
    this.startCallback = callback;
  }

  /**
   * Set callback for when listening ends
   * @param {Function} callback
   */
  onEnd(callback) {
    this.endCallback = callback;
  }

  /**
   * Set callback for when user starts speaking
   * @param {Function} callback
   */
  onSpeechStart(callback) {
    this.speechStartCallback = callback;
  }

  /**
   * Set callback for when user stops speaking
   * @param {Function} callback
   */
  onSpeechEnd(callback) {
    this.speechEndCallback = callback;
  }

  /**
   * Set language for recognition
   * @param {string} lang - Language code (e.g., 'en-US', 'es-ES')
   */
  setLanguage(lang) {
    this.recognition.lang = lang;
  }

  /**
   * Enable/disable continuous mode
   * @param {boolean} continuous - Whether to continue listening after result
   */
  setContinuous(continuous) {
    this.recognition.continuous = continuous;
  }

  /**
   * Enable/disable interim results
   * @param {boolean} interim - Whether to return partial results
   */
  setInterimResults(interim) {
    this.recognition.interimResults = interim;
  }
}

/**
 * Helper function to quickly get speech input
 * @returns {Promise<string>} - Resolves with transcript
 */
export async function getSpeechInput() {
  if (!isSupported()) {
    throw new Error('Speech recognition not supported');
  }

  return new Promise((resolve, reject) => {
    const recognition = new VoiceRecognition();

    recognition.onResult((result) => {
      resolve(result.transcript);
    });

    recognition.onError((error) => {
      reject(new Error(error.message));
    });

    recognition.start();
  });
}
