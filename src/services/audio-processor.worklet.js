/**
 * Audio Processor Worklet for Realtime API
 * Processes microphone audio and sends PCM16 data
 */

class RealtimeAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = true;

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.command === 'stop') {
        this.isRecording = false;
      } else if (event.data.command === 'start') {
        this.isRecording = true;
      }
    };
  }

  /**
   * Convert Float32Array to 16-bit PCM
   */
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Process audio data
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (!this.isRecording || !input || !input[0]) {
      return true;
    }

    // Get first channel audio data
    const channelData = input[0];

    // Convert to PCM16
    const pcm16 = this.floatTo16BitPCM(channelData);

    // Send to main thread
    this.port.postMessage({
      type: 'audio',
      data: pcm16,
    });

    return true;
  }
}

registerProcessor('realtime-audio-processor', RealtimeAudioProcessor);
