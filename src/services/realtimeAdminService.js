/**
 * OpenAI Realtime API Service for Admin Agent
 * Handles voice conversation with function calling for admin configuration
 */

import { supabase } from '../lib/supabase.js';

export class RealtimeAdminService {
  constructor() {
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioWorkletNode = null;
    this.analyser = null;
    this.outputAnalyser = null; // Separate analyser for AI output (not sent back to OpenAI)
    this.isConnected = false;
    this.conversationId = null;

    // Audio playback
    this.playbackQueue = [];
    this.isPlayingAudio = false;
    this.nextPlaybackTime = 0;

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
    this.onFunctionCall = null;
    this.onAudioStart = null;
    this.onAudioEnd = null;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(conversationId = null) {
    try {
      this.conversationId = conversationId;

      // Get session token from backend
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated');
      }

      // Get ephemeral token from our Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/realtime-admin-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ conversation_id: conversationId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get Realtime API token');
      }

      const { token, model } = await response.json();

      // Connect to OpenAI Realtime API (GA version - no beta header)
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
      console.error('[RealtimeAdmin] Connection error:', error);
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
    console.log('[RealtimeAdmin] Connected to OpenAI Realtime API');
    this.isConnected = true;

    // Configure session (GA API format)
    this._send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions: `You are an admin assistant for Pat AI. You help users configure their call/SMS handling agent and take actions on their behalf.

You can:
- Update system prompts (use update_system_prompt function)
- Add knowledge sources from URLs (use add_knowledge_source function)
- Call contacts by name or phone number (use call_contact function)
- Send SMS messages to contacts (use send_sms function)
- List or search contacts (use list_contacts function)
- Add new contacts (use add_contact function)
- Search for businesses online and add them to contacts (use search_business function)

CRITICAL INSTRUCTIONS:
1. When you call a function, ALWAYS provide a natural conversational response explaining what you've prepared
2. After calling a function, ALWAYS ask "Is there anything else I can help you with?"
3. For actions like calls and SMS, explain that the action is prepared and will need confirmation before executing
4. Keep the conversation flowing - don't abruptly end it
5. Only when the user explicitly says they're done should you say goodbye

CRITICAL - NEVER REFUSE TO CALL OR TEXT:
- You CAN make calls and send texts to ANY number - contacts OR businesses
- If someone asks to call "Pizza Hut" or any business, use search_business to find their number, then offer to call
- NEVER say "I can't make calls to external numbers" - you absolutely CAN via the search_business function
- For ANY business name the user wants to call/text, use search_business first to look up their phone number

LOCATION FOR BUSINESS SEARCH:
- When searching for a business, if asked about location, the system will remember the user's city for future searches
- If the user previously provided a city, they may be asked "Would you like me to search near [city]?" - if they say yes, call search_business with that city as the location parameter
- If the user provides a NEW city (e.g., "I'm in Toronto" or "search in Vancouver"), call search_business with that city as the location
- Once the user tells you their city (e.g., "Toronto", "New York"), call search_business again with the location parameter set to their city
- Example flow: User says "Call Pizza Hut" → search fails without location → ask "What city are you in?" → user says "Toronto" → call search_business with query="Pizza Hut" and location="Toronto"
- Example with remembered city: System asks "Would you like me to search near Toronto?" → user says "yes" → call search_business with query="Pizza Hut" and location="Toronto"

VOICE CONFIRMATIONS:
- After presenting an action (call, text, add contact, etc.), wait for the user to confirm
- When user says "yes", "confirm", "do it", "go ahead", "sure", "okay" → call confirm_pending_action
- When user says "no", "cancel", "nevermind", "stop" → call cancel_pending_action
- Always confirm actions before executing them - never execute without user confirmation

Be warm, conversational, and helpful. Never expose vendor names like "OpenAI" or "Retell" - use "Pat AI assistant" instead.`,
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
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000,
            },
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: 24000,
            },
            voice: 'shimmer', // More natural, warm voice
          },
        },
        tools: [
          {
            type: 'function',
            name: 'update_system_prompt',
            description: 'Update the system prompt for the call/SMS handling agent',
            parameters: {
              type: 'object',
              properties: {
                new_prompt: {
                  type: 'string',
                  description: 'The updated system prompt text',
                },
                modification_type: {
                  type: 'string',
                  enum: ['append', 'replace', 'modify'],
                  description: 'How to apply the change',
                },
              },
              required: ['new_prompt', 'modification_type'],
            },
          },
          {
            type: 'function',
            name: 'add_knowledge_source',
            description: 'Add a URL to the knowledge base',
            parameters: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The URL to add as a knowledge source',
                },
              },
              required: ['url'],
            },
          },
          {
            type: 'function',
            name: 'call_contact',
            description: 'Initiate a phone call to a contact. Searches contacts by name or phone number.',
            parameters: {
              type: 'object',
              properties: {
                contact_identifier: {
                  type: 'string',
                  description: 'Contact name or phone number to call',
                },
              },
              required: ['contact_identifier'],
            },
          },
          {
            type: 'function',
            name: 'send_sms',
            description: 'Send an SMS text message to a contact',
            parameters: {
              type: 'object',
              properties: {
                recipient: {
                  type: 'string',
                  description: 'Contact name or phone number',
                },
                message: {
                  type: 'string',
                  description: 'The message content to send',
                },
              },
              required: ['recipient', 'message'],
            },
          },
          {
            type: 'function',
            name: 'list_contacts',
            description: 'Search or list user\'s contacts',
            parameters: {
              type: 'object',
              properties: {
                search_term: {
                  type: 'string',
                  description: 'Optional: filter contacts by name or phone',
                },
              },
            },
          },
          {
            type: 'function',
            name: 'add_contact',
            description: 'Add a new contact to the user\'s contact list',
            parameters: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Contact name',
                },
                phone_number: {
                  type: 'string',
                  description: 'Phone number in any format',
                },
                notes: {
                  type: 'string',
                  description: 'Optional notes about the contact',
                },
              },
              required: ['name', 'phone_number'],
            },
          },
          {
            type: 'function',
            name: 'search_business',
            description: 'Search for a business online using Google Places API. Use this when the user wants to call or text a business that is not in their contacts. Returns business name, address, and phone number.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Business name to search for (e.g., "Pizza Hut", "Dr. Smith dentist")',
                },
                location: {
                  type: 'string',
                  description: 'Optional location hint (e.g., "Vancouver", "near me")',
                },
                intent: {
                  type: 'string',
                  enum: ['call', 'text'],
                  description: 'What the user wants to do - call or text the business',
                },
                message: {
                  type: 'string',
                  description: 'If intent is "text", the message to send to the business',
                },
              },
              required: ['query', 'intent'],
            },
          },
          {
            type: 'function',
            name: 'confirm_pending_action',
            description: 'Execute the pending action that was prepared. Call this when user says "yes", "confirm", "do it", "go ahead", or similar confirmation.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
          {
            type: 'function',
            name: 'cancel_pending_action',
            description: 'Cancel the pending action. Call this when user says "no", "cancel", "nevermind", or similar.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
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
      // analyser: for microphone input (feeds worklet which sends to OpenAI)
      // outputAnalyser: for AI audio output (does NOT feed worklet)
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.smoothingTimeConstant = 0.8;

      // Listen for audio data from worklet
      let audioChunkCount = 0;
      this.audioWorkletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && this.isConnected) {
          const pcm16 = event.data.data;
          const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16.buffer)));

          // Log first few chunks to verify audio is being sent
          if (audioChunkCount < 5) {
            console.log('[RealtimeAdmin] Sending audio chunk #', audioChunkCount, 'size:', pcm16.length);
            audioChunkCount++;
          }

          this._send({
            type: 'input_audio_buffer.append',
            audio: base64,
          });
        }
      };

      // Connect microphone input: mic -> analyser -> worklet -> destination
      // This path sends audio to OpenAI
      source.connect(this.analyser);
      this.analyser.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext.destination);

      console.log('[RealtimeAdmin] Audio capture started');
    } catch (error) {
      console.error('[RealtimeAdmin] Audio capture error:', error);
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
    console.log('[RealtimeAdmin] Message:', message.type, message);

    switch (message.type) {
      case 'session.created':
        console.log('[RealtimeAdmin] Session created', message.session);
        console.log('[RealtimeAdmin] Default output modalities:', message.session?.output_modalities);
        break;

      case 'session.updated':
        console.log('[RealtimeAdmin] Session updated', message.session);
        console.log('[RealtimeAdmin] Output modalities:', message.session?.output_modalities);
        break;

      case 'input_audio_buffer.speech_started':
        console.log('[RealtimeAdmin] User started speaking');
        if (this.onAudioStart) {
          this.onAudioStart('user');
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('[RealtimeAdmin] User stopped speaking');
        // Capture timestamp when user stops speaking
        this.lastSpeechStoppedTimestamp = Date.now();
        console.log('[RealtimeAdmin] Speech stopped at timestamp:', this.lastSpeechStoppedTimestamp);
        if (this.onAudioEnd) {
          this.onAudioEnd('user');
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        console.log('[RealtimeAdmin] User transcript:', message.transcript);
        // Pass the timestamp from when user stopped speaking
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(message.transcript, 'user', this.lastSpeechStoppedTimestamp);
        }
        break;

      case 'response.output_audio.started':
      case 'response.created':
        // Capture timestamp when assistant starts responding
        this.lastResponseStartTimestamp = Date.now();
        console.log('[RealtimeAdmin] Response started at timestamp:', this.lastResponseStartTimestamp);
        // Reset audio playback timer for new response
        this.nextPlaybackTime = this.audioContext ? this.audioContext.currentTime : 0;
        if (this.onResponseStart) {
          this.onResponseStart(this.lastResponseStartTimestamp);
        }
        break;

      case 'response.output_audio.delta':
        // Play audio chunk
        this._playAudioChunk(message.delta);
        break;

      case 'response.output_audio_transcript.delta':
        console.log('[RealtimeAdmin] Assistant speaking:', message.delta);
        // Pass the timestamp from when response started
        if (this.onTranscriptUpdate) {
          this.onTranscriptUpdate(message.delta, 'assistant', this.lastResponseStartTimestamp);
        }
        break;

      case 'response.function_call_arguments.done':
        console.log('[RealtimeAdmin] Function call:', message.name, message.arguments, 'call_id:', message.call_id);
        if (this.onFunctionCall) {
          // Pass call_id so we can send results back
          this.onFunctionCall(message.name, JSON.parse(message.arguments), message.call_id);
        }
        break;

      case 'response.done':
        console.log('[RealtimeAdmin] Response complete', message.response);
        console.log('[RealtimeAdmin] Response output:', message.response?.output);
        if (this.onResponseEnd) {
          this.onResponseEnd();
        }
        break;

      case 'error':
        console.error('[RealtimeAdmin] Error:', message.error);
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

      // Create source and play (route through outputAnalyser for visualization only)
      // This does NOT go through worklet, so it won't be sent back to OpenAI
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
      console.error('[RealtimeAdmin] Audio playback error:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  _handleClose() {
    console.log('[RealtimeAdmin] Disconnected from Realtime API');
    this.isConnected = false;

    // Reset audio playback
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
    console.error('[RealtimeAdmin] WebSocket error:', event);
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
   * Send a text message (for testing)
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

  /**
   * Send function call result back to the API so it can respond with voice
   * @param {string} callId - The function call ID
   * @param {string} result - The result to send back (will be spoken)
   */
  sendFunctionResult(callId, result) {
    // Send the function output
    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    });

    // Trigger the AI to respond (speak the result)
    this._send({
      type: 'response.create',
    });
  }
}
