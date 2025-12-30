/**
 * Admin Chat Interface Component
 * Conversational interface for managing AI assistant
 */

import { sendMessage, confirmAction, listConversations, getConversationHistory } from '../services/adminAgentService.js';
import { RealtimeAdminService } from '../services/realtimeAdminService.js';
import { supabase } from '../lib/supabase.js';
import { createVoiceToggle, addVoiceToggleStyles } from './VoiceToggle.js';

/**
 * Create admin chat interface
 * @param {HTMLElement} container - Container element
 * @returns {object} Component API
 */
export function createAdminChatInterface(container) {
  // Add voice toggle styles
  addVoiceToggleStyles();

  // Component state
  let messages = [];
  let conversationId = null;
  let isLoading = false;
  let pendingAction = null;
  let conversations = [];
  let voiceModeEnabled = false;
  let realtimeService = null;
  let analyser = null;
  let animationId = null;
  let voiceTranscripts = [];
  let currentAssistantMessage = '';
  let currentUserMessage = '';
  let userSpeechTimer = null;
  let autoSaveInterval = null;

  // Timestamp-based message tracking for proper ordering
  let pendingMessages = []; // Array of {role, content, timestamp, element}
  let currentUserTimestamp = null;
  let currentAssistantTimestamp = null;

  // Create elements
  const chatContainer = document.createElement('div');
  chatContainer.className = 'admin-chat-interface';

  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'chat-sidebar';

  const newChatBtn = document.createElement('button');
  newChatBtn.className = 'new-chat-button';
  newChatBtn.innerHTML = `
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
    </svg>
    New chat
  `;
  newChatBtn.addEventListener('click', startNewChat);
  sidebar.appendChild(newChatBtn);

  const conversationList = document.createElement('div');
  conversationList.className = 'conversation-list';
  sidebar.appendChild(conversationList);

  chatContainer.appendChild(sidebar);

  // Chat area wrapper
  const chatArea = document.createElement('div');
  chatArea.className = 'chat-area';

  // Message history
  const messageHistory = document.createElement('div');
  messageHistory.className = 'chat-messages';
  chatArea.appendChild(messageHistory);

  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.className = 'chat-input-container';

  // Text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'chat-input';
  textInput.placeholder = 'Ask anything...';
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Voice mode toggle button - waveform icon
  const voiceModeToggle = document.createElement('button');
  voiceModeToggle.type = 'button';
  voiceModeToggle.className = 'voice-mode-icon-toggle';
  voiceModeToggle.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor" class="wave-bar bar-1"/>
      <rect x="8" y="5" width="2" height="14" rx="1" fill="currentColor" class="wave-bar bar-2"/>
      <rect x="12" y="3" width="2" height="18" rx="1" fill="currentColor" class="wave-bar bar-3"/>
      <rect x="16" y="7" width="2" height="10" rx="1" fill="currentColor" class="wave-bar bar-4"/>
      <rect x="20" y="9" width="2" height="6" rx="1" fill="currentColor" class="wave-bar bar-5"/>
    </svg>
  `;
  voiceModeToggle.title = 'Start voice conversation';
  voiceModeToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleVoiceMode();
  });

  // Microphone button for voice-to-text (quick dictation)
  const voiceToggle = createVoiceToggle({
    onTranscript: (text) => {
      textInput.value = text;
    },
    onError: (error) => {
      console.error('[AdminChat] Voice input error:', error);
    },
  });

  // Assemble input container
  inputContainer.appendChild(textInput);
  if (voiceToggle) {
    inputContainer.appendChild(voiceToggle);
  }
  inputContainer.appendChild(voiceModeToggle);

  chatArea.appendChild(inputContainer);
  chatContainer.appendChild(chatArea);

  // Append to container
  container.appendChild(chatContainer);

  // Load conversation history
  loadConversations().catch(err => {
    console.error('Failed to load conversations on mount:', err);
  });

  // Save conversation when navigating away
  window.addEventListener('beforeunload', (e) => {
    if (voiceTranscripts.length > 0) {
      // Try to save synchronously (best effort)
      saveCurrentConversation();
    }
  });

  /**
   * Handle send message
   */
  async function handleSend() {
    const message = textInput.value.trim();

    if (!message || isLoading) {
      return;
    }

    // Clear input
    textInput.value = '';

    // Add user message to UI
    addMessage('user', message);

    // Set loading state
    setLoading(true);

    // Update overlay if active
    if (voiceModeEnabled) {
      updateVoiceOverlayStatus('Processing...', 'Thinking...');
    }

    try {
      // Send message to admin agent
      console.log('[AdminChat] Sending message to admin agent...');
      const response = await sendMessage(message, conversationId);
      console.log('[AdminChat] Got response:', response);

      // Update conversation ID
      conversationId = response.conversationId;

      // Add assistant response
      console.log('[AdminChat] Adding assistant response to UI');
      addMessage('assistant', response.response);

      // Note: Voice mode uses Realtime API, which handles speech automatically
      // No need to call TTS here

      // Handle pending action
      if (response.requiresConfirmation && response.pendingAction) {
        pendingAction = response.pendingAction;
        showConfirmationPrompt(response.pendingAction);
      }

      // Reload conversations to update sidebar
      await loadConversations();

    } catch (error) {
      console.error('[AdminChat] Send message error:', error);
      console.error('[AdminChat] Error stack:', error.stack);
      showError(error.message || 'Failed to send message');

      // Make sure we return to listening state on error
      if (voiceModeEnabled) {
        updateVoiceOverlayStatus('Listening...', 'Speak to your AI assistant');
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Add message to history
   */
  function addMessage(role, content) {
    messages.push({ role, content });

    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message-${role}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-bubble';
    bubbleEl.textContent = content;

    messageEl.appendChild(bubbleEl);
    messageHistory.appendChild(messageEl);

    // Auto-scroll to bottom
    scrollToBottom();
  }

  /**
   * Show confirmation prompt for pending action
   */
  function showConfirmationPrompt(action) {
    const confirmEl = document.createElement('div');
    confirmEl.className = 'chat-confirmation';

    const previewEl = document.createElement('div');
    previewEl.className = 'confirmation-preview';
    previewEl.textContent = action.preview;

    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'confirmation-buttons';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn-confirm';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', () => handleConfirm(action, confirmEl));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => handleCancel(confirmEl));

    buttonsEl.appendChild(confirmBtn);
    buttonsEl.appendChild(cancelBtn);

    confirmEl.appendChild(previewEl);
    confirmEl.appendChild(buttonsEl);

    messageHistory.appendChild(confirmEl);
    scrollToBottom();
  }

  /**
   * Handle confirmation
   */
  async function handleConfirm(action, confirmEl) {
    try {
      // Disable buttons
      confirmEl.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
      });

      // Execute action
      const result = await confirmAction(conversationId, action);

      // Remove confirmation prompt
      confirmEl.remove();

      // Add success message
      addMessage('assistant', result.message || 'Changes applied successfully.');

      // Clear pending action
      pendingAction = null;

    } catch (error) {
      console.error('Confirm action error:', error);
      showError(error.message || 'Failed to apply changes');

      // Re-enable buttons
      confirmEl.querySelectorAll('button').forEach(btn => {
        btn.disabled = false;
      });
    }
  }

  /**
   * Handle cancellation
   */
  function handleCancel(confirmEl) {
    confirmEl.remove();
    pendingAction = null;
    addMessage('assistant', 'Okay, I won\'t make those changes.');
  }

  /**
   * Set loading state
   */
  function setLoading(loading) {
    isLoading = loading;
    textInput.disabled = loading;

    // Visual feedback during loading
    if (loading) {
      textInput.placeholder = 'Sending...';
    } else {
      textInput.placeholder = 'Ask anything...';
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'chat-error';
    errorEl.textContent = message;
    messageHistory.appendChild(errorEl);
    scrollToBottom();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorEl.classList.add('fade-out');
      setTimeout(() => errorEl.remove(), 300);
    }, 5000);
  }

  /**
   * Scroll to bottom of message history
   */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      messageHistory.scrollTop = messageHistory.scrollHeight;
    });
  }

  /**
   * Load conversations from server
   */
  async function loadConversations() {
    try {
      const convos = await listConversations();
      conversations = convos;
      renderConversations();
    } catch (error) {
      console.error('Load conversations error:', error);
    }
  }

  /**
   * Render conversation list
   */
  function renderConversations() {
    conversationList.innerHTML = '';

    if (conversations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'conversation-list-empty';
      empty.textContent = 'No conversations yet';
      conversationList.appendChild(empty);
      return;
    }

    conversations.forEach(convo => {
      const item = document.createElement('button');
      item.className = 'conversation-item';
      if (convo.id === conversationId) {
        item.classList.add('active');
      }

      const title = document.createElement('div');
      title.className = 'conversation-title';
      title.textContent = `Chat ${new Date(convo.created_at || convo.started_at).toLocaleDateString()}`;

      const date = document.createElement('div');
      date.className = 'conversation-date';
      date.textContent = formatRelativeTime(convo.last_message_at || convo.created_at);

      item.appendChild(title);
      item.appendChild(date);

      item.addEventListener('click', () => loadConversation(convo.id));

      conversationList.appendChild(item);
    });
  }

  /**
   * Save current conversation transcripts before switching
   */
  async function saveCurrentConversation() {
    console.log('[AdminChat] ===== SAVE CURRENT CONVERSATION =====');
    console.log('[AdminChat] voiceTranscripts count:', voiceTranscripts.length);
    console.log('[AdminChat] Current user buffer:', currentUserMessage ? `"${currentUserMessage}"` : '(empty)');
    console.log('[AdminChat] Current assistant buffer:', currentAssistantMessage ? `"${currentAssistantMessage.substring(0, 100)}..."` : '(empty)');

    // Save any pending voice transcripts
    if (voiceTranscripts.length > 0) {
      console.log('[AdminChat] Messages to save:');
      voiceTranscripts.forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.role}: "${msg.content.substring(0, 50)}..."`);
      });

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session && conversationId) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-voice-conversation`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                messages: voiceTranscripts,
              }),
            }
          );

          if (response.ok) {
            console.log('[AdminChat] ✓ Saved successfully, clearing voiceTranscripts array');
            voiceTranscripts = [];
          } else {
            console.error('[AdminChat] ✗ Save failed with status:', response.status);
          }
        } else {
          console.log('[AdminChat] Skipping save - no session or conversationId');
        }
      } catch (error) {
        console.error('[AdminChat] Error saving current conversation:', error);
      }
    } else {
      console.log('[AdminChat] No finalized messages to save (check buffers above)');
    }
  }

  /**
   * Load a specific conversation
   */
  async function loadConversation(convoId) {
    try {
      // Save current conversation before switching
      await saveCurrentConversation();

      conversationId = convoId;
      const history = await getConversationHistory(convoId);

      // Clear current messages
      messages = [];
      messageHistory.innerHTML = '';

      // Load history
      history.forEach(msg => {
        addMessage(msg.role, msg.content);
      });

      renderConversations();
    } catch (error) {
      console.error('Load conversation error:', error);
      showError(error.message || 'Failed to load conversation');
    }
  }

  /**
   * Toggle voice mode - opens/closes overlay
   */
  function toggleVoiceMode() {
    if (voiceModeEnabled) {
      closeVoiceOverlay();
    } else {
      openVoiceOverlay();
    }
  }

  /**
   * Open voice conversation overlay
   */
  async function openVoiceOverlay() {
    voiceModeEnabled = true;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'voice-overlay';
    overlay.id = 'voice-overlay';

    overlay.innerHTML = `
      <div class="voice-overlay-close" id="voice-overlay-close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/>
          <line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div class="voice-overlay-content">
        <div class="voice-waveform-container">
          <canvas id="voice-waveform-canvas" width="400" height="400"></canvas>
          <div class="voice-connecting" id="voice-connecting">
            <div class="connecting-spinner"></div>
            <div class="connecting-text">Connecting...</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Attach close handler with better event capture
    const closeBtn = document.getElementById('voice-overlay-close');
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeVoiceOverlay();
    }, true);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    // Setup audio visualization
    analyser = null;
    animationId = null;
    voiceTranscripts = [];
    currentUserMessage = '';
    currentAssistantMessage = '';
    userSpeechTimer = null;

    // Reset timestamp-based ordering state
    pendingMessages = [];
    currentUserTimestamp = null;
    currentAssistantTimestamp = null;

    const canvas = document.getElementById('voice-waveform-canvas');
    const ctx = canvas.getContext('2d');

    function drawWaveform() {
      if (!voiceModeEnabled) {
        if (animationId) cancelAnimationFrame(animationId);
        return;
      }

      // Get audio data from analysers (check both input and output)
      let dataArray, bufferLength, intensity;

      if (analyser && (analyser.input || analyser.output)) {
        // Check both analysers and use whichever has more activity
        const inputData = analyser.input ? new Uint8Array(analyser.input.frequencyBinCount) : null;
        const outputData = analyser.output ? new Uint8Array(analyser.output.frequencyBinCount) : null;

        if (inputData) analyser.input.getByteFrequencyData(inputData);
        if (outputData) analyser.output.getByteFrequencyData(outputData);

        // Calculate average for each
        const inputAvg = inputData ? inputData.reduce((sum, value) => sum + value, 0) / inputData.length : 0;
        const outputAvg = outputData ? outputData.reduce((sum, value) => sum + value, 0) / outputData.length : 0;

        // Use whichever has more activity
        if (outputAvg > inputAvg && outputData) {
          dataArray = outputData;
          bufferLength = outputData.length;
          intensity = outputAvg / 255;
        } else if (inputData) {
          dataArray = inputData;
          bufferLength = inputData.length;
          intensity = inputAvg / 255;
        } else {
          // Fallback to placeholder
          bufferLength = 128;
          dataArray = new Uint8Array(bufferLength);
          const breathe = Math.sin(Date.now() * 0.002) * 0.5 + 0.5;
          intensity = breathe * 0.3;
          for (let i = 0; i < bufferLength; i++) {
            dataArray[i] = Math.sin(i * 0.1 + Date.now() * 0.001) * 50 + 50;
          }
        }
      } else {
        // Placeholder animation while connecting
        bufferLength = 128;
        dataArray = new Uint8Array(bufferLength);
        // Create breathing animation
        const breathe = Math.sin(Date.now() * 0.002) * 0.5 + 0.5;
        intensity = breathe * 0.3;
        // Fill with some variation for organic look
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(i * 0.1 + Date.now() * 0.001) * 50 + 50;
        }
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw organic flowing circle
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 80;
      const points = 60;

      ctx.save();

      // Create smooth organic shape
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const dataIndex = Math.floor((i / points) * bufferLength);
        const amplitude = dataArray[dataIndex] || 0;

        // Create organic variation
        const noise = Math.sin(angle * 3 + Date.now() * 0.001) * 10;
        const radius = baseRadius + (amplitude / 255) * 60 + noise;

        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          // Smooth curves between points
          const prevAngle = ((i - 1) / points) * Math.PI * 2;
          const prevDataIndex = Math.floor(((i - 1) / points) * bufferLength);
          const prevAmplitude = dataArray[prevDataIndex] || 0;
          const prevNoise = Math.sin(prevAngle * 3 + Date.now() * 0.001) * 10;
          const prevRadius = baseRadius + (prevAmplitude / 255) * 60 + prevNoise;
          const prevX = centerX + Math.cos(prevAngle) * prevRadius;
          const prevY = centerY + Math.sin(prevAngle) * prevRadius;

          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
        }
      }
      ctx.closePath();

      // Gradient fill
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius + 60);
      gradient.addColorStop(0, `rgba(255, 0, 128, ${0.3 + intensity * 0.4})`);
      gradient.addColorStop(0.5, `rgba(121, 40, 202, ${0.2 + intensity * 0.3})`);
      gradient.addColorStop(1, `rgba(0, 212, 255, ${0.1 + intensity * 0.2})`);

      ctx.fillStyle = gradient;
      ctx.fill();

      // Glowing stroke
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + intensity * 0.4})`;
      ctx.lineWidth = 2 + intensity * 3;
      ctx.shadowBlur = 20 + intensity * 30;
      ctx.shadowColor = `rgba(255, 0, 128, ${0.8 + intensity * 0.2})`;
      ctx.stroke();

      ctx.restore();

      animationId = requestAnimationFrame(drawWaveform);
    }

    // Start animation immediately with placeholder
    drawWaveform();

    // Initialize Realtime API
    try {
      console.log('[AdminChat] Initializing Realtime API...');

      realtimeService = new RealtimeAdminService();

      // Set up callbacks
      realtimeService.onConnected = () => {
        console.log('[AdminChat] Realtime API connected');

        // Hide connecting indicator
        const connectingEl = document.getElementById('voice-connecting');
        if (connectingEl) {
          connectingEl.style.display = 'none';
        }

        // Store both analysers for visualization
        analyser = {
          input: realtimeService.analyser,
          output: realtimeService.outputAnalyser,
        };
      };

      realtimeService.onDisconnected = () => {
        console.log('[AdminChat] Realtime API disconnected');
        closeVoiceOverlay();
      };

      realtimeService.onError = (error) => {
        console.error('[AdminChat] Realtime API error:', error);
        updateVoiceOverlayStatus('Error', error);
      };

      realtimeService.onAudioStart = (source) => {
        console.log('[AdminChat] Audio started:', source);
        // Audio events handled by waveform visualization
      };

      realtimeService.onAudioEnd = (source) => {
        console.log('[AdminChat] Audio ended:', source);
        // Audio events handled by waveform visualization
      };

      // Helper function to render messages in timestamp order
      function renderMessagesInOrder() {
        // Sort pending messages by timestamp
        const sortedMessages = [...pendingMessages].sort((a, b) => a.timestamp - b.timestamp);

        // Remove all existing voice message elements from DOM
        pendingMessages.forEach(msg => {
          if (msg.element && msg.element.parentNode) {
            msg.element.remove();
          }
        });

        // Re-append in sorted order
        sortedMessages.forEach(msg => {
          if (!msg.element) {
            // Create element if it doesn't exist
            msg.element = document.createElement('div');
            msg.element.className = `chat-message chat-message-${msg.role}`;
            msg.element.innerHTML = `<div class="chat-bubble">${msg.content}</div>`;
          } else {
            // Update content
            msg.element.querySelector('.chat-bubble').textContent = msg.content;
          }
          messageHistory.appendChild(msg.element);
        });

        messageHistory.scrollTop = messageHistory.scrollHeight;
      }

      realtimeService.onTranscriptUpdate = (transcript, role, timestamp) => {
        console.log('[AdminChat] Transcript received - role:', role, 'timestamp:', timestamp, 'content:', transcript);

        if (role === 'user') {
          // Store timestamp from when user stopped speaking (or use current time as fallback)
          if (!currentUserTimestamp) {
            currentUserTimestamp = timestamp || Date.now();
            console.log('[AdminChat] Set user timestamp:', currentUserTimestamp);
          }

          // Accumulate user message (in case of multiple segments)
          if (currentUserMessage) {
            currentUserMessage += ' ' + transcript;
          } else {
            currentUserMessage = transcript;
          }

          // Find or create pending message for this user turn
          let userMsg = pendingMessages.find(m => m.role === 'user' && m.timestamp === currentUserTimestamp);
          if (!userMsg) {
            userMsg = {
              role: 'user',
              content: currentUserMessage,
              timestamp: currentUserTimestamp,
              element: null
            };
            pendingMessages.push(userMsg);
            console.log('[AdminChat] Created new pending user message. Total pending:', pendingMessages.length);
          } else {
            userMsg.content = currentUserMessage;
          }

          // Render messages in timestamp order
          renderMessagesInOrder();

          // Clear existing timer
          if (userSpeechTimer) {
            clearTimeout(userSpeechTimer);
          }

          // Set timer to finalize message after 1 second of no new transcripts
          userSpeechTimer = setTimeout(() => {
            if (currentUserMessage.trim()) {
              console.log('[AdminChat] ✓ Timer expired, finalizing user message to voiceTranscripts');
              console.log('[AdminChat]   Content:', `"${currentUserMessage.trim().substring(0, 100)}..."`);
              voiceTranscripts.push({ role: 'user', content: currentUserMessage.trim() });
              console.log('[AdminChat]   voiceTranscripts now has', voiceTranscripts.length, 'messages');
              currentUserMessage = '';
              currentUserTimestamp = null;
            }
          }, 1000);

        } else if (role === 'assistant') {
          // Store timestamp from when response started (or use current time as fallback)
          if (!currentAssistantTimestamp) {
            currentAssistantTimestamp = timestamp || Date.now();
            console.log('[AdminChat] Set assistant timestamp:', currentAssistantTimestamp);
          }

          // Accumulate assistant message deltas
          currentAssistantMessage += transcript;

          // Find or create pending message for this assistant turn
          let assistantMsg = pendingMessages.find(m => m.role === 'assistant' && m.timestamp === currentAssistantTimestamp);
          if (!assistantMsg) {
            assistantMsg = {
              role: 'assistant',
              content: currentAssistantMessage,
              timestamp: currentAssistantTimestamp,
              element: null
            };
            pendingMessages.push(assistantMsg);
            console.log('[AdminChat] Created new pending assistant message. Total pending:', pendingMessages.length);
          } else {
            assistantMsg.content = currentAssistantMessage;
          }

          // Render messages in timestamp order
          renderMessagesInOrder();
        }
      };

      realtimeService.onFunctionCall = async (functionName, args) => {
        console.log('[AdminChat] Function called:', functionName, args);

        // Handle function call same as before
        // This will create pending actions that need confirmation
        if (functionName === 'update_system_prompt') {
          // Get current user
          const { data: { user } } = await supabase.auth.getUser();

          const { data: agentConfig } = await supabase.from('agent_configs')
            .select('system_prompt')
            .eq('user_id', user?.id)
            .single();

          pendingAction = {
            type: 'update_system_prompt',
            preview: `Proposed new prompt:\n\n${args.new_prompt}`,
            parameters: args,
          };

          // Show confirmation in chat
          showConfirmationPrompt(pendingAction);
        }
      };

      realtimeService.onResponseStart = (timestamp) => {
        console.log('[AdminChat] === RESPONSE START === timestamp:', timestamp);

        // Commit any pending user message immediately when AI starts responding
        if (userSpeechTimer) {
          clearTimeout(userSpeechTimer);
          userSpeechTimer = null;
        }

        if (currentUserMessage.trim()) {
          console.log('[AdminChat] ✓ Committing user message on response start to voiceTranscripts');
          console.log('[AdminChat]   Content:', `"${currentUserMessage.trim().substring(0, 100)}..."`);
          voiceTranscripts.push({ role: 'user', content: currentUserMessage.trim() });
          console.log('[AdminChat]   voiceTranscripts now has', voiceTranscripts.length, 'messages');
          currentUserMessage = '';
          currentUserTimestamp = null;
        }

        // Reset assistant message accumulator for new response
        currentAssistantMessage = '';
        currentAssistantTimestamp = null;
        console.log('[AdminChat] Ready for new assistant response');
      };

      realtimeService.onResponseEnd = () => {
        console.log('[AdminChat] === RESPONSE END ===');
        // Save complete assistant message
        if (currentAssistantMessage.trim()) {
          console.log('[AdminChat] ✓ Finalizing assistant message to voiceTranscripts');
          console.log('[AdminChat]   Content length:', currentAssistantMessage.length, 'chars');
          console.log('[AdminChat]   Preview:', `"${currentAssistantMessage.trim().substring(0, 100)}..."`);
          voiceTranscripts.push({ role: 'assistant', content: currentAssistantMessage.trim() });
          console.log('[AdminChat]   voiceTranscripts now has', voiceTranscripts.length, 'messages');
          currentAssistantMessage = '';
          currentAssistantTimestamp = null;
        } else {
          console.log('[AdminChat] ⚠ No assistant message to finalize (currentAssistantMessage is empty)');
        }
      };

      // Connect to Realtime API
      await realtimeService.connect(conversationId);

      // Start auto-save interval (every 10 seconds)
      autoSaveInterval = setInterval(() => {
        if (voiceTranscripts.length > 0) {
          console.log('[AdminChat] Auto-saving voice transcripts:', voiceTranscripts.length, 'messages');
          saveCurrentConversation();
        }
      }, 10000);

    } catch (error) {
      console.error('[AdminChat] Failed to initialize Realtime API:', error);
      updateVoiceOverlayStatus('Error', 'Failed to connect. Please try again.');
    }
  }

  /**
   * Close voice conversation overlay
   */
  async function closeVoiceOverlay() {
    console.log('[AdminChat] ===== CLOSING VOICE OVERLAY =====');
    console.log('[AdminChat] Current user message buffer:', currentUserMessage);
    console.log('[AdminChat] Current assistant message buffer:', currentAssistantMessage);
    console.log('[AdminChat] voiceTranscripts array before adding remaining:', voiceTranscripts);

    voiceModeEnabled = false;

    // Immediately start closing animation for better UX
    const overlay = document.getElementById('voice-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }

    // Stop auto-save interval
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }

    // Stop animation
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Clear user speech timer
    if (userSpeechTimer) {
      console.log('[AdminChat] Clearing user speech timer');
      clearTimeout(userSpeechTimer);
      userSpeechTimer = null;
    }

    // Add any remaining user message
    if (currentUserMessage.trim()) {
      console.log('[AdminChat] Adding remaining user message:', currentUserMessage.trim());
      voiceTranscripts.push({ role: 'user', content: currentUserMessage.trim() });
      currentUserMessage = '';
    } else {
      console.log('[AdminChat] No remaining user message to add');
    }

    // Add any remaining assistant message
    if (currentAssistantMessage.trim()) {
      console.log('[AdminChat] Adding remaining assistant message (length:', currentAssistantMessage.length, '):', currentAssistantMessage.trim().substring(0, 100) + '...');
      voiceTranscripts.push({ role: 'assistant', content: currentAssistantMessage.trim() });
      currentAssistantMessage = '';
    } else {
      console.log('[AdminChat] No remaining assistant message to add');
    }

    console.log('[AdminChat] voiceTranscripts array after adding remaining:', voiceTranscripts);

    // Clear pending messages
    pendingMessages = [];
    currentUserTimestamp = null;
    currentAssistantTimestamp = null;

    // Save voice transcripts to database (they're already in the UI from real-time updates)
    if (voiceTranscripts.length > 0) {
      console.log('[AdminChat] Saving voice transcripts:', voiceTranscripts.length, 'messages');
      console.log('[AdminChat] Transcript details:', JSON.stringify(voiceTranscripts, null, 2));

      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('[AdminChat] Session obtained, calling Edge Function');
          console.log('[AdminChat] Conversation ID:', conversationId);

          // Save conversation to database
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-voice-conversation`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                conversation_id: conversationId,
                messages: voiceTranscripts,
              }),
            }
          );

          console.log('[AdminChat] Edge Function response status:', response.status);
          const data = await response.json();
          console.log('[AdminChat] Edge Function response data:', data);

          if (response.ok) {
            // Update conversation ID
            conversationId = data.conversation_id;
            console.log('[AdminChat] Voice conversation saved successfully. New conversation ID:', conversationId);

            // Reload conversations to update sidebar
            console.log('[AdminChat] Reloading conversations list');
            await loadConversations();
          } else {
            console.error('[AdminChat] Failed to save voice conversation. Status:', response.status);
            console.error('[AdminChat] Error response:', data);
          }
        } else {
          console.error('[AdminChat] No session available, cannot save conversation');
        }
      } catch (error) {
        console.error('[AdminChat] Error saving voice conversation:', error);
        console.error('[AdminChat] Error stack:', error.stack);
      }

      voiceTranscripts = [];
    } else {
      console.log('[AdminChat] No voice transcripts to save');
    }

    // Disconnect Realtime API
    if (realtimeService) {
      console.log('[AdminChat] Disconnecting Realtime API');
      realtimeService.disconnect();
      realtimeService = null;
    }

    // Remove overlay after animation completes
    if (overlay) {
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
  }

  /**
   * Start a new chat
   */
  async function startNewChat() {
    // Save current conversation before starting new
    await saveCurrentConversation();

    conversationId = null;
    messages = [];
    messageHistory.innerHTML = '';

    // Clear any pending messages from voice mode
    pendingMessages = [];
    currentUserTimestamp = null;
    currentAssistantTimestamp = null;
    currentUserMessage = '';
    currentAssistantMessage = '';

    renderConversations();
    addMessage('assistant', 'Hi! I can help you configure your AI assistant. What would you like to change?');
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    // Check if toast container exists
    let toastContainer = document.querySelector('.toast-container');

    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Add to container
    toastContainer.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  /**
   * Format relative time
   */
  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Public API
  return {
    destroy: () => {
      if (voiceToggle && voiceToggle.destroy) {
        voiceToggle.destroy();
      }
      chatContainer.remove();
    },
    clear: () => {
      messages = [];
      conversationId = null;
      pendingAction = null;
      messageHistory.innerHTML = '';
    },
    addWelcomeMessage: () => {
      addMessage('assistant', 'Hi! I can help you configure your AI assistant. What would you like to change?');
    },
  };
}

