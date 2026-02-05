/**
 * OpenAI Realtime API Service for Omni Admin Chat
 * Handles voice conversation with any agent's configuration
 */

import { supabase } from '../lib/supabase.js';

export class RealtimeOmniService {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioWorkletNode = null;
    this.analyser = null;
    this.outputAnalyser = null;
    this.isConnected = false;
    this.agentConfig = null;

    // Audio playback
    this.playbackQueue = [];
    this.isPlayingAudio = false;
    this.nextPlaybackTime = 0;
    this.isAssistantSpeaking = false;  // Track if assistant is speaking to duck mic

    // Timestamp tracking for proper ordering
    this.lastSpeechStoppedTimestamp = null;
    this.lastResponseStartTimestamp = null;

    // Callbacks
    this.onConnected = null;
    this.onDisconnected = null;
    this.onError = null;
    this.onTranscriptUpdate = null;
    this.onResponseStart = null;
    this.onResponseEnd = null;
    this.onAudioStart = null;
    this.onAudioEnd = null;
  }

  /**
   * Connect to OpenAI Realtime API with specific agent config
   * @param {string} agentId - The agent's ID to connect with
   */
  async connect(agentId) {
    try {
      // Get session token from backend
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated');
      }

      // Get ephemeral token from our Edge Function with agent context
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/realtime-omni-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ agent_id: agentId }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get Realtime API token');
      }

      const { token, model, agentConfig } = await response.json();
      this.agentConfig = agentConfig;

      console.log('[RealtimeOmni] Connecting with agent:', agentConfig.agent_name);
      console.log('[RealtimeOmni] Voice:', agentConfig.voice_id);

      // Connect to OpenAI Realtime API
      const realtimeUrl = `wss://api.openai.com/v1/realtime?model=${model}`;
      this.ws = new WebSocket(realtimeUrl, [
        'realtime',
        `openai-insecure-api-key.${token}`,
      ]);

      this.ws.addEventListener('open', () => this._handleOpen());
      this.ws.addEventListener('message', (event) => this._handleMessage(event));
      this.ws.addEventListener('close', () => this._handleClose());
      this.ws.addEventListener('error', (event) => this._handleError(event));

    } catch (error) {
      console.error('[RealtimeOmni] Connection error:', error);
      if (this.onError) {
        this.onError(error.message);
      }
      throw error;
    }
  }

  /**
   * Handle WebSocket open
   */
  async _handleOpen() {
    console.log('[RealtimeOmni] Connected to OpenAI Realtime API');
    this.isConnected = true;

    // Configure session with agent's prompt and voice
    this._send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: this.agentConfig.system_prompt,
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.8,           // Higher = less sensitive, harder to interrupt
              prefix_padding_ms: 500,   // More padding before speech starts
              silence_duration_ms: 1500, // Longer silence required to end turn
            },
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            voice: this.agentConfig.voice_id || 'shimmer',
          },
        },
        tools: [], // No function calling for omni chat - just conversation
      },
    });

    // Start capturing audio
    await this._startAudioCapture();

    if (this.onConnected) {
      this.onConnected();
    }
  }

  /**
   * Start capturing audio from microphone
   */
  async _startAudioCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });

      // Load AudioWorklet processor
      await this.audioContext.audioWorklet.addModule(
        new URL('./audio-processor.worklet.js', import.meta.url)
      );

      // Create AudioWorklet node
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'realtime-audio-processor');

      // Create analysers for visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.8;

      // Listen for audio data from worklet
      let audioChunkCount = 0;
      this.audioWorkletNode.port.onmessage = (event) => {
        // Skip sending audio while assistant is speaking (prevent feedback interruption)
        if (event.data.type === 'audio' && this.isConnected && !this.isAssistantSpeaking) {
          const pcm16 = event.data.data;
          const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16.buffer)));

          if (audioChunkCount < 3) {
            console.log('[RealtimeOmni] Sending audio chunk #', audioChunkCount);
            audioChunkCount++;
          }

          this._send({
            type: 'input_audio_buffer.append',
            audio: base64,
          });
        }
      };

      // Connect microphone input
      source.connect(this.analyser);
      this.analyser.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);

      console.log('[RealtimeOmni] Audio capture started');
    } catch (error) {
      console.error('[RealtimeOmni] Audio capture error:', error);
      if (this.onError) {
        this.onError('Failed to access microphone');
      }
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  _handleMessage(event) {
    const message = JSON.parse(event.data);
    console.log('[RealtimeOmni] Message:', message.type);

    switch (message.type) {
      case 'session.created':
        console.log('[RealtimeOmni] Session created');
        // Trigger agent to speak first with greeting
        this._send({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{
              type: 'input_text',
              text: '[System: Voice connection established. Greet the user briefly and ask how you can help them today.]',
            }],
          },
        });
        this._send({ type: 'response.create' });
        break;

      case 'session.updated':
        console.log('[RealtimeOmni] Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[RealtimeOmni] User started speaking');
        if (this.onAudioStart) {
          this.onAudioStart('user');
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('[RealtimeOmni] User stopped speaking');
        this.lastSpeechStoppedTimestamp = Date.now();
        if (this.onAudioEnd) {
          this.onAudioEnd('user');
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        console.log('[RealtimeOmni] User transcript:', message.transcript);
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(message.transcript, 'user', this.lastSpeechStoppedTimestamp);
        }
        break;

      case 'response.output_audio.started':
      case 'response.created':
        this.lastResponseStartTimestamp = Date.now();
        this.nextPlaybackTime = this.audioContext ? this.audioContext.currentTime : 0;
        this.isAssistantSpeaking = true;  // Mute mic input while assistant speaks
        if (this.onResponseStart) {
          this.onResponseStart(this.lastResponseStartTimestamp);
        }
        break;

      case 'response.output_audio.delta':
        this._playAudioChunk(message.delta);
        break;

      case 'response.output_audio_transcript.delta':
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(message.delta, 'assistant', this.lastResponseStartTimestamp);
        }
        break;

      case 'response.done':
        console.log('[RealtimeOmni] Response complete');
        // Delay re-enabling mic to let scheduled audio finish playing
        setTimeout(() => {
          this.isAssistantSpeaking = false;
        }, 500);
        if (this.onResponseEnd) {
          this.onResponseEnd();
        }
        break;

      case 'error':
        console.error('[RealtimeOmni] Error:', message.error);
        if (this.onError) {
          this.onError(message.error.message);
        }
        break;
    }
  }

  /**
   * Play audio chunk
   */
  _playAudioChunk(base64Audio) {
    if (!this.audioContext) {
      return;
    }

    try {
      // Decode base64 to binary string
      const binaryString = atob(base64Audio);

      // Convert to Int16Array (PCM16 format)
      const len = binaryString.length;
      const int16Array = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        const byte1 = binaryString.charCodeAt(i);
        const byte2 = binaryString.charCodeAt(i + 1);
        int16Array[i / 2] = (byte2 << 8) | byte1;
      }

      // Convert Int16 to Float32 (Web Audio format)
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      // Create source and play (route through outputAnalyser for visualization)
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.audioContext.destination);

      // Schedule playback for smooth continuous audio
      const currentTime = this.audioContext.currentTime;
      const startTime = Math.max(currentTime, this.nextPlaybackTime);
      source.start(startTime);

      // Update next playback time
      this.nextPlaybackTime = startTime + audioBuffer.duration;

    } catch (error) {
      console.error('[RealtimeOmni] Audio playback error:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  _handleClose() {
    console.log('[RealtimeOmni] Disconnected from Realtime API');
    this.isConnected = false;
    this.nextPlaybackTime = 0;

    // Stop audio capture
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.onDisconnected) {
      this.onDisconnected();
    }
  }

  /**
   * Handle WebSocket error
   */
  _handleError(event) {
    console.error('[RealtimeOmni] WebSocket error:', event);
    if (this.onError) {
      this.onError('Connection error');
    }
  }

  /**
   * Send message to OpenAI Realtime API
   */
  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from Realtime API
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a text message (for text input)
   */
  sendText(text) {
    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text,
        }],
      },
    });

    this._send({
      type: 'response.create',
    });
  }
}