/**
 * Add CSS styles for admin chat interface
 */
export function addAdminChatStyles() {
  if (document.getElementById('admin-chat-styles')) {
    return; // Already added
  }

  const style = document.createElement('style');
  style.id = 'admin-chat-styles';
  style.textContent = `
    .admin-chat-interface {
      display: flex;
      flex-direction: row;
      height: 100%;
      background: white;
      overflow: hidden;
    }

    .chat-sidebar {
      width: 260px;
      background: #f9fafb;
      border-right: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .new-chat-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      margin: 12px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      color: #374151;
      font-weight: 500;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .new-chat-button:hover {
      background: #f3f4f6;
    }

    .new-chat-button svg {
      flex-shrink: 0;
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 12px 12px 12px;
    }

    .conversation-list-empty {
      padding: 20px;
      text-align: center;
      color: #9ca3af;
      font-size: 14px;
    }

    .conversation-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 100%;
      padding: 12px;
      margin-bottom: 4px;
      background: transparent;
      border: none;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      transition: background 0.2s;
    }

    .conversation-item:hover {
      background: #e5e7eb;
    }

    .conversation-item.active {
      background: #dbeafe;
    }

    .conversation-title {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      margin-bottom: 4px;
    }

    .conversation-date {
      font-size: 12px;
      color: #9ca3af;
    }

    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chat-message {
      display: flex;
      margin-bottom: 8px;
    }

    .chat-message-user {
      justify-content: flex-end;
    }

    .chat-message-assistant {
      justify-content: flex-start;
    }

    .chat-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .chat-message-user .chat-bubble {
      background: #3b82f6;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .chat-message-assistant .chat-bubble {
      background: #f3f4f6;
      color: #1f2937;
      border-bottom-left-radius: 4px;
    }

    .chat-confirmation {
      background: #fef3c7;
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 16px;
      margin: 12px 0;
    }

    .confirmation-preview {
      background: white;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 12px;
      font-family: monospace;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }

    .confirmation-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .confirmation-buttons button {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-confirm {
      background: #10b981;
      color: white;
    }

    .btn-confirm:hover {
      background: #059669;
    }

    .btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-cancel:hover {
      background: #d1d5db;
    }

    .confirmation-buttons button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .chat-error {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 8px;
      border-left: 4px solid #c00;
      animation: slide-in 0.3s ease;
    }

    .chat-error.fade-out {
      animation: fade-out 0.3s ease;
      opacity: 0;
    }

    .chat-input-container {
      display: flex;
      gap: 8px;
      padding: 16px;
      padding-bottom: 16px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
      min-height: 40px;
      max-height: 40px;
      resize: none;
    }

    .chat-input:focus {
      border-color: #3b82f6;
    }

    .chat-input:disabled {
      background: #f3f4f6;
      cursor: not-allowed;
    }

    .chat-send-button {
      padding: 12px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      height: 44px;
    }

    .chat-send-button:hover:not(:disabled) {
      background: #2563eb;
    }

    .chat-send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .voice-mode-icon-toggle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: #f3f4f6;
      color: #6b7280;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      position: relative;
    }

    .voice-mode-icon-toggle:hover {
      background: #f0f0f0;
      color: #374151;
      transform: scale(1.05);
    }

    .voice-mode-icon-toggle:active {
      transform: scale(0.95);
    }

    /* Animated waveform in button - only on hover */
    @keyframes wave-pulse {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(1.5); }
    }

    .voice-mode-icon-toggle:hover .wave-bar {
      animation: wave-pulse 1s ease-in-out infinite;
    }

    .voice-mode-icon-toggle:hover .bar-1 { animation-delay: 0s; }
    .voice-mode-icon-toggle:hover .bar-2 { animation-delay: 0.1s; }
    .voice-mode-icon-toggle:hover .bar-3 { animation-delay: 0.2s; }
    .voice-mode-icon-toggle:hover .bar-4 { animation-delay: 0.3s; }
    .voice-mode-icon-toggle:hover .bar-5 { animation-delay: 0.4s; }

    /* Voice overlay */
    .voice-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .voice-overlay.active {
      opacity: 1;
    }

    .voice-overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
      position: relative;
      width: 100%;
      max-width: 600px;
      padding: 40px;
    }

    .voice-overlay-close {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: transparent;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      -webkit-tap-highlight-color: transparent;
      z-index: 10001;
      user-select: none;
    }

    .voice-overlay-close svg {
      pointer-events: none;
      width: 28px;
      height: 28px;
    }

    .voice-overlay-close:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }

    .voice-overlay-close:active {
      background: rgba(255, 255, 255, 0.4);
      transform: scale(0.95);
    }

    .voice-waveform-container {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 400px;
      position: relative;
    }

    #voice-waveform-canvas {
      max-width: 100%;
      height: auto;
    }

    .voice-connecting {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .connecting-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: rgba(255, 0, 128, 0.8);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .connecting-text {
      color: rgba(255, 255, 255, 0.9);
      font-size: 16px;
      font-weight: 500;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .chat-sidebar {
        display: none;
      }

      .chat-bubble {
        max-width: 85%;
      }

      .chat-input-container {
        padding: 12px;
        padding-bottom: 12px;
      }

      .chat-send-button {
        padding: 12px 16px;
      }
    }
  `;

  document.head.appendChild(style);
}
